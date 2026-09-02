/**
 * `RunPlanService`: where the derived RunPlan (`runtime/run-plan.ts`)
 * becomes durable history and a visible event.
 *
 * The service is deliberately thin. All the judgment lives in the pure
 * derivation; this layer only decides three things:
 *
 * 1. **When a version is worth minting.** A revision that produces exactly
 *    the work the previous version already described is not a revision, and
 *    minting a version for it would bury the one moment that matters — the
 *    concern that genuinely changed the plan — in a list of identical
 *    entries.
 * 2. **What the person is told.** `plan.revised` carries the human sentence
 *    from `describeRunPlanRevision`, plus the counts as `safeDetails`, so a
 *    consumer can render "reused 4, added 2" without re-deriving anything.
 * 3. **Nothing else.** It reads case state and never writes it. The
 *    `caseStore` dependency is typed as `Pick<CaseStore, 'load'>` precisely
 *    so that stays true by construction: there is no `append` on the
 *    dependency to call.
 *
 * ## Why the cause is passed in rather than inferred
 *
 * `revisePlan` takes the trigger from its caller. The command that changed
 * the case knows what changed — `setCandidateDisposition` knows the
 * candidate, `updateDiscovery` knows the topic — and that is genuine
 * causality. Reconstructing it here by diffing two plans would produce a
 * plausible-looking attribution that could be wrong, which is the exact
 * failure mode this build treats as worse than saying nothing.
 */
import type { CaseState, CompiledDecisionPack, PublicActivityEventType } from '@sift/contracts';
import type { Clock, IdGenerator } from '@sift/core';
import type { ActivityStore } from '../store/activity-store.js';
import type { CaseStore } from '../store/case-store.js';
import type { RunPlanStore } from '../store/run-plan-store.js';
import {
  buildRunPlan,
  describeRunPlanRevision,
  reviseRunPlan,
  type RunPlan,
  type RunPlanItemStatus,
  type RunPlanRevisionCause,
} from '../runtime/run-plan.js';

/** The one registry capability this service needs: resolve a case's pinned pack. */
export interface PinnedPackLookup {
  get(packId: string, version: string): CompiledDecisionPack | undefined;
}

export interface RunPlanServiceDeps {
  /** Read-only by type, not by convention: this service has no way to write case state. */
  readonly caseStore: Pick<CaseStore, 'load'>;
  readonly planStore: RunPlanStore;
  readonly activityStore: ActivityStore;
  readonly registry: PinnedPackLookup;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

const PLAN_CREATED: PublicActivityEventType = 'plan.created';
const PLAN_REVISED: PublicActivityEventType = 'plan.revised';

export class RunPlanService {
  constructor(private readonly deps: RunPlanServiceDeps) {}

  /**
   * The plan for a case, creating a first version if there is none.
   * Returns `undefined` when the case or its pinned pack cannot be
   * resolved — a missing case is not an occasion to invent a plan.
   */
  ensurePlan(caseId: string): RunPlan | undefined {
    const existing = this.deps.planStore.loadLatest(caseId);
    if (existing !== undefined) return existing;

    const resolved = this.resolve(caseId);
    if (resolved === undefined) return undefined;

    const plan = buildRunPlan(this.deps.idGenerator.next('plan'), {
      caseState: resolved.caseState,
      pack: resolved.pack,
      now: this.deps.clock.now(),
    });
    this.deps.planStore.save(plan);
    this.emit(plan, PLAN_CREATED, describeRunPlanRevision(plan), {
      version: plan.version,
      items: plan.items.length,
      unverifiable: plan.unverifiable.length,
    });
    return plan;
  }

