/**
 * `CommandService`: one method per `SiftCommands` verb except
 * `requestInvestigation` (docs/specs/architecture.md "Shared command
 * client"; `run-service.ts` owns `requestInvestigation` -- see that file's
 * header comment for why it is a genuinely separate concern, not merely a
 * split for convenience).
 *
 * Every method follows the same shape (docs/specs/architecture.md "Command
 * and event flow"):
 *  1. validate the raw input against its real `@sift/contracts` Zod schema;
 *  2. load the case and check `expectedSequence` (optimistic concurrency);
 *  3. derive the resulting `CaseEvent`(s) using the appropriate `@sift/core`
 *     pure function;
 *  4. call `CaseStore.append()` with idempotency-key deduplication;
 *  5. derive and append the matching `PublicActivityEvent`(s);
 *  6. return a `CommandReceipt`-shaped `ServiceResult`.
 *
 * `commandId` (the idempotency key) is a caller-supplied parameter, not a
 * field on any `@sift/contracts` `*Input` schema -- none of them carry one
 * (confirmed: `apps/agent/src/db/schema.ts`'s own header comment reaches the
 * same conclusion for the DB layer: "the client-generated `commandId` *is*
 * the idempotency key ... that is the only identifier the contracts
 * actually carry"). `routes/commands.ts` reads it from the request's
 * `Idempotency-Key` header, a well-established REST convention, rather than
 * this module inventing an ad hoc envelope schema.
 *
 * --- Real, confirmed gaps in the current `@sift/contracts` `CaseEvent`
 * taxonomy this module works around, all documented in depth in
 * `store/case-store.ts` (`AppendOptions.seedSnapshot`, `SelectionPatch`) ---
 *
 *  - `attributeDefinitions` (creation only: `startDemo`'s `seedSnapshot`);
 *  - `selectedOptionId`/`selectedEvidenceId`/`activeFocus` (`focusOption`/
 *    `focusEvidence`'s `updateSelection`);
 *  - `sources` (`submitSource`'s `updateSelection`).
 *
 * --- Deliberately deferred to a later task (documented, not silently
 * dropped) ---
 *
 *  - `updateCriteria`/`defineCaseAttribute` do not derive a case obligation
 *    for a newly-added user concern needing an evidence question
 *    (`criterionNeedsEvidenceQuestion` in `@sift/core`'s `criteria.ts` is a
 *    pure predicate only; resolving a pack's `extensionPolicy.
 *    userConcernTemplateId` into a concrete `ObligationTemplate` is not
 *    named among this task's explicit deliverables, and
 *    `docs/specs/testing.md`'s "the compact `apartment-hunt` authoring
 *    fixture must ... create a case obligation" names the pack-conformance
 *    suite, not `apps/agent`'s command service, as where this is proven).
 *    `updateCriteria`/`defineCaseAttribute` still correctly update
 *    `criteria`/`caseExtensions` and invalidate a stale `recommendation`.
 *  - `submitSource` durably records the submitted `Source` itself (via
 *    `updateSelection`), but does not create `Claim`/`EvidenceLink` records
 *    for its `claims`: `SubmitSourceInputSchema` carries no `obligationId`
 *    to link them to, and resolving one (matching a claim to the right
 *    obligation) is real business logic outside this task's explicit scope.
 *  - `defineCaseAttribute`'s `origin` (`'user'` vs `'agent_proposed'`,
 *    which decides whether the extension is immediately usable or needs
 *    `reviewCaseExtension` confirmation first) has no signal in
 *    `DefineCaseAttributeInputSchema` at all -- CLAUDE.md's "Visible UI
 *    controls and WebMCP callbacks use the same command implementation"
 *    means this method cannot infer it from *which* route called it either.
 *    Exposed as an optional parameter defaulting to `'user'` (the direct-UI
 *    path); a later WebMCP-adapter task can pass `'agent_proposed'`
 *    explicitly for a model-initiated proposal.
 */
