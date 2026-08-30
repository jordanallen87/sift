import { beforeEach, describe, expect, it } from 'vitest';
import type { CaseState, CommandReceipt, EntityRecord } from '@sift/contracts';
import { compilePack, PackRegistry } from '@sift/packs';
import {
  createRegistryWithSyntheticPack,
  createSequentialIdGenerator,
  fixedClock,
  FIXED_NOW,
  syntheticCarPurchaseManifest,
  syntheticCatalog,
} from '../fixtures/synthetic-pack.js';
import { InMemoryActivityStore } from '../store/activity-store.js';
import { MemoryCaseStore } from '../store/memory-case-store.js';
import { CommandService } from './command-service.js';

function requireOk(result: {
  status: string;
}): asserts result is { status: 'ok'; value: CommandReceipt } {
  if (result.status !== 'ok') {
    throw new Error(`expected ok, got ${result.status}: ${JSON.stringify(result)}`);
  }
}

function requireSnapshot(receipt: CommandReceipt): CaseState {
  if (receipt.snapshot === undefined) throw new Error('receipt has no snapshot');
  return receipt.snapshot;
}

/**
 * A `CaseStore` wrapper whose `load()` always returns a fixed, deliberately
 * stale snapshot while `append()`/`updateSelection()` (and everything else)
 * still hit the real, since-advanced store. Simulates the real race
 * `loadForMutation()`'s own pre-check cannot observe in a single
 * synchronous test process: another command committing between this
 * command's read and its write (architecture.md "Command and event flow" --
 * exactly the optimistic-concurrency contract `append()`/`updateSelection()`
 * enforce). Proves each command method's own `if (result.status ===
 * 'applied')` branch correctly sees the non-`'applied'` outcome `append()`/
 * `updateSelection()` can genuinely return, not just the one
 * `loadForMutation()`'s pre-check already filters for.
 */
function staleReadCaseStore(real: MemoryCaseStore, staleSnapshot: CaseState) {
  return {
    load: (_caseId: string) => staleSnapshot,
    append: real.append.bind(real),
    updateSelection: real.updateSelection.bind(real),
    peekIdempotent: real.peekIdempotent.bind(real),
    subscribe: real.subscribe.bind(real),
    resetDemo: real.resetDemo.bind(real),
  };
}

