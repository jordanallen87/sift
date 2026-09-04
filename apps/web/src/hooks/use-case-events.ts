/**
 * Live case data hook (docs/specs/product.md "Real-time experience
 * contract"; docs/specs/architecture.md "Real-time event contract"): the
 * one place `apps/web` subscribes to the real `GET /api/cases/:caseId/events`
 * endpoint (`apps/agent/src/routes/events.ts`) and projects it into a
 * `CaseState` snapshot plus an ordered `PublicActivityEvent[]` list every
 * region component renders from.
 *
 * Grounded directly in the real server route this task's brief pointed at
 * (`apps/agent/src/routes/events.ts`), not an assumed shape:
 *
 * - SSE is the default transport. Every `PublicActivityEvent` is sent as a
 *   *named* SSE event (`event: <event.type>`, one of the twenty
 *   `PUBLIC_ACTIVITY_EVENT_TYPES`), never the unnamed default `"message"`
 *   type -- so this hook registers a listener for each of those twenty names
 *   via `addEventListener`, not `onmessage`.
 * - `?mode=poll&afterSequence=N` returns a plain `{ snapshot, events }` JSON
 *   body. This hook reuses that *exact* endpoint for three purposes, not
 *   three different code paths: (1) the very first load for a case (snapshot
 *   + full activity backlog in one call), (2) the ongoing polling-fallback
 *   loop, and (3) a lightweight, COALESCED "refresh the canonical snapshot"
 *   call driven by live SSE events (see below) -- since `PublicActivityEvent`
 *   itself never carries a full updated `CaseState`, this is the only real
 *   route that can answer "what does the case look like now."
 *
 * Canonical-snapshot-freshness judgment call (recorded here and in
 * docs/build-log.md, per CLAUDE.md's "record judgment calls" instruction):
 * ordinary `PublicActivityEvent`s narrate activity (`summary`, bounded
 * `safeDetails`) but never carry the full updated `CaseState` a case-affecting
 * event produced. Rather than hand-maintaining a second, web-side copy of
 * "which of the twenty event types actually changed canonical state" (a
 * classification that would silently drift from the real reducer in
 * `packages/core` this app must never re-implement), this hook treats the
 * canonical snapshot as possibly-stale after *every* newly-applied,
 * non-duplicate event. This is deliberately simple and safety-first --
 * "Canonical snapshots update only from committed case events" (product.md)
 * is satisfied by construction, at the cost of some redundant reads for
 * purely-narrative events (`tool.started`, `skill.activated`, ...).
 *
 * What it does NOT do is issue one request per event. That was the original
 * implementation, and it is a real defect at real event volumes: a single
 * investigation emits ~73 correlated events, so the pane fired ~73 `GET
 * ...?mode=poll` requests -- today inside a ~70 ms window, against a
 * browser's ~6-connection-per-host budget the live SSE socket already holds
 * one of -- and then discarded every response but the newest. The MARKING is
 * per-event; the FETCHING is throttled and coalesced by
 * `requestSnapshotRefresh` below (leading edge immediate, trailing edge
 * guaranteed), which bounds a burst to `ceil(duration /
 * snapshotRefreshIntervalMs) + 1` requests and still converges on the true
 * final snapshot.
 *
 * Coalescing has one consequence the rest of the app has to be told about,
 * and `resolveEventSequence` (see `UseCaseEventsResult` below) is where it is
 * handled rather than papered over: between the events of a burst the
 * canonical snapshot -- the only carrier of `CaseState.eventSequence` -- is
 * legitimately up to `snapshotRefreshIntervalMs` behind the server, and
 * `PublicActivityEvent.sequence` is a separate counter that cannot stand in
 * for it. A mutation whose `expectedSequence` came from the lagging snapshot
 * therefore took an avoidable `409 CONFLICT`. The resolver reads the
 * canonical snapshot once, immediately, in exactly the window where this hook
 * knows it has seen the case move and has not read the result yet.
 *
 * This same mechanism is what makes the server's slow-consumer resync marker
 * (`type: 'case.snapshot'`, `safeDetails.resyncRequired: true`,
 * architecture.md "Real-time event contract") work for free: it is just
 * another event that triggers the same snapshot refresh, needing no special
 * case here. The server also closes the HTTP response right after sending
 * that marker (`res.end()` in `events.ts`'s `onResyncRequired`), which this
 * hook's own SSE `onerror`/reconnect handling below already covers.
 *
 * Reconnect / replay strategy: the real `EventSource` cannot have its
 * `Last-Event-ID` request header set programmatically on an
 * *explicitly-created* connection (only the browser's own automatic,
 * opaque-to-this-hook reconnection sends it). To keep reconnection fully
 * observable and testable (bounded attempt counting, deterministic fallback
 * to polling), this hook manages reconnection itself: on `onerror` it closes
 * the failed connection and opens a fresh one whose URL carries
 * `?afterSequence=<lastAppliedSequence>` -- the server's own route treats
 * this identically to the `Last-Event-ID` header ("`fromHeader ?? fromQuery
 * ?? 0`"), so this is a spec-compliant, equivalent replay mechanism, not a
 * workaround. After `maxReconnectAttempts` consecutive failures, the hook
 * gives up on SSE for this case generation and switches to the polling
 * fallback (architecture.md: "Polling is an allowed fallback when a
 * deployment proxy prevents SSE").
 *
 * Dedup: architecture.md "duplicate event IDs are ignored client-side" --
 * enforced here by `PublicActivityEvent.eventId` (not the SSE `id:`/sequence
 * field), across both SSE delivery and poll-fallback delivery, in one shared
 * `Set`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import {
  CaseStateSchema,
  PUBLIC_ACTIVITY_EVENT_TYPES,
  PublicActivityEventSchema,
  type CaseState,
  type PublicActivityEvent,
} from '@sift/contracts';

const DEFAULT_POLL_INTERVAL_MS = 4000;
const DEFAULT_RECONNECT_DELAY_MS = 1500;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;
/**
 * Minimum spacing between two canonical-snapshot refreshes (see
 * `requestSnapshotRefresh` below). A real investigation emits ~73
 * correlated events; refreshing per event issued ~73 `GET
 * ...?mode=poll` requests against a browser's ~6-connection-per-host budget
 * (with the live SSE socket holding one of them), for a snapshot that is
 * only ever read as "what does the case look like NOW" -- every response but
 * the newest was discarded on arrival anyway. 250 ms is short enough that a
 * person cannot perceive the trailing refresh landing after the last event
 * of a burst, and long enough to bound a run streamed over several seconds
 * to a couple of dozen requests rather than one per event.
 */