import {
  DefineCaseAttributeInputSchema,
  FocusEvidenceInputSchema,
  FocusOptionInputSchema,
  ReviewCaseExtensionInputSchema,
  ReviewProposalInputSchema,
  RequestRevisionInputSchema,
  SelectPackInputSchema,
  SetEvidenceDispositionInputSchema,
  StartCaseInputSchema,
  StartDemoInputSchema,
  SubmitSourceInputSchema,
  UpdateCriteriaInputSchema,
  UpsertOptionInputSchema,
  type AttributeRecord,
  type CaseEvent,
  type CaseAttributeOrigin,
  type CaseState,
  type CommandReceipt,
  type CompiledDecisionPack,
  type Criterion,
  type EntityRecord,
  type EvidenceLink,
  type PublicActivityEvent,
  type ReviewProposalInput,
  type Source,
} from '@sift/contracts';
import {
  addCriterion,
  createAttributeRecord,
  defineCaseExtension,
  instantiateCase,
  isSiftDomainError,
  PolicyViolationError,
  removeCriterion,
  renameCriterion,
  reviewCaseExtension as reviewCaseExtensionDomain,
  reviewProposal as reviewProposalDomain,
  reweightCriterion,
  type Clock,
  type IdGenerator,
  type PackSelection,
} from '@sift/core';
import type { PackRegistry } from '@sift/packs';
import type { ActivityStore } from '../store/activity-store.js';
import type { AppendResult, CaseStore } from '../store/case-store.js';
import {
  conflict,
  formatZodIssues,
  notFound,
  ok,
  policyFailure,
  validationFailure,
  type ServiceResult,
} from './service-result.js';

export interface CommandServiceDeps {
  readonly caseStore: CaseStore;
  readonly activityStore: ActivityStore;
  readonly registry: PackRegistry;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  /**
   * Demo id -> starting `EntityRecord`s for `startDemo` to seed onto the
   * freshly created case, alongside its `pack`/`criteria`/`obligations`
   * (`instantiateCase` always seeds `entities: []` -- packs-and-routing.md
   * says nothing about starting candidates because that is demo-launcher
   * behavior, not pack data). Optional so every pack/demo without an entry
   * (and every existing test) keeps starting with zero entities unchanged.
   *
   * `upsertOption` cannot be reused to seed these instead:
   * `OptionAttributeInputSchema.value` is required and the handler
   * hardcodes `status: 'asserted'`, so an entity carrying a legitimately
   * `status: 'unknown'` attribute (no value -- CLAUDE.md "never fabricate")
   * can only be expressed as a direct `option.upserted` event, which is
   * exactly what `startDemo` appends here.
   */
  readonly demoSeedEntities?: Readonly<Record<string, (clock: Clock) => readonly EntityRecord[]>>;
}

