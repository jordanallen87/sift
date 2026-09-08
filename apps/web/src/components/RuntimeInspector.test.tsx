import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
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

  it('has no axe violations in the Overview and Timeline views', async () => {
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
  });

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

  it('has no axe violations on a Timeline item carrying both redactions and a stateDiff', async () => {
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
  });

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

    it('has no axe violations on the Activity tab, including with Inspect-event buttons rendered', async () => {
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