describe('CommandService', () => {
  let caseStore: MemoryCaseStore;
  let activityStore: InMemoryActivityStore;
  let registry: PackRegistry;
  let service: CommandService;

  beforeEach(() => {
    caseStore = new MemoryCaseStore();
    activityStore = new InMemoryActivityStore();
    registry = createRegistryWithSyntheticPack();
    service = new CommandService({
      caseStore,
      activityStore,
      registry,
      clock: fixedClock,
      idGenerator: createSequentialIdGenerator(),
    });
  });

  function startDemo(commandId = 'cmd-start'): CaseState {
    const result = service.startDemo(commandId, { demoId: 'car-purchase' });
    requireOk(result);
    return requireSnapshot(result.value);
  }

  describe('startDemo', () => {
    it('creates a fully-seeded case from the pinned pack (success)', () => {
      const result = service.startDemo('cmd-1', { demoId: 'car-purchase' });
      requireOk(result);
      const snapshot = requireSnapshot(result.value);

      expect(snapshot.pack.id).toBe('car-purchase');
      expect(snapshot.pack.selectedBy).toBe('user');
      expect(snapshot.title).toBe('Choose Our Next Car (test fixture)');
      expect(snapshot.criteria).toHaveLength(1);
      expect(snapshot.obligations).toHaveLength(1);
      // The real gap `seedSnapshot` closes: attributeDefinitions must come
      // from the pack, not be left empty by applyCaseEvent's minimal skeleton.
      expect(snapshot.attributeDefinitions).toHaveLength(1);
      expect(snapshot.attributeDefinitions[0]?.id).toBe('car.price');
      expect(result.value.acceptedSequence).toBe(snapshot.eventSequence);

      const activity = activityStore.replayFrom(snapshot.id, 0);
      expect(activity).toHaveLength(1);
      expect(activity[0]?.type).toBe('command.accepted');
    });

    it('rejects an unregistered demo pack (not_found)', () => {
      const emptyRegistryService = new CommandService({
        caseStore: new MemoryCaseStore(),
        activityStore: new InMemoryActivityStore(),
        registry: new PackRegistry(),
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });
      const result = emptyRegistryService.startDemo('cmd-1', { demoId: 'home-energy-guardian' });
      expect(result.status).toBe('not_found');
    });

    it('rejects invalid input (validation)', () => {
      const result = service.startDemo('cmd-1', { demoId: 'not-a-real-demo' });
      expect(result.status).toBe('validation');
    });

    it('is idempotent: retrying the same commandId returns the original case, not a second one', () => {
      const first = service.startDemo('cmd-1', { demoId: 'car-purchase' });
      requireOk(first);
      const second = service.startDemo('cmd-1', { demoId: 'car-purchase' });
      requireOk(second);

      expect(second.value.caseId).toBe(first.value.caseId);
      expect(activityStore.replayFrom(first.value.caseId, 0)).toHaveLength(1);
    });

    it('resolves the highest registered semantic version, comparing numerically not lexicographically', () => {
      const multiVersionRegistry = new PackRegistry();
      for (const version of ['1.0.0', '2.1.3', '2.1.10', '2.2.0']) {
        multiVersionRegistry.register(
          compilePack(
            syntheticCarPurchaseManifest({
              identity: { ...syntheticCarPurchaseManifest().identity, version },
            }),
            syntheticCatalog(),
            fixedClock,
          ),
        );
      }
      const multiVersionService = new CommandService({
        caseStore: new MemoryCaseStore(),
        activityStore: new InMemoryActivityStore(),
        registry: multiVersionRegistry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = multiVersionService.startDemo('cmd-1', { demoId: 'car-purchase' });
      requireOk(result);
      // Numeric comparison at every level: "2.2.0" beats "2.1.10" (minor),
      // which beats "2.1.3" (patch, and not lexicographically -- a naive
      // string compare would incorrectly rank "2.1.3" above "2.1.10"),
      // which beats "1.0.0" (major).
      expect(result.value.snapshot?.pack.version).toBe('2.2.0');
    });

    it('keeps the already-found highest version when a later-registered candidate has a lower version (reduce\'s "not greater" branch, not just its "greater" branch every other multi-version case above exercises)', () => {
      const descendingVersionRegistry = new PackRegistry();
      for (const version of ['2.0.0', '1.5.0']) {
        descendingVersionRegistry.register(
          compilePack(
            syntheticCarPurchaseManifest({
              identity: { ...syntheticCarPurchaseManifest().identity, version },
            }),
            syntheticCatalog(),
            fixedClock,
          ),
        );
      }
      const descendingVersionService = new CommandService({
        caseStore: new MemoryCaseStore(),
        activityStore: new InMemoryActivityStore(),
        registry: descendingVersionRegistry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = descendingVersionService.startDemo('cmd-1', { demoId: 'car-purchase' });
      requireOk(result);
      // "2.0.0" was registered (and found) first; "1.5.0" registered second
      // must NOT overwrite it -- proving the reduce's ternary took its
      // "candidate is not greater than latest" (false) branch.
      expect(result.value.snapshot?.pack.version).toBe('2.0.0');
    });

    it('seeds pack-specific demo entities (e.g. starting candidates) when demoSeedEntities configures the pack', () => {
      // Real gap this closes: instantiateCase always seeds entities: [], and
      // nothing else in the live product ever adds starting candidates to a
      // freshly started case -- confirmed by apps/agent's real live-engine
      // manual smoke test (docs/build-log.md). upsertOption cannot be used
      // to seed these instead: OptionAttributeInputSchema.value is required
      // and the handler hardcodes status: 'asserted', so an entity carrying
      // a legitimately unknown-status attribute (no value; CLAUDE.md "never
      // fabricate") can only be expressed as a direct option.upserted event
      // -- exactly what demoSeedEntities lets a pack-boot wiring supply.
      const unknownAttributeEntity: EntityRecord = {
        id: 'candidate-demo',
        kind: 'option',
        label: 'Demo Candidate',
        attributes: {
          'car.price': {
            definitionId: 'car.price',
            label: 'Price',
            origin: 'pack',
            sourceIds: [],
            status: 'unknown',
            updatedAt: FIXED_NOW,
          },
        },
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      };
      const seededActivityStore = new InMemoryActivityStore();
      const seededService = new CommandService({
        caseStore: new MemoryCaseStore(),
        activityStore: seededActivityStore,
        registry: createRegistryWithSyntheticPack(),
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
        demoSeedEntities: { 'car-purchase': () => [unknownAttributeEntity] },
      });

      const result = seededService.startDemo('cmd-1', { demoId: 'car-purchase' });
      requireOk(result);
      const snapshot = requireSnapshot(result.value);

      expect(snapshot.entities).toHaveLength(1);
      expect(snapshot.entities[0]?.id).toBe('candidate-demo');
      expect(snapshot.entities[0]?.attributes['car.price']?.status).toBe('unknown');
      expect(result.value.acceptedSequence).toBe(snapshot.eventSequence);

      const activity = seededActivityStore.replayFrom(snapshot.id, 0);
      expect(activity.map((event) => event.summary)).toEqual([
        'Started "Choose Our Next Car (test fixture)".',
        'Added option "Demo Candidate".',
      ]);
    });

    it('starts a case with no entities when the pack has no demoSeedEntities entry (unchanged default behavior)', () => {
      const snapshot = startDemo();
      expect(snapshot.entities).toHaveLength(0);
    });
  });

  describe('selectPack', () => {
    it('re-pins the case to a newly selected installed pack (success)', () => {
      const snapshot = startDemo();
      const result = service.selectPack('cmd-2', {
        caseId: snapshot.id,
        packId: 'car-purchase',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      expect(requireSnapshot(result.value).pack.selectedBy).toBe('user');
    });

    it('rejects invalid input (validation)', () => {
      const result = service.selectPack('cmd-2', { caseId: '', packId: '', expectedSequence: -1 });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.selectPack('cmd-2', {
        caseId: 'missing',
        packId: 'car-purchase',
        expectedSequence: 0,
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const snapshot = startDemo();
      const result = service.selectPack('cmd-2', {
        caseId: snapshot.id,
        packId: 'car-purchase',
        expectedSequence: snapshot.eventSequence - 1,
      });
      expect(result.status).toBe('conflict');
    });

    it('rejects an uninstalled pack (validation)', () => {
      const snapshot = startDemo();
      const result = service.selectPack('cmd-2', {
        caseId: snapshot.id,
        packId: 'does-not-exist',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('validation');
    });

    it('is idempotent: retrying the same commandId returns the original result', () => {
      const snapshot = startDemo();
      const input = {
        caseId: snapshot.id,
        packId: 'car-purchase',
        expectedSequence: snapshot.eventSequence,
      };
      const first = service.selectPack('cmd-2', input);
      requireOk(first);
      const second = service.selectPack('cmd-2', input);
      requireOk(second);
      expect(second.value.acceptedSequence).toBe(first.value.acceptedSequence);
    });
  });

  describe('upsertOption', () => {
    it('adds a new option with typed attribute records (success)', () => {
      const snapshot = startDemo();
      const result = service.upsertOption('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: {
          label: 'Honda Civic',
          kind: 'car',
          attributes: [
            { definitionId: 'car.price', value: { type: 'money', amount: 24000, currency: 'USD' } },
          ],
        },
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.entities).toHaveLength(1);
      expect(updated.entities[0]?.label).toBe('Honda Civic');
      expect(updated.entities[0]?.attributes['car.price']?.status).toBe('asserted');
    });

    it('updates an existing option in place when optionId matches (upsert)', () => {
      const snapshot = startDemo();
      const first = service.upsertOption('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: {
          label: 'Honda Civic',
          kind: 'car',
          attributes: [
            { definitionId: 'car.price', value: { type: 'money', amount: 24000, currency: 'USD' } },
          ],
        },
      });
      requireOk(first);
      const afterFirst = requireSnapshot(first.value);
      const optionId = afterFirst.entities[0]?.id;
      if (optionId === undefined) throw new Error('expected an option id');

      const second = service.upsertOption('cmd-3', {
        caseId: snapshot.id,
        optionId,
        expectedSequence: afterFirst.eventSequence,
        option: {
          label: 'Honda Civic LX',
          kind: 'car',
          attributes: [
            { definitionId: 'car.price', value: { type: 'money', amount: 23000, currency: 'USD' } },
          ],
        },
      });
      requireOk(second);
      const final = requireSnapshot(second.value);
      expect(final.entities).toHaveLength(1);
      expect(final.entities[0]?.label).toBe('Honda Civic LX');
    });

    it('rejects invalid input (validation)', () => {
      const result = service.upsertOption('cmd-2', { caseId: '', expectedSequence: -1 });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.upsertOption('cmd-2', {
        caseId: 'missing',
        expectedSequence: 0,
        option: { label: 'x', kind: 'car', attributes: [] },
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const snapshot = startDemo();
      const result = service.upsertOption('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence + 5,
        option: { label: 'x', kind: 'car', attributes: [] },
      });
      expect(result.status).toBe('conflict');
    });

    it('persists optional sourceIds on an option attribute when the caller provides them (every other test above omits sourceIds entirely)', () => {
      const snapshot = startDemo();
      const result = service.upsertOption('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: {
          label: 'Honda Civic',
          kind: 'car',
          attributes: [
            {
              definitionId: 'car.price',
              value: { type: 'money', amount: 24000, currency: 'USD' },
              sourceIds: ['source-1'],
            },
          ],
        },
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.entities[0]?.attributes['car.price']?.sourceIds).toEqual(['source-1']);
    });

    // `createAttributeRecord`'s `!recordResult.ok` branch (and therefore the
    // `errors.length > 0` branch right after it) is not covered here,
    // deliberately: it can only fail if `attributeValueStatusInvariantError`
    // rejects the status/value pairing (impossible -- this method always
    // passes the fixed pair `status: 'asserted'` with a `value` that
    // `UpsertOptionInputSchema`'s `OptionAttributeInputSchema.value` already
    // requires to be present) or if the final `AttributeRecordSchema.
    // safeParse(candidate)` rejects a `definitionId`/`label`/`value`/
    // `sourceIds` that has *already* passed validation against an identical
    // or strictly narrower Zod schema one line above in `upsertOption`
    // itself (`idString()` is a strict subset of `AttributeRecordShape`'s
    // unconstrained `safeString(200)`, and `value`/`sourceIds` reuse the
    // exact same `AttributeValueSchema`/`idString()` schema instances) --
    // re-parsing already-valid data with the same schema cannot fail. Not
    // reachable through any input that has already passed
    // `UpsertOptionInputSchema.safeParse`.
  });

  describe('focusOption', () => {
    function withOption(): { snapshot: CaseState; optionId: string } {
      const snapshot = startDemo();
      const result = service.upsertOption('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: { label: 'Honda Civic', kind: 'car', attributes: [] },
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      const optionId = updated.entities[0]?.id;
      if (optionId === undefined) throw new Error('expected option id');
      return { snapshot: updated, optionId };
    }

    it('sets selectedOptionId without advancing eventSequence (success)', () => {
      const { snapshot, optionId } = withOption();
      const result = service.focusOption('cmd-3', {
        caseId: snapshot.id,
        optionId,
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.selectedOptionId).toBe(optionId);
      expect(updated.eventSequence).toBe(snapshot.eventSequence);
    });

    it('rejects invalid input (validation)', () => {
      const result = service.focusOption('cmd-3', {
        caseId: '',
        optionId: '',
        expectedSequence: -1,
      });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.focusOption('cmd-3', {
        caseId: 'missing',
        optionId: 'x',
        expectedSequence: 0,
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const { snapshot, optionId } = withOption();
      const result = service.focusOption('cmd-3', {
        caseId: snapshot.id,
        optionId,
        expectedSequence: snapshot.eventSequence + 1,
      });
      expect(result.status).toBe('conflict');
    });

    it('rejects an unknown optionId (validation)', () => {
      const { snapshot } = withOption();
      const result = service.focusOption('cmd-3', {
        caseId: snapshot.id,
        optionId: 'does-not-exist',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('validation');
    });

    it('is idempotent: retrying the same commandId returns the original result', () => {
      const { snapshot, optionId } = withOption();
      const input = { caseId: snapshot.id, optionId, expectedSequence: snapshot.eventSequence };
      const first = service.focusOption('cmd-3', input);
      requireOk(first);
      const second = service.focusOption('cmd-3', input);
      requireOk(second);
      expect(second.value.caseId).toBe(first.value.caseId);
    });

    it("returns a 409-shaped conflict when the underlying updateSelection() call itself detects the case has advanced (the \"if (result.status === 'applied')\" false path -- loadForMutation's own pre-check already catches every conflict every other test above produces, so only a genuine append()/updateSelection() race, simulated here, reaches it)", () => {
      const { snapshot, optionId } = withOption();
      const advanced = service.upsertOption('cmd-real', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: { label: 'Toyota Corolla', kind: 'car', attributes: [] },
      });
      requireOk(advanced);

      const staleReadService = new CommandService({
        caseStore: staleReadCaseStore(caseStore, snapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.focusOption('cmd-race', {
        caseId: snapshot.id,
        optionId,
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('conflict');
    });
  });

  describe('defineCaseAttribute', () => {
    function draftInput(caseId: string, expectedSequence: number) {
      return {
        caseId,
        expectedSequence,
        definition: {
          id: 'custom.pet_sensory_fit',
          label: 'Pet sensory fit',
          valueType: 'text' as const,
          appliesTo: ['car'],
          evidenceExpectation: 'assertion' as const,
          comparison: 'none' as const,
          reason: 'The household has a dog that reacts badly to certain interiors.',
        },
      };
    }

    it('creates a confirmed user-origin extension by default (success)', () => {
      const snapshot = startDemo();
      const result = service.defineCaseAttribute(
        'cmd-2',
        draftInput(snapshot.id, snapshot.eventSequence),
      );
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.caseExtensions).toHaveLength(1);
      expect(updated.caseExtensions[0]?.definition.confirmation).toBe('confirmed');
      expect(updated.caseExtensions[0]?.definition.origin).toBe('user');
    });

    it('creates a pending agent-proposed extension when origin is passed explicitly', () => {
      const snapshot = startDemo();
      const result = service.defineCaseAttribute(
        'cmd-2',
        draftInput(snapshot.id, snapshot.eventSequence),
        'agent_proposed',
      );
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.caseExtensions[0]?.definition.confirmation).toBe('pending');
    });

    it('rejects invalid input (validation)', () => {
      const result = service.defineCaseAttribute('cmd-2', { caseId: '', expectedSequence: -1 });
      expect(result.status).toBe('validation');
    });

    it('rejects a duplicate custom attribute id (validation, from the core domain function)', () => {
      const snapshot = startDemo();
      const first = service.defineCaseAttribute(
        'cmd-2',
        draftInput(snapshot.id, snapshot.eventSequence),
      );
      requireOk(first);
      const updated = requireSnapshot(first.value);
      const second = service.defineCaseAttribute(
        'cmd-3',
        draftInput(snapshot.id, updated.eventSequence),
      );
      expect(second.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.defineCaseAttribute('cmd-2', draftInput('missing', 0));
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const snapshot = startDemo();
      const result = service.defineCaseAttribute(
        'cmd-2',
        draftInput(snapshot.id, snapshot.eventSequence + 1),
      );
      expect(result.status).toBe('conflict');
    });

    it('is idempotent: retrying the same commandId returns the original result', () => {
      const snapshot = startDemo();
      const input = draftInput(snapshot.id, snapshot.eventSequence);
      const first = service.defineCaseAttribute('cmd-2', input);
      requireOk(first);
      const second = service.defineCaseAttribute('cmd-2', input);
      requireOk(second);
      expect(second.value.acceptedSequence).toBe(first.value.acceptedSequence);
    });

    it('carries optional unit and allowedValues through to the created definition when provided (draftInput() above never sets either)', () => {
      const snapshot = startDemo();
      const result = service.defineCaseAttribute('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        definition: {
          id: 'custom.max_towing_capacity',
          label: 'Max towing capacity',
          valueType: 'number',
          appliesTo: ['car'],
          unit: 'lbs',
          allowedValues: ['1500', '3500', '5000'],
          evidenceExpectation: 'source',
          comparison: 'higher_better',
          reason: 'The household tows a small trailer.',
        },
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.caseExtensions[0]?.definition.unit).toBe('lbs');
      expect(updated.caseExtensions[0]?.definition.allowedValues).toEqual(['1500', '3500', '5000']);
    });

    it("returns a 409-shaped conflict when the underlying append() call itself detects the case has advanced (a genuine race, not one loadForMutation's pre-check already catches -- see focusOption's identical-purpose test above)", () => {
      const snapshot = startDemo();
      const advanced = service.upsertOption('cmd-real', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: { label: 'Toyota Corolla', kind: 'car', attributes: [] },
      });
      requireOk(advanced);

      const staleReadService = new CommandService({
        caseStore: staleReadCaseStore(caseStore, snapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.defineCaseAttribute(
        'cmd-race',
        draftInput(snapshot.id, snapshot.eventSequence),
      );
      expect(result.status).toBe('conflict');
    });
  });

  describe('reviewCaseExtension', () => {
    function withPendingExtension(): { snapshot: CaseState; extensionId: string } {
      const snapshot = startDemo();
      const result = service.defineCaseAttribute(
        'cmd-2',
        {
          caseId: snapshot.id,
          expectedSequence: snapshot.eventSequence,
          definition: {
            id: 'custom.pet_sensory_fit',
            label: 'Pet sensory fit',
            valueType: 'text',
            appliesTo: ['car'],
            evidenceExpectation: 'assertion',
            comparison: 'none',
            reason: 'reason',
          },
        },
        'agent_proposed',
      );
      requireOk(result);
      const updated = requireSnapshot(result.value);
      const extensionId = updated.caseExtensions[0]?.id;
      if (extensionId === undefined) throw new Error('expected extension id');
      return { snapshot: updated, extensionId };
    }

    it('confirms a pending extension (success)', () => {
      const { snapshot, extensionId } = withPendingExtension();
      const result = service.reviewCaseExtension('cmd-3', {
        caseId: snapshot.id,
        extensionId,
        decision: 'confirm',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.caseExtensions[0]?.definition.confirmation).toBe('confirmed');
    });

    it('rejects invalid input (validation)', () => {
      const result = service.reviewCaseExtension('cmd-3', {
        caseId: '',
        extensionId: '',
        decision: 'confirm',
        expectedSequence: -1,
      });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.reviewCaseExtension('cmd-3', {
        caseId: 'missing',
        extensionId: 'x',
        decision: 'confirm',
        expectedSequence: 0,
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const { snapshot, extensionId } = withPendingExtension();
      const result = service.reviewCaseExtension('cmd-3', {
        caseId: snapshot.id,
        extensionId,
        decision: 'confirm',
        expectedSequence: snapshot.eventSequence + 1,
      });
      expect(result.status).toBe('conflict');
    });

    it('rejects reviewing an unknown extensionId (validation)', () => {
      const { snapshot } = withPendingExtension();
      const result = service.reviewCaseExtension('cmd-3', {
        caseId: snapshot.id,
        extensionId: 'does-not-exist',
        decision: 'confirm',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('validation');
    });

    it('rejects reviewing an already-decided extension (validation, from the core domain function)', () => {
      const { snapshot, extensionId } = withPendingExtension();
      const first = service.reviewCaseExtension('cmd-3', {
        caseId: snapshot.id,
        extensionId,
        decision: 'confirm',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(first);
      const updated = requireSnapshot(first.value);
      const second = service.reviewCaseExtension('cmd-4', {
        caseId: snapshot.id,
        extensionId,
        decision: 'confirm',
        expectedSequence: updated.eventSequence,
      });
      expect(second.status).toBe('validation');
    });

    it('is idempotent: retrying the same commandId returns the original result', () => {
      const { snapshot, extensionId } = withPendingExtension();
      const input = {
        caseId: snapshot.id,
        extensionId,
        decision: 'confirm' as const,
        expectedSequence: snapshot.eventSequence,
      };
      const first = service.reviewCaseExtension('cmd-3', input);
      requireOk(first);
      const second = service.reviewCaseExtension('cmd-3', input);
      requireOk(second);
      expect(second.value.acceptedSequence).toBe(first.value.acceptedSequence);
    });

    it('rejects a pending extension and records a "Rejected" activity summary (every other test above only ever confirms)', () => {
      const { snapshot, extensionId } = withPendingExtension();
      const result = service.reviewCaseExtension('cmd-3', {
        caseId: snapshot.id,
        extensionId,
        decision: 'reject',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.caseExtensions[0]?.definition.confirmation).toBe('rejected');

      const activity = activityStore.replayFrom(snapshot.id, 0);
      expect(activity.some((event) => event.summary.includes('Rejected case extension'))).toBe(
        true,
      );
    });

    it('returns a 409-shaped conflict when the underlying append() call itself detects the case has advanced', () => {
      const { snapshot, extensionId } = withPendingExtension();
      const advanced = service.upsertOption('cmd-real', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: { label: 'Toyota Corolla', kind: 'car', attributes: [] },
      });
      requireOk(advanced);

      const staleReadService = new CommandService({
        caseStore: staleReadCaseStore(caseStore, snapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.reviewCaseExtension('cmd-race', {
        caseId: snapshot.id,
        extensionId,
        decision: 'confirm',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('conflict');
    });
  });

  describe('updateCriteria', () => {
    it('adds a new user-defined criterion (success)', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [
          {
            op: 'add',
            criterion: {
              id: 'range',
              label: 'Range',
              kind: 'preference',
              weight: 40,
              direction: 'higher_better',
            },
          },
        ],
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.criteria).toHaveLength(2);
      expect(updated.criteria.some((c) => c.id === 'range')).toBe(true);
    });

    it('rejects adding a user-defined criterion when the pinned pack disallows them (policy) -- the synthetic pack every other test uses has allowUserDefined: true, so this needs a differently-configured pack', () => {
      const noUserDefinedRegistry = new PackRegistry();
      noUserDefinedRegistry.register(
        compilePack(
          syntheticCarPurchaseManifest({
            criteria: {
              defaults: [
                {
                  id: 'price',
                  label: 'Price',
                  kind: 'hard_constraint',
                  weight: 100,
                  direction: 'lower_better',
                  appliesToAttribute: 'car.price',
                  origin: 'pack',
                  status: 'active',
                },
              ],
              allowUserDefined: false,
              protectedCriterionIds: ['price'],
            },
          }),
          syntheticCatalog(),
          fixedClock,
        ),
      );
      const restrictedService = new CommandService({
        caseStore: new MemoryCaseStore(),
        activityStore: new InMemoryActivityStore(),
        registry: noUserDefinedRegistry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });
      const startResult = restrictedService.startDemo('cmd-1', { demoId: 'car-purchase' });
      requireOk(startResult);
      const restrictedSnapshot = requireSnapshot(startResult.value);

      const result = restrictedService.updateCriteria('cmd-2', {
        caseId: restrictedSnapshot.id,
        expectedSequence: restrictedSnapshot.eventSequence,
        operations: [
          {
            op: 'add',
            criterion: {
              id: 'range',
              label: 'Range',
              kind: 'preference',
              weight: 40,
              direction: 'higher_better',
            },
          },
        ],
      });
      expect(result.status).toBe('policy');
    });

    it('adds a criterion carrying optional target, appliesToAttribute, and question fields when provided (the "adds a new user-defined criterion" success test above sets none of them)', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [
          {
            op: 'add',
            criterion: {
              id: 'max-price-hard',
              label: 'Max acceptable price',
              kind: 'hard_constraint',
              weight: 50,
              direction: 'target',
              target: { type: 'money', amount: 30000, currency: 'USD' },
              appliesToAttribute: 'car.price',
              question: 'What is the maximum acceptable out-the-door price?',
            },
          },
        ],
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      const criterion = updated.criteria.find((c) => c.id === 'max-price-hard');
      expect(criterion?.target).toEqual({ type: 'money', amount: 30000, currency: 'USD' });
      expect(criterion?.appliesToAttribute).toBe('car.price');
      expect(criterion?.question).toBe('What is the maximum acceptable out-the-door price?');
    });

    it('removes a non-protected, previously user-added criterion (success) -- every removal test elsewhere in this block only exercises rejection paths', () => {
      const snapshot = startDemo();
      const added = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [
          {
            op: 'add',
            criterion: {
              id: 'range',
              label: 'Range',
              kind: 'preference',
              weight: 40,
              direction: 'higher_better',
            },
          },
        ],
      });
      requireOk(added);
      const afterAdd = requireSnapshot(added.value);

      const result = service.updateCriteria('cmd-3', {
        caseId: snapshot.id,
        expectedSequence: afterAdd.eventSequence,
        operations: [{ op: 'remove', criterionId: 'range' }],
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      // removeCriterion() marks the criterion 'excluded' rather than
      // deleting the entry (packages/core/src/criteria.ts) -- both entries
      // are still present, but "range" is no longer active.
      expect(updated.criteria).toHaveLength(2);
      const removed = updated.criteria.find((c) => c.id === 'range');
      expect(removed?.status).toBe('excluded');
    });

    it('rejects removing a protected criterion (policy)', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [{ op: 'remove', criterionId: 'price' }],
      });
      expect(result.status).toBe('policy');
    });

    it('rejects reweighting a protected criterion (policy)', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [{ op: 'reweight', criterionId: 'price', weight: 50 }],
      });
      expect(result.status).toBe('policy');
    });

    it('rejects an operation on an unknown criterionId (validation)', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [{ op: 'rename', criterionId: 'does-not-exist', label: 'x' }],
      });
      expect(result.status).toBe('validation');
    });

    it('rejects adding a criterion with a duplicate id (validation, from the core domain function)', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [
          {
            op: 'add',
            criterion: {
              id: 'price', // already exists as a pack default
              label: 'Price again',
              kind: 'preference',
              weight: 10,
              direction: 'lower_better',
            },
          },
        ],
      });
      expect(result.status).toBe('validation');
    });

    it('rejects removing an unknown criterionId (validation, from the core domain function)', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [{ op: 'remove', criterionId: 'does-not-exist' }],
      });
      expect(result.status).toBe('validation');
    });

    it('rejects reweighting an unknown criterionId (validation, from the core domain function)', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [{ op: 'reweight', criterionId: 'does-not-exist', weight: 50 }],
      });
      expect(result.status).toBe('validation');
    });

    it('throws (real invariant violation) when the case pinned pack is missing from the registry', () => {
      const snapshot = startDemo();
      // A second service sharing the same caseStore but a fresh, empty
      // registry -- simulates the case's pinned pack having vanished from
      // the registry, which real production wiring should never allow but
      // which this method defends against explicitly rather than silently
      // misbehaving.
      const strandedService = new CommandService({
        caseStore,
        activityStore: new InMemoryActivityStore(),
        registry: new PackRegistry(),
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      expect(() =>
        strandedService.updateCriteria('cmd-2', {
          caseId: snapshot.id,
          expectedSequence: snapshot.eventSequence,
          operations: [{ op: 'rename', criterionId: 'price', label: 'x' }],
        }),
      ).toThrow(/is not present in the registry/);
    });

    it('rejects invalid input (validation)', () => {
      const result = service.updateCriteria('cmd-2', {
        caseId: '',
        expectedSequence: -1,
        operations: [],
      });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.updateCriteria('cmd-2', {
        caseId: 'missing',
        expectedSequence: 0,
        operations: [{ op: 'rename', criterionId: 'x', label: 'y' }],
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const snapshot = startDemo();
      const result = service.updateCriteria('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence + 1,
        operations: [{ op: 'rename', criterionId: 'price', label: 'Price (renamed)' }],
      });
      expect(result.status).toBe('conflict');
    });

    it('invalidates a ready recommendation when criteria change', () => {
      const snapshot = startDemo();
      caseStore.append(
        snapshot.id,
        [
          {
            eventId: 'ev-rec',
            caseId: snapshot.id,
            sequence: snapshot.eventSequence + 1,
            timestamp: FIXED_NOW,
            type: 'recommendation.ready',
            payload: {
              recommendation: {
                id: 'rec-1',
                status: 'ready',
                favoredOptionId: null,
                rationale: 'because',
                facts: [],
                hypotheses: [],
                confidence: 0.5,
                limitations: [],
                sourceIds: [],
                resolvedObligationIds: [],
                acceptedUncertaintyObligationIds: [],
                generatedAt: FIXED_NOW,
              },
            },
          },
        ],
        snapshot.eventSequence,
      );
      const withRecommendation = caseStore.load(snapshot.id);
      if (withRecommendation === undefined) throw new Error('expected case');

      const result = service.updateCriteria('cmd-3', {
        caseId: snapshot.id,
        expectedSequence: withRecommendation.eventSequence,
        operations: [{ op: 'rename', criterionId: 'price', label: 'Price (renamed)' }],
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.recommendation?.status).toBe('stale');

      const activity = activityStore.replayFrom(snapshot.id, 0);
      expect(activity.some((event) => event.type === 'recommendation.invalidated')).toBe(true);
    });

    it('is idempotent: retrying the same commandId returns the original result', () => {
      const snapshot = startDemo();
      const input = {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [{ op: 'rename' as const, criterionId: 'price', label: 'Price (renamed)' }],
      };
      const first = service.updateCriteria('cmd-2', input);
      requireOk(first);
      const second = service.updateCriteria('cmd-2', input);
      requireOk(second);
      expect(second.value.acceptedSequence).toBe(first.value.acceptedSequence);
    });

    it('returns a 409-shaped conflict when the underlying append() call itself detects the case has advanced', () => {
      const snapshot = startDemo();
      const advanced = service.upsertOption('cmd-real', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: { label: 'Toyota Corolla', kind: 'car', attributes: [] },
      });
      requireOk(advanced);

      const staleReadService = new CommandService({
        caseStore: staleReadCaseStore(caseStore, snapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.updateCriteria('cmd-race', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        operations: [{ op: 'rename', criterionId: 'price', label: 'Price (renamed again)' }],
      });
      expect(result.status).toBe('conflict');
    });
  });

  describe('submitSource', () => {
    it('adds a source to the case (success)', () => {
      const snapshot = startDemo();
      const result = service.submitSource('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        source: {
          url: 'https://example.com/review',
          title: 'Consumer review',
          retrievedAt: FIXED_NOW,
          claims: [],
        },
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.sources).toHaveLength(1);
      expect(updated.sources[0]?.title).toBe('Consumer review');
      expect(updated.sources[0]?.verification).toBe('unverified');
      // Non-event-sourced escape hatch: does not advance eventSequence.
      expect(updated.eventSequence).toBe(snapshot.eventSequence);
    });

    it('rejects invalid input (validation)', () => {
      const result = service.submitSource('cmd-2', { caseId: '', expectedSequence: -1 });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.submitSource('cmd-2', {
        caseId: 'missing',
        expectedSequence: 0,
        source: { url: 'https://example.com', title: 'x', retrievedAt: FIXED_NOW, claims: [] },
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const snapshot = startDemo();
      const result = service.submitSource('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence + 1,
        source: { url: 'https://example.com', title: 'x', retrievedAt: FIXED_NOW, claims: [] },
      });
      expect(result.status).toBe('conflict');
    });

    it('is idempotent: retrying the same commandId does not add the source twice', () => {
      const snapshot = startDemo();
      const input = {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        source: { url: 'https://example.com', title: 'x', retrievedAt: FIXED_NOW, claims: [] },
      };
      const first = service.submitSource('cmd-2', input);
      requireOk(first);
      const second = service.submitSource('cmd-2', input);
      requireOk(second);
      expect(requireSnapshot(second.value).sources).toHaveLength(1);
    });

    it('captures optional publisher, publishedAt, and excerpt fields when the caller provides them (the "adds a source" success test above omits all three)', () => {
      const snapshot = startDemo();
      const result = service.submitSource('cmd-2', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        source: {
          url: 'https://example.com/review',
          title: 'Consumer review',
          publisher: 'Consumer Reports',
          publishedAt: FIXED_NOW,
          retrievedAt: FIXED_NOW,
          excerpt: 'This car scored well in reliability testing.',
          claims: [],
        },
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.sources[0]?.publisher).toBe('Consumer Reports');
      expect(updated.sources[0]?.publishedAt).toBe(FIXED_NOW);
      expect(updated.sources[0]?.excerpt).toBe('This car scored well in reliability testing.');
    });
  });

  describe('setEvidenceDisposition', () => {
    function withEvidence(): { snapshot: CaseState; evidenceId: string } {
      const snapshot = startDemo();
      caseStore.append(
        snapshot.id,
        [
          {
            eventId: 'ev-evidence',
            caseId: snapshot.id,
            sequence: snapshot.eventSequence + 1,
            timestamp: FIXED_NOW,
            type: 'evidence.accepted',
            payload: {
              evidenceLink: {
                id: 'evidence-1',
                obligationId: 'hard-constraints',
                level: 'E1',
                verdict: 'pass',
                disposition: 'included',
                summary: 'summary',
                stale: false,
                createdAt: FIXED_NOW,
                updatedAt: FIXED_NOW,
              },
            },
          },
        ],
        snapshot.eventSequence,
      );
      const updated = caseStore.load(snapshot.id);
      if (updated === undefined) throw new Error('expected case');
      return { snapshot: updated, evidenceId: 'evidence-1' };
    }

    it('changes an evidence link disposition (success)', () => {
      const { snapshot, evidenceId } = withEvidence();
      const result = service.setEvidenceDisposition('cmd-3', {
        caseId: snapshot.id,
        evidenceId,
        disposition: 'excluded',
        reason: 'Not independent.',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      const link = updated.evidenceLinks.find((item) => item.id === evidenceId);
      expect(link?.disposition).toBe('excluded');
      expect(link?.dispositionReason).toBe('Not independent.');
    });

    it('rejects invalid input (validation)', () => {
      const result = service.setEvidenceDisposition('cmd-3', {
        caseId: '',
        evidenceId: '',
        disposition: 'excluded',
        reason: '',
        expectedSequence: -1,
      });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.setEvidenceDisposition('cmd-3', {
        caseId: 'missing',
        evidenceId: 'x',
        disposition: 'excluded',
        reason: 'reason',
        expectedSequence: 0,
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const { snapshot, evidenceId } = withEvidence();
      const result = service.setEvidenceDisposition('cmd-3', {
        caseId: snapshot.id,
        evidenceId,
        disposition: 'excluded',
        reason: 'reason',
        expectedSequence: snapshot.eventSequence + 1,
      });
      expect(result.status).toBe('conflict');
    });

    it('rejects an unknown evidenceId (validation)', () => {
      const { snapshot } = withEvidence();
      const result = service.setEvidenceDisposition('cmd-3', {
        caseId: snapshot.id,
        evidenceId: 'does-not-exist',
        disposition: 'excluded',
        reason: 'reason',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('validation');
    });

    it('is idempotent: retrying the same commandId returns the original result', () => {
      const { snapshot, evidenceId } = withEvidence();
      const input = {
        caseId: snapshot.id,
        evidenceId,
        disposition: 'excluded' as const,
        reason: 'Not independent.',
        expectedSequence: snapshot.eventSequence,
      };
      const first = service.setEvidenceDisposition('cmd-3', input);
      requireOk(first);
      const second = service.setEvidenceDisposition('cmd-3', input);
      requireOk(second);
      expect(second.value.acceptedSequence).toBe(first.value.acceptedSequence);
    });

    it('returns a 409-shaped conflict when the underlying append() call itself detects the case has advanced', () => {
      const { snapshot, evidenceId } = withEvidence();
      const advanced = service.upsertOption('cmd-real', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: { label: 'Toyota Corolla', kind: 'car', attributes: [] },
      });
      requireOk(advanced);

      const staleReadService = new CommandService({
        caseStore: staleReadCaseStore(caseStore, snapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.setEvidenceDisposition('cmd-race', {
        caseId: snapshot.id,
        evidenceId,
        disposition: 'excluded',
        reason: 'reason',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('conflict');
    });
  });

  describe('focusEvidence', () => {
    function withEvidence(): { snapshot: CaseState; evidenceId: string } {
      const snapshot = startDemo();
      caseStore.append(
        snapshot.id,
        [
          {
            eventId: 'ev-evidence',
            caseId: snapshot.id,
            sequence: snapshot.eventSequence + 1,
            timestamp: FIXED_NOW,
            type: 'evidence.accepted',
            payload: {
              evidenceLink: {
                id: 'evidence-1',
                obligationId: 'hard-constraints',
                level: 'E1',
                verdict: 'pass',
                disposition: 'included',
                summary: 'summary',
                stale: false,
                createdAt: FIXED_NOW,
                updatedAt: FIXED_NOW,
              },
            },
          },
        ],
        snapshot.eventSequence,
      );
      const updated = caseStore.load(snapshot.id);
      if (updated === undefined) throw new Error('expected case');
      return { snapshot: updated, evidenceId: 'evidence-1' };
    }

    it('sets selectedEvidenceId (success)', () => {
      const { snapshot, evidenceId } = withEvidence();
      const result = service.focusEvidence('cmd-3', {
        caseId: snapshot.id,
        evidenceId,
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      expect(requireSnapshot(result.value).selectedEvidenceId).toBe(evidenceId);
    });

    it('rejects invalid input (validation)', () => {
      const result = service.focusEvidence('cmd-3', {
        caseId: '',
        evidenceId: '',
        expectedSequence: -1,
      });
      expect(result.status).toBe('validation');
    });

    it('rejects an unknown evidenceId (validation)', () => {
      const { snapshot } = withEvidence();
      const result = service.focusEvidence('cmd-3', {
        caseId: snapshot.id,
        evidenceId: 'does-not-exist',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.focusEvidence('cmd-3', {
        caseId: 'missing',
        evidenceId: 'x',
        expectedSequence: 0,
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const { snapshot, evidenceId } = withEvidence();
      const result = service.focusEvidence('cmd-3', {
        caseId: snapshot.id,
        evidenceId,
        expectedSequence: snapshot.eventSequence + 1,
      });
      expect(result.status).toBe('conflict');
    });

    it('is idempotent: retrying the same commandId returns the original result', () => {
      const { snapshot, evidenceId } = withEvidence();
      const input = { caseId: snapshot.id, evidenceId, expectedSequence: snapshot.eventSequence };
      const first = service.focusEvidence('cmd-3', input);
      requireOk(first);
      const second = service.focusEvidence('cmd-3', input);
      requireOk(second);
      expect(second.value.caseId).toBe(first.value.caseId);
    });

    it('returns a 409-shaped conflict when the underlying updateSelection() call itself detects the case has advanced', () => {
      const { snapshot, evidenceId } = withEvidence();
      const advanced = service.upsertOption('cmd-real', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: { label: 'Toyota Corolla', kind: 'car', attributes: [] },
      });
      requireOk(advanced);

      const staleReadService = new CommandService({
        caseStore: staleReadCaseStore(caseStore, snapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.focusEvidence('cmd-race', {
        caseId: snapshot.id,
        evidenceId,
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('conflict');
    });
  });

  describe('reviewProposal and requestRevision', () => {
    function withPendingProposal(): { snapshot: CaseState } {
      const snapshot = startDemo();
      caseStore.append(
        snapshot.id,
        [
          {
            eventId: 'ev-rec',
            caseId: snapshot.id,
            sequence: snapshot.eventSequence + 1,
            timestamp: FIXED_NOW,
            type: 'recommendation.ready',
            payload: {
              recommendation: {
                id: 'rec-1',
                status: 'ready',
                favoredOptionId: null,
                rationale: 'because',
                facts: [],
                hypotheses: [],
                confidence: 0.5,
                limitations: [],
                sourceIds: [],
                resolvedObligationIds: [],
                acceptedUncertaintyObligationIds: [],
                generatedAt: FIXED_NOW,
              },
            },
          },
          {
            eventId: 'ev-proposal',
            caseId: snapshot.id,
            sequence: snapshot.eventSequence + 2,
            timestamp: FIXED_NOW,
            type: 'proposal.reviewed',
            payload: {
              proposal: {
                id: 'proposal-1',
                recommendationId: 'rec-1',
                status: 'pending',
                createdAt: FIXED_NOW,
              },
            },
          },
        ],
        snapshot.eventSequence,
      );
      const updated = caseStore.load(snapshot.id);
      if (updated === undefined) throw new Error('expected case');
      return { snapshot: updated };
    }

    it('approves a pending proposal when actor is human (success), moving the case to decided', () => {
      const { snapshot } = withPendingProposal();
      const result = service.reviewProposal('cmd-3', {
        caseId: snapshot.id,
        proposalId: 'proposal-1',
        actor: 'human',
        decision: 'approve',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.proposal?.status).toBe('approved');
      expect(updated.status).toBe('decided');
    });

    it('rejects an agent actor attempting to approve (policy) -- the human-only authority rule', () => {
      const { snapshot } = withPendingProposal();
      const result = service.reviewProposal('cmd-3', {
        caseId: snapshot.id,
        proposalId: 'proposal-1',
        actor: 'agent',
        decision: 'approve',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('policy');
      // The case must remain exactly as it was -- no partial mutation.
      expect(caseStore.load(snapshot.id)?.status).not.toBe('decided');
    });

    it('rejects invalid input (validation)', () => {
      const result = service.reviewProposal('cmd-3', {
        caseId: '',
        proposalId: '',
        actor: 'human',
        decision: 'approve',
        expectedSequence: -1,
      });
      expect(result.status).toBe('validation');
    });

    it('returns not_found for a missing case', () => {
      const result = service.reviewProposal('cmd-3', {
        caseId: 'missing',
        proposalId: 'x',
        actor: 'human',
        decision: 'approve',
        expectedSequence: 0,
      });
      expect(result.status).toBe('not_found');
    });

    it('returns conflict for a stale expectedSequence', () => {
      const { snapshot } = withPendingProposal();
      const result = service.reviewProposal('cmd-3', {
        caseId: snapshot.id,
        proposalId: 'proposal-1',
        actor: 'human',
        decision: 'approve',
        expectedSequence: snapshot.eventSequence + 1,
      });
      expect(result.status).toBe('conflict');
    });

    it('rejects reviewing a proposal id that does not match the pending one (validation, from core)', () => {
      const { snapshot } = withPendingProposal();
      const result = service.reviewProposal('cmd-3', {
        caseId: snapshot.id,
        proposalId: 'does-not-match',
        actor: 'human',
        decision: 'approve',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('validation');
    });

    it('requestRevision routes through reviewProposal with decision request_revision and actor human (success)', () => {
      const { snapshot } = withPendingProposal();
      const result = service.requestRevision('cmd-3', {
        caseId: snapshot.id,
        proposalId: 'proposal-1',
        instructions: 'Please reconsider the mileage assumption.',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.proposal?.status).toBe('revision_requested');
      expect(updated.proposal?.revisionInstructions).toBe(
        'Please reconsider the mileage assumption.',
      );
      // request_revision never approves -- status must not become decided.
      expect(updated.status).not.toBe('decided');
    });

    it('requestRevision rejects invalid input (validation)', () => {
      const result = service.requestRevision('cmd-3', {
        caseId: '',
        proposalId: '',
        instructions: '',
        expectedSequence: -1,
      });
      expect(result.status).toBe('validation');
    });

    it('is idempotent: retrying the same commandId returns the original result (applyProposalReview, shared by reviewProposal/requestRevision)', () => {
      const { snapshot } = withPendingProposal();
      const input = {
        caseId: snapshot.id,
        proposalId: 'proposal-1',
        actor: 'human' as const,
        decision: 'approve' as const,
        expectedSequence: snapshot.eventSequence,
      };
      const first = service.reviewProposal('cmd-3', input);
      requireOk(first);
      const second = service.reviewProposal('cmd-3', input);
      requireOk(second);
      expect(second.value.acceptedSequence).toBe(first.value.acceptedSequence);
    });

    it('rejects a pending proposal when actor is human (success), recording a "Proposal rejected." activity summary (every other test above only ever approves or requests revision)', () => {
      const { snapshot } = withPendingProposal();
      const result = service.reviewProposal('cmd-3', {
        caseId: snapshot.id,
        proposalId: 'proposal-1',
        actor: 'human',
        decision: 'reject',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(result);
      const updated = requireSnapshot(result.value);
      expect(updated.proposal?.status).toBe('rejected');

      const activity = activityStore.replayFrom(snapshot.id, 0);
      expect(activity.some((event) => event.summary === 'Proposal rejected.')).toBe(true);
    });

    it('returns a 409-shaped conflict when the underlying append() call itself detects the case has advanced (applyProposalReview, shared by reviewProposal/requestRevision)', () => {
      const { snapshot } = withPendingProposal();
      const advanced = service.upsertOption('cmd-real', {
        caseId: snapshot.id,
        expectedSequence: snapshot.eventSequence,
        option: { label: 'Toyota Corolla', kind: 'car', attributes: [] },
      });
      requireOk(advanced);

      const staleReadService = new CommandService({
        caseStore: staleReadCaseStore(caseStore, snapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.reviewProposal('cmd-race', {
        caseId: snapshot.id,
        proposalId: 'proposal-1',
        actor: 'human',
        decision: 'approve',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('conflict');
    });
  });

  // `applyProposalReview`'s `proposal === null` guard (right after the
  // try/catch around `reviewProposalDomain`) is not covered here,
  // deliberately: the method's own comment already documents why --
  // `reviewProposalDomain` (the real `@sift/core` function under test
  // throughout this describe block) only ever returns a `CaseState` with a
  // non-null `proposal`; every input that would leave one unset is rejected
  // via a thrown error first (caught above). Not reachable without directly
  // replacing `@sift/core`'s real `reviewProposal`, which this suite
  // deliberately never does.
  //
  // `applyProposalReview`'s `catch` block's `throw error;` re-throw (the
  // `isSiftDomainError(error)` false path) is likewise not covered:
  // `reviewProposalDomain` only ever throws `PolicyViolationError` or
  // `ValidationFailedError` (both `SiftDomainError` subclasses,
  // packages/core/src/errors.ts) -- confirmed by reading every throw site in
  // packages/core/src/policy.ts. The `isSiftDomainError(error)` *true*
  // branch is already covered above ("rejects reviewing a proposal id that
  // does not match the pending one").

  // `checkIdempotent`'s "idempotency record references a case that no
  // longer exists" throw (see that method's own comment) is not reachable
  // through any real `CaseStore` public API: both `MemoryCaseStore` and
  // `SqliteCaseStore`'s `resetDemo()` remove a case's idempotency records
  // together with the case itself (the SQLite `idempotency_keys.case_id`
  // foreign key cascades on delete; `MemoryCaseStore.resetDemo` mirrors
  // that by filtering its own idempotency map) -- unlike
  // `run-service.ts`'s equivalent guard (`run-service.test.ts` covers it),
  // whose `RunStore` is a genuinely separate store with no such enforced
  // consistency with `CaseStore`. Left as documented, provably-unreachable
  // defense-in-depth, the same treatment `case-store.ts`'s own analogous
  // "folding produced no snapshot" guard gets.

  // `toReceipt`'s own `switch (result.status)` statement is not given a
  // `default:` arm: `AppendResult['status']` is a closed, fully-enumerated
  // union ('applied' | 'duplicate' | 'conflict' | 'not_found'), and every one
  // of those four literal cases is genuinely exercised somewhere in this
  // file ('applied'/'duplicate' throughout; 'conflict'/'not_found' by the
  // race-simulation tests directly below). The switch's own implicit
  // "matched no case" fallthrough is therefore not reachable by any value a
  // real `CaseStore` can produce -- only by a `CaseStore` implementation
  // that violates its own return-type contract, which this suite does not
  // simulate (unlike the deliberate stale-`load()` race below, that would
  // not be testing this file's real behavior, only a fabricated one).

  describe('toReceipt() conflict/not_found passthrough from CaseStore.append() itself', () => {
    // `loadForMutation()` already pre-checks `expectedSequence` against
    // `caseStore.load()`'s result before any command builds its events --
    // in a single synchronous process (as every other test in this file
    // runs), that pre-check and the later `caseStore.append()` call always
    // agree, so `toReceipt`'s own `'conflict'`/`'not_found'` branches never
    // fire that way. They exist for the real case `append()`'s own atomic
    // check protects against: another request committing between this
    // command's read and its write (architecture.md "Command and event
    // flow": exactly the optimistic-concurrency contract `append()`
    // enforces). Simulated here with a store wrapper whose `load()`
    // deliberately returns a stale snapshot while `append()` still sees the
    // real, since-advanced state -- proving `toReceipt` (not just
    // `loadForMutation`) correctly turns each of `append()`'s outcomes into
    // the right `ServiceResult`.
    function withStaleReadStore(real: MemoryCaseStore, staleSnapshot: CaseState) {
      return {
        load: (_caseId: string) => staleSnapshot,
        append: real.append.bind(real),
        updateSelection: real.updateSelection.bind(real),
        peekIdempotent: real.peekIdempotent.bind(real),
        subscribe: real.subscribe.bind(real),
        resetDemo: real.resetDemo.bind(real),
      };
    }

    it('returns a 409-shaped conflict when append() itself detects the case has advanced', () => {
      const snapshot = startDemo();
      const staleSnapshot = snapshot;
      // A second command commits for real, advancing the case past what
      // the stale read above still reflects.
      const advanced = service.selectPack('cmd-real', {
        caseId: snapshot.id,
        packId: 'car-purchase',
        expectedSequence: snapshot.eventSequence,
      });
      requireOk(advanced);

      const staleReadService = new CommandService({
        caseStore: withStaleReadStore(caseStore, staleSnapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.selectPack('cmd-race', {
        caseId: snapshot.id,
        packId: 'car-purchase',
        expectedSequence: staleSnapshot.eventSequence,
      });
      expect(result.status).toBe('conflict');
      if (result.status !== 'conflict') throw new Error('expected conflict');
      expect(result.actualSequence).toBe(advanced.value.acceptedSequence);
    });

    it('returns not_found when append() itself finds the case gone', () => {
      const snapshot = startDemo();
      caseStore.resetDemo(snapshot.id);

      const staleReadService = new CommandService({
        caseStore: withStaleReadStore(caseStore, snapshot),
        activityStore,
        registry,
        clock: fixedClock,
        idGenerator: createSequentialIdGenerator(),
      });

      const result = staleReadService.selectPack('cmd-race', {
        caseId: snapshot.id,
        packId: 'car-purchase',
        expectedSequence: snapshot.eventSequence,
      });
      expect(result.status).toBe('not_found');
    });
  });
});