  /**
   * Re-derives the plan and, if the work genuinely changed, mints the next
   * version. Returns `undefined` when there is no plan to revise or when
   * nothing changed — both of which are ordinary, not errors.
   */
  revisePlan(caseId: string, cause: RunPlanRevisionCause): RunPlan | undefined {
    const previous = this.deps.planStore.loadLatest(caseId);
    if (previous === undefined) return undefined;

    const resolved = this.resolve(caseId);
    if (resolved === undefined) return undefined;

    const candidate = reviseRunPlan(
      previous,
      {
        caseState: resolved.caseState,
        pack: resolved.pack,
        now: this.deps.clock.now(),
      },
      cause,
    );

    if (!changesTheWork(candidate, previous)) return undefined;

    this.deps.planStore.save(candidate);
    this.emit(candidate, PLAN_REVISED, describeRunPlanRevision(candidate), {
      version: candidate.version,
      trigger: cause.trigger,
      reason: cause.reason,
      reused: candidate.revision?.reusedSignatures.length ?? 0,
      added: candidate.revision?.addedSignatures.length ?? 0,
      rerun: candidate.revision?.staledSignatures.length ?? 0,
      cancelled: candidate.revision?.cancelledSignatures.length ?? 0,
      unverifiable: candidate.unverifiable.length,
    });
    return candidate;
  }

  /** Marks finished work on the current version. Signatures the plan does not have are ignored. */
  recordAccepted(caseId: string, signatures: readonly string[]): void {
    this.applyStatuses(caseId, signatures, 'accepted');
  }

  /** Marks work as under way on the current version. */
  recordRunning(caseId: string, signatures: readonly string[]): void {
    this.applyStatuses(caseId, signatures, 'running');
  }

  currentPlan(caseId: string): RunPlan | undefined {
    return this.deps.planStore.loadLatest(caseId);
  }

  history(caseId: string): RunPlan[] {
    return this.deps.planStore.listVersions(caseId);
  }

  private applyStatuses(
    caseId: string,
    signatures: readonly string[],
    status: RunPlanItemStatus,
  ): void {
    const plan = this.deps.planStore.loadLatest(caseId);
    if (plan === undefined) return;
    const statuses: Record<string, RunPlanItemStatus> = {};
    for (const signature of signatures) statuses[signature] = status;
    this.deps.planStore.updateItemStatuses(
      plan.planId,
      plan.version,
      statuses,
      this.deps.clock.now(),
    );
  }

  private resolve(
    caseId: string,
  ): { caseState: CaseState; pack: CompiledDecisionPack } | undefined {
    const caseState = this.deps.caseStore.load(caseId);
    if (caseState === undefined) return undefined;
    const pack = this.deps.registry.get(caseState.pack.id, caseState.pack.version);
    if (pack === undefined) return undefined;
    return { caseState, pack };
  }

  private emit(
    plan: RunPlan,
    type: PublicActivityEventType,
    summary: string,
    safeDetails: Record<string, string | number>,
  ): void {
    this.deps.activityStore.append({
      timestamp: this.deps.clock.now(),
      caseId: plan.caseId,
      type,
      phase: 'active',
      summary,
      safeDetails,
    });
  }
}

/**
 * Whether a candidate revision says something the previous version did not.
 *
 * Not only "is there different work". A concern nothing can verify adds no
 * items at all, and the first version of this predicate therefore refused
 * to mint a version for it — so raising the dog-crate concern left the plan
 * sitting at v1 with nothing to show, even though the case had genuinely
 * gained a visible unknown. Found by the persona harness.
 *
 * A new unknown is one of the more important things this product has to
 * say. "Sift noted your concern and has nothing that can check it" is
 * useful; silence is not.
 */
function changesTheWork(candidate: RunPlan, previous: RunPlan): boolean {
  const revision = candidate.revision;
  if (revision === undefined) return false;
  const workChanged =
    revision.addedSignatures.length > 0 ||
    revision.staledSignatures.length > 0 ||
    revision.cancelledSignatures.length > 0;
  const previousUnknowns = new Set(previous.unverifiable.map((entry) => entry.concernId));
  const unknownsChanged =
    candidate.unverifiable.length !== previous.unverifiable.length ||
    candidate.unverifiable.some((entry) => !previousUnknowns.has(entry.concernId));
  return workChanged || unknownsChanged;
}
