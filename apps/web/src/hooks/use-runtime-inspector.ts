/**
 * `useRuntimeInspector`: the one place `apps/web` fetches the real
 * `GET /api/debug/runs/:runId` route (`apps/agent/src/routes/debug.ts`) that
 * backs the minimum-viable Runtime Inspector (Overview + Timeline views
 * only -- docs/specs/debugging-and-observability.md "Runtime Inspector UI",
 * this task's scope).
 *
 * Deliberately a plain fetch-on-demand hook, not a live SSE subscription
 * like `use-case-events.ts`: `GET /api/debug/runs/:runId/events` (SSE) and
 * `.../export` are explicitly out of scope for this pass (see this task's
 * brief and the dated `docs/build-log.md` entry) -- `refresh()` lets a
 * caller re-fetch on demand (e.g. after a run completes) instead.
 *
 * `category`/`level` are forwarded as `?category=`/`?level=` query
 * parameters to the real server-side filter
 * (`RuntimeEventStore.listByRun`'s own filter, exercised end-to-end through
 * this route) -- changing either re-fetches; `overview` always reflects the
 * whole run regardless of the active filter, exactly like the route itself
 * documents.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  RUNTIME_DEBUG_CATEGORIES,
  RUNTIME_DEBUG_LEVELS,
  RuntimeDebugEventSchema,
  type RuntimeDebugCategory,
  type RuntimeDebugEvent,
  type RuntimeDebugLevel,
} from '@pax/contracts';

export interface RuntimeOverview {
  runId: string;
  caseId: string;
  obligationId: string;
  traceId: string | null;
  sessionId: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  eventCount: number;
  countsByCategory: Record<string, number>;
  countsByLevel: Record<string, number>;
  errorCount: number;
  tokenUsage: { input: number; output: number; total: number } | null;
  estimatedCostUsd: number | null;
}

export interface RuntimeInspectorEvent extends RuntimeDebugEvent {
  id: string;
}

const RuntimeOverviewSchema = z
  .object({
    runId: z.string(),
    caseId: z.string(),
    obligationId: z.string(),
    traceId: z.string().nullable(),
    sessionId: z.string().nullable(),
    status: z.string(),
    startedAt: z.string(),
    completedAt: z.string().nullable(),
    durationMs: z.number().nullable(),
    eventCount: z.number(),
    countsByCategory: z.record(z.string(), z.number()),
    countsByLevel: z.record(z.string(), z.number()),
    errorCount: z.number(),
    tokenUsage: z.object({ input: z.number(), output: z.number(), total: z.number() }).nullable(),
    estimatedCostUsd: z.number().nullable(),
  })
  .strict();

const DebugRunResponseSchema = z
  .object({
    overview: RuntimeOverviewSchema,
    events: z.array(RuntimeDebugEventSchema.extend({ id: z.string() }).strict()),
  })
  .strict();

export interface UseRuntimeInspectorOptions {
  /** The run to inspect, or `null` when the inspector is not open -- the hook fetches nothing and reports empty state. */
  runId: string | null;
  category?: RuntimeDebugCategory;
  level?: RuntimeDebugLevel;
  /** Same-origin by default. Overridable for tests. */
  baseUrl?: string;
  /** Injectable fetch implementation for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface UseRuntimeInspectorResult {
  overview: RuntimeOverview | null;
  events: RuntimeInspectorEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred.';
}

function buildUrl(
  baseUrl: string,
  runId: string,
  category: RuntimeDebugCategory | undefined,
  level: RuntimeDebugLevel | undefined,
): string {
  const params = new URLSearchParams();
  if (category !== undefined) params.set('category', category);
  if (level !== undefined) params.set('level', level);
  const query = params.toString();
  return `${baseUrl}/api/debug/runs/${encodeURIComponent(runId)}${query.length > 0 ? `?${query}` : ''}`;
}

export function useRuntimeInspector(
  options: UseRuntimeInspectorOptions,
): UseRuntimeInspectorResult {
  const { runId, category, level } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<UseRuntimeInspectorResult>({
    overview: null,
    events: [],
    loading: false,
    error: null,
    refresh: () => undefined,
  });
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  useEffect(() => {
    if (runId === null) {
      setState({ overview: null, events: [], loading: false, error: null, refresh });
      return;
    }

    let cancelled = false;
    const config = optionsRef.current;
    const baseUrl = config.baseUrl ?? '';
    const fetchImpl = config.fetchImpl ?? fetch;

    setState((prev) => ({ ...prev, loading: true, error: null, refresh }));

    fetchImpl(buildUrl(baseUrl, runId, category, level))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Runtime Inspector request failed with status ${response.status}.`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (cancelled) return;
        const parsed = DebugRunResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error('Runtime Inspector response did not match its contract.');
        }
        setState({
          overview: parsed.data.overview,
          events: parsed.data.events,
          loading: false,
          error: null,
          refresh,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false, error: describeError(error), refresh }));
      });

    return () => {
      cancelled = true;
    };
  }, [runId, category, level, refreshToken, refresh]);

  return state;
}

/** Re-exported so `RuntimeInspector.tsx` builds its filter `<select>` options from the same real vocabulary the server validates against, rather than a hand-duplicated list. */
export { RUNTIME_DEBUG_CATEGORIES, RUNTIME_DEBUG_LEVELS };
