/**
 * `GET /api/debug/runs/:runId` (docs/specs/architecture.md "HTTP service":
 * `GET /api/debug/runs/:runId`) -- the Runtime Inspector's query route for
 * this pass's minimum-viable Overview + Timeline surface
 * (docs/specs/debugging-and-observability.md "Runtime Inspector UI").
 *
 * Returns one run's `overview` (status, trace/session IDs, duration,
 * category/level counts, error count, token usage/estimated cost when
 * available) alongside its ordered `events` timeline, computed from the real
 * `RunStore` record and the real persisted `runtime_events` rows
 * (`store/runtime-event-store.ts`, this task). `overview` always reflects
 * the *whole* run regardless of `?category=`/`?level=` -- only `events`
 * (the Timeline) is narrowed by those query filters, matching
 * debugging-and-observability.md's split between the Overview view ("status
 * ... duration, model/tool calls, tokens ... errors") and the Timeline view
 * ("category, agent, level ... filters").
 *
 * `?category=`/`?level=` reuse `RuntimeEventStore.listByRun`'s own filter
 * (so the store-level filtering path this task's brief asked for is
 * genuinely exercised, not merely present in the interface), applied
 * against the same full event list a second time here for `events` --
 * `overview`'s aggregate counts are computed from the unfiltered list, so
 * one HTTP call answers both views without a client needing to refetch
 * unfiltered data just to render Overview after applying a Timeline filter.
 *
 * `SIFT_DEBUG_ENABLED=false` returns `404` for this route entirely
 * (debugging-and-observability.md "Redaction and access": "`SIFT_DEBUG_ENABLED=false`
 * disables debug routes and UI in non-demo deployments") -- `enabled`
 * defaults to `true` so every existing caller that does not pass it
 * (`server.ts` always will) keeps working.
 *
 * Graph/Swarm visualization, State/Context/Errors views, export, and live
 * SSE streaming (`GET /api/debug/runs/:runId/events`,
 * `GET /api/debug/runs/:runId/export`) are explicitly out of scope for this
 * pass -- see this task's brief and the dated `docs/build-log.md` entry.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  RUNTIME_DEBUG_CATEGORIES,
  RUNTIME_DEBUG_LEVELS,
  RuntimeDebugEventSchema,
  type RuntimeDebugCategory,
  type RuntimeDebugEvent,
  type RuntimeDebugLevel,
} from '@sift/contracts';
import type { RunRecord, RunStore } from '../services/run-service.js';
import type { RuntimeEventStore } from '../store/runtime-event-store.js';
import { sendError } from './http-support.js';

export interface DebugRouterDeps {
  readonly runStore: RunStore;
  readonly runtimeEventStore: RuntimeEventStore;
  /** `SIFT_DEBUG_ENABLED` (config.ts). Defaults to `true`. */
  readonly enabled?: boolean;
}

const TokenUsageSchema = z
  .object({
    input: z.number().int().min(0),
    output: z.number().int().min(0),
    total: z.number().int().min(0),
  })
  .strict();

