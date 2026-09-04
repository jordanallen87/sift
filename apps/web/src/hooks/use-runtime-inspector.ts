/**
 * `useRuntimeInspector`: the one place `apps/web` fetches the real
 * `GET /api/debug/runs/:runId` and `GET /api/debug/runs/:runId/export`
 * routes (`apps/agent/src/routes/debug.ts`) that back the Runtime
 * Inspector's Overview + Timeline views
 * (docs/specs/debugging-and-observability.md "Runtime Inspector UI").
 *
 * Deliberately a plain fetch-on-demand hook, not a live SSE subscription
 * like `use-case-events.ts`: `GET /api/debug/runs/:runId/events` (SSE) is
 * still out of scope (see the dated `docs/build-log.md` entries) --
 * `refresh()` lets a caller re-fetch on demand (e.g. after a run completes)
 * instead.
 *
 * --- Filters are the server's, never this hook's ---
 *
 * `category`, `level`, `agent`, `search`, and `origin` are forwarded as
 * `?category=`/`?level=`/`?agent=`/`?q=`/`?origin=` to the real server-side
 * filter and changing any of them re-fetches. None of them is ever applied
 * to an already-fetched array here: a client-side `.filter()` over one
 * page of events would silently disagree with `overview`, which the route
 * always computes over the *whole* run precisely so a narrowed Timeline
 * never misreports how big the run was.
 *
 * --- Tolerating a server that has not caught up ---
 *
 * `agentIds`/`countsByOrigin` are parsed as optional with empty defaults.
 * They are always present on a current server, but the WebMCP origin
 * marker is arriving on runtime events separately from this UI, and an
 * inspector that hard-fails its whole contract parse because one aggregate
 * is missing would take out Overview and Timeline too. Empty is the honest
 * reading of "this run states no agents / no origins" either way.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  COMMAND_ORIGINS,
  RUNTIME_DEBUG_CATEGORIES,
  RUNTIME_DEBUG_LEVELS,
  RuntimeDebugEventSchema,
  type CommandOrigin,
  type RuntimeDebugCategory,
  type RuntimeDebugEvent,
  type RuntimeDebugLevel,
} from '@sift/contracts';

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
  /** Every distinct agent this run's events actually name. Empty when none do -- the agent filter has nothing honest to offer and is not rendered. */
  agentIds: string[];
  /** Counts per recognized WebMCP-style origin marker. `{}` means no event stated one, which is not the same fact as "a human clicked" -- see `debug.ts`. */
  countsByOrigin: Record<string, number>;
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
    // Optional with an empty default -- see this module's header comment
    // ("Tolerating a server that has not caught up").
    agentIds: z.array(z.string()).default([]),
    countsByOrigin: z.record(z.string(), z.number()).default({}),
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
  /** Exact emitting agent/node id (`?agent=`). Offer only values from `overview.agentIds`; a made-up id honestly matches nothing. */
  agent?: string;
  /** Free text (`?q=`), matched server-side against the summary/name/category/agent text a Timeline item renders. */
  search?: string;
  /** WebMCP-style provenance marker (`?origin=`). */
  origin?: CommandOrigin;
  /** Same-origin by default. Overridable for tests. */
  baseUrl?: string;
  /** Injectable fetch implementation for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** One downloaded `sift-run-<runId>.json` bundle, already read into memory -- small enough to hold because the route bounds a run's events, and the caller needs the bytes anyway to hand them to the browser. */
export interface RuntimeExportResult {
  filename: string;
  body: string;
  exportedEventCount: number;
}

export interface UseRuntimeInspectorResult {
  overview: RuntimeOverview | null;
  events: RuntimeInspectorEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /**
   * Downloads the run's sanitized export bundle through the SAME route,
   * the same redactor, and the same active filters as the rendered
   * Timeline. Rejects (rather than resolving with an empty bundle) when
   * there is no run, when the request fails, or when the response is not
   * the contract -- an export that silently produces nothing is worse than
   * one that says why.
   */
  exportRun: () => Promise<RuntimeExportResult>;
}

