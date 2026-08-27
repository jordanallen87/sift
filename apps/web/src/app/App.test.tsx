import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { CaseState, CommandReceipt, PublicActivityEvent } from '@pax/contracts';
import { App } from './App.js';
import { AppProviders } from './AppProviders.js';
import { createFakePaxCommands, buildFakeCommandReceipt } from '../test/fake-pax-commands.js';
import { buildFixtureCaseState, buildFixtureCompiledPack } from '../test/fixtures.js';
import { FakeEventSource, createFakeEventSource } from '../test/fake-event-source.js';
import { InMemoryModelContextAdapter } from '../model-context/adapter.js';
import { CASE_SCOPED_PAX_TOOL_NAMES } from '../model-context/register-pax-tools.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const CASE_ID = 'case-live-1';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  FakeEventSource.reset();
  // `App`'s reload-restore feature (`active-case-storage.ts`) persists a
  // pointer to the active case id in `localStorage`. jsdom's `localStorage`
  // is not reset between tests automatically (unlike a real browser's
  // fresh-per-session storage in these tests' single shared jsdom window),
  // so an earlier test's real `startDemo` would otherwise leak a stored
  // caseId into every later test in this file, making `App` render the
  // "Restoring your case…" state instead of the plain launcher it expects.
  localStorage.clear();
});

function pollHandler(snapshot: CaseState, events: PublicActivityEvent[] = []) {
  return http.get(`/api/cases/${CASE_ID}/events`, ({ request }) => {
    const url = new URL(request.url);
    const after = Number(url.searchParams.get('afterSequence') ?? '0');
    return HttpResponse.json({
      snapshot,
      events: events.filter((event) => event.sequence > after),
    });
  });
}

function packsHandler(packs: ReturnType<typeof buildFixtureCompiledPack>[]) {
  return http.get('/api/packs', () => HttpResponse.json(packs));
}

function commandHandler(
  commandName: string,
  receipt: CommandReceipt,
  onCall?: (body: unknown) => void,
) {
  return http.post(`/api/cases/${CASE_ID}/commands/${commandName}`, async ({ request }) => {
    onCall?.(await request.json());
    return HttpResponse.json(receipt);
  });
}

function runHandler(receipt: CommandReceipt & { runId: string }, onCall?: (body: unknown) => void) {
  return http.post(`/api/cases/${CASE_ID}/run`, async ({ request }) => {
    onCall?.(await request.json());
    return HttpResponse.json(receipt);
  });
}

function debugRunHandler(runId: string) {
  return http.get(`/api/debug/runs/${runId}`, () =>
    HttpResponse.json({
      overview: {
        runId,
        caseId: CASE_ID,
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
      },
      events: [
        {
          schemaVersion: '1.0',
          sequence: 0,
          timestamp: '2026-08-27T00:00:00.000Z',
          traceId: 'trace-1',
          caseId: CASE_ID,
          runId,
          category: 'tool',
          name: 'tool.listing_reader',
          phase: 'start',
          level: 'info',
          summary: 'Calling tool "listing_reader".',
          attributes: {},
          redactions: [],
          id: 'debug-1',
        },
      ],
    }),
  );
}

const DEFAULT_PACK = buildFixtureCompiledPack({
  entities: [{ id: 'car', label: 'Car', attributeIds: [] }],
});

function renderLiveWorkspace(snapshot: CaseState, events: PublicActivityEvent[] = []) {
  server.use(
    http.post('/api/cases/demo', () =>
      HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID, commandId: 'cmd-start' })),
    ),
    pollHandler(snapshot, events),
    packsHandler([DEFAULT_PACK]),
  );

  const adapter = new InMemoryModelContextAdapter();
  const utils = render(
    <AppProviders
      caseEventsConfig={{ createEventSource: createFakeEventSource }}
      webMcpAdapter={adapter}
    >
      <App />
    </AppProviders>,
  );
  return { ...utils, adapter };
}

async function startDemoAndWait() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
  await waitFor(() => {
    expect(screen.getByTestId('case-workspace')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByTestId('case-header')).toBeInTheDocument();
  });
  return user;
}

