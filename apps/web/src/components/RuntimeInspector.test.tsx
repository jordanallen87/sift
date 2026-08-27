import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { RuntimeDebugEvent } from '@pax/contracts';
import { RuntimeInspector } from './RuntimeInspector.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const BASE_URL = 'http://pax.test';
const RUN_ID = 'run-1';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function buildEvent(
  overrides: Partial<RuntimeDebugEvent & { id: string }> = {},
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
    eventCount: 2,
    countsByCategory: { tool: 1, skill: 1 },
    countsByLevel: { info: 2 },
    errorCount: 0,
    tokenUsage: null,
    estimatedCostUsd: null,
    ...overrides,
  };
}

function debugHandler(
  overview: ReturnType<typeof buildOverview>,
  events: ReturnType<typeof buildEvent>[],
) {
  return http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}`, ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const level = url.searchParams.get('level');
    const filtered = events.filter(
      (event) =>
        (category === null || event.category === category) &&
        (level === null || event.level === level),
    );
    return HttpResponse.json({ overview, events: filtered });
  });
}

describe('RuntimeInspector', () => {
  it('renders a loading state before the first response resolves', async () => {
    server.use(
      http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ overview: buildOverview(), events: [buildEvent()] });
      }),
    );
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );

    expect(screen.getByTestId('runtime-inspector-loading')).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument();
    });
  });

  it('renders the real Overview from the actual server response', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-status')).toHaveTextContent('completed');
    });
    expect(screen.getByTestId('runtime-inspector-duration')).toHaveTextContent('5.0 s');
    expect(screen.getByTestId('runtime-inspector-event-count')).toHaveTextContent('2');
    expect(screen.getByTestId('runtime-inspector-error-count')).toHaveTextContent('0');
    expect(screen.getByTestId('runtime-inspector-trace-id')).toHaveTextContent('trace-1');
    expect(screen.getByTestId('runtime-inspector-category-counts')).toHaveTextContent('tool');
  });

  it('shows a null-safe "In progress" duration for a run with no completedAt', async () => {
    server.use(
      debugHandler(buildOverview({ status: 'running', completedAt: null, durationMs: null }), [
        buildEvent(),
      ]),
    );
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-duration')).toHaveTextContent('In progress');
    });
  });

  it('switches to the Timeline view and renders ordered events', async () => {
    server.use(
      debugHandler(buildOverview(), [
        buildEvent({ id: 'debug-2', sequence: 1, summary: 'second', name: 'tool.b' }),
        buildEvent({ id: 'debug-1', sequence: 0, summary: 'first', name: 'tool.a' }),
      ]),
    );
    const user = userEvent.setup();
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('runtime-inspector-tab-timeline'));

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-timeline-list')).toBeInTheDocument();
    });
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('first');
    expect(items[1]).toHaveTextContent('second');
  });

  it('re-fetches with the real server-side category filter when the Timeline filter changes', async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}`, ({ request }) => {
        capturedUrl = new URL(request.url);
        const category = capturedUrl.searchParams.get('category');
        const events =
          category === 'skill'
            ? [buildEvent({ id: 'debug-2', category: 'skill', name: 'skill.activated' })]
            : [buildEvent()];
        return HttpResponse.json({ overview: buildOverview(), events });
      }),
    );
    const user = userEvent.setup();
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('runtime-inspector-tab-timeline'));
    await user.selectOptions(screen.getByTestId('runtime-inspector-filter-category'), 'skill');

    await waitFor(() => {
      expect(capturedUrl?.searchParams.get('category')).toBe('skill');
    });
    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-2')).toBeInTheDocument();
    });
  });

  it('calls onClose from the "Return to case" control', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RuntimeInspector runId={RUN_ID} onClose={onClose} apiConfig={{ baseUrl: BASE_URL }} />);
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('runtime-inspector-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a recoverable error state on a failed request', async () => {
    server.use(
      http.get(
        `${BASE_URL}/api/debug/runs/${RUN_ID}`,
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-error')).toBeInTheDocument();
    });
  });

  it('renders an empty Timeline state distinctly from the loading/error states', async () => {
    server.use(
      debugHandler(buildOverview({ eventCount: 0, countsByCategory: {}, countsByLevel: {} }), []),
    );
    const user = userEvent.setup();
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('runtime-inspector-tab-timeline'));
    expect(screen.getByTestId('runtime-inspector-timeline-empty')).toBeInTheDocument();
  });

  it('has no axe violations in the Overview and Timeline views', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
    const user = userEvent.setup();
    const { container } = render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
    );
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByTestId('runtime-inspector-tab-timeline'));
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-timeline')).toBeInTheDocument(),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
    const { overflowRisks, renderResult } = renderAtNarrowWidth(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );
    await waitFor(() => {
      expect(renderResult.getByTestId('runtime-inspector-overview')).toBeInTheDocument();
    });
    expect(overflowRisks).toEqual([]);
  });
});
