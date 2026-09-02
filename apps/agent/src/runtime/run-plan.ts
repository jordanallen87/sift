/**
 * The continuous RunPlan: what Sift intends to do about a case right now,
 * why, and what it deliberately is not doing.
 *
 * A plan is *derived*, never authored. `buildRunPlan` is a pure function of
 * (case state, pack, budgets), so the same case always produces the same
 * plan, and a plan can be recomputed from a reloaded snapshot rather than
 * restored from a fragile in-memory queue. `reviseRunPlan` is the same
 * derivation run again, diffed against the previous version.
 *
 * ## Three rules made structural
 *
 * The interesting part of this module is what it refuses to represent.
 *
 * 1. **Expensive work needs a human's authorization.** A `deep` item must
 *    carry a `triageBasis`, and a `TriageBasis.disposition` may only be
 *    `keep` or `unsure`. There is no value that expresses "deep work
 *    authorized by a candidate nobody reviewed" — so the planner cannot
 *    write one down even by mistake, and neither can a future caller.
 * 2. **Runtime work cannot touch what a human owns.** `RunPlanItem.writes`
 *    is one of `evidence`, `enrichment`, or `none`. Discovery answers,
 *    dispositions, and the decision itself are not members of that union.
 *    The protection is the absence of the capability, not a check that
 *    could be forgotten.
 * 3. **A concern no capability can answer stays an explicit unknown.** It
 *    goes to `unverifiable` with a reason, never to `items` as a
 *    plausible-looking task that will quietly never produce anything.
 *
 * ## Why staleness is a transition and not a status
 *
 * `RUN_PLAN_ITEM_STATUSES` has no `stale` member. When a revision finds
 * that an accepted item's inputs have changed, the item is re-planned in
 * place and its signature is recorded in `revision.staledSignatures`.
 * Keeping a superseded row alongside its replacement would put two entries
 * in `items` claiming the same work, and the first question anyone asks of
 * a plan — "what is Sift doing about X?" — would have two answers. The
 * revision summary is where the history belongs.
 *
 * ## Causality
 *
 * Reuse is decided by `inputsHash`: a hash of exactly the state an item's
 * result depended on. Enrichment depends on the candidate; a concern check
 * depends on the concern plus the confirmed answers the pack maps to it.
 * That is why adding a new concern reuses every earlier result, while
 * changing the budget answer re-runs only the checks budget feeds.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CaseState, CompiledDecisionPack, ObligationState } from '@sift/contracts';

// --- Vocabulary ---

export const RUN_PLAN_ITEM_KINDS = ['enrich_candidate', 'check_concern'] as const;
export type RunPlanItemKind = (typeof RUN_PLAN_ITEM_KINDS)[number];

export const RUN_PLAN_DEPTHS = ['shallow', 'deep'] as const;
export type RunPlanDepth = (typeof RUN_PLAN_DEPTHS)[number];

/** See the header: `stale` is deliberately absent. */
export const RUN_PLAN_ITEM_STATUSES = ['planned', 'running', 'accepted', 'cancelled'] as const;
export type RunPlanItemStatus = (typeof RUN_PLAN_ITEM_STATUSES)[number];

/**
 * Everything runtime work is permitted to write. Discovery answers,
 * candidate dispositions, the shortlist, and the decision are absent by
 * design — see rule 2 in this module's header.
 */
export const RUN_PLAN_WRITE_TARGETS = ['evidence', 'enrichment', 'none'] as const;
export type RunPlanWriteTarget = (typeof RUN_PLAN_WRITE_TARGETS)[number];

/**
 * The dispositions that authorize deep work. `pass` and `unreviewed` are
 * real dispositions and neither is an authorization, so neither appears
 * here.
 */
export const TRIAGE_AUTHORIZATIONS = ['keep', 'unsure'] as const;
export type TriageAuthorization = (typeof TRIAGE_AUTHORIZATIONS)[number];

