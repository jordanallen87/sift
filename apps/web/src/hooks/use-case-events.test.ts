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
});
