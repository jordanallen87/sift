/**
 * `GET /api/debug/runs/:runId` and `GET /api/debug/runs/:runId/export`
 * (docs/specs/architecture.md "HTTP service") -- the Runtime Inspector's
 * query and export routes for its Overview + Timeline surface
 * (docs/specs/debugging-and-observability.md "Runtime Inspector UI").
 *
 * Returns one run's `overview` (status, trace/session IDs, duration,
 * category/level counts, error count, token usage/estimated cost when
 * available) alongside its ordered `events` timeline, computed from the real
 * `RunStore` record and the real persisted `runtime_events` rows
 * (`store/runtime-event-store.ts`). `overview` always reflects the *whole*
 * run regardless of the query filters -- only `events` (the Timeline) is
 * narrowed by them, matching debugging-and-observability.md's split between
 * the Overview view ("status ... duration, model/tool calls, tokens ...
 * errors") and the Timeline view ("category, agent, level, and free-text
 * filters").
 *
 * --- The filter set ---
 *
 * `?category=`/`?level=` reuse `RuntimeEventStore.listByRun`'s own filter
 * vocabulary, applied against the same full event list a second time here
 * for `events` -- `overview`'s aggregate counts are computed from the
 * unfiltered list, so one HTTP call answers both views without a client
 * needing to refetch unfiltered data just to render Overview after applying
 * a Timeline filter.
 *
 * `?agent=`, `?q=`, and `?origin=` complete the spec's filter set. They are
 * applied here rather than pushed down into `RuntimeEventStore.listByRun`
 * deliberately: that interface's filter is the *store's* contract, shared
 * with its own conformance suite, and every one of these three needs the
 * unfiltered list anyway to build the Overview in the same request. All
 * five compose conjunctively (AND), so narrowing by level never silently
 * widens a free-text search.
 *
 * `?q=` matches only the text a Timeline item actually renders -- summary,
 * event name, category, and agent id. It deliberately does NOT search
 * `attributes`/`payload`: those can carry redacted or bounded content the
 * UI does not display, and a filter that confirms the presence of a string
 * it will not show you is a disclosure channel around the redactor, not a
 * search box.
 *
 * `?origin=` answers "was this caused by a WebMCP tool call or by a click"
 * (debugging-and-observability.md "WebMCP tool calls", ADR 0006 decision 8).
 * The marker's home on a runtime event is `attributes.origin`, and it is
 * read through the same closed `COMMAND_ORIGINS` vocabulary the
 * `X-Sift-Command-Origin` header reader uses -- never free text. An event
 * with no marker is reported as having no origin and is never collapsed
 * into `user`: "an absent header records nothing", and a run whose events
 * predate origin propagation truthfully reports `countsByOrigin: {}` rather
 * than inventing provenance for it. This is observability only; nothing
 * here is ever consulted for an authorization decision.
 *
 * `overview.agentIds`/`overview.countsByOrigin` exist so a client can offer
 * exactly these two filters over the run's *real* values without guessing a
 * vocabulary or fabricating one -- both are computed from the whole run, so
 * selecting an agent never collapses the list to the single agent already
 * selected.
 *
 * --- Export ---
 *
 * `GET /api/debug/runs/:runId/export` returns the sanitized
 * `sift-run-<runId>.json` bundle the spec's "Global inspector actions" names,
 * honouring the identical filters so what you export is what you were
 * looking at. JSON (not NDJSON) because the spec names that filename and
 * because a bundle is more than its event rows: it carries the whole-run
 * `overview`, the filters that produced it, and the redaction manifest, and
 * those have no natural NDJSON representation.
 *
 * "Export applies the same redactor again and records its redaction
 * manifest" (debugging-and-observability.md "Redaction and access"): the
 * export re-runs `event-normalizer.ts`'s own `redactValue` -- literally the
 * same function `runtime-event-store.ts` applies at persistence time, not a
 * second reimplementation that could drift -- over every exported event's
 * attributes/payload/stateDiff. In normal operation that second pass finds
 * nothing new, because the store already redacted at write time; it is
 * belt-and-braces for any row that reached the table another way, and it is
 * what lets this route state a manifest for the exact bytes it emitted.
 *
 * `SIFT_DEBUG_ENABLED=false` returns `404` for both routes entirely
 * (debugging-and-observability.md "Redaction and access": "`SIFT_DEBUG_ENABLED=false`
 * disables debug routes and UI in non-demo deployments") -- `enabled`
 * defaults to `true` so every existing caller that does not pass it
 * (`server.ts` always will) keeps working.
 *
 * Graph/Swarm visualization, the State/Context/Errors views, and live SSE
 * streaming (`GET /api/debug/runs/:runId/events`) remain out of scope --
 * see the dated `docs/build-log.md` entries.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  COMMAND_ORIGINS,
  CommandOriginSchema,
  RUNTIME_DEBUG_CATEGORIES,
  RUNTIME_DEBUG_LEVELS,
  RuntimeDebugEventSchema,
  type CommandOrigin,
  type Redaction,
  type RuntimeDebugCategory,
  type RuntimeDebugEvent,
  type RuntimeDebugLevel,
} from '@sift/contracts';
import type { Clock } from '@sift/core';
import type { RunRecord, RunStore } from '../services/run-service.js';
import type { PersistedRuntimeEvent, RuntimeEventStore } from '../store/runtime-event-store.js';
import { redactValue } from '../runtime/event-normalizer.js';
import { sendError } from './http-support.js';

export interface DebugRouterDeps {
  readonly runStore: RunStore;
  readonly runtimeEventStore: RuntimeEventStore;
  /** `SIFT_DEBUG_ENABLED` (config.ts). Defaults to `true`. */
  readonly enabled?: boolean;
  /** Stamps the export bundle's `exportedAt`. Injectable so a test can assert an exact bundle; defaults to the real wall clock. */
  readonly clock?: Clock;
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
    /** Every distinct `agentId` this run's events actually carry, sorted. Empty when none do -- absence is not an agent. */
    agentIds: z.array(z.string()),
    /** Counts per recognized `CommandOrigin` marker. `{}` means no event stated an origin, which is deliberately not the same fact as "a human clicked". */
    countsByOrigin: z.record(z.string(), z.number().int().min(0)),
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
 * The WebMCP provenance marker's one home on a runtime event
 * (debugging-and-observability.md "WebMCP tool calls"): `attributes.origin`,
 * validated against the same closed `COMMAND_ORIGINS` vocabulary
 * `readCommandOrigin` enforces on the `X-Sift-Command-Origin` header.
 *
 * Returns `undefined` for an event that states no origin AND for one whose
 * `attributes.origin` is not a recognized member -- both are honestly "the
 * caller stated no origin". Nothing here defaults to `user`, invents a
 * marker, or treats a missing field as an error: origin propagation onto
 * runtime events is arriving separately, so this must read correctly both
 * before and after that lands.
 */