export const RUN_PLAN_REVISION_REASONS = [
  'new_concern',
  'discovery_changed',
  'triage_changed',
  'candidates_changed',
] as const;
export type RunPlanRevisionReason = (typeof RUN_PLAN_REVISION_REASONS)[number];

/**
 * Enrichment is a catalog read Sift owns, not a pack capability — which is
 * why an `enrich_candidate` item never consults `resolvedCapabilities` and
 * a pack that declares no specialists at all can still have its candidates
 * filled in.
 */
export const CATALOG_LOOKUP_CAPABILITY_ID = 'sift.catalog_lookup';

const PRIORITY_BY_KIND: Record<RunPlanItemKind, number> = {
  check_concern: 80,
  enrich_candidate: 40,
};

const WRITES_BY_KIND: Record<RunPlanItemKind, RunPlanWriteTarget> = {
  check_concern: 'evidence',
  enrich_candidate: 'enrichment',
};

const DEPTH_BY_KIND: Record<RunPlanItemKind, RunPlanDepth> = {
  check_concern: 'deep',
  enrich_candidate: 'shallow',
};

// --- Schemas ---

const idString = () =>
  z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._:+-]+$/, 'must be a plain identifier');

const TriageBasisSchema = z
  .object({
    /** The candidates whose human judgment authorizes this work. Never empty. */
    entityIds: z.array(idString()).min(1).max(50),
    disposition: z.enum(TRIAGE_AUTHORIZATIONS),
    confirmedAt: z.iso.datetime(),
  })
  .strict();
export type TriageBasis = z.infer<typeof TriageBasisSchema>;

const RunPlanItemShape = z
  .object({
    /** Stable identity: kind plus semantic target. Two obligations about one concern share it. */
    signature: z.string().min(1).max(400),
    kind: z.enum(RUN_PLAN_ITEM_KINDS),
    /** The criterion this work is about; absent for work that is not about a concern. */
    concernId: idString().optional(),
    /** Every obligation this one item accounts for, so deduplication loses nothing. */
    obligationIds: z.array(idString()).max(50),
    targetEntityId: idString(),
    capabilityId: idString(),
    label: z.string().min(1).max(300),
    priority: z.number().int().min(0).max(1000),
    depth: z.enum(RUN_PLAN_DEPTHS),
    writes: z.enum(RUN_PLAN_WRITE_TARGETS),
    status: z.enum(RUN_PLAN_ITEM_STATUSES),
    /** Hash of exactly the state this item's result depends on. Drives reuse. */
    inputsHash: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    triageBasis: TriageBasisSchema.optional(),
  })
  .strict();

export const RunPlanItemSchema = RunPlanItemShape.superRefine((item, ctx) => {
  if (item.depth === 'deep' && item.triageBasis === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['triageBasis'],
      message: 'deep work must name the human triage that authorized it',
    });
  }
  if (item.depth === 'shallow' && item.triageBasis !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['triageBasis'],
      message: 'shallow work needs no authority and may not claim one',
    });
  }
});
export type RunPlanItem = z.infer<typeof RunPlanItemSchema>;

const UnverifiableConcernSchema = z
  .object({
    concernId: idString(),
    obligationIds: z.array(idString()).max(50),
    reason: z.string().min(1).max(500),
  })
  .strict();
export type UnverifiableConcern = z.infer<typeof UnverifiableConcernSchema>;

const RunPlanStopConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('work_available'), detail: z.string().max(300) }).strict(),
  z.object({ kind: z.literal('awaiting_discovery'), detail: z.string().max(300) }).strict(),
  z.object({ kind: z.literal('awaiting_triage'), detail: z.string().max(300) }).strict(),
  z.object({ kind: z.literal('budget_exhausted'), detail: z.string().max(300) }).strict(),
  z.object({ kind: z.literal('complete'), detail: z.string().max(300) }).strict(),
]);
export type RunPlanStopCondition = z.infer<typeof RunPlanStopConditionSchema>;

const RunPlanBudgetsSchema = z
  .object({
    /** Bounds outstanding work, not finished work: accepted results are free to keep. */
    maxPlannedItems: z.number().int().min(1).max(500),
    maxPlannedDeepItems: z.number().int().min(0).max(500),
  })
  .strict();
