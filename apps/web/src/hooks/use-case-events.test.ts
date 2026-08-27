import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { CaseState, PublicActivityEvent } from '@pax/contracts';
import { buildFixtureCaseState } from '../test/fixtures.js';
import { FakeEventSource, createFakeEventSource } from '../test/fake-event-source.js';
import { useCaseEvents } from './use-case-events.js';

const BASE_URL = 'http://pax.test';
const CASE_ID = 'case-1';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function buildEvent(overrides: Partial<PublicActivityEvent> = {}): PublicActivityEvent {
  return {
    schemaVersion: '1.0',
    eventId: 'evt-1',
    sequence: 1,
    timestamp: '2026-08-27T00:00:00.000Z',
    caseId: CASE_ID,
    type: 'run.queued',
    phase: 'queued',
    summary: 'Investigation queued.',
    ...overrides,
  };
}

function pollHandler(snapshot: CaseState, events: PublicActivityEvent[]) {
  return http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('mode') !== 'poll') {
      return new HttpResponse(null, { status: 400 });
    }
    const after = Number(url.searchParams.get('afterSequence') ?? '0');
    return HttpResponse.json({
      snapshot,
      events: events.filter((event) => event.sequence > after),
    });
  });
}

beforeEach(() => {
  FakeEventSource.reset();
});