function readEventOrigin(event: RuntimeDebugEvent): CommandOrigin | undefined {
  const parsed = CommandOriginSchema.safeParse(event.attributes['origin']);
  return parsed.success ? parsed.data : undefined;
}

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
  const countsByOrigin: Record<string, number> = {};
  const agentIds = new Set<string>();
  let errorCount = 0;
  let tokenTotal = { input: 0, output: 0, total: 0 };
  let hasTokenUsage = false;
  let costTotal = 0;
  let hasCost = false;

  for (const event of events) {
    countsByCategory[event.category] = (countsByCategory[event.category] ?? 0) + 1;
    countsByLevel[event.level] = (countsByLevel[event.level] ?? 0) + 1;
    if (event.agentId !== undefined) agentIds.add(event.agentId);
    const origin = readEventOrigin(event);
    if (origin !== undefined) countsByOrigin[origin] = (countsByOrigin[origin] ?? 0) + 1;
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
    agentIds: [...agentIds].sort((a, b) => a.localeCompare(b)),
    countsByOrigin,
    errorCount,
    tokenUsage: hasTokenUsage ? tokenTotal : null,
    estimatedCostUsd: hasCost ? costTotal : null,
  };
}

const CategoryQuerySchema = z.enum(RUNTIME_DEBUG_CATEGORIES);
const LevelQuerySchema = z.enum(RUNTIME_DEBUG_LEVELS);
/** Bounded to keep a hostile query string from turning into an unbounded per-event scan; 200 also matches `RuntimeEventStore`'s own id-length ceiling. */
const MAX_TEXT_FILTER_LENGTH = 200;