/**
 * The one part of the bundle this client depends on. Non-strict on purpose:
 * the server also sends `overview`, `filters`, and `redactionManifest`, and
 * those travel through to the saved file untouched rather than being
 * re-validated (and potentially dropped) by a client that has no use for
 * them.
 */
const DebugExportSchema = z.object({
  runId: z.string(),
  exportedEventCount: z.number(),
  events: z.array(z.unknown()),
});

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred.';
}

type FilterOptions = Pick<
  UseRuntimeInspectorOptions,
  'category' | 'level' | 'agent' | 'search' | 'origin'
>;

/** Every filter this hook forwards, in one place, so the Timeline request and the export request can never drift into asking for different things. */
function buildQuery(filters: FilterOptions): string {
  const params = new URLSearchParams();
  if (filters.category !== undefined) params.set('category', filters.category);
  if (filters.level !== undefined) params.set('level', filters.level);
  if (filters.agent !== undefined && filters.agent.length > 0) params.set('agent', filters.agent);
  if (filters.origin !== undefined) params.set('origin', filters.origin);
  if (filters.search !== undefined && filters.search.trim().length > 0) {
    params.set('q', filters.search.trim());
  }
  return params.toString();
}

function buildUrl(baseUrl: string, runId: string, filters: FilterOptions, suffix = ''): string {
  const query = buildQuery(filters);
  return `${baseUrl}/api/debug/runs/${encodeURIComponent(runId)}${suffix}${query.length > 0 ? `?${query}` : ''}`;
}

/** Prefers the filename the server actually put in `Content-Disposition` (it sanitizes the run id for header safety) and falls back to the same spec'd shape when a fetch mock omits the header. */
function readFilename(response: Response, runId: string): string {
  const header = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? `sift-run-${runId}.json`;
}

export function useRuntimeInspector(
  options: UseRuntimeInspectorOptions,
): UseRuntimeInspectorResult {
  const { runId, category, level, agent, search, origin } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<Omit<UseRuntimeInspectorResult, 'refresh' | 'exportRun'>>({
    overview: null,
    events: [],
    loading: false,
    error: null,
  });
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  const exportRun = useCallback(async (): Promise<RuntimeExportResult> => {
    const config = optionsRef.current;
    if (config.runId === null) {
      throw new Error('There is no run to export yet.');
    }
    const fetchImpl = config.fetchImpl ?? fetch;
    const response = await fetchImpl(
      buildUrl(config.baseUrl ?? '', config.runId, config, '/export'),
    );
    if (!response.ok) {
      throw new Error(`Runtime Inspector export failed with status ${response.status}.`);
    }
    // Kept as text, not re-serialized from the parsed object: the file the
    // user saves is then byte-for-byte what the server's redactor emitted,
    // with nothing this client could add, drop, or reorder.
    const body = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error('Runtime Inspector export response was not valid JSON.');
    }
    const bundle = DebugExportSchema.safeParse(parsed);
    if (!bundle.success) {
      throw new Error('Runtime Inspector export did not match its contract.');
    }
    return {
      filename: readFilename(response, config.runId),
      body,
      exportedEventCount: bundle.data.exportedEventCount,
    };
  }, []);

  useEffect(() => {
    if (runId === null) {
      setState({ overview: null, events: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    const config = optionsRef.current;
    const baseUrl = config.baseUrl ?? '';
    const fetchImpl = config.fetchImpl ?? fetch;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    // Filters are read off `config` (the current options object) rather
    // than rebuilt from the destructured values, so the Timeline request
    // and the export request are constructed from one shape. The
    // destructured values are still this effect's dependencies -- they are
    // what decides when to re-fetch.
    fetchImpl(buildUrl(baseUrl, runId, config))
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
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false, error: describeError(error) }));
      });

    return () => {
      cancelled = true;
    };
  }, [runId, category, level, agent, search, origin, refreshToken]);

  return { ...state, refresh, exportRun };
}

/** Re-exported so `RuntimeInspector.tsx` builds its filter `<select>` options from the same real vocabulary the server validates against, rather than a hand-duplicated list. */
export { COMMAND_ORIGINS, RUNTIME_DEBUG_CATEGORIES, RUNTIME_DEBUG_LEVELS };