const DEFAULT_SNAPSHOT_REFRESH_INTERVAL_MS = 250;

export type CaseEventsConnectionState =
  'connecting' | 'live' | 'reconnecting' | 'polling' | 'offline';

/**
 * The minimal `EventSource` surface this hook actually uses, hand-rolled the
 * same way `model-context/adapter.ts` hand-rolls `document.modelContext`
 * (not imported from a third-party typings package) -- see that file's own
 * header comment for the general rationale. Structurally satisfied by the
 * real global `EventSource`; `InMemoryModelContextAdapter`'s sibling test
 * doubles establish the pattern of a hand-written fake implementing this
 * exact interface for tests.
 */
export interface EventSourceLikeMessageEvent {
  readonly data: string;
  readonly lastEventId?: string;
}

export interface EventSourceLike {
  close(): void;
  addEventListener(type: string, listener: (event: EventSourceLikeMessageEvent) => void): void;
  removeEventListener(type: string, listener: (event: EventSourceLikeMessageEvent) => void): void;
  onopen: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type CreateEventSource = (url: string) => EventSourceLike;

function defaultCreateEventSource(url: string): EventSourceLike {
  if (typeof EventSource === 'undefined') {
    throw new Error('EventSource is not supported in this environment.');
  }
  // The real DOM `EventSource` structurally satisfies `EventSourceLike` for
  // every member this hook actually calls; cast rather than fight the DOM
  // lib's broader overloaded `addEventListener` signature (same discipline
  // as `model-context/adapter.ts`'s own hand-rolled ambient typing).
  return new EventSource(url) as unknown as EventSourceLike;
}

export interface UseCaseEventsOptions {
  /** The active case id, or `null` when no case is open yet -- the hook subscribes to nothing and reports empty state. */
  caseId: string | null;
  /** Same-origin by default, matching `sift-client.ts`'s own default. Overridable for tests. */
  baseUrl?: string;
  /** Injectable fetch implementation for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable `EventSource` factory for tests; defaults to the real global `EventSource`. */
  createEventSource?: CreateEventSource;
  /** Interval between polling-fallback requests once SSE has been given up on. */
  pollIntervalMs?: number;
  /** Delay before opening a fresh `EventSource` after one fails. */
  reconnectDelayMs?: number;
  /** Consecutive SSE failures tolerated before falling back to polling. */
  maxReconnectAttempts?: number;
  /** Minimum spacing between two coalesced canonical-snapshot refreshes. See `DEFAULT_SNAPSHOT_REFRESH_INTERVAL_MS`. */
  snapshotRefreshIntervalMs?: number;
}

export interface UseCaseEventsResult {
  /** The current canonical case snapshot, or `null` before the first successful load. Never blanked by a later error -- the last valid snapshot is always preserved (product.md "Errors must preserve the last valid case state"). */
  snapshot: CaseState | null;
  /** Every distinct (by `eventId`) activity event received so far, ordered by `sequence`. */
  events: PublicActivityEvent[];
  connectionState: CaseEventsConnectionState;
  /** A human-readable message for the most recent recoverable transport error, or `null` once recovered. */
  error: string | null;
  /**
   * The case's authoritative `CaseState.eventSequence` at call time -- the
   * value a mutation's `expectedSequence` must carry (architecture.md
   * "Optimistic concurrency"; webmcp.md: the field "exists so a mutation can
   * be rejected when it was written against a stale view").
   *
   * `snapshot.eventSequence` alone is NOT that value, and this is the one
   * place that distinction can be made honestly:
   *
   * - `PublicActivityEvent.sequence` is "a wholly separate monotonic counter
   *   from `CaseEvent.sequence`" (`apps/agent/src/store/activity-store.ts`'s
   *   own header comment, and the `id:` field the SSE route sends), so the
   *   live stream tells this hook *that* the case moved but never *what the
   *   case sequence now is*;
   * - the canonical snapshot -- the only thing that does carry
   *   `eventSequence` -- is refreshed on a coalescing throttle
   *   (`requestSnapshotRefresh` below), so between a burst's events it
   *   legitimately lags the server by up to `snapshotRefreshIntervalMs`.
   *
   * So a command issued in that window would carry a sequence the server has
   * already moved past and take an avoidable `409 CONFLICT` -- avoidable
   * because nothing about the person's intent was stale, only this client's
   * own refresh schedule. This resolver closes exactly that gap and nothing
   * wider: it returns the current snapshot's sequence immediately when this
   * hook has already reconciled every event it has seen, and otherwise reads
   * the canonical snapshot once, now, outside the throttle. It never invents
   * a sequence, never advances past what the server has confirmed, and never
   * suppresses a genuine conflict -- a writer this client has not heard from
   * still produces one.
   */
  resolveEventSequence: () => Promise<number>;
}

const CaseEventsPollResponseSchema = z
  .object({
    snapshot: CaseStateSchema,
    events: z.array(PublicActivityEventSchema),
  })
  .strict();

interface PollResult {
  snapshot: CaseState;
  events: PublicActivityEvent[];
}

async function fetchCaseEventsPoll(
  fetchImpl: typeof fetch,
  baseUrl: string,
  caseId: string,
  afterSequence: number,
): Promise<PollResult> {
  const url = `${baseUrl}/api/cases/${encodeURIComponent(caseId)}/events?mode=poll&afterSequence=${afterSequence}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Sift case events request failed with status ${response.status}.`);
  }
  const payload: unknown = await response.json();
  const parsed = CaseEventsPollResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('Sift case events response did not match its contract.');
  }
  return parsed.data;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred.';
}

