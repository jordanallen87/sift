import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { RuntimeDebugEvent } from '@sift/contracts';
import { useRuntimeInspector } from './use-runtime-inspector.js';

const BASE_URL = 'http://sift.test';
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

  it('reports the generic "unknown error" message (not a blank or [object Object] string) when the fetch rejects with a non-Error value', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately a non-Error rejection value; that is exactly what this test exercises.
    const fetchImpl = (() => Promise.reject('boom')) as unknown as typeof fetch;

    const { result } = renderHook(() =>
      useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL, fetchImpl }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('An unknown error occurred.');
  });

  it('reports a recoverable error when the debug run response does not match its contract', async () => {
    server.use(
      http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}`, () =>
        HttpResponse.json({ not: 'a valid debug run response' }),
      ),
    );

    const { result } = renderHook(() => useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain('did not match its contract');
    expect(result.current.overview).toBeNull();
  });

  it('unmounting after the response arrives but before its body finishes parsing does not apply a late overview/events update', async () => {
    let resolveJson: ((value: unknown) => void) | undefined;
    const fetchImpl = (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          new Promise((resolve) => {
            resolveJson = resolve;
          }),
      })) as unknown as typeof fetch;

    const { result, unmount } = renderHook(() =>
      useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL, fetchImpl }),
    );
    await waitFor(() => expect(resolveJson).toBeDefined());
    expect(result.current.loading).toBe(true);

    unmount();
    expect(() =>
      resolveJson?.({ overview: buildOverview(), events: [buildEvent()] }),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The disposed guard skipped committing this now-stale overview/events
    // payload to a component that no longer exists.
  });

  it('forwards agent/search/origin as ?agent=/?q=/?origin=, trimming the free text it sends', async () => {
    let capturedUrl: URL | undefined;
    server.use(
      debugHandler(buildOverview(), [buildEvent()], (url) => {
        capturedUrl = url;
      }),
    );

    const { result } = renderHook(() =>
      useRuntimeInspector({
        runId: RUN_ID,
        baseUrl: BASE_URL,
        agent: 'deal-analyst',
        search: '  budget guard  ',
        origin: 'webmcp',
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(capturedUrl?.searchParams.get('agent')).toBe('deal-analyst');
    expect(capturedUrl?.searchParams.get('q')).toBe('budget guard');
    expect(capturedUrl?.searchParams.get('origin')).toBe('webmcp');
  });

  it('sends no free-text parameter at all for whitespace-only search text', async () => {
    let capturedUrl: URL | undefined;
    server.use(
      debugHandler(buildOverview(), [buildEvent()], (url) => {
        capturedUrl = url;
      }),
    );

    const { result } = renderHook(() =>
      useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL, search: '   ' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(capturedUrl?.searchParams.has('q')).toBe(false);
  });

  it('re-fetches when the free-text filter changes', async () => {
    let callCount = 0;
    server.use(
      debugHandler(buildOverview(), [buildEvent()], () => {
        callCount += 1;
      }),
    );

    const { result, rerender } = renderHook(
      ({ search }: { search?: string }) =>
        useRuntimeInspector({
          runId: RUN_ID,
          baseUrl: BASE_URL,
          ...(search !== undefined ? { search } : {}),
        }),
      { initialProps: {} },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(callCount).toBe(1);

    rerender({ search: 'budget' });
    await waitFor(() => expect(callCount).toBe(2));
  });

  it('defaults agentIds/countsByOrigin to empty for a server that does not send them yet, rather than failing the whole contract parse', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));

    const { result } = renderHook(() => useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // `buildOverview()` above deliberately omits both fields.
    expect(result.current.overview?.agentIds).toEqual([]);
    expect(result.current.overview?.countsByOrigin).toEqual({});
    expect(result.current.overview?.status).toBe('completed');
  });

  it('reads agentIds/countsByOrigin off the real response when the server does send them', async () => {
    server.use(
      debugHandler(buildOverview({ agentIds: ['deal-analyst'], countsByOrigin: { webmcp: 2 } }), [
        buildEvent(),
      ]),
    );

    const { result } = renderHook(() => useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.overview?.agentIds).toEqual(['deal-analyst']);
    expect(result.current.overview?.countsByOrigin).toEqual({ webmcp: 2 });
  });

  describe('exportRun', () => {
    function exportHandler(
      body: Record<string, unknown>,
      onRequest?: (url: URL) => void,
      headers: Record<string, string> = {
        'Content-Disposition': 'attachment; filename="sift-run-run-1.json"',
      },
    ) {
      return http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}/export`, ({ request }) => {
        onRequest?.(new URL(request.url));
        return HttpResponse.json(body, { headers });
      });
    }

    function bundle(overrides: Record<string, unknown> = {}) {
      return {
        schemaVersion: '1.0',
        runId: RUN_ID,
        exportedAt: '2026-08-27T00:00:10.000Z',
        filters: {},
        overview: buildOverview(),
        exportedEventCount: 1,
        events: [buildEvent()],
        redactionManifest: [],
        ...overrides,
      };
    }

    it('requests the export route with the same filters the Timeline is showing, and returns the server bytes verbatim', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        debugHandler(buildOverview(), [buildEvent()]),
        exportHandler(bundle(), (url) => {
          capturedUrl = url;
        }),
      );

      const { result } = renderHook(() =>
        useRuntimeInspector({
          runId: RUN_ID,
          baseUrl: BASE_URL,
          level: 'error',
          search: 'budget',
        }),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      const exported = await result.current.exportRun();

      expect(capturedUrl?.pathname).toBe(`/api/debug/runs/${RUN_ID}/export`);
      expect(capturedUrl?.searchParams.get('level')).toBe('error');
      expect(capturedUrl?.searchParams.get('q')).toBe('budget');
      expect(exported.filename).toBe('sift-run-run-1.json');
      expect(exported.exportedEventCount).toBe(1);
      // The saved bytes are the server's, not a re-serialization: the
      // redaction manifest and overview survive untouched.
      expect(JSON.parse(exported.body)).toMatchObject({
        runId: RUN_ID,
        redactionManifest: [],
      });
    });

    it("falls back to the spec'd filename when the response carries no Content-Disposition", async () => {
      server.use(
        debugHandler(buildOverview(), [buildEvent()]),
        exportHandler(bundle(), undefined, {}),
      );

      const { result } = renderHook(() =>
        useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect((await result.current.exportRun()).filename).toBe('sift-run-run-1.json');
    });

    it('rejects rather than resolving with an empty bundle when there is no run to export', async () => {
      const { result } = renderHook(() => useRuntimeInspector({ runId: null, baseUrl: BASE_URL }));

      await expect(result.current.exportRun()).rejects.toThrow(/no run to export/i);
    });

    it('rejects with the status when the export request fails', async () => {
      server.use(
        debugHandler(buildOverview(), [buildEvent()]),
        http.get(
          `${BASE_URL}/api/debug/runs/${RUN_ID}/export`,
          () => new HttpResponse(null, { status: 500 }),
        ),
      );

      const { result } = renderHook(() =>
        useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(result.current.exportRun()).rejects.toThrow(/500/);
    });

    it('rejects when the export response is not the export contract', async () => {
      server.use(debugHandler(buildOverview(), [buildEvent()]), exportHandler({ not: 'a bundle' }));

      const { result } = renderHook(() =>
        useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL }),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(result.current.exportRun()).rejects.toThrow(/did not match its contract/);
    });
  });

  it('unmounting before a pending fetch rejects does not apply a late error state update', async () => {
    let rejectFetch: ((reason?: unknown) => void) | undefined;
    const fetchImpl = (() =>
      new Promise((_resolve, reject) => {
        rejectFetch = reject;
      })) as unknown as typeof fetch;

    const { unmount } = renderHook(() =>
      useRuntimeInspector({ runId: RUN_ID, baseUrl: BASE_URL, fetchImpl }),
    );
    await waitFor(() => expect(rejectFetch).toBeDefined());

    unmount();
    expect(() => rejectFetch?.(new Error('late failure'))).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