/** The Timeline's complete spec'd filter set. Every field is optional and they compose conjunctively; see this module's header comment for why `q` searches only rendered text. */
interface TimelineFilter {
  category?: RuntimeDebugCategory;
  level?: RuntimeDebugLevel;
  agent?: string;
  q?: string;
  origin?: CommandOrigin;
}

/** Exactly the text a Timeline item renders, lower-cased once per event so `?q=` never re-derives it per comparison. */
function searchableText(event: RuntimeDebugEvent): string {
  return `${event.summary}\n${event.name}\n${event.category}\n${event.agentId ?? ''}`.toLowerCase();
}

function matchesFilter(event: RuntimeDebugEvent, filter: TimelineFilter): boolean {
  if (filter.category !== undefined && event.category !== filter.category) return false;
  if (filter.level !== undefined && event.level !== filter.level) return false;
  if (filter.agent !== undefined && event.agentId !== filter.agent) return false;
  if (filter.origin !== undefined && readEventOrigin(event) !== filter.origin) return false;
  if (filter.q !== undefined && !searchableText(event).includes(filter.q)) return false;
  return true;
}

type ParsedFilter = { readonly ok: true; readonly filter: TimelineFilter } | { readonly ok: false };

/**
 * Reads and validates the shared query filter for both routes, writing the
 * `400 VALIDATION` response itself and returning `{ ok: false }` on a bad
 * value -- the same "check the flag and return immediately" contract
 * `http-support.ts`'s `readCommandId`/`readCommandOrigin` already use, so an
 * invalid filter can never silently degrade into an unfiltered response
 * (which, on the export route, would hand back far more than was asked for).
 */
function parseTimelineFilter(query: Request['query'], res: Response): ParsedFilter {
  const filter: TimelineFilter = {};

  if (typeof query['category'] === 'string') {
    const parsed = CategoryQuerySchema.safeParse(query['category']);
    if (!parsed.success) {
      sendError(
        res,
        400,
        'VALIDATION',
        `"category" must be one of: ${RUNTIME_DEBUG_CATEGORIES.join(', ')}.`,
        false,
      );
      return { ok: false };
    }
    filter.category = parsed.data;
  }

  if (typeof query['level'] === 'string') {
    const parsed = LevelQuerySchema.safeParse(query['level']);
    if (!parsed.success) {
      sendError(
        res,
        400,
        'VALIDATION',
        `"level" must be one of: ${RUNTIME_DEBUG_LEVELS.join(', ')}.`,
        false,
      );
      return { ok: false };
    }
    filter.level = parsed.data;
  }

  if (typeof query['origin'] === 'string') {
    const parsed = CommandOriginSchema.safeParse(query['origin']);
    if (!parsed.success) {
      sendError(
        res,
        400,
        'VALIDATION',
        `"origin" must be one of: ${COMMAND_ORIGINS.join(', ')}.`,
        false,
      );
      return { ok: false };
    }
    filter.origin = parsed.data;
  }

  if (typeof query['agent'] === 'string') {
    if (query['agent'].length > MAX_TEXT_FILTER_LENGTH) {
      sendError(
        res,
        400,
        'VALIDATION',
        `"agent" must be at most ${MAX_TEXT_FILTER_LENGTH} characters.`,
        false,
      );
      return { ok: false };
    }
    // A blank value is how a `<select>`/input says "no filter", so it is
    // read as absence rather than as an agent whose id is the empty string
    // -- which would match nothing and look like a broken control.
    if (query['agent'].length > 0) filter.agent = query['agent'];
  }

  if (typeof query['q'] === 'string') {
    if (query['q'].length > MAX_TEXT_FILTER_LENGTH) {
      sendError(
        res,
        400,
        'VALIDATION',
        `"q" must be at most ${MAX_TEXT_FILTER_LENGTH} characters.`,
        false,
      );
      return { ok: false };
    }
    // Trimmed and lower-cased once here so matching is case-insensitive and
    // a user who typed only whitespace sees their whole run, not nothing.
    const normalized = query['q'].trim().toLowerCase();
    if (normalized.length > 0) filter.q = normalized;
  }

  return { ok: true, filter };
}

