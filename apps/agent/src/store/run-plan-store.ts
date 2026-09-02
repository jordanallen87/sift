/**
 * Durable storage for the continuous RunPlan (`runtime/run-plan.ts`).
 *
 * Every version is kept. That is the point: the plan's headline claim is
 * that a new concern revises work already under way instead of restarting
 * it, and a store that kept only the current plan could assert that but
 * never show it. `listVersions` is what turns the claim into evidence a
 * judge can open after the fact, and what makes the proof survive a reload.
 *
 * Re-saving an existing `(planId, version)` is rejected rather than
 * overwritten. A plan version is a statement about what Sift intended at a
 * moment; silently rewriting one would make the history unfalsifiable.
 */
import { RunPlanSchema, type RunPlan, type RunPlanItemStatus } from '../runtime/run-plan.js';
import type { SiftDatabase } from '../db/connection.js';

export class DuplicateRunPlanVersionError extends Error {
  constructor(planId: string, version: number) {
    super(
      `Run plan "${planId}" already has a version ${String(version)}. A plan version records ` +
        'what Sift intended at one moment and is never rewritten — revise the plan instead.',
    );
    this.name = 'DuplicateRunPlanVersionError';
  }
}

export interface RunPlanStore {
  /** Persists one plan version. Throws `DuplicateRunPlanVersionError` if that version already exists. */
  save(plan: RunPlan): void;
  /** The newest version for a case, or `undefined` when the case has no plan yet. */
  loadLatest(caseId: string): RunPlan | undefined;
  /** Every version for a case, oldest first — the revision history itself. */
  listVersions(caseId: string): RunPlan[];
  /**
   * Advances the execution status of items within one already-persisted
   * version, keyed by signature. Unknown signatures are ignored.
   *
   * This is deliberately the *only* mutation the store offers, and it can
   * reach nothing but `status`/`updatedAt`. An item moving from `planned` to
   * `accepted` is that version making progress, not a rewrite of what it
   * intended — and because no method here can change an item's inputs,
   * label, authority, or the revision summary, "what Sift planned and why"
   * stays unfalsifiable by construction rather than by convention.
   */
  updateItemStatuses(
    planId: string,
    version: number,
    statuses: Readonly<Record<string, RunPlanItemStatus>>,
    updatedAt: string,
  ): void;
}

/** Applies a status map to a plan's items without touching anything else about them. */
function withStatuses(
  plan: RunPlan,
  statuses: Readonly<Record<string, RunPlanItemStatus>>,
  updatedAt: string,
): RunPlan {
  return {
    ...plan,
    items: plan.items.map((item) => {
      const next = statuses[item.signature];
      return next === undefined ? item : { ...item, status: next, updatedAt };
    }),
  };
}

export class MemoryRunPlanStore implements RunPlanStore {
  private readonly plans = new Map<string, RunPlan>();

  private static key(planId: string, version: number): string {
    return `${planId}@${String(version)}`;
  }

  save(plan: RunPlan): void {
    const key = MemoryRunPlanStore.key(plan.planId, plan.version);
    if (this.plans.has(key)) {
      throw new DuplicateRunPlanVersionError(plan.planId, plan.version);
    }
    this.plans.set(key, plan);
  }

  loadLatest(caseId: string): RunPlan | undefined {
    const versions = this.listVersions(caseId);
    return versions.at(-1);
  }

  listVersions(caseId: string): RunPlan[] {
    return [...this.plans.values()]
      .filter((plan) => plan.caseId === caseId)
      .sort((a, b) => a.version - b.version);
  }

  updateItemStatuses(
    planId: string,
    version: number,
    statuses: Readonly<Record<string, RunPlanItemStatus>>,
    updatedAt: string,
  ): void {
    const key = MemoryRunPlanStore.key(planId, version);
    const existing = this.plans.get(key);
    if (existing === undefined) return;
    this.plans.set(key, withStatuses(existing, statuses, updatedAt));
  }
}

interface RunPlanRow {
  data: string;
}

export class SqliteRunPlanStore implements RunPlanStore {
  constructor(private readonly database: SiftDatabase) {}

  save(plan: RunPlan): void {
    const existing = this.database.sqlite
      .prepare('SELECT 1 FROM run_plans WHERE plan_id = ? AND version = ?')
      .get(plan.planId, plan.version);
    if (existing !== undefined) {
      throw new DuplicateRunPlanVersionError(plan.planId, plan.version);
    }
    this.database.sqlite
      .prepare(
        `INSERT INTO run_plans (plan_id, version, case_id, created_at, data)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(plan.planId, plan.version, plan.caseId, plan.createdAt, JSON.stringify(plan));
  }

  loadLatest(caseId: string): RunPlan | undefined {
    const row = this.database.sqlite
      .prepare('SELECT data FROM run_plans WHERE case_id = ? ORDER BY version DESC LIMIT 1')
      .get(caseId) as RunPlanRow | undefined;
    return row === undefined ? undefined : parseRow(row);
  }

  listVersions(caseId: string): RunPlan[] {
    const rows = this.database.sqlite
      .prepare('SELECT data FROM run_plans WHERE case_id = ? ORDER BY version ASC')
      .all(caseId) as RunPlanRow[];
    return rows.map(parseRow);
  }

  updateItemStatuses(
    planId: string,
    version: number,
    statuses: Readonly<Record<string, RunPlanItemStatus>>,
    updatedAt: string,
  ): void {
    const row = this.database.sqlite
      .prepare('SELECT data FROM run_plans WHERE plan_id = ? AND version = ?')
      .get(planId, version) as RunPlanRow | undefined;
    if (row === undefined) return;
    const next = withStatuses(parseRow(row), statuses, updatedAt);
    this.database.sqlite
      .prepare('UPDATE run_plans SET data = ? WHERE plan_id = ? AND version = ?')
      .run(JSON.stringify(next), planId, version);
  }
}

/**
 * Revalidated on the way out, not merely cast. A row written by an older
 * build is exactly the case where a silent cast would hand a caller a
 * `RunPlan`-shaped object that is not one.
 */
function parseRow(row: RunPlanRow): RunPlan {
  return RunPlanSchema.parse(JSON.parse(row.data));
}