describe('useCaseEvents', () => {
  it('does nothing and reports the connecting state when caseId is null', () => {
    const { result } = renderHook(() =>
      useCaseEvents({ caseId: null, baseUrl: BASE_URL, createEventSource: createFakeEventSource }),
    );

    expect(result.current.snapshot).toBeNull();
    expect(result.current.events).toEqual([]);
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('loads the initial snapshot and events via poll, then opens an SSE connection and goes live on open', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    const seedEvent = buildEvent({ eventId: 'evt-seed', sequence: 1 });
    server.use(pollHandler(snapshot, [seedEvent]));

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot).toEqual(snapshot);
    });
    expect(result.current.events.map((event) => event.eventId)).toEqual(['evt-seed']);

    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    expect(result.current.connectionState).toBe('connecting');

    FakeEventSource.instances[0]!.triggerOpen();

    await waitFor(() => {
      expect(result.current.connectionState).toBe('live');
    });
  });

  it('applies a live SSE event, appends it in sequence order, and refreshes the snapshot', async () => {
    const initialSnapshot = buildFixtureCaseState({ id: CASE_ID, eventSequence: 1 });
    const refreshedSnapshot = buildFixtureCaseState({ id: CASE_ID, eventSequence: 2 });
    let pollCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, () => {
        pollCount += 1;
        const snapshot = pollCount === 1 ? initialSnapshot : refreshedSnapshot;
        return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
      }),
    );

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    source.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));

    const liveEvent = buildEvent({
      eventId: 'evt-live-1',
      sequence: 2,
      type: 'evidence.accepted',
      phase: 'completed',
    });
    source.emit(liveEvent);

    await waitFor(() => {
      expect(result.current.events.map((event) => event.eventId)).toEqual(['evt-live-1']);
    });
    await waitFor(() => {
      expect(result.current.snapshot).toEqual(refreshedSnapshot);
    });
  });

  it('ignores a duplicate event id delivered twice (replay dedup)', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    server.use(pollHandler(snapshot, []));

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    source.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));

    const duplicated = buildEvent({ eventId: 'evt-dup', sequence: 5 });
    source.emit(duplicated);
    await waitFor(() => {
      expect(result.current.events.map((event) => event.eventId)).toEqual(['evt-dup']);
    });

    source.emit(duplicated);
    // Give the (absent) second application a tick to have landed if it were
    // going to -- then assert the list is still exactly one item.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.events.map((event) => event.eventId)).toEqual(['evt-dup']);
  });

  it('silently ignores a malformed (non-JSON or schema-invalid) SSE message rather than crashing', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    server.use(pollHandler(snapshot, []));

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    source.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));

    source.emitRaw('run.queued', 'not valid json{{{');
    source.emitRaw('run.queued', JSON.stringify({ not: 'a valid PublicActivityEvent' }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.current.events).toEqual([]);
    expect(result.current.connectionState).toBe('live');
  });

  it('replays only events after the last received sequence when reconnecting', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    server.use(pollHandler(snapshot, []));

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        reconnectDelayMs: 5,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const first = FakeEventSource.instances[0]!;
    first.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));

    first.emit(buildEvent({ eventId: 'evt-a', sequence: 3 }));
    await waitFor(() => {
      expect(result.current.events.map((event) => event.eventId)).toEqual(['evt-a']);
    });

    first.triggerError();
    await waitFor(() => expect(result.current.connectionState).toBe('reconnecting'));
    expect(first.closed).toBe(true);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    const second = FakeEventSource.instances[1]!;
    expect(second.url).toContain('afterSequence=3');
  });

  it('falls back to polling after exceeding the max reconnect attempts, and keeps polling on an interval', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    let pollCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, () => {
        pollCount += 1;
        return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
      }),
    );

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        reconnectDelayMs: 2,
        maxReconnectAttempts: 1,
        pollIntervalMs: 5,
      }),
    );

    // First SSE attempt fails.
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0]!.triggerError();

    // Reconnect attempt (2nd instance) also fails -> exceeds maxReconnectAttempts: 1.
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    FakeEventSource.instances[1]!.triggerError();

    await waitFor(() => {
      expect(result.current.connectionState).toBe('polling');
    });

    const countAfterFallback = pollCount;
    await waitFor(() => {
      expect(pollCount).toBeGreaterThan(countAfterFallback);
    });
  });

  it('preserves the last valid snapshot and reports offline when a poll request fails', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    let shouldFail = false;
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, () => {
        if (shouldFail) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
      }),
    );

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        reconnectDelayMs: 2,
        maxReconnectAttempts: 0,
        pollIntervalMs: 5,
      }),
    );

    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0]!.triggerError();
    await waitFor(() => expect(result.current.connectionState).toBe('polling'));

    shouldFail = true;
    await waitFor(() => {
      expect(result.current.connectionState).toBe('offline');
    });
    expect(result.current.error).not.toBeNull();
    // Last-valid snapshot is preserved, never blanked.
    expect(result.current.snapshot).toEqual(snapshot);
  });

  it('tears down the previous subscription (closes SSE) when caseId changes', async () => {
    const snapshotA = buildFixtureCaseState({ id: 'case-a' });
    const snapshotB = buildFixtureCaseState({ id: 'case-b' });
    server.use(
      http.get(`${BASE_URL}/api/cases/case-a/events`, () =>
        HttpResponse.json({ snapshot: snapshotA, events: [] as PublicActivityEvent[] }),
      ),
      http.get(`${BASE_URL}/api/cases/case-b/events`, () =>
        HttpResponse.json({ snapshot: snapshotB, events: [] as PublicActivityEvent[] }),
      ),
    );

    const { result, rerender } = renderHook(
      ({ caseId }: { caseId: string }) =>
        useCaseEvents({ caseId, baseUrl: BASE_URL, createEventSource: createFakeEventSource }),
      { initialProps: { caseId: 'case-a' } },
    );

    await waitFor(() => expect(result.current.snapshot).toEqual(snapshotA));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const firstSource = FakeEventSource.instances[0]!;

    rerender({ caseId: 'case-b' });

    await waitFor(() => expect(firstSource.closed).toBe(true));
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshotB));
  });

  it('closes the EventSource and clears timers on unmount', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    server.use(pollHandler(snapshot, []));

    const { unmount } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    unmount();

    expect(source.closed).toBe(true);
  });

  it('unmounting while a background snapshot refresh is still in flight does not throw or apply a late update', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    let resolveRefresh: (() => void) | undefined;
    let pollCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, async () => {
        pollCount += 1;
        if (pollCount === 1) {
          return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
        }
        // The refresh triggered by the live event below never resolves
        // until after `unmount()` -- proving the `disposed` guard, not a
        // race, is what prevents the late state update.
        await new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        });
        return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
      }),
    );

    const { result, unmount } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    source.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));

    source.emit(buildEvent({ eventId: 'evt-triggers-refresh', sequence: 1 }));
    await waitFor(() => expect(pollCount).toBe(2));

    expect(() => unmount()).not.toThrow();
    resolveRefresh?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // No error was thrown by the late resolution landing after unmount.
  });

  it('falls back to the real global EventSource when no createEventSource override is supplied, surfacing a clear error and falling back to polling when this environment has none', async () => {
    // jsdom (this project's Vitest `environment: 'jsdom'`) does not implement
    // `EventSource` at all -- confirmed directly against the installed jsdom
    // package, not assumed. `defaultCreateEventSource`'s own
    // `typeof EventSource === 'undefined'` guard exists precisely for this
    // real case, not just a defensive placeholder: every other test in this
    // file supplies `createEventSource: createFakeEventSource` and so never
    // exercises the *real* default factory this hook falls back to when a
    // caller (the real `AppProviders` with no `caseEventsConfig` override)
    // doesn't supply one.
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    let callCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
        }
        // The fallback poll this failure triggers is deliberately left
        // hanging forever so its (eventual, unrelated) success can never
        // race ahead and overwrite the very error text this test asserts on.
        return new Promise<never>(() => undefined);
      }),
    );

    const { result } = renderHook(() => useCaseEvents({ caseId: CASE_ID, baseUrl: BASE_URL }));

    await waitFor(() => {
      expect(result.current.error).toContain('EventSource is not supported');
    });
    // The thrown construction error is caught by the initial load's own
    // `.catch()`, which falls back to polling -- no SSE connection was ever
    // opened (there is nothing for `FakeEventSource` to have recorded).
    expect(result.current.connectionState).toBe('polling');
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('treats a schema-invalid poll response (fails CaseEventsPollResponseSchema) as a recoverable error rather than crashing', async () => {
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, () =>
        HttpResponse.json({ not: 'a valid poll response shape' }),
      ),
    );

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => {
      expect(result.current.error).toContain('did not match its contract');
    });
    expect(result.current.connectionState).toBe('offline');
  });

  it('reports the generic "unknown error" message (not a blank or [object Object] string) when the initial poll rejects with a non-Error value, and still falls back to polling', async () => {
    // `fetchCaseEventsPoll` itself only ever throws real `Error` instances,
    // but a caller-injected `fetchImpl` (as `App.tsx`/`AppProviders` allow
    // for tests, and as a real fetch polyfill theoretically could) can
    // reject with an arbitrary non-Error value -- `describeError`'s fallback
    // branch exists for exactly that case.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately a non-Error rejection value; that is exactly what this test exercises.
    const fetchImpl = (() => Promise.reject('boom')) as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        fetchImpl,
        pollIntervalMs: 5,
      }),
    );

    await waitFor(() => {
      expect(result.current.error).toBe('An unknown error occurred.');
    });
    expect(result.current.connectionState).toBe('offline');
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('unmounting before the very first snapshot poll rejects does not apply a late offline/error state update or start polling', async () => {
    let rejectInitial: ((reason?: unknown) => void) | undefined;
    const fetchImpl = (() =>
      new Promise((_resolve, reject) => {
        rejectInitial = reject;
      })) as unknown as typeof fetch;

    const { unmount } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        fetchImpl,
      }),
    );

    await waitFor(() => expect(rejectInitial).toBeDefined());
    unmount();

    expect(() => rejectInitial?.(new Error('late failure'))).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The disposed guard skipped both the offline/error state update and the
    // polling fallback this rejection would otherwise have started.
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('computes lastSequence correctly from an out-of-order initial events backlog (a later, lower-sequence event never regresses it)', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    const higherFirst = buildEvent({ eventId: 'evt-seq-5', sequence: 5 });
    const lowerSecond = buildEvent({ eventId: 'evt-seq-2', sequence: 2 });
    // `pollHandler` preserves array order (it only filters by sequence), so
    // this genuinely delivers the higher-sequence event before the lower one
    // within the very same poll response -- a real, if unusual, ordering a
    // server-side backlog could produce.
    server.use(pollHandler(snapshot, [higherFirst, lowerSecond]));

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        reconnectDelayMs: 5,
      }),
    );

    await waitFor(() => {
      expect(result.current.events.map((event) => event.eventId)).toEqual([
        'evt-seq-2',
        'evt-seq-5',
      ]);
    });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    FakeEventSource.instances[0]!.triggerError();

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    // Replays from sequence 5 (the true maximum), not 2 (the later-processed,
    // lower one) -- proving the lastSequence guard did not regress.
    expect(FakeEventSource.instances[1]!.url).toContain('afterSequence=5');
  });

  it('a live SSE message that arrives after unmount is ignored (does not refresh the snapshot or update state)', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    let refreshCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, ({ request }) => {
        const url = new URL(request.url);
        if (
          url.searchParams.get('mode') === 'poll' &&
          url.searchParams.get('afterSequence') !== '0'
        ) {
          refreshCallCount += 1;
        }
        return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
      }),
    );

    const { result, unmount } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    source.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));
    const refreshCountAtUnmount = refreshCallCount;

    unmount();
    expect(() =>
      source.emit(buildEvent({ eventId: 'evt-after-unmount', sequence: 9 })),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // `refreshSnapshot()` -- the observable side effect `handleMessage` would
    // otherwise have triggered -- was never called for this post-unmount event.
    expect(refreshCallCount).toBe(refreshCountAtUnmount);
  });

  it('does not lower lastSequence when a live SSE event with a lower sequence than already seen arrives, and still records it by id', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    server.use(pollHandler(snapshot, []));

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        reconnectDelayMs: 5,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    source.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));

    source.emit(buildEvent({ eventId: 'evt-high', sequence: 10 }));
    await waitFor(() => {
      expect(result.current.events.map((event) => event.eventId)).toEqual(['evt-high']);
    });

    source.emit(buildEvent({ eventId: 'evt-low', sequence: 3 }));
    await waitFor(() => {
      expect(result.current.events.map((event) => event.eventId)).toEqual(['evt-low', 'evt-high']);
    });

    source.triggerError();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    // Reconnects from sequence 10 (the real maximum), proving the later,
    // lower-sequence live event never regressed `lastSequence` to 3.
    expect(FakeEventSource.instances[1]!.url).toContain('afterSequence=10');
  });

  it('a stale/duplicate error callback from an already-replaced connection does not clear the current connection pointer, but still counts toward its own retry budget and can close the current connection once that budget is exceeded', async () => {
    // A real `EventSource` can legitimately fire more than one `error` event
    // for the same underlying failure before this hook has replaced it with
    // a fresh connection. `openSse()`'s `onerror` handler guards the
    // `currentSource = null` assignment with an identity check
    // (`currentSource === source`) precisely so a late/duplicate callback
    // from a connection that has *already* been superseded cannot clear the
    // pointer to the connection that actually replaced it.
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    server.use(pollHandler(snapshot, []));

    const { result } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        reconnectDelayMs: 5,
        maxReconnectAttempts: 1,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const first = FakeEventSource.instances[0]!;
    first.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));

    // First failure (attempt 1 of 1 tolerated) -- reconnects to a second,
    // real connection rather than exceeding the budget yet.
    first.triggerError();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    const second = FakeEventSource.instances[1]!;
    expect(second.closed).toBe(false);

    // A late, duplicate `error` callback from the already-replaced `first`
    // connection: `currentSource` already points at `second`, so this must
    // not null it out directly -- but it still increments `first`'s own
    // retry counter past `maxReconnectAttempts`, which falls back to
    // polling and closes whatever connection is *currently* tracked
    // (`second`), even though the failure it reacted to came from `first`.
    first.triggerError();

    await waitFor(() => {
      expect(result.current.connectionState).toBe('polling');
    });
    expect(second.closed).toBe(true);
  });

  it('unmounting while a fallback poll request that will succeed is still in flight does not apply its result after the fact', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    let releasePendingSuccess: (() => void) | undefined;
    let callCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, async () => {
        callCount += 1;
        if (callCount <= 1) {
          return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
        }
        await new Promise<void>((resolve) => {
          releasePendingSuccess = resolve;
        });
        return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
      }),
    );

    const { result, unmount } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        maxReconnectAttempts: 0,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    // `maxReconnectAttempts: 0` falls straight to polling on the first SSE
    // failure, immediately issuing the first fallback poll (call #2).
    FakeEventSource.instances[0]!.triggerError();
    await waitFor(() => expect(result.current.connectionState).toBe('polling'));
    await waitFor(() => expect(releasePendingSuccess).toBeDefined());

    expect(() => unmount()).not.toThrow();
    releasePendingSuccess?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // No error was thrown by the late-resolving fallback poll landing after
    // unmount; the disposed guard skipped applying its (now stale) result.
  });

  it('unmounting while a fallback poll request that will fail is still in flight does not surface a late offline/error state update', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    let releasePendingFailure: (() => void) | undefined;
    let callCount = 0;
    server.use(
      http.get(`${BASE_URL}/api/cases/${CASE_ID}/events`, async () => {
        callCount += 1;
        if (callCount <= 1) {
          return HttpResponse.json({ snapshot, events: [] as PublicActivityEvent[] });
        }
        await new Promise<void>((resolve) => {
          releasePendingFailure = resolve;
        });
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const { result, unmount } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        maxReconnectAttempts: 0,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0]!.triggerError();
    await waitFor(() => expect(result.current.connectionState).toBe('polling'));
    await waitFor(() => expect(releasePendingFailure).toBeDefined());

    expect(() => unmount()).not.toThrow();
    releasePendingFailure?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // No error was thrown, and (being unobservable post-unmount by design)
    // no offline/error state was ever committed for this stale rejection.
  });

  it('an open callback that arrives after unmount is ignored rather than throwing or reviving the torn-down connection', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    server.use(pollHandler(snapshot, []));

    const { unmount } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    unmount();

    expect(() => source.triggerOpen()).not.toThrow();
  });

  it('an error callback that arrives after unmount is ignored and does not schedule a reconnect attempt', async () => {
    const snapshot = buildFixtureCaseState({ id: CASE_ID });
    server.use(pollHandler(snapshot, []));

    const { result, unmount } = renderHook(() =>
      useCaseEvents({
        caseId: CASE_ID,
        baseUrl: BASE_URL,
        createEventSource: createFakeEventSource,
        reconnectDelayMs: 5,
      }),
    );

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    source.triggerOpen();
    await waitFor(() => expect(result.current.connectionState).toBe('live'));
    unmount();

    expect(() => source.triggerError()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 15));
    // If the disposed guard had been skipped, this would have scheduled a
    // reconnect timer that opens a second connection after `reconnectDelayMs`.
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