/** The filters that actually applied, echoed back in the export bundle so a downloaded file states which view produced it. `q` is the normalized form the server matched on, not the raw keystrokes. */
function describeFilter(filter: TimelineFilter): Record<string, string> {
  return {
    ...(filter.category !== undefined ? { category: filter.category } : {}),
    ...(filter.level !== undefined ? { level: filter.level } : {}),
    ...(filter.agent !== undefined ? { agent: filter.agent } : {}),
    ...(filter.origin !== undefined ? { origin: filter.origin } : {}),
    ...(filter.q !== undefined ? { q: filter.q } : {}),
  };
}

const ExportRedactionEntrySchema = z
  .object({
    eventId: z.string().min(1),
    sequence: z.number().int().min(0),
    path: z.string(),
    reason: z.string(),
  })
  .strict();

const DebugExportSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    runId: z.string(),
    exportedAt: z.iso.datetime(),
    filters: z.record(z.string(), z.string()),
    overview: RuntimeOverviewSchema,
    exportedEventCount: z.number().int().min(0),
    events: z.array(PersistedRuntimeEventSchema),
    redactionManifest: z.array(ExportRedactionEntrySchema),
  })
  .strict();

/**
 * Re-applies `event-normalizer.ts`'s `redactValue` -- the same function
 * `runtime-event-store.ts` applies at write time -- to everything on an
 * event capable of carrying arbitrary content, and reports what it found so
 * the bundle can state a manifest for the exact bytes it emits.
 *
 * `summary`/`name` are not re-scanned: both are `safeString`-constrained
 * authored copy from Sift's own normalizers, never user or model content.
 */
function redactForExport(event: PersistedRuntimeEvent): {
  event: PersistedRuntimeEvent;
  redactions: Redaction[];
} {
  const attributes = redactValue(event.attributes);
  const payload = event.payload !== undefined ? redactValue(event.payload) : undefined;
  const stateDiff = event.stateDiff !== undefined ? redactValue(event.stateDiff) : undefined;

  const found: Redaction[] = [
    ...attributes.redactions,
    ...(payload?.redactions ?? []),
    ...(stateDiff?.redactions ?? []),
  ];

  return {
    event: {
      ...event,
      attributes: attributes.value as Record<string, unknown>,
      ...(payload !== undefined ? { payload: payload.value } : {}),
      ...(stateDiff !== undefined
        ? { stateDiff: stateDiff.value as RuntimeDebugEvent['stateDiff'] }
        : {}),
      // The persisted manifest (what the store withheld at write time) plus
      // anything this pass withheld. Both matter: the first explains a
      // `[REDACTED]` already in the row, the second would explain a leak
      // this route stopped.
      redactions: [...event.redactions, ...found],
    },
    redactions: [...event.redactions, ...found],
  };
}

