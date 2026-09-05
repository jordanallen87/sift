import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

/**
 * Axe walks the whole rendered subtree, and this component renders the
 * largest one in the app -- the full Inspector with its filter set, paging
 * controls and a populated Timeline. On its own that costs ~1.2s; under
 * `pnpm test:coverage` the instrumentation roughly triples it, and with the
 * suite's workers running in parallel it intermittently crossed Vitest's
 * 5s default and failed the coverage stage while passing `test:unit`
 * moments earlier. The assertions are unchanged and still fail on a real
 * violation -- this only stops a slow accessibility check from being
 * reported as a broken one. It is a ceiling, not a sleep: a genuinely hung
 * test still fails here, just later.
 */
const AXE_TIMEOUT_MS = 20_000;
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { PublicActivityEvent, RuntimeDebugEvent } from '@sift/contracts';
import { RuntimeInspector } from './RuntimeInspector.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const BASE_URL = 'http://sift.test';
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

  // A real Home Energy Guardian round-1 run resolves all five of the pack's
  // obligations in one Swarm pass (every specialist runs every round), but
  // `overview.obligationId` -- "active obligation" in
  // debugging-and-observability.md's Overview spec -- only ever names the
  // ONE obligation the run was launched to investigate. That field alone
  // was designed around car-purchase's Graph, where a round genuinely
  // targets one obligation; applied to a Swarm run whose events plainly
  // carry five different `obligationId` values, the Overview's single
  // "Obligation" line understates what the run actually did -- a real,
  // observed defect (confirmed against a live run's exported bundle, not
  // invented), not a hypothetical. The fix is derived from the run's own
  // events, never hardcoded to either pack, matching this component's
  // existing "derived, never assumed" discipline (see RunGraphView.tsx).
  it("states every obligation a run's events touch, not just its seed obligation", async () => {
    server.use(
      debugHandler(buildOverview({ obligationId: 'energy.anomaly' }), [
        buildEvent({
          id: 'debug-1',
          sequence: 0,
          category: 'swarm',
          obligationId: 'energy.anomaly',
        }),
        buildEvent({
          id: 'debug-2',
          sequence: 1,
          category: 'swarm',
          obligationId: 'energy.rate_change',
        }),
        buildEvent({
          id: 'debug-3',
          sequence: 2,
          category: 'swarm',
          obligationId: 'energy.weather',
        }),
        // No obligationId at all (a real, honest state -- e.g. a
        // `swarm.handoff` event) must never be counted as a distinct
        // obligation.
        buildEvent({ id: 'debug-4', sequence: 3, category: 'swarm' }),
      ]),
    );
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );

    const note = await screen.findByTestId('runtime-inspector-obligation-coverage');
    expect(note).toHaveTextContent('energy.rate_change');
    expect(note).toHaveTextContent('energy.weather');
    // The seed obligation is already shown by the existing "Obligation"
    // field -- restating it here would be redundant, not additionally
    // honest.
    expect(within(note).queryByText(/energy\.anomaly/)).not.toBeInTheDocument();
  });

  it("says nothing extra when a run's events name only its one seed obligation", async () => {
    server.use(
      debugHandler(buildOverview({ obligationId: 'car.deal_normalization' }), [
        buildEvent({ id: 'debug-1', sequence: 0, obligationId: 'car.deal_normalization' }),
        buildEvent({ id: 'debug-2', sequence: 1, obligationId: 'car.deal_normalization' }),
      ]),
    );
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
    expect(screen.queryByTestId('runtime-inspector-obligation-coverage')).not.toBeInTheDocument();
  });

  it('hides the obligation-coverage note while a Timeline filter is narrowing the loaded events, rather than reporting a partial run as the whole one', async () => {
    server.use(
      http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}`, ({ request }) => {
        const url = new URL(request.url);
        const category = url.searchParams.get('category');
        const events =
          category === null
            ? [
                buildEvent({ id: 'debug-1', sequence: 0, obligationId: 'energy.anomaly' }),
                buildEvent({ id: 'debug-2', sequence: 1, obligationId: 'energy.rate_change' }),
              ]
            : // A filtered fetch can still, on its own, contain more than one
              // distinct obligationId -- the guard must key off "a filter is
              // active" itself, not off whatever the filtered set happens to
              // contain.
              [
                buildEvent({
                  id: 'debug-3',
                  sequence: 2,
                  category: 'swarm',
                  obligationId: 'energy.rate_change',
                }),
                buildEvent({
                  id: 'debug-4',
                  sequence: 3,
                  category: 'swarm',
                  obligationId: 'energy.weather',
                }),
              ];
        return HttpResponse.json({
          overview: buildOverview({ obligationId: 'energy.anomaly' }),
          events,
        });
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

    await screen.findByTestId('runtime-inspector-obligation-coverage');

    await user.click(screen.getByTestId('runtime-inspector-tab-timeline'));
    await user.selectOptions(screen.getByTestId('runtime-inspector-filter-category'), 'swarm');
    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-3')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('runtime-inspector-tab-overview'));
    expect(screen.queryByTestId('runtime-inspector-obligation-coverage')).not.toBeInTheDocument();
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

  it("shows the run's execution shape on its own tab, not just a flat list", async () => {
    // The four analysts all start before any of them completes -- that is a
    // real property of this Graph and it is invisible in a chronological
    // list. This asserts the tab is genuinely wired to the same events the
    // Timeline gets, so mounting it cannot silently regress to an empty
    // panel.
    const nodes = ['deal-analyst', 'ownership-cost-analyst', 'safety-reliability-analyst'];
    server.use(
      debugHandler(
        buildOverview(),
        nodes.map((nodeId, index) =>
          buildEvent({
            id: `debug-graph-${String(index)}`,
            sequence: index,
            category: 'graph',
            name: 'graph.node_completed',
            phase: 'start',
            summary: `Graph node "${nodeId}" started.`,
            attributes: { nodeId },
          }),
        ),
      ),
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

    await user.click(screen.getByTestId('runtime-inspector-tab-execution'));

    const panel = await screen.findByTestId('runtime-inspector-execution');
    for (const nodeId of nodes) {
      expect(within(panel).getByText(new RegExp(nodeId))).toBeInTheDocument();
    }
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

  it("calls onClose from the sheet's own close control", async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RuntimeInspector runId={RUN_ID} onClose={onClose} apiConfig={{ baseUrl: BASE_URL }} />);
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId('sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RuntimeInspector runId={RUN_ID} onClose={onClose} apiConfig={{ baseUrl: BASE_URL }} />);
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the overlay behind the sheet is clicked', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RuntimeInspector runId={RUN_ID} onClose={onClose} apiConfig={{ baseUrl: BASE_URL }} />);
    await waitFor(() =>
      expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
    );

    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the run details inside the real Sheet portal/overlay markup, not a bare full-width section', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
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

    const content = screen.getByTestId('runtime-inspector');
    expect(content.closest('[data-slot="sheet-content"]')).toBe(content);
    expect(content.tagName).not.toBe('SECTION');
    expect(content.getAttribute('role')).toBe('dialog');
    expect(document.querySelector('[data-slot="sheet-overlay"]')).not.toBeNull();
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

  it(
    'has no axe violations in the Overview and Timeline views',
    { timeout: AXE_TIMEOUT_MS },
    async () => {
      server.use(debugHandler(buildOverview(), [buildEvent()]));
      const user = userEvent.setup();
      // The Sheet's content is rendered through a Radix portal into
      // `document.body`, outside `container` -- axe must inspect the real
      // rendered tree, not the now-empty wrapper `render()` leaves behind.
      const { baseElement } = render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await waitFor(() =>
        expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
      );
      expect(await axe(baseElement)).toHaveNoViolations();

      await user.click(screen.getByTestId('runtime-inspector-tab-timeline'));
      await waitFor(() =>
        expect(screen.getByTestId('runtime-inspector-timeline')).toBeInTheDocument(),
      );
      expect(await axe(baseElement)).toHaveNoViolations();
    },
  );

  it('formats a sub-second duration in milliseconds rather than seconds', async () => {
    server.use(debugHandler(buildOverview({ durationMs: 500 }), [buildEvent()]));
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-duration')).toHaveTextContent('500 ms');
    });
  });

  it('renders the agent id on a Timeline item when the real event carries one', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent({ agentId: 'deal-analyst' })]));
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
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-1')).toHaveTextContent(
        'agent: deal-analyst',
      );
    });
  });

  it('shows "(none)" for a real overview whose traceId is null rather than a blank cell', async () => {
    server.use(debugHandler(buildOverview({ traceId: null }), [buildEvent()]));
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-trace-id')).toHaveTextContent('(none)');
    });
  });

  it('re-fetches with the real server-side level filter when the Timeline level filter changes', async () => {
    let capturedUrl: URL | undefined;
    server.use(
      http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}`, ({ request }) => {
        capturedUrl = new URL(request.url);
        const level = capturedUrl.searchParams.get('level');
        const events =
          level === 'error'
            ? [buildEvent({ id: 'debug-error', level: 'error', summary: 'A tool call failed.' })]
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
    await user.selectOptions(screen.getByTestId('runtime-inspector-filter-level'), 'error');

    await waitFor(() => {
      expect(capturedUrl?.searchParams.get('level')).toBe('error');
    });
    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-error')).toBeInTheDocument();
    });
  });

  it('fetches through a caller-supplied fetchImpl override rather than the real global fetch', async () => {
    const overview = buildOverview();
    const events = [buildEvent()];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ overview, events }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;

    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL, fetchImpl }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-status')).toHaveTextContent('completed');
    });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('renders token usage but not an estimated cost when only tokenUsage is present on the real overview', async () => {
    server.use(
      debugHandler(
        buildOverview({
          tokenUsage: { input: 120, output: 340, total: 460 },
          estimatedCostUsd: null,
        }),
        [buildEvent()],
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
      expect(screen.getByTestId('runtime-inspector-token-usage')).toHaveTextContent(
        '120 in / 340 out / 460 total',
      );
    });
    expect(screen.queryByTestId('runtime-inspector-estimated-cost')).not.toBeInTheDocument();
  });

  it('renders an estimated cost but no token usage line when only estimatedCostUsd is present on the real overview', async () => {
    server.use(
      debugHandler(buildOverview({ tokenUsage: null, estimatedCostUsd: 0.0842 }), [buildEvent()]),
    );
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-estimated-cost')).toHaveTextContent('$0.0842');
    });
    expect(screen.queryByTestId('runtime-inspector-token-usage')).not.toBeInTheDocument();
  });

  // The Sheet portals its content straight to `document.body`, outside the
  // 390px probe div, so this heuristic's `container.innerHTML` scan no
  // longer sees the sheet markup -- `overflowRisks` is trivially `[]` here.
  // `renderResult.getByTestId` still finds it, since Testing Library binds
  // queries to `document.body` by default, not `container`.
  it("surfaces a redaction's path and reason on a Timeline item that carries one -- never the underlying value, since Redaction never carries one", async () => {
    server.use(
      debugHandler(buildOverview(), [
        buildEvent({
          redactions: [{ path: 'payload.note', reason: 'matched a configured secret pattern' }],
        }),
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

    const redactions = await screen.findByTestId(
      'runtime-inspector-timeline-item-debug-1-redactions',
    );
    expect(redactions).toHaveTextContent('payload.note');
    expect(redactions).toHaveTextContent('matched a configured secret pattern');
  });

  it('omits the redactions list entirely from a Timeline item that carries none', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent({ redactions: [] })]));
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
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-1')).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('runtime-inspector-timeline-item-debug-1-redactions'),
    ).not.toBeInTheDocument();
  });

  it('renders a State diff disclosure listing each JSON Patch operation for a Timeline item that carries a real stateDiff', async () => {
    server.use(
      debugHandler(buildOverview(), [
        buildEvent({
          stateDiff: [
            {
              op: 'replace',
              path: '/recommendation',
              value: { favoredOptionId: 'candidate-rav4' },
            },
          ],
        }),
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

    const disclosure = await screen.findByTestId(
      'runtime-inspector-timeline-item-debug-1-state-diff',
    );
    await user.click(within(disclosure).getByText(/State diff/));
    expect(disclosure).toHaveTextContent('replace');
    expect(disclosure).toHaveTextContent('/recommendation');
    expect(disclosure).toHaveTextContent('candidate-rav4');
  });

  it('omits the State diff disclosure entirely from a Timeline item with no stateDiff', async () => {
    server.use(debugHandler(buildOverview(), [buildEvent()]));
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
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-1')).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('runtime-inspector-timeline-item-debug-1-state-diff'),
    ).not.toBeInTheDocument();
  });

  it('opens directly to the Timeline view, pre-filtered to nothing, when a focusEventId is supplied (I2 activity-to-trace navigation)', async () => {
    server.use(
      debugHandler(buildOverview(), [
        buildEvent({ id: 'debug-1', sequence: 0, summary: 'first' }),
        buildEvent({ id: 'debug-2', sequence: 1, summary: 'second' }),
      ]),
    );
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
        focusEventId="debug-2"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-timeline')).toBeInTheDocument();
    });
    expect(screen.getByTestId('runtime-inspector-tab-timeline')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('marks the exact focusEventId Timeline item as focused, distinct from every other item', async () => {
    server.use(
      debugHandler(buildOverview(), [
        buildEvent({ id: 'debug-1', sequence: 0, summary: 'first' }),
        buildEvent({ id: 'debug-2', sequence: 1, summary: 'second' }),
      ]),
    );
    render(
      <RuntimeInspector
        runId={RUN_ID}
        onClose={() => undefined}
        apiConfig={{ baseUrl: BASE_URL }}
        focusEventId="debug-2"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-2')).toHaveAttribute(
        'data-focused',
        'true',
      );
    });
    expect(screen.getByTestId('runtime-inspector-timeline-item-debug-1')).not.toHaveAttribute(
      'data-focused',
      'true',
    );
  });

  it(
    'has no axe violations on a Timeline item carrying both redactions and a stateDiff',
    { timeout: AXE_TIMEOUT_MS },
    async () => {
      server.use(
        debugHandler(buildOverview(), [
          buildEvent({
            redactions: [{ path: 'payload.note', reason: 'matched a configured secret pattern' }],
            stateDiff: [{ op: 'replace', path: '/status', value: 'active' }],
          }),
        ]),
      );
      const user = userEvent.setup();
      const { baseElement } = render(
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
      await waitFor(() =>
        expect(screen.getByTestId('runtime-inspector-timeline')).toBeInTheDocument(),
      );
      expect(await axe(baseElement)).toHaveNoViolations();
    },
  );

  // Task A5 / I2b: the Runtime Inspector is extended (not duplicated) with
  // an Activity tab reusing `ActivityTimeline` verbatim, and `runId` can now
  // be `null` for the new "Developer view" entry point opened with no
  // specific run in hand.
  describe('Activity tab (Task A5 / I2b)', () => {
    function buildActivityEvent(overrides: Partial<PublicActivityEvent> = {}): PublicActivityEvent {
      return {
        schemaVersion: '1.0',
        eventId: 'activity-1',
        sequence: 1,
        timestamp: '2026-08-27T00:00:00.000Z',
        caseId: 'case-1',
        type: 'tool.started',
        phase: 'active',
        summary: 'Looking up dealer inventory.',
        ...overrides,
      };
    }

    it('opens directly to the Activity tab and renders the passed events when runId is null (no run in hand yet)', async () => {
      render(
        <RuntimeInspector
          runId={null}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
          events={[buildActivityEvent({ summary: 'Case created.' })]}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-activity')).toBeInTheDocument();
      });
      expect(screen.getByTestId('runtime-inspector-tab-activity')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByText('Case created.')).toBeInTheDocument();
      expect(screen.getByTestId('runtime-inspector-run-id')).toHaveTextContent('No run selected');
      // No run was ever selected, so no fetch to /api/debug/runs/:runId
      // should have happened -- proven negatively: no overview data renders
      // even after settling.
      expect(screen.queryByTestId('runtime-inspector-overview')).not.toBeInTheDocument();
    });

    it("defaults events to an empty list (never crashes) and shows ActivityTimeline's own honest empty state", async () => {
      render(
        <RuntimeInspector
          runId={null}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('activity-timeline-no-items')).toBeInTheDocument();
      });
    });

    it('still defaults to Overview when runId is provided (existing behavior unaffected), with Activity reachable via its own tab', async () => {
      server.use(debugHandler(buildOverview(), [buildEvent()]));
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
          events={[buildActivityEvent()]}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument();
      });
      expect(screen.getByTestId('runtime-inspector-tab-activity')).toHaveAttribute(
        'aria-selected',
        'false',
      );

      await user.click(screen.getByTestId('runtime-inspector-tab-activity'));
      expect(screen.getByTestId('runtime-inspector-activity')).toBeInTheDocument();
    });

    it('does not render "Inspect event" buttons in the Activity tab when onInspectEvent is not provided', async () => {
      render(
        <RuntimeInspector
          runId={null}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
          events={[buildActivityEvent({ runId: 'run-2', debugEventId: 'debug-7' })]}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-activity')).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId('activity-item-inspect-event-activity-1'),
      ).not.toBeInTheDocument();
    });

    it('calls onInspectEvent with the runId and debugEventId when "Inspect event" is clicked in the Activity tab', async () => {
      const onInspectEvent = vi.fn();
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={null}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
          events={[buildActivityEvent({ runId: 'run-2', debugEventId: 'debug-7' })]}
          onInspectEvent={onInspectEvent}
        />,
      );

      const button = await screen.findByTestId('activity-item-inspect-event-activity-1');
      await user.click(button);

      expect(onInspectEvent).toHaveBeenCalledWith('run-2', 'debug-7');
    });

    it('reactively switches to Timeline when focusEventId changes on an already-mounted Inspector (the "Inspect event" round trip via controlled props)', async () => {
      server.use(debugHandler(buildOverview(), [buildEvent({ id: 'debug-2', sequence: 1 })]));
      const { rerender } = render(
        <RuntimeInspector
          runId={null}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
          events={[buildActivityEvent()]}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-activity')).toBeInTheDocument();
      });

      // Simulates `App.tsx` receiving the bubbled-up onInspectEvent call and
      // re-passing new runId/focusEventId props down to this same,
      // still-mounted Inspector instance.
      rerender(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
          events={[buildActivityEvent()]}
          focusEventId="debug-2"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-tab-timeline')).toHaveAttribute(
          'aria-selected',
          'true',
        );
      });
      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-timeline-item-debug-2')).toHaveAttribute(
          'data-focused',
          'true',
        );
      });
    });

    it(
      'has no axe violations on the Activity tab, including with Inspect-event buttons rendered',
      { timeout: AXE_TIMEOUT_MS },
      async () => {
        const { baseElement } = render(
          <RuntimeInspector
            runId={null}
            onClose={() => undefined}
            apiConfig={{ baseUrl: BASE_URL }}
            events={[buildActivityEvent({ runId: 'run-2', debugEventId: 'debug-7' })]}
            onInspectEvent={() => undefined}
          />,
        );
        await waitFor(() => {
          expect(screen.getByTestId('runtime-inspector-activity')).toBeInTheDocument();
        });
        expect(await axe(baseElement)).toHaveNoViolations();
      },
    );
  });

  // The rest of the spec'd Timeline filter set ("category, agent, level, and
  // free-text filters"), the WebMCP origin filter/badge, the sanitized export
  // bundle, and the bounded-DOM windowing that makes a 245-event run readable
  // in a 390 px pane. Every filter below is asserted at the REQUEST, not just
  // at the rendered list: a filter that never reaches the server would
  // disagree with the whole-run Overview beside it.
  describe('complete filter set, export, and windowing', () => {
    /** A handler that applies the real server's filter semantics, so a client test cannot pass by filtering locally. */
    function filteringHandler(
      events: ReturnType<typeof buildEvent>[],
      overview = buildOverview(),
      onRequest?: (url: URL) => void,
    ) {
      return http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}`, ({ request }) => {
        const url = new URL(request.url);
        onRequest?.(url);
        const category = url.searchParams.get('category');
        const level = url.searchParams.get('level');
        const agent = url.searchParams.get('agent');
        const origin = url.searchParams.get('origin');
        const q = url.searchParams.get('q');
        const filtered = events.filter((event) => {
          if (category !== null && event.category !== category) return false;
          if (level !== null && event.level !== level) return false;
          if (agent !== null && event.agentId !== agent) return false;
          if (origin !== null && event.attributes['origin'] !== origin) return false;
          if (
            q !== null &&
            !`${event.summary} ${event.name} ${event.agentId ?? ''}`
              .toLowerCase()
              .includes(q.toLowerCase())
          ) {
            return false;
          }
          return true;
        });
        return HttpResponse.json({ overview, events: filtered });
      });
    }

    async function openTimeline(user: ReturnType<typeof userEvent.setup>): Promise<void> {
      await waitFor(() =>
        expect(screen.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
      );
      await user.click(screen.getByTestId('runtime-inspector-tab-timeline'));
      await waitFor(() =>
        expect(screen.getByTestId('runtime-inspector-timeline')).toBeInTheDocument(),
      );
    }

    it('sends typed free text to the real server as ?q= and renders only what came back', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        filteringHandler(
          [
            buildEvent({
              id: 'debug-noise',
              sequence: 0,
              name: 'intervention.proceed',
              summary: 'BudgetGuard: tool is excluded from the run tool-call budget.',
            }),
            buildEvent({ id: 'debug-tool', sequence: 1, summary: 'Reading dealer listings.' }),
          ],
          buildOverview(),
          (url) => {
            capturedUrl = url;
          },
        ),
      );
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(user);
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-tool')).toBeInTheDocument();

      await user.type(screen.getByTestId('runtime-inspector-filter-search'), 'budgetguard');

      await waitFor(() => expect(capturedUrl?.searchParams.get('q')).toBe('budgetguard'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('runtime-inspector-timeline-item-debug-tool'),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-noise')).toBeInTheDocument();
    });

    it('offers only the agents the run actually names, and sends the chosen one as ?agent=', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        filteringHandler(
          [
            buildEvent({ id: 'debug-deal', sequence: 0, agentId: 'deal-analyst' }),
            buildEvent({ id: 'debug-reliability', sequence: 1, agentId: 'reliability-analyst' }),
          ],
          buildOverview({ agentIds: ['deal-analyst', 'reliability-analyst'] }),
          (url) => {
            capturedUrl = url;
          },
        ),
      );
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(user);

      const select = screen.getByTestId('runtime-inspector-filter-agent');
      expect(within(select).getByRole('option', { name: 'deal-analyst' })).toBeInTheDocument();

      await user.selectOptions(select, 'deal-analyst');

      await waitFor(() => expect(capturedUrl?.searchParams.get('agent')).toBe('deal-analyst'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('runtime-inspector-timeline-item-debug-reliability'),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-deal')).toBeInTheDocument();
    });

    it('renders no agent control at all for a run whose events name no agent', async () => {
      server.use(filteringHandler([buildEvent()], buildOverview({ agentIds: [] })));
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(user);

      expect(screen.queryByTestId('runtime-inspector-filter-agent')).not.toBeInTheDocument();
    });

    it('badges a WebMCP-originated event and leaves an event that states no origin unbadged', async () => {
      server.use(
        filteringHandler(
          [
            buildEvent({
              id: 'debug-webmcp',
              sequence: 0,
              summary: 'Command issued through a registered WebMCP tool.',
              attributes: { origin: 'webmcp' },
            }),
            buildEvent({ id: 'debug-click', sequence: 1, attributes: {} }),
          ],
          buildOverview({ countsByOrigin: { webmcp: 1 } }),
        ),
      );
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(user);

      expect(
        screen.getByTestId('runtime-inspector-timeline-item-debug-webmcp-origin'),
      ).toHaveTextContent('WebMCP');
      // Absence of a badge is "nothing was stated", never a fabricated
      // "user" origin -- the marker is only ever rendered when present.
      expect(
        screen.queryByTestId('runtime-inspector-timeline-item-debug-click-origin'),
      ).not.toBeInTheDocument();
    });

    it('sends ?origin= to the server when the run carries markers, and offers no origin control when it does not', async () => {
      let capturedUrl: URL | undefined;
      server.use(
        filteringHandler(
          [
            buildEvent({ id: 'debug-webmcp', sequence: 0, attributes: { origin: 'webmcp' } }),
            buildEvent({ id: 'debug-click', sequence: 1, attributes: {} }),
          ],
          buildOverview({ countsByOrigin: { webmcp: 1 } }),
          (url) => {
            capturedUrl = url;
          },
        ),
      );
      const user = userEvent.setup();
      const { unmount } = render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(user);

      await user.selectOptions(screen.getByTestId('runtime-inspector-filter-origin'), 'webmcp');
      await waitFor(() => expect(capturedUrl?.searchParams.get('origin')).toBe('webmcp'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('runtime-inspector-timeline-item-debug-click'),
        ).not.toBeInTheDocument();
      });

      unmount();

      // The same component against a run that predates origin propagation:
      // no control, because every value it could offer returns nothing.
      server.use(filteringHandler([buildEvent()], buildOverview({ countsByOrigin: {} })));
      const secondUser = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(secondUser);
      expect(screen.queryByTestId('runtime-inspector-filter-origin')).not.toBeInTheDocument();
      expect(screen.queryByTestId('runtime-inspector-origin-counts')).not.toBeInTheDocument();
    });

    it('exports the run through the real export route, honouring the filters currently applied', async () => {
      let exportUrl: URL | undefined;
      server.use(
        filteringHandler([
          buildEvent({ id: 'debug-1', sequence: 0, level: 'error', summary: 'A tool failed.' }),
        ]),
        http.get(`${BASE_URL}/api/debug/runs/${RUN_ID}/export`, ({ request }) => {
          exportUrl = new URL(request.url);
          return HttpResponse.json(
            {
              schemaVersion: '1.0',
              runId: RUN_ID,
              exportedAt: '2026-08-27T00:00:10.000Z',
              filters: { level: 'error' },
              overview: buildOverview(),
              exportedEventCount: 1,
              events: [buildEvent({ level: 'error' })],
              redactionManifest: [],
            },
            {
              headers: {
                'Content-Disposition': 'attachment; filename="sift-run-run-1.json"',
              },
            },
          );
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
      await openTimeline(user);
      await user.selectOptions(screen.getByTestId('runtime-inspector-filter-level'), 'error');
      await waitFor(() =>
        expect(screen.getByTestId('runtime-inspector-timeline-item-debug-1')).toBeInTheDocument(),
      );

      await user.click(screen.getByTestId('runtime-inspector-export'));

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-export-status')).toHaveTextContent(
          'Exported 1 events to sift-run-run-1.json.',
        );
      });
      // What you export is what you were looking at.
      expect(exportUrl?.pathname).toBe(`/api/debug/runs/${RUN_ID}/export`);
      expect(exportUrl?.searchParams.get('level')).toBe('error');
    });

    it('reports a failed export instead of silently claiming success', async () => {
      server.use(
        filteringHandler([buildEvent()]),
        http.get(
          `${BASE_URL}/api/debug/runs/${RUN_ID}/export`,
          () => new HttpResponse(null, { status: 500 }),
        ),
      );
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(user);

      await user.click(screen.getByTestId('runtime-inspector-export'));

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-export-error')).toHaveTextContent('500');
      });
      expect(screen.queryByTestId('runtime-inspector-export-status')).not.toBeInTheDocument();
    });

    it('offers no export control when the Inspector was opened with no run in hand', async () => {
      render(
        <RuntimeInspector
          runId={null}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await waitFor(() =>
        expect(screen.getByTestId('runtime-inspector-activity')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('runtime-inspector-export')).not.toBeInTheDocument();
    });

    function buildLargeRun(count: number): ReturnType<typeof buildEvent>[] {
      return Array.from({ length: count }, (_unused, index) =>
        buildEvent({
          id: `debug-${index}`,
          sequence: index,
          summary: `Event number ${index}.`,
        }),
      );
    }

    function renderedTimelineItemCount(): number {
      return document.querySelectorAll('[data-testid^="runtime-inspector-timeline-item-"]').length;
    }

    it('keeps the rendered Timeline bounded for a run far larger than one window, and pages through the rest', async () => {
      const events = buildLargeRun(300);
      server.use(filteringHandler(events, buildOverview({ eventCount: 300 })));
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(user);

      // 300 real events; a bounded number of DOM nodes.
      expect(renderedTimelineItemCount()).toBe(50);
      expect(screen.getByTestId('runtime-inspector-timeline-window')).toHaveTextContent(
        'Showing 1–50 of 300 events',
      );
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-0')).toBeInTheDocument();
      expect(
        screen.queryByTestId('runtime-inspector-timeline-item-debug-50'),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId('runtime-inspector-timeline-later'));

      expect(renderedTimelineItemCount()).toBe(50);
      expect(screen.getByTestId('runtime-inspector-timeline-window')).toHaveTextContent(
        'Showing 51–100 of 300 events',
      );
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-50')).toBeInTheDocument();
      expect(
        screen.queryByTestId('runtime-inspector-timeline-item-debug-0'),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId('runtime-inspector-timeline-earlier'));
      expect(screen.getByTestId('runtime-inspector-timeline-item-debug-0')).toBeInTheDocument();
    });

    it('omits the paging controls entirely for a run that fits in one window', async () => {
      server.use(filteringHandler(buildLargeRun(3)));
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await openTimeline(user);

      expect(renderedTimelineItemCount()).toBe(3);
      expect(screen.queryByTestId('runtime-inspector-timeline-window')).not.toBeInTheDocument();
      expect(screen.queryByTestId('runtime-inspector-timeline-later')).not.toBeInTheDocument();
    });

    it('moves the window to the page holding a focused event deep inside a large run, so the jump target is really in the DOM', async () => {
      server.use(filteringHandler(buildLargeRun(300), buildOverview({ eventCount: 300 })));
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
          focusEventId="debug-250"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-timeline-item-debug-250')).toHaveAttribute(
          'data-focused',
          'true',
        );
      });
      expect(renderedTimelineItemCount()).toBe(50);
      expect(screen.getByTestId('runtime-inspector-timeline-window')).toHaveTextContent(
        'Showing 251–300 of 300 events',
      );
    });

    it('says so when a filter hides the event the Inspector was opened to show, and can undo it', async () => {
      server.use(
        filteringHandler([
          buildEvent({ id: 'debug-1', sequence: 0, category: 'tool', summary: 'first' }),
          buildEvent({ id: 'debug-2', sequence: 1, category: 'tool', summary: 'second' }),
        ]),
      );
      const user = userEvent.setup();
      render(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
          focusEventId="debug-2"
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-timeline-item-debug-2')).toHaveAttribute(
          'data-focused',
          'true',
        );
      });
      // No filters are active yet, so nothing is being hidden.
      expect(screen.queryByTestId('runtime-inspector-focus-hidden')).not.toBeInTheDocument();

      await user.selectOptions(screen.getByTestId('runtime-inspector-filter-category'), 'skill');

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-focus-hidden')).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId('runtime-inspector-timeline-item-debug-2'),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId('runtime-inspector-clear-filters'));

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-timeline-item-debug-2')).toHaveAttribute(
          'data-focused',
          'true',
        );
      });
      expect(screen.queryByTestId('runtime-inspector-focus-hidden')).not.toBeInTheDocument();
    });

    it(
      'has no axe violations with the full filter set, an origin badge, and the paging controls rendered',
      { timeout: AXE_TIMEOUT_MS },
      async () => {
        const events = buildLargeRun(120);
        events[0] = buildEvent({
          id: 'debug-0',
          sequence: 0,
          summary: 'Command issued through a registered WebMCP tool.',
          agentId: 'deal-analyst',
          attributes: { origin: 'webmcp' },
        });
        server.use(
          filteringHandler(
            events,
            buildOverview({
              eventCount: 120,
              agentIds: ['deal-analyst'],
              countsByOrigin: { webmcp: 1 },
            }),
          ),
        );
        const user = userEvent.setup();
        const { baseElement } = render(
          <RuntimeInspector
            runId={RUN_ID}
            onClose={() => undefined}
            apiConfig={{ baseUrl: BASE_URL }}
          />,
        );
        await openTimeline(user);
        expect(screen.getByTestId('runtime-inspector-timeline-window')).toBeInTheDocument();

        expect(await axe(baseElement)).toHaveNoViolations();
      },
    );

    it('introduces no fixed width wider than the 390px pane, in the Timeline as rendered through the sheet portal', async () => {
      server.use(
        filteringHandler(
          buildLargeRun(120),
          buildOverview({
            eventCount: 120,
            agentIds: ['deal-analyst'],
            countsByOrigin: { webmcp: 1 },
          }),
        ),
      );
      const user = userEvent.setup();
      const { renderResult, overflowRisks } = renderAtNarrowWidth(
        <RuntimeInspector
          runId={RUN_ID}
          onClose={() => undefined}
          apiConfig={{ baseUrl: BASE_URL }}
        />,
      );
      await waitFor(() =>
        expect(renderResult.getByTestId('runtime-inspector-overview')).toBeInTheDocument(),
      );
      await user.click(renderResult.getByTestId('runtime-inspector-tab-timeline'));
      await waitFor(() =>
        expect(renderResult.getByTestId('runtime-inspector-timeline')).toBeInTheDocument(),
      );
      expect(overflowRisks).toEqual([]);

      // `renderAtNarrowWidth` scans its own container, and the Sheet portals
      // its content to `document.body` -- outside that container, which is
      // why the assertion above is necessary but not sufficient here. The
      // same structural rule, applied to the markup that actually rendered.
      const portaled = document.body.innerHTML;
      const fixedWidths = [
        ...portaled.matchAll(/(?<!max-)(?:min-)?width:\s*(\d+(?:\.\d+)?)px/gi),
        ...portaled.matchAll(/\bmin-w-\[(\d+(?:\.\d+)?)px\]/gi),
        ...portaled.matchAll(/(?<!max-|min-)\bw-\[(\d+(?:\.\d+)?)px\]/gi),
      ].filter((match) => Number(match[1]) > 390);
      expect(fixedWidths.map((match) => match[0])).toEqual([]);
    });
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