describe('App', () => {
  it('renders the demo launcher when no case is active', () => {
    render(
      <AppProviders commandsClient={createFakePaxCommands()}>
        <App />
      </AppProviders>,
    );

    expect(screen.getByTestId('demo-launcher')).toBeInTheDocument();
    expect(screen.queryByTestId('case-workspace')).not.toBeInTheDocument();
  });

  it('transitions from the launcher to the case workspace once a demo starts', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-abc' });
    const commands = createFakePaxCommands({
      startDemo: () => Promise.resolve(receipt),
    });
    const user = userEvent.setup();

    render(
      <AppProviders commandsClient={commands}>
        <App />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Choose our next car' }));

    await waitFor(() => {
      expect(screen.getByTestId('case-workspace')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('demo-launcher')).not.toBeInTheDocument();
  });

  it('has no routing chrome -- renders exactly one top-level region at a time', () => {
    render(
      <AppProviders commandsClient={createFakePaxCommands()}>
        <App />
      </AppProviders>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  describe('reload persistence', () => {
    it('restores the active case from a stored caseId, verified against the real server, on a fresh mount', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, title: 'Restored case' });
      localStorage.setItem('pax:activeCaseId', CASE_ID);
      server.use(
        http.get(`/api/cases/${CASE_ID}`, () => HttpResponse.json(snapshot)),
        pollHandler(snapshot),
        packsHandler([DEFAULT_PACK]),
      );

      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );

      // Never flashes the launcher while restoration is being verified.
      expect(screen.queryByTestId('demo-launcher')).not.toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('case-header')).toBeInTheDocument();
      });
      expect(screen.getByTestId('case-header-title')).toHaveTextContent('Restored case');
    });

    it('clears a stale stored caseId and falls back to the launcher when the server no longer has that case', async () => {
      localStorage.setItem('pax:activeCaseId', 'case-does-not-exist');
      server.use(
        http.get('/api/cases/case-does-not-exist', () =>
          HttpResponse.json({ error: 'not found' }, { status: 404 }),
        ),
      );

      render(
        <AppProviders commandsClient={createFakePaxCommands()}>
          <App />
        </AppProviders>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('demo-launcher')).toBeInTheDocument();
      });
      expect(localStorage.getItem('pax:activeCaseId')).toBeNull();
    });
  });

  describe('live workspace wiring', () => {
    it('renders CaseHeader with the real streamed snapshot title, pack badge, and status', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, title: 'Choose our next car (live)' });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      expect(screen.getByTestId('case-header-title')).toHaveTextContent(
        'Choose our next car (live)',
      );
      expect(screen.getByTestId('case-header-pack-badge')).toHaveTextContent('car-purchase');
    });

    it('renders the loading state for the header before the first snapshot resolves', async () => {
      // Deliberately never resolves within this test's window.
      server.use(
        http.post('/api/cases/demo', () =>
          HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
        ),
        http.get(`/api/cases/${CASE_ID}/events`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return HttpResponse.json({
            snapshot: buildFixtureCaseState({ id: CASE_ID }),
            events: [],
          });
        }),
        packsHandler([DEFAULT_PACK]),
      );
      const user = userEvent.setup();
      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));

      await waitFor(() => {
        expect(screen.getByTestId('case-workspace')).toBeInTheDocument();
      });
      expect(screen.getByTestId('case-workspace-loading')).toHaveAttribute('aria-busy', 'true');
    });

    it('computes readiness from the real evaluateReadiness(core) function over the live snapshot', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        obligations: [
          {
            id: 'obl-1',
            label: 'Confirm total price',
            question: 'What is the out-the-door price?',
            category: 'price',
            required: true,
            priority: 1,
            requiredEvidenceLevel: 'E1',
            maxAttempts: 3,
            acceptedUncertaintyAllowed: false,
            dependsOn: [],
            preferredSkills: [],
            preferredSpecialists: [],
            completionRule: {
              minimumEvidenceLevel: 'E1',
              minimumIndependentSources: 1,
              acceptedUncertaintyAllowed: false,
            },
            origin: 'pack',
            status: 'satisfied',
            attemptsUsed: 1,
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('readiness-panel-status')).toHaveTextContent(
          /ready for decision/i,
        );
      });
      expect(screen.getByTestId('readiness-panel-bucket-satisfied-count')).toHaveTextContent('1');
    });

    it('renders live evidence via EvidenceList from the real snapshot', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        sources: [
          {
            id: 'source-1',
            url: 'https://dealer.example.com',
            title: 'Dealer quote',
            retrievedAt: '2026-08-27T00:00:00.000Z',
            origin: 'user_submitted',
            verification: 'unverified',
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        ],
        evidenceLinks: [
          {
            id: 'evidence-1',
            obligationId: 'obl-1',
            sourceId: 'source-1',
            level: 'E1',
            verdict: 'pass',
            disposition: 'included',
            summary: 'Confirmed via dealer quote.',
            stale: false,
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('evidence-card-evidence-1')).toBeInTheDocument();
      });
    });

    it('renders a live SSE activity event via ActivityTimeline as it streams in', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
      const source = FakeEventSource.instances.at(-1)!;
      source.triggerOpen();

      source.emit({
        schemaVersion: '1.0',
        eventId: 'evt-live',
        sequence: 1,
        timestamp: '2026-08-27T00:01:00.000Z',
        caseId: CASE_ID,
        type: 'specialist.started',
        phase: 'active',
        summary: 'Deal analyst started working.',
      });

      await waitFor(() => {
        expect(screen.getByTestId('activity-timeline-list')).toHaveTextContent(
          'Deal analyst started working.',
        );
      });
    });

    it('reflects the real SSE connectionState in the CaseHeader connection indicator', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
      FakeEventSource.instances.at(-1)!.triggerOpen();

      await waitFor(() => {
        expect(screen.getByTestId('case-header-connection-status')).toHaveTextContent(/live/i);
      });
    });

    it("reset demo calls startDemo with the currently active pack's demoId and transitions to the new case", async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, title: 'First case' });
      let capturedBody: unknown;
      server.use(
        http.post('/api/cases/demo', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(buildFakeCommandReceipt({ caseId: 'case-live-2' }));
        }),
        pollHandler(snapshot),
        http.get('/api/cases/case-live-2/events', () =>
          HttpResponse.json({
            snapshot: buildFixtureCaseState({ id: 'case-live-2', title: 'Second case' }),
            events: [],
          }),
        ),
        packsHandler([DEFAULT_PACK]),
      );

      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      const user = await startDemoAndWait();

      await user.click(screen.getByTestId('case-header-reset-demo'));

      await waitFor(() => {
        expect(screen.getByTestId('case-header-title')).toHaveTextContent('Second case');
      });
      expect(capturedBody).toMatchObject({ demoId: 'car-purchase' });
    });

    it('the "Request investigation" control calls requestInvestigation and LiveRunStatus reflects the correlated run', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      let capturedBody: unknown;
      server.use(
        http.post('/api/cases/demo', () =>
          HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
        ),
        pollHandler(snapshot),
        packsHandler([DEFAULT_PACK]),
        runHandler(
          { ...buildFakeCommandReceipt({ caseId: CASE_ID }), runId: 'run-live-1' },
          (body) => {
            capturedBody = body;
          },
        ),
      );

      const user = userEvent.setup();
      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
      await waitFor(() => expect(screen.getByTestId('case-header')).toBeInTheDocument());

      await user.click(screen.getByTestId('request-investigation'));

      await waitFor(() => {
        expect(screen.getByTestId('live-run-status-run-id')).toHaveTextContent('run-live-1');
      });
      expect(capturedBody).toMatchObject({
        caseId: CASE_ID,
        expectedSequence: snapshot.eventSequence,
      });
    });

    it('automatically retries a requestInvestigation 409 conflict once, using the server-reported actual sequence', async () => {
      // A real Playwright e2e run under worker contention found this
      // exact race: the browser's SSE-delivered `snapshot.eventSequence`
      // can be one event behind the server the instant this control is
      // pressed. `App.tsx`'s `handleRequestInvestigation` recovers
      // automatically using the conflict envelope's `actualSequence`
      // (architecture.md: "Conflicts return the latest sequence so ChatGPT
      // can call pax_get_case_context before retrying") rather than
      // leaving the human stuck with a silently re-enabled button.
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      let callCount = 0;
      server.use(
        http.post('/api/cases/demo', () =>
          HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
        ),
        pollHandler(snapshot),
        packsHandler([DEFAULT_PACK]),
        http.post(`/api/cases/${CASE_ID}/run`, async ({ request }) => {
          callCount += 1;
          if (callCount === 1) {
            return HttpResponse.json(
              {
                error: {
                  code: 'CONFLICT',
                  message:
                    'The case has advanced since expectedSequence was read; refresh and retry.',
                  retryable: true,
                  expectedSequence: snapshot.eventSequence,
                  actualSequence: snapshot.eventSequence + 1,
                },
                snapshot,
              },
              { status: 409 },
            );
          }
          const body = (await request.json()) as { expectedSequence: number };
          expect(body.expectedSequence).toBe(snapshot.eventSequence + 1);
          return HttpResponse.json({
            ...buildFakeCommandReceipt({ caseId: CASE_ID }),
            runId: 'run-retry-1',
          });
        }),
      );

      const user = userEvent.setup();
      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
      await waitFor(() => expect(screen.getByTestId('case-header')).toBeInTheDocument());

      await user.click(screen.getByTestId('request-investigation'));

      await waitFor(() => {
        expect(screen.getByTestId('live-run-status-run-id')).toHaveTextContent('run-retry-1');
      });
      expect(callCount).toBe(2);
      expect(screen.queryByTestId('request-investigation-error')).not.toBeInTheDocument();
    });

    it('approving a pending proposal calls reviewProposal with actor "human"', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        recommendation: {
          id: 'rec-1',
          status: 'ready',
          favoredOptionId: null,
          rationale: 'Best overall fit.',
          facts: [],
          hypotheses: [],
          confidence: 0.8,
          limitations: [],
          sourceIds: [],
          resolvedObligationIds: [],
          acceptedUncertaintyObligationIds: [],
          generatedAt: '2026-08-27T00:00:00.000Z',
        },
        proposal: {
          id: 'prop-1',
          recommendationId: 'rec-1',
          status: 'pending',
          createdAt: '2026-08-27T00:00:00.000Z',
        },
      });
      let capturedBody: unknown;
      renderLiveWorkspace(snapshot);
      server.use(
        commandHandler('reviewProposal', buildFakeCommandReceipt({ caseId: CASE_ID }), (body) => {
          capturedBody = body;
        }),
      );
      const user = await startDemoAndWait();

      await waitFor(() => expect(screen.getByTestId('approval-card-approve')).toBeInTheDocument());
      await user.click(screen.getByTestId('approval-card-approve'));

      await waitFor(() => {
        expect(capturedBody).toMatchObject({
          caseId: CASE_ID,
          proposalId: 'prop-1',
          actor: 'human',
          decision: 'approve',
        });
      });
    });

    it('an evidence disposition control calls setEvidenceDisposition on the shared command client', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        evidenceLinks: [
          {
            id: 'evidence-1',
            obligationId: 'obl-1',
            level: 'E1',
            verdict: 'pass',
            disposition: 'included',
            summary: 'Confirmed.',
            stale: false,
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      });
      let capturedBody: unknown;
      renderLiveWorkspace(snapshot);
      server.use(
        commandHandler(
          'setEvidenceDisposition',
          buildFakeCommandReceipt({ caseId: CASE_ID }),
          (body) => {
            capturedBody = body;
          },
        ),
      );
      const user = await startDemoAndWait();

      await waitFor(() =>
        expect(screen.getByTestId('evidence-card-set-excluded')).toBeInTheDocument(),
      );
      await user.click(screen.getByTestId('evidence-card-set-excluded'));

      await waitFor(() => {
        expect(capturedBody).toMatchObject({
          caseId: CASE_ID,
          evidenceId: 'evidence-1',
          disposition: 'excluded',
        });
      });
    });

    it('shows a recoverable error on the EvidenceList when setEvidenceDisposition fails', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        evidenceLinks: [
          {
            id: 'evidence-1',
            obligationId: 'obl-1',
            level: 'E1',
            verdict: 'pass',
            disposition: 'included',
            summary: 'Confirmed.',
            stale: false,
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      });
      renderLiveWorkspace(snapshot);
      server.use(
        http.post(`/api/cases/${CASE_ID}/commands/setEvidenceDisposition`, () =>
          HttpResponse.json(
            { error: { code: 'CONFLICT', message: 'Stale sequence.', retryable: true } },
            { status: 409 },
          ),
        ),
      );
      const user = await startDemoAndWait();

      await waitFor(() =>
        expect(screen.getByTestId('evidence-card-set-excluded')).toBeInTheDocument(),
      );
      await user.click(screen.getByTestId('evidence-card-set-excluded'));

      await waitFor(() => {
        expect(screen.getByTestId('evidence-list-error')).toHaveTextContent('Stale sequence.');
      });
    });

    it('joins a real claim into an evidence item (via claimId) rather than only falling back to the summary', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        claims: [
          {
            id: 'claim-1',
            obligationId: 'obl-1',
            statement: 'The dealer confirmed the out-the-door price.',
            stance: 'supports',
            confidence: 0.9,
            sourceIds: [],
            stale: false,
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        ],
        evidenceLinks: [
          {
            id: 'evidence-1',
            obligationId: 'obl-1',
            claimId: 'claim-1',
            level: 'E1',
            verdict: 'pass',
            disposition: 'included',
            summary: 'Fallback summary text.',
            stale: false,
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('evidence-card-claim')).toHaveTextContent(
          'The dealer confirmed the out-the-door price.',
        );
      });
    });

    it('renders a pending agent-proposed case extension via CaseExtensionReviewCard', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        caseExtensions: [
          {
            id: 'ext-1',
            caseId: CASE_ID,
            definition: {
              id: 'custom.pet_sensory_fit',
              label: 'Pet sensory fit',
              valueType: 'string',
              required: false,
              appliesTo: ['car'],
              evidenceExpectation: 'assertion',
              comparison: 'none',
              sensitive: false,
              origin: 'agent_proposed',
              reason: 'The household mentioned a sound-sensitive dog.',
              confirmation: 'pending',
              proposedBy: 'lead-investigator',
              createdAt: '2026-08-27T00:00:00.000Z',
            },
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('case-extension-review-card-label')).toHaveTextContent(
          'Pet sensory fit',
        );
      });
    });

    it('registers case-scoped WebMCP tools once a case is active', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      const { adapter } = renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        for (const name of CASE_SCOPED_PAX_TOOL_NAMES) {
          expect(adapter.getRegisteredTool(name)).toBeDefined();
        }
      });
    });

    it('resolves the active installed pack (by identity.id) and passes its real optionLabel/presentation down to OptionEditor and OptionComparison', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      // `DEFAULT_PACK.presentation.optionLabel` is `'car'` -- if the active
      // pack were not correctly resolved (e.g. matched on the wrong field),
      // this would silently fall back to the generic `'option'` label.
      await waitFor(() => {
        expect(screen.getByTestId('option-editor-new')).toHaveTextContent('Add car');
      });
      expect(screen.getByRole('heading', { name: 'car candidates' })).toBeInTheDocument();
    });

    it('shows the WebMcpStatus "ready" confirmation when the injected adapter reports supported', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      expect(screen.getByTestId('webmcp-status-supported')).toBeInTheDocument();
    });

    it('shows a recoverable ErrorState while preserving the last valid CaseHeader title when the stream errors', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, title: 'Resilient case' });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
      FakeEventSource.instances.at(-1)!.triggerError();

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
      // Last valid case state is preserved -- the header title never blanks.
      expect(screen.getByTestId('case-header-title')).toHaveTextContent('Resilient case');
      expect(screen.getByTestId('case-header-connection-status')).toHaveTextContent(
        /reconnecting/i,
      );
    });

    it('renders the obligation label, reason, active skill, and active specialist from a real activeFocus', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        obligations: [
          {
            id: 'obl-1',
            label: 'Confirm total price',
            question: 'What is the out-the-door price?',
            category: 'price',
            required: true,
            priority: 1,
            requiredEvidenceLevel: 'E1',
            maxAttempts: 3,
            acceptedUncertaintyAllowed: false,
            dependsOn: [],
            preferredSkills: [],
            preferredSpecialists: [],
            completionRule: {
              minimumEvidenceLevel: 'E1',
              minimumIndependentSources: 1,
              acceptedUncertaintyAllowed: false,
            },
            origin: 'pack',
            status: 'active',
            attemptsUsed: 1,
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
        ],
        activeFocus: {
          obligationId: 'obl-1',
          reason: 'Dealer quote has not been corroborated yet.',
          skillId: 'price-verification',
          specialistId: 'deal-analyst',
          since: '2026-08-27T00:00:00.000Z',
        },
      });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('current-focus-obligation')).toHaveTextContent(
          'Confirm total price',
        );
      });
      expect(screen.getByTestId('current-focus-reason')).toHaveTextContent(
        'Dealer quote has not been corroborated yet.',
      );
      expect(screen.getByTestId('current-focus-skill')).toHaveTextContent('price-verification');
      expect(screen.getByTestId('current-focus-specialist')).toHaveTextContent('deal-analyst');
    });

    it('shows the "Draft withheld" recommendation state when the last event is draft.withheld and no recommendation exists yet', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, recommendation: null });
      const withheldEvent: PublicActivityEvent = {
        schemaVersion: '1.0',
        eventId: 'evt-withheld',
        sequence: 1,
        timestamp: '2026-08-27T00:01:00.000Z',
        caseId: CASE_ID,
        type: 'draft.withheld',
        phase: 'completed',
        summary: 'Draft withheld pending more evidence.',
      };
      renderLiveWorkspace(snapshot, [withheldEvent]);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('recommendation-card-withheld')).toBeInTheDocument();
      });
    });

    it('does not send a reset command when the active pack id is not a recognized demo id', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        pack: {
          id: 'not-a-real-demo-pack',
          version: '1.0.0',
          compiledHash: 'a'.repeat(64),
          selectedBy: 'router',
          reasons: [],
        },
      });
      let startDemoCalled: boolean;
      server.use(
        http.post('/api/cases/demo', () => {
          startDemoCalled = true;
          return HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID }));
        }),
        pollHandler(snapshot),
        packsHandler([DEFAULT_PACK]),
      );
      const user = userEvent.setup();
      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
      // Only track calls made *after* the initial launcher click's own
      // (expected) startDemo call.
      startDemoCalled = false;
      await waitFor(() => expect(screen.getByTestId('case-header')).toBeInTheDocument());

      await user.click(screen.getByTestId('case-header-reset-demo'));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(startDemoCalled).toBe(false);
    });

    it('recovers from a reset-demo failure by re-enabling the reset control', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, title: 'Still here' });
      renderLiveWorkspace(snapshot);
      const user = await startDemoAndWait();
      // Only the *reset* attempt fails -- the initial `startDemo` from the
      // launcher (already completed above) must succeed normally.
      server.use(http.post('/api/cases/demo', () => new HttpResponse(null, { status: 500 })));

      await user.click(screen.getByTestId('case-header-reset-demo'));

      await waitFor(() => {
        expect(screen.getByTestId('case-header-reset-demo')).not.toBeDisabled();
      });
      // Never blanked -- the same case stays displayed after a failed reset.
      expect(screen.getByTestId('case-header-title')).toHaveTextContent('Still here');
    });

    it('disposes the WebMCP tool registration handle cleanly on unmount', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      const { unmount, adapter } = renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      // Waiting for a *case-scoped* tool (rather than a global one) proves
      // the async `registerPaxTools()` promise has actually resolved and
      // its handle has been committed to React state via the follow-up
      // `setActiveCase` effect -- a global tool alone can appear registered
      // slightly before that commit, which would make this test's `unmount`
      // race the handle's own assignment.
      await waitFor(() => {
        expect(adapter.getRegisteredTool('pax_upsert_option')).toBeDefined();
      });
      expect(adapter.getRegisteredTool('pax_get_case_context')).toBeDefined();

      unmount();

      expect(adapter.getRegisteredTool('pax_get_case_context')).toBeUndefined();
      expect(adapter.getRegisteredTool('pax_upsert_option')).toBeUndefined();
    });

    it('recovers from a requestInvestigation failure by re-enabling the control', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      server.use(
        http.post(`/api/cases/${CASE_ID}/run`, () => new HttpResponse(null, { status: 500 })),
      );
      const user = await startDemoAndWait();

      await user.click(screen.getByTestId('request-investigation'));

      await waitFor(() => {
        expect(screen.getByTestId('request-investigation')).toBeEnabled();
      });
      expect(screen.getByTestId('request-investigation')).toHaveTextContent(
        'Request investigation',
      );
      expect(screen.getByTestId('request-investigation-error')).toBeInTheDocument();
    });

    it('shows a generic error message on the ApprovalCard when reviewProposal rejects with a non-Error value', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        recommendation: {
          id: 'rec-1',
          status: 'ready',
          favoredOptionId: null,
          rationale: 'Best overall fit.',
          facts: [],
          hypotheses: [],
          confidence: 0.8,
          limitations: [],
          sourceIds: [],
          resolvedObligationIds: [],
          acceptedUncertaintyObligationIds: [],
          generatedAt: '2026-08-27T00:00:00.000Z',
        },
        proposal: {
          id: 'prop-1',
          recommendationId: 'rec-1',
          status: 'pending',
          createdAt: '2026-08-27T00:00:00.000Z',
        },
      });
      renderLiveWorkspace(snapshot);
      server.use(
        http.post(`/api/cases/${CASE_ID}/commands/reviewProposal`, () =>
          HttpResponse.text('not the expected JSON error body', { status: 500 }),
        ),
      );
      const user = await startDemoAndWait();

      await waitFor(() => expect(screen.getByTestId('approval-card-approve')).toBeInTheDocument());
      await user.click(screen.getByTestId('approval-card-approve'));

      await waitFor(() => {
        expect(screen.getByTestId('approval-card-error')).toBeInTheDocument();
      });
    });

    it('degrades gracefully (still renders the workspace) when GET /api/packs fails', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      server.use(
        http.post('/api/cases/demo', () =>
          HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
        ),
        pollHandler(snapshot),
        http.get('/api/packs', () => new HttpResponse(null, { status: 500 })),
      );
      const user = userEvent.setup();
      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));

      await waitFor(() => {
        expect(screen.getByTestId('case-header')).toBeInTheDocument();
      });
      // Falls back to the generic 'option' label rather than blocking.
      expect(screen.getByTestId('option-editor-new')).toHaveTextContent('Add option');
    });

    it('has no axe violations in the live workspace', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      const { container } = renderLiveWorkspace(snapshot);
      await startDemoAndWait();
      await waitFor(() => expect(screen.getByTestId('readiness-panel')).toBeInTheDocument());

      expect(await axe(container)).toHaveNoViolations();
    });

    it('renders the whole workspace at 390px width with no fixed-width overflow risk', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      server.use(
        http.post('/api/cases/demo', () =>
          HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
        ),
        pollHandler(snapshot),
        packsHandler([DEFAULT_PACK]),
      );
      const user = userEvent.setup();
      const { overflowRisks, renderResult } = renderAtNarrowWidth(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      await user.click(renderResult.getByRole('button', { name: 'Choose our next car' }));
      await waitFor(() => {
        expect(renderResult.getByTestId('case-workspace')).toBeInTheDocument();
      });

      expect(overflowRisks).toEqual([]);
    });

    describe('Runtime Inspector wiring', () => {
      it('opens the real Runtime Inspector from the "Inspect run" control once a run exists, and returns to the case body on close', async () => {
        const snapshot = buildFixtureCaseState({ id: CASE_ID });
        server.use(
          http.post('/api/cases/demo', () =>
            HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
          ),
          pollHandler(snapshot),
          packsHandler([DEFAULT_PACK]),
          runHandler({ ...buildFakeCommandReceipt({ caseId: CASE_ID }), runId: 'run-inspect-1' }),
          debugRunHandler('run-inspect-1'),
        );
        const user = userEvent.setup();
        render(
          <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
            <App />
          </AppProviders>,
        );
        await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
        await waitFor(() => expect(screen.getByTestId('case-header')).toBeInTheDocument());

        // Not reachable before any run has ever been requested this session.
        expect(screen.queryByTestId('open-runtime-inspector')).not.toBeInTheDocument();

        await user.click(screen.getByTestId('request-investigation'));
        await waitFor(() => {
          expect(screen.getByTestId('open-runtime-inspector')).toBeInTheDocument();
        });

        await user.click(screen.getByTestId('open-runtime-inspector'));

        await waitFor(() => {
          expect(screen.getByTestId('runtime-inspector')).toBeInTheDocument();
        });
        expect(screen.getByTestId('runtime-inspector-run-id')).toHaveTextContent('run-inspect-1');
        // The inspector genuinely replaces the case body -- current focus / activity / approval are gone while it is open.
        expect(screen.queryByTestId('current-focus')).not.toBeInTheDocument();
        expect(screen.queryByTestId('activity-timeline')).not.toBeInTheDocument();
        // The case header stays visible.
        expect(screen.getByTestId('case-header')).toBeInTheDocument();

        await waitFor(() => {
          expect(screen.getByTestId('runtime-inspector-status')).toHaveTextContent('completed');
        });

        await user.click(screen.getByTestId('runtime-inspector-close'));

        await waitFor(() => {
          expect(screen.queryByTestId('runtime-inspector')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('current-focus')).toBeInTheDocument();
      });

      it('opens the Runtime Inspector from a correlated ActivityTimeline item', async () => {
        const snapshot = buildFixtureCaseState({ id: CASE_ID });
        renderLiveWorkspace(snapshot);
        server.use(debugRunHandler('run-from-activity'));
        await startDemoAndWait();

        await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
        const source = FakeEventSource.instances.at(-1)!;
        source.triggerOpen();
        source.emit({
          schemaVersion: '1.0',
          eventId: 'evt-correlated',
          sequence: 1,
          timestamp: '2026-08-27T00:01:00.000Z',
          caseId: CASE_ID,
          runId: 'run-from-activity',
          type: 'specialist.started',
          phase: 'active',
          summary: 'Deal analyst started working.',
        });

        await waitFor(() => {
          expect(
            screen.getByTestId('activity-item-inspect-run-evt-correlated'),
          ).toBeInTheDocument();
        });
        await userEvent
          .setup()
          .click(screen.getByTestId('activity-item-inspect-run-evt-correlated'));

        await waitFor(() => {
          expect(screen.getByTestId('runtime-inspector-run-id')).toHaveTextContent(
            'run-from-activity',
          );
        });
      });

      it('has no axe violations with the Runtime Inspector open', async () => {
        const snapshot = buildFixtureCaseState({ id: CASE_ID });
        server.use(
          http.post('/api/cases/demo', () =>
            HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
          ),
          pollHandler(snapshot),
          packsHandler([DEFAULT_PACK]),
          runHandler({ ...buildFakeCommandReceipt({ caseId: CASE_ID }), runId: 'run-inspect-axe' }),
          debugRunHandler('run-inspect-axe'),
        );
        const user = userEvent.setup();
        const { container } = render(
          <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
            <App />
          </AppProviders>,
        );
        await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
        await waitFor(() => expect(screen.getByTestId('case-header')).toBeInTheDocument());
        await user.click(screen.getByTestId('request-investigation'));
        await waitFor(() =>
          expect(screen.getByTestId('open-runtime-inspector')).toBeInTheDocument(),
        );
        await user.click(screen.getByTestId('open-runtime-inspector'));
        await waitFor(() => {
          expect(screen.getByTestId('runtime-inspector-status')).toHaveTextContent('completed');
        });

        expect(await axe(container)).toHaveNoViolations();
      });
    });
  });
});