function sortEvents(events: PublicActivityEvent[]): PublicActivityEvent[] {
  return [...events].sort((a, b) => a.sequence - b.sequence);
}

/**
 * Subscribes to the live case event stream for `caseId`, exposing the
 * current canonical `CaseState` snapshot and the ordered public activity
 * log. See this file's header comment for the full transport/replay/dedup/
 * snapshot-freshness design.
 */
export function useCaseEvents(options: UseCaseEventsOptions): UseCaseEventsResult {
  const { caseId } = options;
  // Every other option is read fresh from this ref at the start of each
  // connection cycle, not added to the effect's dependency array -- keeps
  // the effect keyed purely on `caseId` (the one value whose *change* must
  // tear down and restart the subscription) and immune to callers passing
  // new-identity-but-equivalent option objects/functions on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<Omit<UseCaseEventsResult, 'resolveEventSequence'>>({
    snapshot: null,
    events: [],
    connectionState: 'connecting',
    error: null,
  });

  // Rebound by the effect below on every connection cycle, so the returned
  // resolver's identity stays stable across renders (callers memoize command
  // handlers on it) while always reaching the CURRENT case's live
  // bookkeeping. Before the first cycle, and after the last one is torn down,
  // there is no case to read a sequence from.
  const resolveEventSequenceRef = useRef<() => Promise<number>>(() => Promise.resolve(0));
  const resolveEventSequence = useCallback(() => resolveEventSequenceRef.current(), []);

  useEffect(() => {
    if (caseId === null) {
      resolveEventSequenceRef.current = () => Promise.resolve(0);
      setState({ snapshot: null, events: [], connectionState: 'connecting', error: null });
      return;
    }

    // Re-bound to a fresh `const` so every nested function declaration below
    // captures a value TypeScript's control-flow narrowing can prove is
    // never `null`, rather than the outer `caseId` closure variable (whose
    // narrowing from the guard above does not extend into nested function
    // declarations).
    const activeCaseId = caseId;
    const config = optionsRef.current;
    const baseUrl = config.baseUrl ?? '';
    const fetchImpl = config.fetchImpl ?? fetch;
    const createEventSourceImpl = config.createEventSource ?? defaultCreateEventSource;
    const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const reconnectDelayMs = config.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    const maxReconnectAttempts = config.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    const snapshotRefreshIntervalMs =
      config.snapshotRefreshIntervalMs ?? DEFAULT_SNAPSHOT_REFRESH_INTERVAL_MS;

    let disposed = false;
    const seenEventIds = new Set<string>();
    let lastSequence = 0;
    let reconnectAttempts = 0;
    let refreshToken = 0;
    let refreshInFlight = false;
    let refreshPending = false;
    // Deliberately `-Infinity`, not `Date.now()`: the very first refresh of
    // a connection cycle must go out immediately (the burst has not started
    // yet, and a single isolated event has to land promptly), so nothing
    // may look like a refresh that "just happened".
    let lastRefreshStartedAt = Number.NEGATIVE_INFINITY;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let currentSource: EventSourceLike | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    // The snapshot as this cycle last read it, kept alongside `setState` so
    // the resolver below can answer synchronously without a render in
    // between (a click handler asks for the sequence, not for a re-render).
    let latestSnapshot: CaseState | null = null;
    /**
     * The highest ACTIVITY sequence `latestSnapshot` is known to account for.
     *
     * Always the `lastSequence` observed at the moment its read was *issued*,
     * never at the moment the response landed: the route re-loads the case at
     * response time, so the snapshot provably covers everything up to the
     * request, and anything that arrived while it was in flight is
     * deliberately left uncovered rather than optimistically claimed.
     * `lastSequence > snapshotCoversSequence` is therefore the exact,
     * conservative statement "this client has seen the case move and has not
     * read the result yet."
     */
    let snapshotCoversSequence = 0;
    let authoritativeRead: {
      token: number;
      coversSequence: number;
      promise: Promise<CaseState | null>;
    } | null = null;
    let authoritativeReadToken = 0;

    setState({ snapshot: null, events: [], connectionState: 'connecting', error: null });

    function applyPollResult(
      result: PollResult,
      nextConnectionState: CaseEventsConnectionState,
      coversSequence: number,
    ) {
      const freshEvents = result.events.filter((event) => !seenEventIds.has(event.eventId));
      for (const event of freshEvents) {
        seenEventIds.add(event.eventId);
        if (event.sequence > lastSequence) lastSequence = event.sequence;
      }
      latestSnapshot = result.snapshot;
      snapshotCoversSequence = Math.max(snapshotCoversSequence, coversSequence);
      setState((prev) => ({
        snapshot: result.snapshot,
        events: freshEvents.length > 0 ? sortEvents([...prev.events, ...freshEvents]) : prev.events,
        connectionState: nextConnectionState,
        error: null,
      }));
    }

    function clearRefreshTimer() {
      if (refreshTimer !== null) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    }

    /**
     * Coalescing entry point for "the canonical snapshot may have moved --
     * go and read it." Called once per newly-applied event; it is emphatically
     * NOT one request per call.
     *
     * A run's events arrive in correlated bursts (a real investigation is
     * ~73 events, today inside ~70 ms and, once the runtime streams as the
     * graph progresses, spread over seconds). Issuing one poll per event put
     * dozens of requests against a browser's ~6-connection-per-host budget
     * while the live SSE socket held one of them, and every response but the
     * newest was thrown away by the token guard below anyway.
     *
     * The policy is a leading-edge-plus-trailing-edge throttle:
     *
     * - the first refresh after a quiet period goes out immediately, so a
     *   single isolated event is never delayed behind a timer;
     * - any refresh requested while one is in flight, or inside the
     *   `snapshotRefreshIntervalMs` cooldown after one started, collapses
     *   into a single `refreshPending` flag;
     * - a pending flag always produces exactly one more refresh once the
     *   in-flight request settles and the cooldown elapses -- so the last
     *   event of a burst is never the one whose refresh got dropped, and the
     *   pane converges on the true final snapshot.
     *
     * That bounds a burst of any length to `ceil(duration /
     * snapshotRefreshIntervalMs) + 1` requests instead of one per event,
     * while leaving replay, dedup, resync and the polling fallback (all of
     * which reach state through `applyPollResult`, not through here)
     * untouched.
     */
    function requestSnapshotRefresh() {
      if (disposed) return;
      if (refreshInFlight || refreshTimer !== null) {
        refreshPending = true;
        return;
      }
      const sinceLastRefresh = Date.now() - lastRefreshStartedAt;
      if (sinceLastRefresh >= snapshotRefreshIntervalMs) {
        startSnapshotRefresh();
        return;
      }
      refreshPending = true;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        if (disposed || !refreshPending) return;
        startSnapshotRefresh();
      }, snapshotRefreshIntervalMs - sinceLastRefresh);
    }

    function startSnapshotRefresh() {
      refreshPending = false;
      refreshInFlight = true;
      lastRefreshStartedAt = Date.now();
      const token = ++refreshToken;
      const coversSequence = lastSequence;
      fetchCaseEventsPoll(fetchImpl, baseUrl, activeCaseId, coversSequence)
        .then((result) => {
          if (disposed || token !== refreshToken) return;
          latestSnapshot = result.snapshot;
          snapshotCoversSequence = Math.max(snapshotCoversSequence, coversSequence);
          setState((prev) => ({ ...prev, snapshot: result.snapshot }));
        })
        .catch(() => {
          // A background refresh failure is not itself a transport-level
          // disconnect (SSE/polling remain the source of truth for
          // connection state) -- the last valid snapshot simply stays as-is.
        })
        .finally(() => {
          refreshInFlight = false;
          // Never dropped: whatever arrived while this request was in flight
          // still gets a refresh of its own.
          if (refreshPending) requestSnapshotRefresh();
        });
    }

    /**
     * Reads the canonical snapshot immediately, outside the coalescing
     * throttle, and returns it.
     *
     * Deliberately NOT routed through `requestSnapshotRefresh`: that policy
     * exists to stop a *burst of events* from issuing one request per event,
     * and it is right. This is the opposite shape -- a single, human-paced
     * request for a value that must be current before a command goes out --
     * so bounding it behind the burst timer would trade the defect it fixes
     * for a 250 ms delay on a button press. Concurrent callers that need no
     * newer view than the one already in flight share that one request, so
     * two controls pressed together still cost one read, not two.
     */
    function readSnapshotNow(): Promise<CaseState | null> {
      if (authoritativeRead !== null && authoritativeRead.coversSequence >= lastSequence) {
        return authoritativeRead.promise;
      }
      const coversSequence = lastSequence;
      const readToken = ++authoritativeReadToken;
      const token = ++refreshToken;
      const promise = fetchCaseEventsPoll(fetchImpl, baseUrl, activeCaseId, coversSequence)
        .then((result) => {
          if (disposed || token !== refreshToken) return latestSnapshot;
          latestSnapshot = result.snapshot;
          snapshotCoversSequence = Math.max(snapshotCoversSequence, coversSequence);
          setState((prev) => ({ ...prev, snapshot: result.snapshot }));
          return result.snapshot;
        })
        .catch(() => {
          // The last valid snapshot stays as-is, exactly as a failed
          // background refresh leaves it -- the caller falls back to the
          // sequence it already had, which is the pre-existing behaviour
          // rather than a new failure mode.
          return latestSnapshot;
        })
        .finally(() => {
          if (authoritativeRead?.token === readToken) authoritativeRead = null;
        });
      authoritativeRead = { token: readToken, coversSequence, promise };
      return promise;
    }

    function resolveEventSequence(): Promise<number> {
      const known = latestSnapshot?.eventSequence ?? 0;
      // Already reconciled with every event this client has seen, so the
      // snapshot in hand IS the server's sequence as of the last thing the
      // server told us. No request, and no reason for one.
      if (disposed || (latestSnapshot !== null && lastSequence <= snapshotCoversSequence)) {
        return Promise.resolve(known);
      }
      return readSnapshotNow().then((snapshot) => snapshot?.eventSequence ?? known);
    }

    resolveEventSequenceRef.current = resolveEventSequence;

    function handleMessage(message: EventSourceLikeMessageEvent) {
      if (disposed) return;
      let raw: unknown;
      try {
        raw = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = PublicActivityEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const event = parsed.data;
      if (seenEventIds.has(event.eventId)) return;
      seenEventIds.add(event.eventId);
      if (event.sequence > lastSequence) lastSequence = event.sequence;
      setState((prev) => ({ ...prev, events: sortEvents([...prev.events, event]) }));
      requestSnapshotRefresh();
    }

    function clearReconnectTimer() {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function clearPollTimer() {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function startPolling() {
      if (disposed) return;
      clearReconnectTimer();
      // Polling reads the canonical snapshot on every tick (through
      // `applyPollResult`), starting with the immediate `poll()` below, so a
      // still-queued SSE-era snapshot refresh would only duplicate the very
      // next request. Dropping it here cannot lose state.
      clearRefreshTimer();
      refreshPending = false;
      if (currentSource) {
        currentSource.close();
        currentSource = null;
      }
      setState((prev) => ({ ...prev, connectionState: 'polling' }));

      const poll = () => {
        const coversSequence = lastSequence;
        fetchCaseEventsPoll(fetchImpl, baseUrl, activeCaseId, coversSequence)
          .then((result) => {
            if (disposed) return;
            applyPollResult(result, 'polling', coversSequence);
          })
          .catch((error: unknown) => {
            if (disposed) return;
            setState((prev) => ({
              ...prev,
              connectionState: 'offline',
              error: describeError(error),
            }));
          });
      };
      poll();
      pollTimer = setInterval(poll, pollIntervalMs);
    }

    function openSse() {
      if (disposed) return;
      const query = lastSequence > 0 ? `?afterSequence=${lastSequence}` : '';
      const url = `${baseUrl}/api/cases/${encodeURIComponent(activeCaseId)}/events${query}`;
      const source = createEventSourceImpl(url);
      currentSource = source;

      source.onopen = () => {
        if (disposed) return;
        reconnectAttempts = 0;
        setState((prev) => ({ ...prev, connectionState: 'live', error: null }));
      };

      source.onerror = () => {
        if (disposed) return;
        source.close();
        if (currentSource === source) currentSource = null;
        reconnectAttempts += 1;
        if (reconnectAttempts > maxReconnectAttempts) {
          startPolling();
          return;
        }
        setState((prev) => ({
          ...prev,
          connectionState: 'reconnecting',
          error: 'Lost connection to the live case stream. Reconnecting…',
        }));
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          openSse();
        }, reconnectDelayMs);
      };

      for (const type of PUBLIC_ACTIVITY_EVENT_TYPES) {
        source.addEventListener(type, handleMessage);
      }
    }

    fetchCaseEventsPoll(fetchImpl, baseUrl, caseId, 0)
      .then((result) => {
        if (disposed) return;
        applyPollResult(result, 'connecting', 0);
        openSse();
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setState((prev) => ({ ...prev, connectionState: 'offline', error: describeError(error) }));
        startPolling();
      });

    return () => {
      disposed = true;
      clearReconnectTimer();
      clearPollTimer();
      clearRefreshTimer();
      if (currentSource) {
        currentSource.close();
        currentSource = null;
      }
    };
  }, [caseId]);

  return useMemo(() => ({ ...state, resolveEventSequence }), [state, resolveEventSequence]);
}