export type RunPlanBudgets = z.infer<typeof RunPlanBudgetsSchema>;

export const DEFAULT_RUN_PLAN_BUDGETS: RunPlanBudgets = {
  maxPlannedItems: 24,
  maxPlannedDeepItems: 8,
};

const RunPlanRevisionSummarySchema = z
  .object({
    previousVersion: z.number().int().min(1),
    reason: z.enum(RUN_PLAN_REVISION_REASONS),
    /** The causal id: the concern, topic, or candidate whose change forced this revision. */
    trigger: idString(),
    reusedSignatures: z.array(z.string().max(400)).max(500),
    staledSignatures: z.array(z.string().max(400)).max(500),
    cancelledSignatures: z.array(z.string().max(400)).max(500),
    addedSignatures: z.array(z.string().max(400)).max(500),
  })
  .strict();
export type RunPlanRevisionSummary = z.infer<typeof RunPlanRevisionSummarySchema>;

const RunPlanShape = z
  .object({
    schemaVersion: z.literal('1.0'),
    planId: idString(),
    caseId: idString(),
    packId: idString(),
    packVersion: z.string().min(1).max(50),
    version: z.number().int().min(1),
    createdAt: z.iso.datetime(),
    budgets: RunPlanBudgetsSchema,
    items: z.array(RunPlanItemSchema).max(500),
    /** Signatures that did not fit the budget. Deferred and named, never silently dropped. */
    deferredForBudget: z.array(z.string().max(400)).max(500),
    unverifiable: z.array(UnverifiableConcernSchema).max(200),
    stopCondition: RunPlanStopConditionSchema,
    revision: RunPlanRevisionSummarySchema.optional(),
  })
  .strict();

export const RunPlanSchema = RunPlanShape.superRefine((plan, ctx) => {
  const seen = new Set<string>();
  for (const item of plan.items) {
    if (seen.has(item.signature)) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: `duplicate plan item "${item.signature}"; one piece of work has one entry`,
      });
    }
    seen.add(item.signature);
  }
  if (plan.version === 1 && plan.revision !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['revision'],
      message: 'a first version revised nothing',
    });
  }
});
export type RunPlan = z.infer<typeof RunPlanSchema>;

// --- Derivation ---

export interface RunPlanContext {
  readonly caseState: CaseState;
  readonly pack: CompiledDecisionPack;
  readonly now: string;
  readonly budgets?: Partial<RunPlanBudgets>;
}

export interface RunPlanRevisionCause {
  readonly reason: RunPlanRevisionReason;
  readonly trigger: string;
}

export function runPlanItemSignature(kind: RunPlanItemKind, targets: readonly string[]): string {
  return `${kind}:${targets.join('+')}`;
}

/**
 * Canonical JSON: object keys sorted at every level, so two structurally
 * equal inputs always hash identically regardless of construction order.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonical(entryValue)}`);
  return `{${entries.join(',')}}`;
}

function hashInputs(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

/** The concern an obligation is about. Falls back to the obligation itself when it names none. */
function concernIdOf(obligation: ObligationState): string {
  return obligation.criterionId ?? obligation.id;
}

function candidatesOf(caseState: CaseState) {
  return caseState.entities.filter((entity) => entity.kind === 'candidate');
}

function authorizationFor(
  caseState: CaseState,
  entityId: string,
): { disposition: TriageAuthorization; confirmedAt: string } | undefined {
  const record = caseState.discovery?.dispositions.find(
    (disposition) => disposition.entityId === entityId,
  );
  if (record === undefined) return undefined;
  if (record.disposition !== 'keep' && record.disposition !== 'unsure') return undefined;
  return { disposition: record.disposition, confirmedAt: record.decidedAt };
}

/**
 * The confirmed answers the pack says feed this concern. These, and only
 * these, are what makes a concern check go stale — which is why changing
 * the budget re-runs the checks budget feeds and leaves everything else
 * alone.
 */