/**
 * A `Content-Disposition` filename is a response header, and `runId` is a
 * caller-supplied path segment: a quote or a CR/LF in it would break out of
 * the quoted-string (or the header itself). Reduced to the same conservative
 * `[A-Za-z0-9._-]` alphabet `readCommandId` already enforces on command ids,
 * so the header is always well-formed no matter what was requested. The
 * bundle's own `runId` field carries the exact, unmodified id.
 */
function downloadFilename(runId: string): string {
  return `sift-run-${runId.replace(/[^A-Za-z0-9._-]/g, '-')}.json`;
}

export function createDebugRouter(deps: DebugRouterDeps): Router {
  const router = Router();
  const enabled = deps.enabled ?? true;
  const clock: Clock = deps.clock ?? { now: () => new Date().toISOString() };

  /**
   * Both routes share the same gate, the same lookup, and the same filter
   * parsing; only the response differs. Returns `undefined` once it has
   * already written the 404/400 response, so a caller must return
   * immediately.
   */
  function loadFilteredRun(
    req: Request<{ runId: string }>,
    res: Response,
  ):
    | {
        run: RunRecord;
        runId: string;
        filter: TimelineFilter;
        overview: RuntimeOverview;
        events: readonly PersistedRuntimeEvent[];
      }
    | undefined {
    if (!enabled) {
      sendError(res, 404, 'NOT_FOUND', 'The Runtime Inspector is disabled.', false);
      return undefined;
    }

    const runId = req.params.runId;
    const run = deps.runStore.load(runId);
    if (run === undefined) {
      sendError(res, 404, 'NOT_FOUND', `Run "${runId}" was not found.`, false);
      return undefined;
    }

    const parsed = parseTimelineFilter(req.query, res);
    if (!parsed.ok) return undefined;

    // `runtimeEventStore.listByRun`'s own store-level category/level filter
    // is real and independently tested (fixtures/runtime-event-store-contract.ts);
    // it is not reused for `events` below only because `overview` needs the
    // unfiltered list in the same request -- filtering that same fetched
    // list once in-memory for `events` avoids a second store round-trip,
    // and three of the five filters have no store-level equivalent anyway.
    const allEvents = deps.runtimeEventStore.listByRun(runId);
    return {
      run,
      runId,
      filter: parsed.filter,
      overview: buildRuntimeOverview(run, allEvents),
      events: allEvents.filter((event) => matchesFilter(event, parsed.filter)),
    };
  }

  router.get('/api/debug/runs/:runId', (req, res) => {
    const loaded = loadFilteredRun(req, res);
    if (loaded === undefined) return;

    res
      .status(200)
      .json(DebugRunResponseSchema.parse({ overview: loaded.overview, events: loaded.events }));
  });

  router.get('/api/debug/runs/:runId/export', (req, res) => {
    const loaded = loadFilteredRun(req, res);
    if (loaded === undefined) return;

    const redactionManifest: z.infer<typeof ExportRedactionEntrySchema>[] = [];
    const events = loaded.events.map((event) => {
      const result = redactForExport(event);
      for (const redaction of result.redactions) {
        redactionManifest.push({
          eventId: event.id,
          sequence: event.sequence,
          path: redaction.path,
          reason: redaction.reason,
        });
      }
      return result.event;
    });

    const bundle = DebugExportSchema.parse({
      schemaVersion: '1.0',
      runId: loaded.runId,
      exportedAt: clock.now(),
      filters: describeFilter(loaded.filter),
      overview: loaded.overview,
      exportedEventCount: events.length,
      events,
      redactionManifest,
    });

    // An attachment, not an inline body: this is the spec's downloadable
    // `sift-run-<runId>.json` bundle, and a browser hitting the URL directly
    // should save it rather than render it.
    res
      .status(200)
      .type('application/json')
      .setHeader('Content-Disposition', `attachment; filename="${downloadFilename(loaded.runId)}"`);
    res.send(JSON.stringify(bundle, null, 2));
  });

  return router;
}
