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
 * --- Closed by the 2026-08-30 custom-field/research pipeline task (was:
 * "Deliberately deferred to a later task") ---
 *
 *  - `updateCriteria`'s `add` operation now derives a real case obligation
 *    for a newly-added criterion that needs evidence
 *    (`criterionNeedsEvidenceQuestion`, `deriveObligations` -- both real
 *    `@sift/core` functions, used as-is, not reimplemented), gated on the
 *    pinned pack's `extensionPolicy.allowCaseObligations`. See
 *    `synthesizeUserConcernObligationTemplate`'s own doc comment for why
 *    the template content is synthesized generically rather than looked up
 *    from pack data (no pack manifest in this codebase carries real
 *    `userConcern` template content anywhere -- `extensionPolicy.
 *    userConcernTemplateId` is only a reserved id namespace). This is
 *    scoped to `updateCriteria` specifically (not `defineCaseAttribute`):
 *    `criterionNeedsEvidenceQuestion` requires a `Criterion`, which does
 *    not exist until one is added, matching packs-and-routing.md's own
 *    "Users may add ... criteria. When a custom criterion needs evidence,
 *    the core derives a case obligation" ordering.
 *  - `defineCaseAttribute`'s `origin` (`'user'` vs `'agent_proposed'`) is
 *    now also reachable directly on the wire, via
 *    `DefineCaseAttributeInputSchema.origin` (optional, defaulting to
 *    `'user'`) -- see that schema's own doc comment. The pre-existing
 *    method-parameter channel (`originParam`) is preserved unchanged for
 *    backward compatibility with callers that predate this field; the wire
 *    field wins when both are supplied.
 *  - `upsertOption`'s `OptionAttributeInputSchema` now accepts optional
 *    `status`/`confidence`/`origin` alongside an optional (was required)
 *    `value`, so a caller can express a verified value with sources, a
 *    low-confidence agent inference, or an explicit "unknown" -- see that
 *    schema's own doc comment in `packages/contracts/src/commands.ts`.
 *    `AttributeRecordSchema`'s existing cross-field invariant (value
 *    required unless `status: 'unknown'`) is enforced once, by the same
 *    `createAttributeRecord` call this method already made; this task adds
 *    no new invariant logic here.
 *  - `upsertOption`/`reviewCaseExtension` now invalidate a `ready`
 *    recommendation precisely when the write touches a definitionId (or
 *    confirms an extension) an *active* criterion's `appliesToAttribute`
 *    depends on (`criteriaDependOnAttributes`, shared by both) --
 *    narrower, on purpose, than `updateCriteria`/`setEvidenceDisposition`'s
 *    coarser "any change at all" rule, since attribute/extension writes are
 *    far more frequent and often touch fields no criterion currently cares
 *    about.
 *  - `submitSource` now turns `input.source.claims[]` into durable,
 *    option-linked `Claim` records (each paired with an `EvidenceLink`,
 *    the one `CaseEvent` variant that can carry a `Claim`) whenever the
 *    caller supplies the new optional `input.obligationId` --
 *    `SubmitSourceInputSchema`'s own doc comment explains why that field
 *    is genuinely required for linkage and cannot be inferred. When
 *    absent, the `Source` itself still persists (unchanged, pre-existing
 *    behavior) and the activity summary says explicitly how many claims
 *    went unlinked and why -- an honest degradation, not a silent drop.
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
  type Claim,
  type CommandReceipt,
  type CompiledDecisionPack,
  type Criterion,
  type EntityRecord,
  type EvidenceLink,
  type ObligationTemplate,
  type PublicActivityEvent,
  type ReviewProposalInput,
  type Source,
} from '@sift/contracts';
import {
  addCriterion,
  createAttributeRecord,
  criterionNeedsEvidenceQuestion,
  defineCaseExtension,
  deriveObligations,
  instantiateCase,
  isSiftDomainError,
  PolicyViolationError,
  removeCriterion,
  renameCriterion,
  reviewCaseExtension as reviewCaseExtensionDomain,
  reviewProposal as reviewProposalDomain,
  reweightCriterion,
  type Clock,
  type ExistingEvidenceSignal,
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
      // `origin`/`status`/`confidence` default to the exact pre-existing
      // hardcoded values (`'user'`/`'asserted'`/absent) when the caller
      // omits them, preserving backward compatibility for a caller passing
      // just `{ definitionId, value }`. `value` itself is now optional on
      // the wire (`OptionAttributeInputSchema`) so a caller can express
      // `status: 'unknown'` with no value at all -- `createAttributeRecord`
      // (`@sift/core`) already enforces the "value required unless unknown"
      // cross-field invariant and is used exactly as before, just no
      // longer with a value/status pair this method fixes itself.
      const recordResult = createAttributeRecord(
        {
          definitionId: attribute.definitionId,
          label: attribute.label ?? attribute.definitionId,
          origin: attribute.origin ?? 'user',
          status: attribute.status ?? 'asserted',
          ...(attribute.value !== undefined ? { value: attribute.value } : {}),
          ...(attribute.confidence !== undefined ? { confidence: attribute.confidence } : {}),
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

    const events: CaseEvent[] = [
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: snapshot.eventSequence + 1,
        timestamp: now,
        commandId,
        type: 'option.upserted',
        payload: { entity },
      },
    ];

    // Item 4 (dependent invalidation): a `ready` recommendation is
    // invalidated only when this write touches a definitionId at least one
    // *active* criterion actually depends on (`criteriaDependOnAttributes`
    // below) -- not on every option/attribute write. See that method's own
    // doc comment for why the coarser "always invalidate" rule
    // `updateCriteria`/`setEvidenceDisposition` use does not fit here.
    const changedDefinitionIds = new Set(
      input.option.attributes.map((attribute) => attribute.definitionId),
    );
    const invalidatesRecommendation =
      snapshot.recommendation !== null &&
      snapshot.recommendation.status === 'ready' &&
      this.criteriaDependOnAttributes(snapshot.criteria, changedDefinitionIds);
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
          reason: 'A comparison attribute the recommendation depends on changed.',
        },
      });
    }

    const result = this.deps.caseStore.append(input.caseId, events, input.expectedSequence, {
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
      if (invalidatesRecommendation) {
        this.emitActivity({
          timestamp: now,
          caseId: input.caseId,
          commandId,
          type: 'recommendation.invalidated',
          phase: 'completed',
          summary: 'Recommendation invalidated: a dependent option attribute changed.',
        });
      }
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

  /**
   * `originParam` is the pre-existing call-site channel (still used by
   * `apps/agent/src/runtime/car-purchase-scenario.ts` and
   * `car-purchase-engine.test.ts`, both outside this task's scope): a
   * caller that already knows it is agent-driven and does not embed
   * `origin` in the raw command body itself. `input.origin` (now part of
   * `DefineCaseAttributeInputSchema` -- see that schema's own doc comment)
   * is the NEW wire-level channel this task adds, reachable through
   * `routes/commands.ts`'s single-argument `service.defineCaseAttribute
   * (commandId, input)` call and therefore through the WebMCP tool/HTTP
   * route, neither of which pass a third argument. `input.origin` wins
   * when both are present (`effectiveOrigin = input.origin ?? originParam`)
   * so the wire input is authoritative when a caller actually sets it,
   * while every existing caller that supplies only the third argument (and
   * omits `origin` from the body) keeps its exact current behavior
   * unchanged -- `input.origin` is `undefined` in that case, so the
   * expression falls through to `originParam`.
   */
  defineCaseAttribute(
    commandId: string,
    rawInput: unknown,
    originParam: CaseAttributeOrigin = 'user',
  ): ServiceResult<CommandReceipt> {
    const parsed = DefineCaseAttributeInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid defineCaseAttribute input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    const input = parsed.data;
    const origin: CaseAttributeOrigin = input.origin ?? originParam;

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
    const events: CaseEvent[] = [
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: snapshot.eventSequence + 1,
        timestamp: now,
        commandId,
        type: 'extension.confirmed',
        payload: { extensionId: input.extensionId, decision: input.decision },
      },
    ];

    // Item 4: only a *confirm* decision can newly make a custom attribute
    // usable, so only `confirm` is checked for invalidation -- a `reject`
    // permanently disqualifies the extension and cannot make any active
    // criterion's dependency newly satisfiable or newly stale (the
    // criterion, if one already references it, was already depending on a
    // not-yet-usable value either way). Scoped to whether an *active*
    // criterion's `appliesToAttribute` already names this extension's
    // attribute id -- confirming an extension no criterion references yet
    // cannot affect a current recommendation.
    const invalidatesRecommendation =
      input.decision === 'confirm' &&
      snapshot.recommendation !== null &&
      snapshot.recommendation.status === 'ready' &&
      this.criteriaDependOnAttributes(snapshot.criteria, new Set([extension.definition.id]));
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
          reason: 'A confirmed case extension the recommendation depends on changed.',
        },
      });
    }

    const result = this.deps.caseStore.append(input.caseId, events, input.expectedSequence, {
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
      if (invalidatesRecommendation) {
        this.emitActivity({
          timestamp: now,
          caseId: input.caseId,
          commandId,
          type: 'recommendation.invalidated',
          phase: 'completed',
          summary: 'Recommendation invalidated: a confirmed case extension changed.',
        });
      }
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
    const addedCriterionIds: string[] = [];
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
          addedCriterionIds.push(operation.criterion.id);
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
    let nextSequence = snapshot.eventSequence + 1;
    const events: CaseEvent[] = [
      {
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: nextSequence,
        timestamp: now,
        commandId,
        type: 'criteria.updated',
        payload: { criteria },
      },
    ];

    // Item 2 ("Let a custom field create an obligation"): packs-and-
    // routing.md "Users may add ... criteria. When a custom criterion needs
    // evidence, the core derives a case obligation from the pack's
    // `userConcern` template." A "custom criterion" is exactly what this
    // `add` operation just created -- not restricted to a criterion that
    // happens to reference a `custom.*` attribute; a newly-added criterion
    // over a pack-defined attribute with no sourced value yet needs
    // evidence just the same, per `criterionNeedsEvidenceQuestion`'s own
    // generic predicate (`@sift/core`'s `criteria.ts`), which this loop
    // uses exactly as written, not reimplemented. Gated on
    // `pack.extensionPolicy.allowCaseObligations` -- the literal manifest
    // flag governing this exact behavior (packs-and-routing.md
    // `extensionPolicy`); `packages/packs/src/compiler.ts`'s own "Step 8"
    // already enforces `allowCaseObligations: true` implies
    // `allowCaseCriteria: true`, so this gate is never reachable for a
    // pack that forbids case criteria at all.
    if (pack.extensionPolicy.allowCaseObligations) {
      for (const criterionId of addedCriterionIds) {
        const criterion = criteria.find((entry) => entry.id === criterionId);
        if (criterion === undefined) continue; // defensive; addCriterion always inserts what it accepted
        const existingEvidence = this.existingEvidenceSignal(criterion, snapshot);
        if (!criterionNeedsEvidenceQuestion(criterion, existingEvidence)) continue;
        const template = this.synthesizeUserConcernObligationTemplate(criterion);
        const derived = deriveObligations(
          pack,
          [{ template, criterionId: criterion.id }],
          snapshot.obligations,
          this.deps.clock,
        );
        const newObligation = derived.find((obligation) => obligation.id === template.id);
        if (newObligation === undefined) continue; // defensive; deriveObligations always includes every supplied template
        nextSequence += 1;
        events.push({
          eventId: this.deps.idGenerator.next('event'),
          caseId: input.caseId,
          sequence: nextSequence,
          timestamp: now,
          commandId,
          type: 'obligation.updated',
          payload: { obligation: newObligation },
        });
      }
    }

    const invalidatesRecommendation =
      snapshot.recommendation !== null && snapshot.recommendation.status === 'ready';
    if (invalidatesRecommendation && snapshot.recommendation !== null) {
      nextSequence += 1;
      events.push({
        eventId: this.deps.idGenerator.next('event'),
        caseId: input.caseId,
        sequence: nextSequence,
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
   * Item 5: durably records the submitted `Source` (unchanged, existing
   * behavior -- always happens, via `updateSelection`), and additionally
   * turns `input.source.claims[]` into durable, option-linked `Claim`
   * records (via real `append()`ed `evidence.accepted` events -- the one
   * `CaseEvent` variant that can carry a `Claim`, per `events.ts`) whenever
   * `input.obligationId` is supplied. `Claim.obligationId`/
   * `EvidenceLink.obligationId` are both required fields on the canonical
   * storage records (`case.ts`, not owned by this module) -- linking a
   * claim to live evidence genuinely requires knowing which obligation it
   * addresses, and nothing about a bare `statement` + `appliesToEntityIds`
   * pair can honestly supply that on its own. When `obligationId` is
   * absent, claim linkage is skipped but the source itself still persists
   * -- an honest degradation (the activity summary below says exactly how
   * many claims went unlinked and why), never a silent drop.
   *
   * One `Claim` per (claim x entityId) pair: `appliesToEntityIds` may name
   * several options, and `Claim.entityId` is singular, so each named
   * option gets its own genuinely option-linked record. A claim with an
   * empty `appliesToEntityIds` still produces one `Claim`, with `entityId`
   * omitted -- a case-general finding, durable but honestly not
   * option-linked (never fabricating an entity link the caller did not
   * supply).
   *
   * Deliberately does NOT also synthesize a stronger evidence signal than
   * the data supports: `evidence.ts`'s own `achievedEvidenceLevel` doc
   * comment states "a Claim alone (no corroborating EvidenceLink) can only
   * ever establish E0 -- unverified statement or user-provided assertion",
   * which is exactly the right strength for a raw, freshly-submitted,
   * `unverified` source's claim (§27: "Submission does not automatically
   * make a source trusted"). The paired `EvidenceLink` this method creates
   * per claim is therefore tagged `level: 'E0'`, `verdict: 'pass'`
   * (evidence-gathering genuinely succeeded; verdict is not a strength
   * signal -- level is), `disposition: 'included'` (the existing
   * `sift_set_evidence_disposition` command remains the only way to
   * exclude/question it later, per §27's "Existing source-challenge/
   * evidence rules remain authoritative"). `Claim.stance`/`confidence`
   * have no signal on the command input at all (`SourceClaimInputSchema`
   * carries only `statement`/`appliesToEntityIds`) -- `'neutral'`/`0.5` are
   * the deliberately noncommittal defaults: inventing a directional stance
   * or a confidence above the midpoint would assert a judgment about the
   * claim's truth or reliability that nothing in the input actually
   * supports.
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

    if (
      input.obligationId !== undefined &&
      !snapshot.obligations.some((obligation) => obligation.id === input.obligationId)
    ) {
      return validationFailure(
        `Obligation "${input.obligationId}" was not found on case "${input.caseId}".`,
      );
    }

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

    // The obligationId this submission targets, resolved once above.
    const obligationId = input.obligationId;
    let currentSequence = input.expectedSequence;
    let linkedClaimCount = 0;
    const unlinkedClaimCount = obligationId === undefined ? input.source.claims.length : 0;

    if (obligationId !== undefined && input.source.claims.length > 0) {
      const claimEvents: CaseEvent[] = [];
      for (const sourceClaim of input.source.claims) {
        const entityIds: readonly (string | undefined)[] =
          sourceClaim.appliesToEntityIds.length > 0 ? sourceClaim.appliesToEntityIds : [undefined];
        for (const entityId of entityIds) {
          const claim: Claim = {
            id: this.deps.idGenerator.next('claim'),
            obligationId,
            ...(entityId !== undefined ? { entityId } : {}),
            statement: sourceClaim.statement,
            stance: 'neutral',
            confidence: 0.5,
            sourceIds: [source.id],
            stale: false,
            createdAt: now,
          };
          const evidenceLink: EvidenceLink = {
            id: this.deps.idGenerator.next('evidence'),
            obligationId,
            claimId: claim.id,
            sourceId: source.id,
            level: 'E0',
            verdict: 'pass',
            disposition: 'included',
            summary: sourceClaim.statement,
            stale: false,
            createdAt: now,
            updatedAt: now,
          };
          currentSequence += 1;
          claimEvents.push({
            eventId: this.deps.idGenerator.next('event'),
            caseId: input.caseId,
            sequence: currentSequence,
            timestamp: now,
            commandId,
            type: 'evidence.accepted',
            payload: { evidenceLink, claim },
          });
          linkedClaimCount += 1;
        }
      }

      // Derived idempotency key, distinct from the exact `commandId` the
      // `updateSelection()` call below (and this method's own top-of-method
      // `checkIdempotent`) uses: both calls sharing the literal `commandId`
      // would make `updateSelection()` see this `append()` call's own
      // idempotency registration and answer 'duplicate' without ever
      // writing the source -- this method genuinely calls two different
      // store operations for one command, per `case-store.ts`'s own
      // `SelectionPatch` doc comment ("`submitSource`'s source record
      // itself (distinct from the `evidence.accepted` event(s) a
      // submission may *also* produce when it can be linked to an active
      // obligation -- `command-service.ts` calls both `append()` and
      // `updateSelection()` for that case)").
      const claimAppend = this.deps.caseStore.append(
        input.caseId,
        claimEvents,
        input.expectedSequence,
        { idempotency: { commandId: `${commandId}:claims`, commandName: 'submitSource' } },
      );
      if (claimAppend.status === 'conflict' || claimAppend.status === 'not_found') {
        return this.toReceipt(commandId, claimAppend);
      }
      currentSequence = claimAppend.snapshot.eventSequence;
    }

    const result = this.deps.caseStore.updateSelection(
      input.caseId,
      { sources: [...snapshot.sources, source] },
      currentSequence,
      now,
      { commandId, commandName: 'submitSource' },
    );
    if (result.status === 'applied') {
      const summaryParts = [`Submitted source "${source.title}".`];
      if (linkedClaimCount > 0) {
        summaryParts.push(
          `Linked ${linkedClaimCount} claim${linkedClaimCount === 1 ? '' : 's'} to obligation "${obligationId}".`,
        );
      }
      if (unlinkedClaimCount > 0) {
        summaryParts.push(
          `${unlinkedClaimCount} claim${unlinkedClaimCount === 1 ? '' : 's'} not linked: no obligationId was supplied.`,
        );
      }
      this.emitActivity({
        timestamp: now,
        caseId: input.caseId,
        commandId,
        type: 'command.accepted',
        phase: 'completed',
        summary: summaryParts.join(' '),
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

  /**
   * Item 4's shared "does a `ready` recommendation actually depend on this"
   * predicate, used by `upsertOption` and `reviewCaseExtension`. Only an
   * `active` criterion's `appliesToAttribute` counts -- an `excluded`
   * criterion no longer participates in scoring
   * (`normalizeCriterionWeights`, `@sift/core`), so a value it once
   * referenced can no longer affect a recommendation, and a criterion with
   * no `appliesToAttribute` at all cannot name any `attributeIds` member by
   * construction. Deliberately does not consider pack-defined vs.
   * `custom.*` origin: a `Criterion.appliesToAttribute` referencing either
   * kind of attribute id means the recommendation depends on it exactly
   * the same way.
   */
  private criteriaDependOnAttributes(
    criteria: readonly Criterion[],
    attributeIds: ReadonlySet<string>,
  ): boolean {
    return criteria.some(
      (criterion) =>
        criterion.status === 'active' &&
        criterion.appliesToAttribute !== undefined &&
        attributeIds.has(criterion.appliesToAttribute),
    );
  }

  /**
   * Item 2's "existing sourced value" signal for
   * `criterionNeedsEvidenceQuestion` (`@sift/core`'s `criteria.ts`): does
   * any entity on this case already carry a *sourced* value for the
   * criterion's linked attribute? Requires both a real value
   * (`status !== 'unknown'`) and at least one `sourceIds` entry --
   * "sourced" means backed by a source, not merely present; an `asserted`
   * value with no `sourceIds` (a plain user-typed figure with no citation)
   * does not count as already having answered the question a newly-added
   * criterion is asking. Returns an empty array (not a false-`hasSourced
   * Value` entry) when the criterion has no `appliesToAttribute` at all --
   * `criterionNeedsEvidenceQuestion` already treats that case as "always
   * needs one" without consulting `existingEvidence`.
   */
  private existingEvidenceSignal(
    criterion: Criterion,
    snapshot: CaseState,
  ): ExistingEvidenceSignal[] {
    if (criterion.appliesToAttribute === undefined) {
      return [];
    }
    const attributeDefinitionId = criterion.appliesToAttribute;
    const hasSourcedValue = snapshot.entities.some((entity) => {
      const record = entity.attributes[attributeDefinitionId];
      return record !== undefined && record.status !== 'unknown' && record.sourceIds.length > 0;
    });
    return [{ attributeDefinitionId, hasSourcedValue }];
  }

  /**
   * Item 2: synthesizes the case-scoped `ObligationTemplate` a newly-added
   * criterion that needs evidence gets folded into, via the real
   * `@sift/core` `deriveObligations` -- this method only builds the
   * template data that function expects as input; it does not reimplement
   * `deriveObligations` or `criterionNeedsEvidenceQuestion` themselves.
   *
   * pack-authoring.md: "Each pack declares a `userConcern` obligation
   * template ... a case-specific obligation such as
   * `case.<caseId>.dog-crate-fit`." In the current schema,
   * `extensionPolicy.userConcernTemplateId`
   * (`packages/contracts/src/packs.ts`) is only a reserved id namespace --
   * `packages/packs/src/compiler.ts`'s own "Step 8" comment confirms it
   * exists purely to avoid colliding with a real declared obligation id,
   * not to look up actual template content (label/priority/evidence
   * level/...). No pack manifest in this codebase carries such content
   * anywhere. This method therefore synthesizes a template generically,
   * the same pattern `apps/agent/src/runtime/car-purchase-scenario.ts`'s
   * `dogCrateObligationTemplate()` already uses for its one hand-tuned
   * case, made generic here so it applies to any newly-added criterion in
   * any pack, not one hardcoded car-purchase concern.
   *
   * Judgment calls, each chosen to avoid fabricating a signal the
   * criterion itself does not carry:
   *  - `id`: `` `case.${criterion.id}` `` -- matches the exact convention
   *    already live in this codebase
   *    (`apps/agent/src/runtime/scripted-beats/car-purchase.ts`'s
   *    `DOG_CRATE_FIT_OBLIGATION_ID = 'case.custom.dog_crate_fit'`), which
   *    omits the case id pack-authoring.md's own illustrative example
   *    includes -- criterion ids are already unique within one case
   *    (`addCriterion` rejects a duplicate id), so this stays unique
   *    without it, and staying byte-identical to the live convention means
   *    a criterion this method and that hand-tuned demo code both touch
   *    (e.g. `custom.dog_crate_fit`) converge on the SAME obligation record
   *    rather than producing a confusing duplicate.
   *  - `label`/`question`: taken directly from the criterion (`question`
   *    falls back to a generic phrasing built from the label when the
   *    criterion itself was added with none, since
   *    `ObligationTemplateSchema.question` is required but
   *    `CriterionAddInput.question` is optional).
   *  - `priority`: the criterion's own `weight` (both 0-100 scales already
   *    express "how much this matters"), tying a case-derived obligation's
   *    urgency to what the caller who added the criterion said mattered,
   *    rather than an arbitrary constant.
   *  - `requiredEvidenceLevel`/`completionRule.minimumEvidenceLevel: 'E1'`:
   *    the weakest level that still requires an actual source --
   *    appropriate for a concern the pack never anticipated and has no
   *    specialist wired to investigate.
   *  - `maxAttempts: 2`: CLAUDE.md's own canonical GoalLoop bound
   *    ("GoalLoop with a callable recommendation validator and
   *    `maxAttempts: 2`"), and the same value every existing
   *    case-extension template in this codebase already uses
   *    (`dogCrateObligationTemplate`, the `apartment-hunt-extension.test.ts`
   *    fixture).
   *  - `acceptedUncertaintyAllowed: true` (both here and on
   *    `completionRule`): an unanticipated, case-scoped concern may have no
   *    installed skill/specialist able to resolve it at all
   *    (packs-and-routing.md: "Unsupported concerns remain explicit
   *    unknowns"); blocking the case indefinitely on it would contradict
   *    that.
   *  - `preferredSkills`/`preferredSpecialists: []`: this method has no way
   *    to know which installed skill/specialist (if any) can investigate an
   *    arbitrary new criterion in an arbitrary pack -- leaving both empty
   *    is the honest choice over guessing one that might not exist,
   *    matching how `apartment-hunt-extension.test.ts`'s own fixture treats
   *    the identical "no installed skill/specialist can investigate this"
   *    case.
   *  - `dependsOn: []`, `category: 'user_concern'`, `required: true`,
   *    `completionRule.minimumIndependentSources: 0`: no signal exists to
   *    derive any of these from a bare `Criterion`, so each takes the same
   *    fixed value every existing case-extension template in this codebase
   *    already uses.
   */
  private synthesizeUserConcernObligationTemplate(criterion: Criterion): ObligationTemplate {
    return {
      id: `case.${criterion.id}`,
      label: criterion.label,
      question: criterion.question ?? `What should be established about "${criterion.label}"?`,
      category: 'user_concern',
      required: true,
      priority: criterion.weight,
      requiredEvidenceLevel: 'E1',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: true,
      dependsOn: [],
      preferredSkills: [],
      preferredSpecialists: [],
      completionRule: {
        minimumEvidenceLevel: 'E1',
        minimumIndependentSources: 0,
        acceptedUncertaintyAllowed: true,
      },
      origin: 'case_extension',
    };
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