function compareSemver(a: string, b: string): number {
  const partsOf = (version: string): number[] => version.split('.').map(Number);
  const [aMajor = 0, aMinor = 0, aPatch = 0] = partsOf(a);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = partsOf(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/** The highest-`version` compiled pack registered under `packId`, or `undefined` when none is installed. */
function resolveLatestPack(
  registry: PackRegistry,
  packId: string,
): CompiledDecisionPack | undefined {
  const candidates = registry.list().filter((pack) => pack.identity.id === packId);
  return candidates.reduce<CompiledDecisionPack | undefined>((latest, candidate) => {
    if (latest === undefined) return candidate;
    return compareSemver(candidate.identity.version, latest.identity.version) > 0
      ? candidate
      : latest;
  }, undefined);
}

export class CommandService {
  constructor(private readonly deps: CommandServiceDeps) {}

  startDemo(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = StartDemoInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure('Invalid startDemo input.', formatZodIssues(parsed.error.issues));
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const pack = resolveLatestPack(this.deps.registry, input.demoId);
    if (pack === undefined) {
      return notFound(`No installed Decision Pack was found for demo "${input.demoId}".`);
    }

    const selection: PackSelection = {
      selectedBy: 'user',
      reasons: [`Started the "${input.demoId}" demo from the launcher.`],
    };
    const seed = instantiateCase(pack, selection, this.deps.clock, this.deps.idGenerator);
    const seedEntities = this.deps.demoSeedEntities?.[input.demoId]?.(this.deps.clock) ?? [];

    const events: CaseEvent[] = [
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: seed.id,
        sequence: 1,
        timestamp: seed.createdAt,
        commandId,
        type: 'case.created',
        payload: { title: seed.title, pack: seed.pack },
      },
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: seed.id,
        sequence: 2,
        timestamp: seed.createdAt,
        commandId,
        type: 'criteria.updated',
        payload: { criteria: seed.criteria },
      },
      ...seed.obligations.map((obligation, index): CaseEvent => ({
        eventId: this.deps.idGenerator.next('event'),
        caseId: seed.id,
        sequence: 3 + index,
        timestamp: seed.createdAt,
        commandId,
        type: 'obligation.updated',
        payload: { obligation },
      })),
      ...seedEntities.map((entity, index): CaseEvent => ({
        eventId: this.deps.idGenerator.next('event'),
        caseId: seed.id,
        sequence: 3 + seed.obligations.length + index,
        timestamp: seed.createdAt,
        commandId,
        type: 'option.upserted',
        payload: { entity },
      })),
    ];

    const result = this.deps.caseStore.append(seed.id, events, 0, {
      seedSnapshot: seed,
      idempotency: { commandId, commandName: 'startDemo' },
    });

    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: seed.createdAt,
        caseId: result.snapshot.id,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `Started "${pack.identity.name}".`,
      });
      for (const entity of seedEntities) {
        this.emitActivity({
          timestamp: seed.createdAt,
          caseId: result.snapshot.id,
          commandId,
          type: 'command.accepted',
          phase: 'completed',
          summary: `Added option "${entity.label}".`,
        });
      }
    }
    return this.toReceipt(commandId, result);
  }

  /**
   * `startCase` (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md):
   * a normal, non-demo case-creation entry point pinned to any registered
   * pack id -- unlike `startDemo`, never resets to a fixture and seeds zero
   * entities (a catalog-built case's candidates are added afterward, one
   * per vehicle, via the existing, unmodified `upsertOption`). Mirrors
   * `startDemo`'s exact event sequence (`case.created` then
   * `criteria.updated` then one `obligation.updated` per derived
   * obligation) minus the seed-entity events `startDemo`'s
   * `demoSeedEntities` hook adds -- `instantiateCase` always derives
   * `entities: []`, so there is nothing to seed here by construction.
   */
  startCase(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = StartCaseInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure('Invalid startCase input.', formatZodIssues(parsed.error.issues));
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const pack = resolveLatestPack(this.deps.registry, input.packId);
    if (pack === undefined) {
      return notFound(`No installed Decision Pack was found for pack id "${input.packId}".`);
    }

    const selection: PackSelection = {
      selectedBy: 'user',
      reasons: [`Started a new case against "${pack.identity.name}".`],
    };
    const seed = instantiateCase(pack, selection, this.deps.clock, this.deps.idGenerator);

    const events: CaseEvent[] = [
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: seed.id,
        sequence: 1,
        timestamp: seed.createdAt,
        commandId,
        type: 'case.created',
        payload: { title: seed.title, pack: seed.pack },
      },
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: seed.id,
        sequence: 2,
        timestamp: seed.createdAt,
        commandId,
        type: 'criteria.updated',
        payload: { criteria: seed.criteria },
      },
      ...seed.obligations.map((obligation, index): CaseEvent => ({
        eventId: this.deps.idGenerator.next('event'),
        caseId: seed.id,
        sequence: 3 + index,
        timestamp: seed.createdAt,
        commandId,
        type: 'obligation.updated',
        payload: { obligation },
      })),
    ];

    const result = this.deps.caseStore.append(seed.id, events, 0, {
      seedSnapshot: seed,
      idempotency: { commandId, commandName: 'startCase' },
    });

    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: seed.createdAt,
        caseId: result.snapshot.id,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `Started a new case against "${pack.identity.name}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  selectPack(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = SelectPackInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure('Invalid selectPack input.', formatZodIssues(parsed.error.issues));
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    const pack = resolveLatestPack(this.deps.registry, input.packId);
    if (pack === undefined) {
      return validationFailure(`Pack "${input.packId}" is not installed.`);
    }

    const now = this.deps.clock.now();
    const event: CaseEvent = {
      eventId: this.deps.idGenerator.next('event'),
      caseId: input.caseId,
      sequence: snapshot.eventSequence + 1,
      timestamp: now,
      commandId,
      type: 'case.pack_selected',
      payload: {
        pack: {
          id: pack.identity.id,
          version: pack.identity.version,
          compiledHash: pack.compiledHash,
          selectedBy: 'user',
          reasons: ['User explicitly selected this Decision Pack.'],
        },
      },
    };

    const result = this.deps.caseStore.append(input.caseId, [event], input.expectedSequence, {
      idempotency: { commandId, commandName: 'selectPack' },
    });
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `Selected Decision Pack "${pack.identity.id}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  upsertOption(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = UpsertOptionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure('Invalid upsertOption input.', formatZodIssues(parsed.error.issues));
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    const optionId = input.optionId ?? this.deps.idGenerator.next('option');
    const existingEntity = snapshot.entities.find((entity) => entity.id === optionId);

    const now = this.deps.clock.now();
    const attributes: Record<string, AttributeRecord> = {};
    const errors: string[] = [];
    for (const attribute of input.option.attributes) {
      const recordResult = createAttributeRecord(
        {
          definitionId: attribute.definitionId,
          label: attribute.label ?? attribute.definitionId,
          origin: 'user',
          status: 'asserted',
          value: attribute.value,
          ...(attribute.sourceIds !== undefined ? { sourceIds: attribute.sourceIds } : {}),
        },
        this.deps.clock,
      );
      if (!recordResult.ok) {
        errors.push(...recordResult.errors);
        continue;
      }
      attributes[attribute.definitionId] = recordResult.value;
    }
    if (errors.length > 0) {
      return validationFailure('Invalid option attributes.', errors);
    }

    const entity: EntityRecord = {
      id: optionId,
      kind: input.option.kind,
      label: input.option.label,
      attributes,
      createdAt: existingEntity?.createdAt ?? now,
      updatedAt: now,
    };

    const event: CaseEvent = {
      eventId: this.deps.idGenerator.next('event'),
      caseId: input.caseId,
      sequence: snapshot.eventSequence + 1,
      timestamp: now,
      commandId,
      type: 'option.upserted',
      payload: { entity },
    };

    const result = this.deps.caseStore.append(input.caseId, [event], input.expectedSequence, {
      idempotency: { commandId, commandName: 'upsertOption' },
    });
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `${existingEntity !== undefined ? 'Updated' : 'Added'} option "${entity.label}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  focusOption(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = FocusOptionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure('Invalid focusOption input.', formatZodIssues(parsed.error.issues));
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    if (!snapshot.entities.some((entity) => entity.id === input.optionId)) {
      return validationFailure(
        `Option "${input.optionId}" was not found on case "${input.caseId}".`,
      );
    }

    const now = this.deps.clock.now();
    const result = this.deps.caseStore.updateSelection(
      input.caseId,
      { selectedOptionId: input.optionId },
      input.expectedSequence,
      now,
      { commandId, commandName: 'focusOption' },
    );
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `Focused option "${input.optionId}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  /** See this file's header comment for the `origin` default judgment call. */
  defineCaseAttribute(
    commandId: string,
    rawInput: unknown,
    origin: CaseAttributeOrigin = 'user',
  ): ServiceResult<CommandReceipt> {
    const parsed = DefineCaseAttributeInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid defineCaseAttribute input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    const existingAttributeIds = [
      ...snapshot.attributeDefinitions.map((definition) => definition.id),
      ...snapshot.caseExtensions.map((extension) => extension.definition.id),
    ];

    // Rebuilt as a plain object (rather than passing `input.definition`
    // through as-is) because Zod's inferred type for an `.optional()` field
    // is `T | undefined` (the key's *value* may be explicitly `undefined`),
    // while `CaseAttributeDraft` (`@sift/core`) declares `unit?: string` in
    // the stricter `exactOptionalPropertyTypes` sense (the key must be
    // *omitted*, never present with value `undefined`) -- conditionally
    // spreading each optional field reconciles the two.
    const draft = {
      id: input.definition.id,
      label: input.definition.label,
      valueType: input.definition.valueType,
      appliesTo: input.definition.appliesTo,
      evidenceExpectation: input.definition.evidenceExpectation,
      comparison: input.definition.comparison,
      reason: input.definition.reason,
      ...(input.definition.unit !== undefined ? { unit: input.definition.unit } : {}),
      ...(input.definition.allowedValues !== undefined
        ? { allowedValues: input.definition.allowedValues }
        : {}),
    };

    const extensionResult = defineCaseExtension(
      draft,
      {
        caseId: input.caseId,
        origin,
        proposedBy: origin === 'user' ? 'user' : 'model',
        existingAttributeIds,
      },
      { clock: this.deps.clock, idGenerator: this.deps.idGenerator },
    );
    if (!extensionResult.ok) {
      return validationFailure('Unable to define case attribute.', extensionResult.errors);
    }

    const now = this.deps.clock.now();
    const event: CaseEvent = {
      eventId: this.deps.idGenerator.next('event'),
      caseId: input.caseId,
      sequence: snapshot.eventSequence + 1,
      timestamp: now,
      commandId,
      type: 'extension.defined',
      payload: { extension: extensionResult.value },
    };

    const result = this.deps.caseStore.append(input.caseId, [event], input.expectedSequence, {
      idempotency: { commandId, commandName: 'defineCaseAttribute' },
    });
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: origin === 'user' ? 'command.accepted' : 'intervention.confirmation_required',
        phase: origin === 'user' ? 'completed' : 'waiting',
        summary: `${origin === 'user' ? 'Defined' : 'Proposed'} case attribute "${input.definition.id}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  reviewCaseExtension(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = ReviewCaseExtensionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid reviewCaseExtension input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    const extension = snapshot.caseExtensions.find((item) => item.id === input.extensionId);
    if (extension === undefined) {
      return validationFailure(
        `Case extension "${input.extensionId}" was not found on case "${input.caseId}".`,
      );
    }

    const reviewResult = reviewCaseExtensionDomain(extension, input.decision);
    if (!reviewResult.ok) {
      return validationFailure('Unable to review case extension.', reviewResult.errors);
    }

    const now = this.deps.clock.now();
    const event: CaseEvent = {
      eventId: this.deps.idGenerator.next('event'),
      caseId: input.caseId,
      sequence: snapshot.eventSequence + 1,
      timestamp: now,
      commandId,
      type: 'extension.confirmed',
      payload: { extensionId: input.extensionId, decision: input.decision },
    };

    const result = this.deps.caseStore.append(input.caseId, [event], input.expectedSequence, {
      idempotency: { commandId, commandName: 'reviewCaseExtension' },
    });
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `${input.decision === 'confirm' ? 'Confirmed' : 'Rejected'} case extension "${input.extensionId}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  focusEvidence(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = FocusEvidenceInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid focusEvidence input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    if (!snapshot.evidenceLinks.some((link) => link.id === input.evidenceId)) {
      return validationFailure(
        `Evidence "${input.evidenceId}" was not found on case "${input.caseId}".`,
      );
    }

    const now = this.deps.clock.now();
    const result = this.deps.caseStore.updateSelection(
      input.caseId,
      { selectedEvidenceId: input.evidenceId },
      input.expectedSequence,
      now,
      { commandId, commandName: 'focusEvidence' },
    );
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `Focused evidence "${input.evidenceId}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  updateCriteria(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = UpdateCriteriaInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid updateCriteria input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    const pack = this.deps.registry.get(snapshot.pack.id, snapshot.pack.version);
    if (pack === undefined) {
      throw new Error(
        `CommandService.updateCriteria: pinned pack "${snapshot.pack.id}@${snapshot.pack.version}" is not present in the registry.`,
      );
    }

    let criteria: Criterion[] = [...snapshot.criteria];
    for (const operation of input.operations) {
      switch (operation.op) {
        case 'add': {
          if (!pack.criteria.allowUserDefined) {
            return policyFailure(
              `Pack "${pack.identity.id}" does not allow user-defined criteria.`,
            );
          }
          // Same exactOptionalPropertyTypes reconciliation as
          // `defineCaseAttribute`'s `draft` above: rebuild rather than pass
          // Zod's parsed `operation.criterion` straight through.
          const criterionInput = {
            id: operation.criterion.id,
            label: operation.criterion.label,
            kind: operation.criterion.kind,
            weight: operation.criterion.weight,
            direction: operation.criterion.direction,
            ...(operation.criterion.target !== undefined
              ? { target: operation.criterion.target }
              : {}),
            ...(operation.criterion.appliesToAttribute !== undefined
              ? { appliesToAttribute: operation.criterion.appliesToAttribute }
              : {}),
            ...(operation.criterion.question !== undefined
              ? { question: operation.criterion.question }
              : {}),
          };
          const result = addCriterion(criteria, criterionInput, 'user');
          if (!result.ok) return validationFailure('Unable to update criteria.', result.errors);
          criteria = result.value;
          break;
        }
        case 'remove': {
          if (pack.criteria.protectedCriterionIds.includes(operation.criterionId)) {
            return policyFailure(
              `Criterion "${operation.criterionId}" is protected by the pack and cannot be removed.`,
            );
          }
          const result = removeCriterion(
            criteria,
            operation.criterionId,
            pack.criteria.protectedCriterionIds,
          );
          if (!result.ok) return validationFailure('Unable to update criteria.', result.errors);
          criteria = result.value;
          break;
        }
        case 'reweight': {
          if (pack.criteria.protectedCriterionIds.includes(operation.criterionId)) {
            return policyFailure(
              `Criterion "${operation.criterionId}" is protected by the pack and cannot be reweighted.`,
            );
          }
          const result = reweightCriterion(criteria, operation.criterionId, operation.weight, {
            protectedCriterionIds: pack.criteria.protectedCriterionIds,
            allowProtectedReweight: false,
          });
          if (!result.ok) return validationFailure('Unable to update criteria.', result.errors);
          criteria = result.value;
          break;
        }
        case 'rename': {
          const result = renameCriterion(criteria, operation.criterionId, operation.label);
          if (!result.ok) return validationFailure('Unable to update criteria.', result.errors);
          criteria = result.value;
          break;
        }
      }
    }

    const now = this.deps.clock.now();
    const events: CaseEvent[] = [
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: snapshot.eventSequence + 1,
        timestamp: now,
        commandId,
        type: 'criteria.updated',
        payload: { criteria },
      },
    ];
    const invalidatesRecommendation =
      snapshot.recommendation !== null && snapshot.recommendation.status === 'ready';
    if (invalidatesRecommendation && snapshot.recommendation !== null) {
      events.push({
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: snapshot.eventSequence + 2,
        timestamp: now,
        commandId,
        type: 'recommendation.invalidated',
        payload: { recommendationId: snapshot.recommendation.id, reason: 'Criteria changed.' },
      });
    }

    const result = this.deps.caseStore.append(input.caseId, events, input.expectedSequence, {
      idempotency: { commandId, commandName: 'updateCriteria' },
    });
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `Updated criteria (${input.operations.length} change${input.operations.length === 1 ? '' : 's'}).`,
      });
      if (invalidatesRecommendation) {
        this.emitActivity({
          timestamp: now,
          caseId: input.caseId,
          commandId,
          type: 'recommendation.invalidated',
          phase: 'completed',
          summary: 'Recommendation invalidated: criteria changed.',
        });
      }
    }
    return this.toReceipt(commandId, result);
  }

  /**
   * See this file's header comment: durably records the submitted `Source`
   * only. Claim/evidence linkage for `input.source.claims` is deferred (no
   * `obligationId` is present anywhere on `SubmitSourceInput` to target).
   */
  submitSource(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = SubmitSourceInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure('Invalid submitSource input.', formatZodIssues(parsed.error.issues));
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    const now = this.deps.clock.now();
    const source: Source = {
      id: this.deps.idGenerator.next('source'),
      url: input.source.url,
      title: input.source.title,
      ...(input.source.publisher !== undefined ? { publisher: input.source.publisher } : {}),
      ...(input.source.publishedAt !== undefined ? { publishedAt: input.source.publishedAt } : {}),
      retrievedAt: input.source.retrievedAt,
      ...(input.source.excerpt !== undefined ? { excerpt: input.source.excerpt } : {}),
      origin: 'user_submitted',
      verification: 'unverified',
      createdAt: now,
    };

    const result = this.deps.caseStore.updateSelection(
      input.caseId,
      { sources: [...snapshot.sources, source] },
      input.expectedSequence,
      now,
      { commandId, commandName: 'submitSource' },
    );
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: `Submitted source "${source.title}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  setEvidenceDisposition(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = SetEvidenceDispositionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid setEvidenceDisposition input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    const input = parsed.data;

    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    const existing = snapshot.evidenceLinks.find((link) => link.id === input.evidenceId);
    if (existing === undefined) {
      return validationFailure(
        `Evidence "${input.evidenceId}" was not found on case "${input.caseId}".`,
      );
    }

    const now = this.deps.clock.now();
    const updatedLink: EvidenceLink = {
      ...existing,
      disposition: input.disposition,
      dispositionReason: input.reason,
      updatedAt: now,
    };

    const events: CaseEvent[] = [
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: snapshot.eventSequence + 1,
        timestamp: now,
        commandId,
        type: 'evidence.accepted',
        payload: { evidenceLink: updatedLink },
      },
    ];
    const invalidatesRecommendation =
      snapshot.recommendation !== null && snapshot.recommendation.status === 'ready';
    if (invalidatesRecommendation && snapshot.recommendation !== null) {
      events.push({
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: snapshot.eventSequence + 2,
        timestamp: now,
        commandId,
        type: 'recommendation.invalidated',
        payload: {
          recommendationId: snapshot.recommendation.id,
          reason: 'Evidence disposition changed.',
        },
      });
    }

    const result = this.deps.caseStore.append(input.caseId, events, input.expectedSequence, {
      idempotency: { commandId, commandName: 'setEvidenceDisposition' },
    });
    if (result.status === 'applied') {
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'evidence.accepted',
        phase: 'completed',
        summary: `Set evidence "${input.evidenceId}" disposition to "${input.disposition}".`,
      });
    }
    return this.toReceipt(commandId, result);
  }

  requestRevision(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = RequestRevisionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid requestRevision input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    const input = parsed.data;

    return this.applyProposalReview(
      commandId,
      {
        caseId: input.caseId,
        proposalId: input.proposalId,
        actor: 'human',
        decision: 'request_revision',
        instructions: input.instructions,
        expectedSequence: input.expectedSequence,
      },
      'requestRevision',
    );
  }

  reviewProposal(commandId: string, rawInput: unknown): ServiceResult<CommandReceipt> {
    const parsed = ReviewProposalInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid reviewProposal input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    return this.applyProposalReview(commandId, parsed.data, 'reviewProposal');
  }

  private applyProposalReview(
    commandId: string,
    input: ReviewProposalInput,
    commandName: string,
  ): ServiceResult<CommandReceipt> {
    const duplicate = this.checkIdempotent(commandId);
    if (duplicate !== undefined) return duplicate;

    const loaded = this.loadForMutation(input.caseId, input.expectedSequence);
    if (loaded.status !== 'ok') return loaded;
    const snapshot = loaded.value;

    let reviewed: CaseState;
    try {
      reviewed = reviewProposalDomain(snapshot, input, this.deps.clock);
    } catch (error) {
      if (error instanceof PolicyViolationError) {
        return policyFailure(error.message);
      }
      if (isSiftDomainError(error)) {
        return validationFailure(error.message);
      }
      throw error;
    }

    const proposal = reviewed.proposal;
    if (proposal === null) {
      // Unreachable: `reviewProposalDomain` only ever returns a `CaseState`
      // with a non-null `proposal` (it rejects, via a thrown error above,
      // every input that would leave one unset). Guarded defensively so
      // this function's return type stays exactly `CaseEvent` rather than
      // `CaseEvent | undefined`.
      throw new Error(
        'CommandService: reviewProposal produced a null proposal, which should be unreachable.',
      );
    }

    const now = this.deps.clock.now();
    const events: CaseEvent[] = [
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: snapshot.eventSequence + 1,
        timestamp: now,
        commandId,
        type: 'proposal.reviewed',
        payload: { proposal },
      },
    ];

    const result = this.deps.caseStore.append(input.caseId, events, input.expectedSequence, {
      idempotency: { commandId, commandName },
    });
    if (result.status === 'applied') {
      const summary =
        input.decision === 'approve'
          ? 'Proposal approved.'
          : input.decision === 'reject'
            ? 'Proposal rejected.'
            : 'Revision requested.';
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary,
      });
    }
    return this.toReceipt(commandId, result);
  }

  /**
   * Idempotency-key short-circuit, called as the *first* step of every
   * command method (after Zod validation, before `loadForMutation`).
   *
   * Real bug this fixes, worth documenting: a naive implementation checks
   * `expectedSequence` against the case's *current* sequence before ever
   * consulting the idempotency key. That ordering is wrong for any command
   * whose events actually advance `eventSequence` (i.e. every command
   * except the `updateSelection`-based ones, which never advance it at
   * all): a client retrying the exact same `commandId` after a successful
   * first attempt necessarily still carries the *original* (now stale)
   * `expectedSequence` -- the mutation this `commandId` already produced is
   * exactly what advanced the sequence past it. Checking `expectedSequence`
   * first would misclassify that retry as a `409 CONFLICT` instead of
   * replaying the original result, defeating the entire point of
   * idempotency-key deduplication. `CaseStore.append()`/`updateSelection()`
   * already get this ordering right internally (idempotency checked before
   * the sequence check, in the same transaction) -- this mirrors that same
   * ordering at the point *this* class decides whether to do any work at
   * all, via the read-only `CaseStore.peekIdempotent()`.
   */
  private checkIdempotent(commandId: string): ServiceResult<CommandReceipt> | undefined {
    const existing = this.deps.caseStore.peekIdempotent(commandId);
    if (existing === undefined) return undefined;
    const snapshot = this.deps.caseStore.load(existing.caseId);
    if (snapshot === undefined) {
      // Not reachable through any real `CaseStore` public API today: both
      // implementations' `resetDemo()` remove a case's idempotency records
      // together with the case itself (SQLite's `idempotency_keys.case_id`
      // foreign key cascades on delete; `MemoryCaseStore.resetDemo` mirrors
      // that). Kept as defense-in-depth against a future `CaseStore`
      // implementation that does not preserve this invariant.
      throw new Error(
        `CommandService: idempotency record for commandId "${commandId}" references case "${existing.caseId}", which no longer exists`,
      );
    }
    return ok({
      commandId,
      caseId: existing.caseId,
      acceptedSequence: existing.acceptedSequence,
      snapshot,
    });
  }

  private loadForMutation(caseId: string, expectedSequence: number): ServiceResult<CaseState> {
    const snapshot = this.deps.caseStore.load(caseId);
    if (snapshot === undefined) {
      return notFound(`Case "${caseId}" was not found.`);
    }
    if (snapshot.eventSequence !== expectedSequence) {
      return conflict(
        'The case has advanced since expectedSequence was read; refresh and retry.',
        expectedSequence,
        snapshot.eventSequence,
        snapshot,
      );
    }
    return ok(snapshot);
  }

  private toReceipt(commandId: string, result: AppendResult): ServiceResult<CommandReceipt> {
    switch (result.status) {
      case 'applied':
        return ok({
          commandId,
          caseId: result.snapshot.id,
          acceptedSequence: result.snapshot.eventSequence,
          snapshot: result.snapshot,
        });
      case 'duplicate':
        return ok({
          commandId,
          caseId: result.snapshot.id,
          acceptedSequence: result.acceptedSequence,
          snapshot: result.snapshot,
        });
      case 'conflict':
        return conflict(
          'The case has advanced since expectedSequence was read; refresh and retry.',
          result.expectedSequence,
          result.actualSequence,
          result.snapshot,
        );
      case 'not_found':
        return notFound('Case was not found.');
    }
  }

  private emitActivity(
    event: Omit<PublicActivityEvent, 'sequence' | 'eventId' | 'schemaVersion'>,
  ): void {
    this.deps.activityStore.append(event);
  }
}
