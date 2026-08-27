import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { RuntimeDebugEvent } from '@pax/contracts';
import { useRuntimeInspector } from './use-runtime-inspector.js';

const BASE_URL = 'http://pax.test';
const RUN_ID = 'run-1';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function buildEvent(
  overrides: Partial<RuntimeDebugEvent> = {},
): RuntimeDebugEvent & { id: string } {
  return {
    schemaVersion: '1.0',
    sequence: 0,
    timestamp: '2026-08-27T00:00:00.000Z',
    traceId: 'trace-1',
    caseId: 'case-1',
    runId: RUN_ID,
    category: 'tool',
    name: 'tool.listing_reader',
    phase: 'start',
    level: 'info',
    summary: 'Calling tool "listing_reader".',
    attributes: {},
    redactions: [],
    id: 'debug-1',
    ...overrides,
  };
}

function buildOverview(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    caseId: 'case-1',
    obligationId: 'car.deal_normalization',
    traceId: 'trace-1',
    sessionId: null,
    status: 'completed',
    startedAt: '2026-08-27T00:00:00.000Z',
    completedAt: '2026-08-27T00:00:05.000Z',
    durationMs: 5000,
    eventCount: 1,
    countsByCategory: { tool: 1 },
    countsByLevel: { info: 1 },
    errorCount: 0,
    tokenUsage: null,
    estimatedCostUsd: null,
    ...overrides,
  };
}

function debugHandler(
  overview: ReturnType<typeof buildOverview>,
  events: ReturnType<typeof buildEvent>[],
  onRequest?: (url: URL) => void,
) {
  return http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}`, ({ request }) => {
    onRequest?.(new URL(request.url));
    return HttpResponse.json({ overview, events });
  });
}

describe('useRuntimeInspector', () => {
  it('does nothing when runId is null', () => {
    const { result } = renderHook(() => useRuntimeInspector({ runId: null, baseUrl: BASE_URL }));
    expect(result.current.overview).toBeNull();
    expect(result.current.events).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('fetches and returns the real overview + events for a runId', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));

    const { result } = renderHook(() => useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.overview?.status).toBe('completed');
    expect(result.current.overview?.eventCount).toBe(1);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]?.id).toBe('debug-1');
  });

  it('forwards category/level as query parameters', async () => {
    let capturedUrl: URL | undefined;
    server.use(
      debugHandler(buildOverview(), [buildEvent()], (url) => {
        capturedUrl = url;
      }),
    );

    const { result } = renderHook(() =>
      useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL, category: 'tool', level: 'info' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(capturedUrl?.searchParams.get('category')).toBe('tool');
    expect(capturedUrl?.searchParams.get('level')).toBe('info');
  });

  it('re-fetches when category changes', async () => {
    let callCount = 0;
    server.use(
      debugHandler(buildOverview(), [buildEvent()], () => {
        callCount += 1;
      }),
    );

    const { result, rerender } = renderHook(
      ({ category }: { category?: 'tool' | 'skill' }) =>
        useRuntimeInspector({
          runId: RUN_ID,
          baseUrl: BASE_URL,
          ...(category !== undefined ? { category } : {}),
        }),
      { initialProps: {} },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(callCount).toBe(1);

    rerender({ category: 'skill' });
    await waitFor(() => expect(callCount).toBe(2));
  });

  it('reports a recoverable error on a non-OK response', async () => {
    server.use(
      http.get(
        `${BASE_URL}/api/debug/runs/${RUN_ID}`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );

    const { result } = renderHook(() => useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.overview).toBeNull();
  });

  it('refresh() re-fetches on demand', async () => {
    let callCount = 0;
    server.use(
      debugHandler(buildOverview(), [buildEvent()], () => {
        callCount += 1;
      }),
    );

    const { result } = renderHook(() => useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(callCount).toBe(1);

    result.current.refresh();
    await waitFor(() => expect(callCount).toBe(2));
  });
});