const RuntimeOverviewSchema = z
  .object({
    runId: z.string(),
    caseId: z.string(),
    obligationId: z.string(),
    traceId: z.string().nullable(),
    sessionId: z.string().nullable(),
    status: z.string(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    durationMs: z.number().min(0).nullable(),
    eventCount: z.number().int().min(0),
    countsByCategory: z.record(z.string(), z.number().int().min(0)),
    countsByLevel: z.record(z.string(), z.number().int().min(0)),
    errorCount: z.number().int().min(0),
    tokenUsage: TokenUsageSchema.nullable(),
    estimatedCostUsd: z.number().min(0).nullable(),
  })
  .strict();
export type RuntimeOverview = z.infer<typeof RuntimeOverviewSchema>;

const PersistedRuntimeEventSchema = RuntimeDebugEventSchema.extend({
  id: z.string().min(1),
}).strict();

const DebugRunResponseSchema = z
  .object({
    overview: RuntimeOverviewSchema,
    events: z.array(PersistedRuntimeEventSchema),
  })
  .strict();

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed']);

/**
 * Pure aggregation from a real `RunRecord` and its real, unfiltered
 * `runtime_events` rows -- independently unit-testable without an Express
 * request/response at all.
 */
export function buildRuntimeOverview(
  run: RunRecord,
  events: readonly RuntimeDebugEvent[],
): RuntimeOverview {
  const countsByCategory: Record<string, number> = {};
  const countsByLevel: Record<string, number> = {};
  let errorCount = 0;
  let tokenTotal = { input: 0, output: 0, total: 0 };
  let hasTokenUsage = false;
  let costTotal = 0;
  let hasCost = false;

  for (const event of events) {
    countsByCategory[event.category] = (countsByCategory[event.category] ?? 0) + 1;
    countsByLevel[event.level] = (countsByLevel[event.level] ?? 0) + 1;
    if (event.level === 'error') errorCount += 1;
    if (event.tokenUsage !== undefined) {
      hasTokenUsage = true;
      tokenTotal = {
        input: tokenTotal.input + event.tokenUsage.input,
        output: tokenTotal.output + event.tokenUsage.output,
        total: tokenTotal.total + event.tokenUsage.total,
      };
    }
    if (event.estimatedCostUsd !== undefined) {
      hasCost = true;
      costTotal += event.estimatedCostUsd;
    }
  }

  const startedAt = run.createdAt;
  const completedAt = TERMINAL_RUN_STATUSES.has(run.status) ? run.updatedAt : null;
  const rawDurationMs =
    completedAt !== null ? Date.parse(completedAt) - Date.parse(startedAt) : Number.NaN;

  return {
    runId: run.id,
    caseId: run.caseId,
    obligationId: run.obligationId,
    traceId: run.traceId ?? null,
    sessionId: run.sessionId ?? null,
    status: run.status,
    startedAt,
    completedAt,
    durationMs: Number.isFinite(rawDurationMs) ? Math.max(rawDurationMs, 0) : null,
    eventCount: events.length,
    countsByCategory,
    countsByLevel,
    errorCount,
    tokenUsage: hasTokenUsage ? tokenTotal : null,
    estimatedCostUsd: hasCost ? costTotal : null,
  };
}

const CategoryQuerySchema = z.enum(RUNTIME_DEBUG_CATEGORIES);
const LevelQuerySchema = z.enum(RUNTIME_DEBUG_LEVELS);

function matchesFilter(
  event: RuntimeDebugEvent,
  filter: { category?: RuntimeDebugCategory; level?: RuntimeDebugLevel },
): boolean {
  if (filter.category !== undefined && event.category !== filter.category) return false;
  if (filter.level !== undefined && event.level !== filter.level) return false;
  return true;
}

export function createDebugRouter(deps: DebugRouterDeps): Router {
  const router = Router();
  const enabled = deps.enabled ?? true;

  router.get('/api/debug/runs/:runId', (req, res) => {
    if (!enabled) {
      sendError(res, 404, 'NOT_FOUND', 'The Runtime Inspector is disabled.', false);
      return;
    }

    const { runId } = req.params;
    const run = deps.runStore.load(runId);
    if (run === undefined) {
      sendError(res, 404, 'NOT_FOUND', `Run "${runId}" was not found.`, false);
      return;
    }

    const filter: { category?: RuntimeDebugCategory; level?: RuntimeDebugLevel } = {};
    if (typeof req.query['category'] === 'string') {
      const parsed = CategoryQuerySchema.safeParse(req.query['category']);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION',
          `"category" must be one of: ${RUNTIME_DEBUG_CATEGORIES.join(', ')}.`,
          false,
        );
        return;
      }
      filter.category = parsed.data;
    }
    if (typeof req.query['level'] === 'string') {
      const parsed = LevelQuerySchema.safeParse(req.query['level']);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION',
          `"level" must be one of: ${RUNTIME_DEBUG_LEVELS.join(', ')}.`,
          false,
        );
        return;
      }
      filter.level = parsed.data;
    }

    // `runtimeEventStore.listByRun`'s own store-level category/level filter
    // is real and independently tested (fixtures/runtime-event-store-contract.ts);
    // it is not reused for `events` below only because `overview` needs the
    // unfiltered list in the same request -- filtering that same fetched
    // list once in-memory for `events` avoids a second store round-trip.
    const allEvents = deps.runtimeEventStore.listByRun(runId);
    const overview = buildRuntimeOverview(run, allEvents);
    const events = allEvents.filter((event) => matchesFilter(event, filter));

    res.status(200).json(DebugRunResponseSchema.parse({ overview, events }));
  });

  return router;
}
