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
 *   loop, and (3) a lightweight "refresh the canonical snapshot" call made
 *   after every live SSE event (see below) -- since `PublicActivityEvent`
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
 * `packages/core` this app must never re-implement), this hook re-fetches the
 * canonical snapshot via the same poll endpoint after *every* newly-applied,
 * non-duplicate event. This is deliberately simple and safety-first --
 * "Canonical snapshots update only from committed case events" (product.md)
 * is satisfied by construction, at the cost of some redundant reads for
 * purely-narrative events (`tool.started`, `skill.activated`, ...). Demo-
 * scale event volume makes that cost negligible; a later optimization could
 * narrow the trigger set without changing this hook's external contract.
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
import { useEffect, useRef, useState } from 'react';
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
}

export interface UseCaseEventsResult {
  /** The current canonical case snapshot, or `null` before the first successful load. Never blanked by a later error -- the last valid snapshot is always preserved (product.md "Errors must preserve the last valid case state"). */
  snapshot: CaseState | null;
  /** Every distinct (by `eventId`) activity event received so far, ordered by `sequence`. */
  events: PublicActivityEvent[];
  connectionState: CaseEventsConnectionState;
  /** A human-readable message for the most recent recoverable transport error, or `null` once recovered. */
  error: string | null;
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

  const [state, setState] = useState<UseCaseEventsResult>({
    snapshot: null,
    events: [],
    connectionState: 'connecting',
    error: null,
  });

  useEffect(() => {
    if (caseId === null) {
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

    let disposed = false;
    const seenEventIds = new Set<string>();
    let lastSequence = 0;
    let reconnectAttempts = 0;
    let refreshToken = 0;
    let currentSource: EventSourceLike | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    setState({ snapshot: null, events: [], connectionState: 'connecting', error: null });

    function applyPollResult(result: PollResult, nextConnectionState: CaseEventsConnectionState) {
      const freshEvents = result.events.filter((event) => !seenEventIds.has(event.eventId));
      for (const event of freshEvents) {
        seenEventIds.add(event.eventId);
        if (event.sequence > lastSequence) lastSequence = event.sequence;
      }
      setState((prev) => ({
        snapshot: result.snapshot,
        events: freshEvents.length > 0 ? sortEvents([...prev.events, ...freshEvents]) : prev.events,
        connectionState: nextConnectionState,
        error: null,
      }));
    }

    function refreshSnapshot() {
      const token = ++refreshToken;
      fetchCaseEventsPoll(fetchImpl, baseUrl, activeCaseId, lastSequence)
        .then((result) => {
          if (disposed || token !== refreshToken) return;
          setState((prev) => ({ ...prev, snapshot: result.snapshot }));
        })
        .catch(() => {
          // A background refresh failure is not itself a transport-level
          // disconnect (SSE/polling remain the source of truth for
          // connection state) -- the last valid snapshot simply stays as-is.
        });
    }

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
      refreshSnapshot();
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
      if (currentSource) {
        currentSource.close();
        currentSource = null;
      }
      setState((prev) => ({ ...prev, connectionState: 'polling' }));

      const poll = () => {
        fetchCaseEventsPoll(fetchImpl, baseUrl, activeCaseId, lastSequence)
          .then((result) => {
            if (disposed) return;
            applyPollResult(result, 'polling');
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
        applyPollResult(result, 'connecting');
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
      if (currentSource) {
        currentSource.close();
        currentSource = null;
      }
    };
  }, [caseId]);

  return state;
}