function answersFeeding(
  caseState: CaseState,
  pack: CompiledDecisionPack,
  concernId: string,
): readonly { topicId: string; status: string; valueSummary: string | null }[] {
  const topics = pack.discovery?.topics ?? [];
  return topics
    .filter((topic) => topic.mapsToCriterionIds.includes(concernId))
    .map((topic) => topic.id)
    .sort((a, b) => a.localeCompare(b))
    .map((topicId) => {
      const state = caseState.discovery?.topics.find((topic) => topic.topicId === topicId);
      return {
        topicId,
        status: state?.status ?? 'unknown',
        valueSummary: state?.valueSummary ?? null,
      };
    });
}

interface DerivedItem {
  readonly item: RunPlanItem;
}

/**
 * Every item the current state justifies, before budgets are applied.
 * Ordering is deterministic: priority descending, then signature ascending.
 */
function deriveItems(ctx: RunPlanContext): {
  items: RunPlanItem[];
  unverifiable: UnverifiableConcern[];
} {
  const { caseState, pack, now } = ctx;
  const candidates = candidatesOf(caseState);
  const items: RunPlanItem[] = [];
  const unverifiable: UnverifiableConcern[] = [];

  // Safe early work: a catalog read per candidate, available the moment
  // candidates exist and long before anyone has triaged them.
  for (const entity of candidates) {
    const signature = runPlanItemSignature('enrich_candidate', [entity.id]);
    items.push({
      signature,
      kind: 'enrich_candidate',
      obligationIds: [],
      targetEntityId: entity.id,
      capabilityId: CATALOG_LOOKUP_CAPABILITY_ID,
      label: `Fill in known specifications for ${entity.label}`,
      priority: PRIORITY_BY_KIND.enrich_candidate,
      depth: DEPTH_BY_KIND.enrich_candidate,
      writes: WRITES_BY_KIND.enrich_candidate,
      status: 'planned',
      inputsHash: hashInputs({
        kind: 'enrich_candidate',
        entityId: entity.id,
        label: entity.label,
        packId: pack.identity.id,
        packVersion: pack.identity.version,
      }),
      createdAt: now,
      updatedAt: now,
    });
  }

  // Deep work: one item per (concern, authorized candidate). Obligations
  // about the same concern collapse into one item that names them all.
  const openObligations = caseState.obligations.filter(
    (obligation) => obligation.status !== 'satisfied',
  );
  const byConcern = new Map<string, ObligationState[]>();
  for (const obligation of openObligations) {
    const concernId = concernIdOf(obligation);
    byConcern.set(concernId, [...(byConcern.get(concernId) ?? []), obligation]);
  }

  const authorized = candidates
    .map((entity) => ({ entity, authorization: authorizationFor(caseState, entity.id) }))
    .filter(
      (entry): entry is { entity: (typeof candidates)[number]; authorization: TriageBasis } =>
        entry.authorization !== undefined,
    );

  for (const [concernId, obligations] of [...byConcern.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const obligationIds = obligations.map((obligation) => obligation.id).sort();
    const capabilityId = obligations
      .flatMap((obligation) => obligation.preferredSpecialists)
      .find((specialistId) => pack.resolvedCapabilities.specialistIds.includes(specialistId));

    if (capabilityId === undefined) {
      unverifiable.push({
        concernId,
        obligationIds,
        reason:
          'No capability in this pack can verify this concern, so it stays an explicit unknown.',
      });
      continue;
    }

    const answers = answersFeeding(caseState, pack, concernId);
    for (const { entity, authorization } of authorized) {
      items.push({
        signature: runPlanItemSignature('check_concern', [concernId, entity.id]),
        kind: 'check_concern',
        concernId,
        obligationIds,
        targetEntityId: entity.id,
        capabilityId,
        label: `Check ${concernId} for ${entity.label}`,
        priority: PRIORITY_BY_KIND.check_concern,
        depth: DEPTH_BY_KIND.check_concern,
        writes: WRITES_BY_KIND.check_concern,
        status: 'planned',
        inputsHash: hashInputs({
          kind: 'check_concern',
          concernId,
          entityId: entity.id,
          obligationIds,
          packId: pack.identity.id,
          packVersion: pack.identity.version,
          answers,
        }),
        createdAt: now,
        updatedAt: now,
        triageBasis: {
          entityIds: [entity.id],
          disposition: authorization.disposition,
          confirmedAt: authorization.confirmedAt,
        },
      });
    }
  }

  items.sort((a, b) => b.priority - a.priority || a.signature.localeCompare(b.signature));
  return { items, unverifiable };
}

/**
 * Applies budgets to outstanding work only. Accepted results cost nothing
 * to keep, so they are never truncated; cancelled entries are history.
 */
function applyBudgets(
  items: readonly RunPlanItem[],
  budgets: RunPlanBudgets,
): { items: RunPlanItem[]; deferredForBudget: string[] } {
  const kept: RunPlanItem[] = [];
  const deferred: string[] = [];
  let plannedCount = 0;
  let plannedDeepCount = 0;

  for (const item of items) {
    if (item.status !== 'planned') {
      kept.push(item);
      continue;
    }
    const wouldExceedDeep =
      item.depth === 'deep' && plannedDeepCount >= budgets.maxPlannedDeepItems;
    if (plannedCount >= budgets.maxPlannedItems || wouldExceedDeep) {
      deferred.push(item.signature);
      continue;
    }
    plannedCount += 1;
    if (item.depth === 'deep') plannedDeepCount += 1;
    kept.push(item);
  }

  return { items: kept, deferredForBudget: deferred };
}

function stopConditionFor(
  ctx: RunPlanContext,
  items: readonly RunPlanItem[],
  deferredForBudget: readonly string[],
): RunPlanStopCondition {
  const candidates = candidatesOf(ctx.caseState);
  if (candidates.length === 0) {
    return {
      kind: 'awaiting_discovery',
      detail: 'No candidates yet — Sift is still working out what you need.',
    };
  }

  const hasOpenConcern = ctx.caseState.obligations.some(
    (obligation) => obligation.status !== 'satisfied',
  );
  const hasAuthorization = candidates.some(
    (entity) => authorizationFor(ctx.caseState, entity.id) !== undefined,
  );
  if (hasOpenConcern && !hasAuthorization) {
    return {
      kind: 'awaiting_triage',
      detail: 'Keep or flag a few options and Sift will look into those in depth.',
    };
  }

  const outstanding = items.filter(
    (item) => item.status === 'planned' || item.status === 'running',
  ).length;
  if (outstanding > 0) {
    return {
      kind: 'work_available',
      detail: `${String(outstanding)} piece(s) of work are ready to run.`,
    };
  }
  if (deferredForBudget.length > 0) {
    return {
      kind: 'budget_exhausted',
      detail: `${String(deferredForBudget.length)} piece(s) of work are waiting on budget.`,
    };
  }
  return { kind: 'complete', detail: 'Everything Sift can look into has been looked into.' };
}

function resolveBudgets(partial: Partial<RunPlanBudgets> | undefined): RunPlanBudgets {
  return { ...DEFAULT_RUN_PLAN_BUDGETS, ...partial };
}

export function buildRunPlan(planId: string, ctx: RunPlanContext): RunPlan {
  const budgets = resolveBudgets(ctx.budgets);
  const derived = deriveItems(ctx);
  const budgeted = applyBudgets(derived.items, budgets);

  return {
    schemaVersion: '1.0',
    planId,
    caseId: ctx.caseState.id,
    packId: ctx.pack.identity.id,
    packVersion: ctx.pack.identity.version,
    version: 1,
    createdAt: ctx.now,
    budgets,
    items: budgeted.items,
    deferredForBudget: budgeted.deferredForBudget,
    unverifiable: derived.unverifiable,
    stopCondition: stopConditionFor(ctx, budgeted.items, budgeted.deferredForBudget),
  };
}

const sorted = (values: readonly string[]): string[] =>
  [...values].sort((a, b) => a.localeCompare(b));

export function reviseRunPlan(
  previous: RunPlan,
  ctx: RunPlanContext,
  cause: RunPlanRevisionCause,
): RunPlan {
  const budgets = resolveBudgets(ctx.budgets);
  const derived = deriveItems(ctx);
  const previousBySignature = new Map(previous.items.map((item) => [item.signature, item]));

  const reused: string[] = [];
  const staled: string[] = [];
  const added: string[] = [];

  const merged = derived.items.map((fresh): RunPlanItem => {
    const before = previousBySignature.get(fresh.signature);
    if (before === undefined) {
      added.push(fresh.signature);
      return fresh;
    }
    if (before.inputsHash === fresh.inputsHash && before.status === 'accepted') {
      // Nothing this result depended on has changed: keep the finished work
      // exactly as it was, including when it was accepted.
      reused.push(fresh.signature);
      return { ...before, obligationIds: fresh.obligationIds, triageBasis: fresh.triageBasis };
    }
    if (before.inputsHash !== fresh.inputsHash && before.status === 'accepted') {
      staled.push(fresh.signature);
      return fresh;
    }
    // Still planned or running from the previous version, and unchanged.
    reused.push(fresh.signature);
    return { ...before, obligationIds: fresh.obligationIds, triageBasis: fresh.triageBasis };
  });

  // Anything the previous version was doing that the current state no
  // longer justifies. Kept in the list as `cancelled` so the reason a piece
  // of work stopped is visible rather than inferred from its absence.
  const freshSignatures = new Set(derived.items.map((item) => item.signature));
  const cancelled = previous.items.filter((item) => !freshSignatures.has(item.signature));
  const cancelledItems = cancelled.map((item): RunPlanItem => ({
    ...item,
    status: 'cancelled',
    updatedAt: ctx.now,
  }));

  const budgeted = applyBudgets([...merged, ...cancelledItems], budgets);

  return {
    schemaVersion: '1.0',
    planId: previous.planId,
    caseId: previous.caseId,
    packId: ctx.pack.identity.id,
    packVersion: ctx.pack.identity.version,
    version: previous.version + 1,
    createdAt: ctx.now,
    budgets,
    items: budgeted.items,
    deferredForBudget: budgeted.deferredForBudget,
    unverifiable: derived.unverifiable,
    stopCondition: stopConditionFor(ctx, budgeted.items, budgeted.deferredForBudget),
    revision: {
      previousVersion: previous.version,
      reason: cause.reason,
      trigger: cause.trigger,
      reusedSignatures: sorted(reused),
      staledSignatures: sorted(staled),
      cancelledSignatures: sorted(cancelled.map((item) => item.signature)),
      addedSignatures: sorted(added),
    },
  };
}

const REASON_PHRASES: Record<RunPlanRevisionReason, (trigger: string) => string> = {
  new_concern: (trigger) => `a new concern (${trigger})`,
  discovery_changed: (trigger) => `a changed answer (${trigger})`,
  triage_changed: (trigger) => `your triage of ${trigger}`,
  candidates_changed: (trigger) => `a change to the options (${trigger})`,
};

/**
 * One sentence a person can read: what forced the revision, what was
 * reused, and what had to be redone. Deliberately not a template that can
 * degrade to "the plan changed" — the trigger is always named.
 */
export function describeRunPlanRevision(plan: RunPlan): string {
  const revision = plan.revision;
  if (revision === undefined) {
    return `Plan v${String(plan.version)}: first plan, with ${String(plan.items.length)} items and nothing to reuse.`;
  }
  const because = REASON_PHRASES[revision.reason](revision.trigger);
  return (
    `Plan v${String(plan.version)}: ${because} added ${String(revision.addedSignatures.length)} new items, ` +
    `reused ${String(revision.reusedSignatures.length)} finished results, ` +
    `re-ran ${String(revision.staledSignatures.length)} whose inputs changed, ` +
    `and cancelled ${String(revision.cancelledSignatures.length)}.`
  );
}

export type { DerivedItem };
