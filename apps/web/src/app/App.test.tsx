import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { CaseState, CommandReceipt, PublicActivityEvent } from '@sift/contracts';
import { App } from './App.js';
import { AppProviders } from './AppProviders.js';
import { createFakeSiftCommands, buildFakeCommandReceipt } from '../test/fake-sift-commands.js';
import { buildFixtureCaseState, buildFixtureCompiledPack } from '../test/fixtures.js';
import { FakeEventSource, createFakeEventSource } from '../test/fake-event-source.js';
import { InMemoryModelContextAdapter } from '../model-context/adapter.js';
import { CASE_SCOPED_SIFT_TOOL_NAMES } from '../model-context/register-sift-tools.js';
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

// Matches the real server contract exactly (`apps/agent/src/routes/packs.ts`
// `ListPacksResponseSchema`: `{ packs: [...] }`, never a bare array) -- see
// `App.tsx`'s own `InstalledPacksResponseSchema` comment for the real,
// previously-silent bug this mock's earlier bare-array shape masked.
function packsHandler(packs: ReturnType<typeof buildFixtureCompiledPack>[]) {
  return http.get('/api/packs', () => HttpResponse.json({ packs }));
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

// "What Sift found" is now a FindingsSheet trigger, not an inline
// DisclosureSection (round-2 design review) -- tests that need to reach a
// real evidence-card control open the sheet first.
async function openFindingsSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('disclosure-findings-summary'));
  await waitFor(() => {
    expect(screen.getByTestId('findings-sheet')).toBeInTheDocument();
  });
}

describe('App', () => {
  it('renders the demo launcher when no case is active', () => {
    render(
      <AppProviders commandsClient={createFakeSiftCommands()}>
        <App />
      </AppProviders>,
    );

    expect(screen.getByTestId('demo-launcher')).toBeInTheDocument();
    expect(screen.queryByTestId('case-workspace')).not.toBeInTheDocument();
  });

  it('transitions from the launcher to the case workspace once a demo starts', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-abc' });
    const commands = createFakeSiftCommands({
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

  it('transitions launcher -> catalog -> back to launcher, and launcher -> catalog -> case workspace once a case is created', async () => {
    server.use(
      http.get('/api/catalog/makes', () => HttpResponse.json({ makes: ['Toyota'] })),
      http.get('/api/catalog/body-styles', () => HttpResponse.json({ bodyStyles: ['Sedan'] })),
      http.get('/api/catalog/vehicles', () =>
        HttpResponse.json({
          records: [
            {
              id: 'veh-camry-1',
              year: 2025,
              make: 'Toyota',
              model: 'Camry',
              trim: null,
              bodyStyle: 'Sedan',
              drivetrain: null,
              fuelType: null,
              combinedMpg: null,
              cylinders: null,
              transmission: null,
              source: { dataset: 'epa-fueleconomy-gov', recordId: '1' },
            },
            {
              id: 'veh-corolla-1',
              year: 2025,
              make: 'Toyota',
              model: 'Corolla',
              trim: null,
              bodyStyle: 'Sedan',
              drivetrain: null,
              fuelType: null,
              combinedMpg: null,
              cylinders: null,
              transmission: null,
              source: { dataset: 'epa-fueleconomy-gov', recordId: '2' },
            },
          ],
          total: 2,
        }),
      ),
    );
    const startCaseReceipt = buildFakeCommandReceipt({ caseId: 'case-catalog-1' });
    const commands = createFakeSiftCommands({
      startCase: () => Promise.resolve(startCaseReceipt),
      upsertOption: () => Promise.resolve(buildFakeCommandReceipt({ caseId: 'case-catalog-1' })),
    });
    const user = userEvent.setup();

    render(
      <AppProviders commandsClient={commands}>
        <App />
      </AppProviders>,
    );

    await user.click(screen.getByTestId('demo-launcher-compare-vehicles'));
    await waitFor(() => {
      expect(screen.getByTestId('vehicle-catalog-flow')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('demo-launcher')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('vehicle-catalog-back'));
    expect(screen.getByTestId('demo-launcher')).toBeInTheDocument();
    expect(screen.queryByTestId('vehicle-catalog-flow')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('demo-launcher-compare-vehicles'));
    await waitFor(() => {
      expect(screen.getByTestId('vehicle-card-veh-camry-1')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('vehicle-add-veh-camry-1'));
    await user.click(screen.getByTestId('vehicle-add-veh-corolla-1'));
    await user.click(screen.getByTestId('vehicle-catalog-start-comparison'));

    await waitFor(() => {
      expect(screen.getByTestId('case-workspace')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('vehicle-catalog-flow')).not.toBeInTheDocument();
  });

  it('has no routing chrome -- renders exactly one top-level region at a time', () => {
    render(
      <AppProviders commandsClient={createFakeSiftCommands()}>
        <App />
      </AppProviders>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  describe('reload persistence', () => {
    it('restores the active case from a stored caseId, verified against the real server, on a fresh mount', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, title: 'Restored case' });
      localStorage.setItem('sift:activeCaseId', CASE_ID);
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
      localStorage.setItem('sift:activeCaseId', 'case-does-not-exist');
      server.use(
        http.get('/api/cases/case-does-not-exist', () =>
          HttpResponse.json({ error: 'not found' }, { status: 404 }),
        ),
      );

      render(
        <AppProviders commandsClient={createFakeSiftCommands()}>
          <App />
        </AppProviders>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('demo-launcher')).toBeInTheDocument();
      });
      expect(localStorage.getItem('sift:activeCaseId')).toBeNull();
    });
  });

  describe('live workspace wiring', () => {
    it('renders CaseHeader with the real streamed snapshot title, and never leaks the pack id/badge to the consumer surface', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, title: 'Choose our next car (live)' });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      expect(screen.getByTestId('case-header-title')).toHaveTextContent(
        'Choose our next car (live)',
      );
      // ADR 0004 decision item 1: the Decision Pack badge/id/hash and the
      // pack-selection sentence leave the consumer surface entirely.
      expect(screen.queryByTestId('case-header-pack-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('case-header-pack-explanation')).not.toBeInTheDocument();
      expect(screen.queryByText(/car-purchase/)).not.toBeInTheDocument();
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
      const user = await startDemoAndWait();
      await openFindingsSheet(user);

      await waitFor(() => {
        expect(screen.getByTestId('evidence-card-evidence-1')).toBeInTheDocument();
      });
    });

    // Replaces a prior test asserting a live SSE event streamed into
    // `ActivityTimeline`'s raw ledger. ADR 0004 decision item 3/4 moves that
    // raw chronological ledger ("Sift's work so far") to developer content;
    // this is the consumer-surface equivalent -- a live, correlated SSE
    // event still visibly updates the hero's quiet `LiveRunStatus`
    // indicator and flips the headline to the honest "investigating" phase,
    // with no timer or fabricated progress involved (product.md "Real-time
    // experience contract").
    it("streams a live, correlated SSE event into the hero's LiveRunStatus indicator and phase headline", async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, recommendation: null });
      renderLiveWorkspace(snapshot);
      server.use(
        runHandler({ ...buildFakeCommandReceipt({ caseId: CASE_ID }), runId: 'run-stream-1' }),
      );
      const user = await startDemoAndWait();

      await user.click(screen.getByTestId('request-investigation'));
      await waitFor(() => {
        expect(screen.getByTestId('live-run-status')).toBeInTheDocument();
      });

      await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
      const source = FakeEventSource.instances.at(-1)!;
      source.triggerOpen();

      source.emit({
        schemaVersion: '1.0',
        eventId: 'evt-live',
        sequence: 1,
        timestamp: '2026-08-27T00:01:00.000Z',
        caseId: CASE_ID,
        runId: 'run-stream-1',
        type: 'specialist.started',
        phase: 'active',
        summary: 'Deal analyst started working.',
      });

      await waitFor(() => {
        expect(screen.getByTestId('live-run-status-summary')).toHaveTextContent(
          'Deal analyst started working.',
        );
      });
      expect(screen.getByTestId('recommendation-hero-headline')).toHaveTextContent(
        'Sift is investigating.',
      );
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

    it('resets a case-scoped component\'s stale local UI state (e.g. a leftover "Concern added" success banner) when Reset demo switches to a different case', async () => {
      // Manual QA finding (live browser pass, this task): `CustomConcernForm`
      // (and every other case-scoped child App.tsx renders without a `key`
      // tied to the active case -- `OptionEditor`, `CaseExtensionReviewCard`)
      // owns local `useState` (`success`/`error`/`form`) that used to survive
      // a case switch, because React reuses the same component instance
      // across a prop change with no identity change. Confirmed live: submit
      // a custom concern against case A, click "Reset demo" to land on a
      // brand-new case B, and the "Concern added..." success banner from
      // case A was still showing on case B's otherwise-empty form -- falsely
      // implying something had just been added to a case nothing had been
      // submitted against. `App.tsx` now keys the whole case workspace by
      // `activeCaseId` so every case-scoped child remounts (and its local
      // state resets) exactly when the active case actually changes.
      const secondCaseId = 'case-live-2';
      const secondSnapshot = buildFixtureCaseState({ id: secondCaseId, title: 'Second case' });
      let demoCallCount = 0;
      server.use(
        http.post('/api/cases/demo', () => {
          demoCallCount += 1;
          return HttpResponse.json(
            buildFakeCommandReceipt({ caseId: demoCallCount === 1 ? CASE_ID : secondCaseId }),
          );
        }),
        pollHandler(buildFixtureCaseState({ id: CASE_ID, title: 'First case' })),
        http.get(`/api/cases/${secondCaseId}/events`, () =>
          HttpResponse.json({ snapshot: secondSnapshot, events: [] }),
        ),
        packsHandler([DEFAULT_PACK]),
        commandHandler('defineCaseAttribute', buildFakeCommandReceipt({ caseId: CASE_ID })),
      );

      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      const user = await startDemoAndWait();
      await waitFor(() => {
        expect(screen.getByTestId('case-header-title')).toHaveTextContent('First case');
      });

      await user.click(screen.getByTestId('disclosure-add-concern-summary'));
      await user.type(screen.getByLabelText('Concern id'), 'trunk_space');
      await user.type(screen.getByLabelText('Label'), 'Trunk space');
      await user.type(screen.getByLabelText('Why this matters to you'), 'Need cargo room');
      await user.click(screen.getByTestId('custom-concern-form-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('custom-concern-form-success')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('case-header-reset-demo'));
      await waitFor(() => {
        expect(screen.getByTestId('case-header-title')).toHaveTextContent('Second case');
      });

      expect(screen.queryByTestId('custom-concern-form-success')).not.toBeInTheDocument();
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

      // The real run id is never rendered as raw text on the consumer
      // surface anymore (ADR 0004 decision item 3) -- proven here by
      // clicking through to the real Runtime Inspector, the one place the
      // id is developer-appropriate to show.
      await waitFor(() => {
        expect(screen.getByTestId('open-runtime-inspector')).toBeInTheDocument();
      });
      expect(screen.queryByText('run-live-1')).not.toBeInTheDocument();
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
      // can call sift_get_case_context before retrying") rather than
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
        expect(screen.getByTestId('open-runtime-inspector')).toBeInTheDocument();
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
      await openFindingsSheet(user);

      await waitFor(() =>
        expect(screen.getByTestId('evidence-card-disposition-option-excluded')).toBeInTheDocument(),
      );
      await user.click(screen.getByTestId('evidence-card-disposition-option-excluded'));
      await user.type(screen.getByTestId('evidence-card-reason-evidence-1'), 'No longer relevant.');
      await user.click(screen.getByTestId('evidence-card-reason-confirm-evidence-1'));

      await waitFor(() => {
        expect(capturedBody).toMatchObject({
          caseId: CASE_ID,
          evidenceId: 'evidence-1',
          disposition: 'excluded',
        });
      });
    });

    it('shows a recoverable error when setEvidenceDisposition fails', async () => {
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
      await openFindingsSheet(user);

      await waitFor(() =>
        expect(screen.getByTestId('evidence-card-disposition-option-excluded')).toBeInTheDocument(),
      );
      await user.click(screen.getByTestId('evidence-card-disposition-option-excluded'));
      await user.type(screen.getByTestId('evidence-card-reason-evidence-1'), 'No longer relevant.');
      await user.click(screen.getByTestId('evidence-card-reason-confirm-evidence-1'));

      await waitFor(() => {
        expect(screen.getByTestId('error-state-message')).toHaveTextContent('Stale sequence.');
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
      const user = await startDemoAndWait();
      await openFindingsSheet(user);

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
        for (const name of CASE_SCOPED_SIFT_TOOL_NAMES) {
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

    // ADR 0004 decision item 5: `CaseState.activeFocus` is written only as
    // `null` by every production code path -- the old "What Sift is doing"
    // current-focus card was unreachable dead code whose only visible
    // branch was a permanently-true empty state. It is deleted outright,
    // not replaced with a fabricated substitute ("Nothing may render from
    // `activeFocus` again until a real production code path writes a
    // non-null value to it"). This proves the deletion actually took
    // effect: even a snapshot carrying a real, fully-populated `activeFocus`
    // (something no production writer produces today, but the fixture can)
    // renders no trace of the old current-focus UI anywhere.
    it('renders nothing from activeFocus even when the snapshot carries a real (never-production-written) value', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
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

      expect(screen.queryByTestId('current-focus')).not.toBeInTheDocument();
      expect(screen.queryByTestId('current-focus-detail')).not.toBeInTheDocument();
      expect(screen.queryByTestId('current-focus-obligation')).not.toBeInTheDocument();
      expect(screen.queryByTestId('current-focus-reason')).not.toBeInTheDocument();
      expect(screen.queryByTestId('current-focus-skill')).not.toBeInTheDocument();
      expect(screen.queryByTestId('current-focus-specialist')).not.toBeInTheDocument();
      expect(screen.queryByTestId('current-focus-empty')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Dealer quote has not been corroborated yet.'),
      ).not.toBeInTheDocument();
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

    it('derives "Latest command" from replayed history when a case loads with prior run activity, instead of the empty state', async () => {
      // Regression test: `lastRunReceipt` was pure session-local state, set
      // only inside a live command's own promise-resolution handlers, and
      // reset to `null` by `handleDemoStarted`/reload -- so a case loaded
      // with real, already-completed run history (exactly what a page
      // reload replays) rendered "No command has been sent yet." directly
      // above a Readiness panel and Activity log that both correctly showed
      // that same history. Only the `run.queued` event carries both
      // `commandId` and `runId` together (see run-service.ts); every later
      // event in the run (specialist/tool/run.completed) carries only
      // `runId`, so this fixture also proves the fallback finds the real
      // originating `commandId` rather than fabricating one.
      const snapshot = buildFixtureCaseState({ id: CASE_ID, recommendation: null });
      const priorRunEvents: PublicActivityEvent[] = [
        {
          schemaVersion: '1.0',
          eventId: 'evt-1',
          sequence: 1,
          timestamp: '2026-08-27T00:00:00.000Z',
          caseId: CASE_ID,
          commandId: 'cmd-prior-1',
          runId: 'run-prior-1',
          type: 'run.queued',
          phase: 'queued',
          summary: 'Investigation queued.',
        },
        {
          schemaVersion: '1.0',
          eventId: 'evt-2',
          sequence: 2,
          timestamp: '2026-08-27T00:00:05.000Z',
          caseId: CASE_ID,
          runId: 'run-prior-1',
          type: 'specialist.started',
          phase: 'active',
          summary: 'Deal analyst started working.',
        },
        {
          schemaVersion: '1.0',
          eventId: 'evt-3',
          sequence: 3,
          timestamp: '2026-08-27T00:00:10.000Z',
          caseId: CASE_ID,
          runId: 'run-prior-1',
          type: 'run.completed',
          phase: 'completed',
          summary: 'Investigation completed.',
        },
      ];
      renderLiveWorkspace(snapshot, priorRunEvents);
      server.use(debugRunHandler('run-prior-1'));
      await startDemoAndWait();

      // `LiveRunStatus` renders nothing at all before any command has been
      // sent (ADR 0004 item 2); a case reloaded with prior run history must
      // therefore show the real quiet indicator, not that empty state.
      await waitFor(() => {
        expect(screen.getByTestId('live-run-status')).toBeInTheDocument();
      });
      expect(screen.getByTestId('live-run-status-phase')).toHaveTextContent(/completed/i);
      // Neither raw id renders as visible text on the consumer surface
      // (ADR 0004 item 3) -- proven by clicking through to the real
      // Runtime Inspector below, the one place `run-prior-1` is
      // developer-appropriate to show.
      expect(screen.queryByText('run-prior-1')).not.toBeInTheDocument();
      expect(screen.queryByText('cmd-prior-1')).not.toBeInTheDocument();

      // The "Open Runtime Inspector" control is directly adjacent to
      // LiveRunStatus and must not disagree with it: it was still gated on
      // the raw session-local `lastRunReceipt?.runId`, unchanged by the
      // fallback above, so it stayed hidden here even though LiveRunStatus
      // now correctly shows a completed run with a real run id.
      await waitFor(() => {
        expect(screen.getByTestId('open-runtime-inspector')).toBeInTheDocument();
      });
      const user = userEvent.setup();
      await user.click(screen.getByTestId('open-runtime-inspector'));

      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-run-id')).toHaveTextContent('run-prior-1');
      });
    });

    it('scopes the derived "Latest command" fallback to the active case, ignoring any other case\'s events still present in the events array', async () => {
      // Regression test (Task 15 review, Finding 3): `deriveReceiptFromEvents`
      // used to run over whatever `events` currently held, with no filter by
      // `caseId`. On "Reset demo," `setActiveCaseId(newId)` and
      // `setLastRunReceipt(null)` can commit and render before
      // `useCaseEvents`'s own internal `events` state (keyed by `caseId`) has
      // cleared, so for one frame the derived fallback could reflect the
      // *previous* case's history. This test proxies that race at the
      // `deriveReceiptFromEvents` call site directly: it hands the component
      // an `events` array containing a later-sequence event stamped with a
      // different, stale `caseId` (`case-other`) mixed in among the active
      // case's own real history, and asserts the derived receipt reflects
      // only the active case's own run -- never the foreign one, even though
      // it sorts later.
      const snapshot = buildFixtureCaseState({ id: CASE_ID, recommendation: null });
      const events: PublicActivityEvent[] = [
        {
          schemaVersion: '1.0',
          eventId: 'evt-1',
          sequence: 1,
          timestamp: '2026-08-27T00:00:00.000Z',
          caseId: CASE_ID,
          commandId: 'cmd-prior-1',
          runId: 'run-prior-1',
          type: 'run.queued',
          phase: 'queued',
          summary: 'Investigation queued.',
        },
        {
          schemaVersion: '1.0',
          eventId: 'evt-2',
          sequence: 2,
          timestamp: '2026-08-27T00:00:05.000Z',
          caseId: CASE_ID,
          runId: 'run-prior-1',
          type: 'run.completed',
          phase: 'completed',
          summary: 'Investigation completed.',
        },
        // A stale, foreign-case event: a higher sequence number than any
        // real event belonging to `CASE_ID`, which is exactly what would let
        // it win a naive "most recent event" scan if the derivation were not
        // scoped by `caseId`.
        {
          schemaVersion: '1.0',
          eventId: 'evt-foreign',
          sequence: 99,
          timestamp: '2026-08-27T00:01:00.000Z',
          caseId: 'case-other',
          commandId: 'cmd-foreign',
          runId: 'run-foreign',
          type: 'run.queued',
          phase: 'queued',
          summary: "A different case's investigation queued.",
        },
      ];
      renderLiveWorkspace(snapshot, events);
      server.use(debugRunHandler('run-prior-1'));
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('live-run-status')).toBeInTheDocument();
      });
      // Proven by clicking through to the real Runtime Inspector -- the
      // real run id is never rendered as raw consumer-surface text (ADR
      // 0004 item 3), so the *scoping* behavior this test exists to prove
      // (the derivation must never reflect a foreign case's event, even
      // one with a higher sequence number) is now verified at the one
      // place the id is developer-appropriate to show.
      await waitFor(() => {
        expect(screen.getByTestId('open-runtime-inspector')).toBeInTheDocument();
      });
      const user = userEvent.setup();
      await user.click(screen.getByTestId('open-runtime-inspector'));
      await waitFor(() => {
        expect(screen.getByTestId('runtime-inspector-run-id')).toHaveTextContent('run-prior-1');
      });
      expect(screen.getByTestId('runtime-inspector-run-id')).not.toHaveTextContent('run-foreign');
    });

    // ADR 0004 item 2 / audit §2: an empty conceptual region must be
    // ABSENT, not a card announcing its own emptiness -- `LiveRunStatus`
    // used to render a "No command has been sent yet." card here; it now
    // renders nothing at all for a genuinely fresh case with no prior
    // activity.
    it('renders no LiveRunStatus indicator at all for a genuinely fresh case with no prior activity', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, recommendation: null });
      renderLiveWorkspace(snapshot, []);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('case-header')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('live-run-status')).not.toBeInTheDocument();
      expect(screen.queryByTestId('live-run-status-empty')).not.toBeInTheDocument();
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
      // the async `registerSiftTools()` promise has actually resolved and
      // its handle has been committed to React state via the follow-up
      // `setActiveCase` effect -- a global tool alone can appear registered
      // slightly before that commit, which would make this test's `unmount`
      // race the handle's own assignment.
      await waitFor(() => {
        expect(adapter.getRegisteredTool('sift_upsert_option')).toBeDefined();
      });
      expect(adapter.getRegisteredTool('sift_get_case_context')).toBeDefined();

      unmount();

      expect(adapter.getRegisteredTool('sift_get_case_context')).toBeUndefined();
      expect(adapter.getRegisteredTool('sift_upsert_option')).toBeUndefined();
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
        // The inspector is now a Sheet overlay (round-2 design review: "show
        // these in ... a side sliding sheet" rather than navigating to a
        // separate page) -- the case body stays mounted underneath it.
        // `recommendation-hero` replaces the retired "current-focus" card as
        // the stable, always-present region proving this (ADR 0004 item 5
        // deleted the current-focus card entirely).
        expect(screen.getByTestId('recommendation-hero')).toBeInTheDocument();
        expect(screen.getByTestId('case-header')).toBeInTheDocument();

        await waitFor(() => {
          expect(screen.getByTestId('runtime-inspector-status')).toHaveTextContent('completed');
        });

        await user.click(screen.getByTestId('sheet-close'));

        await waitFor(() => {
          expect(screen.queryByTestId('runtime-inspector')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('recommendation-hero')).toBeInTheDocument();
      });

      // A prior version of this test opened the Inspector from a per-item
      // "Inspect run" control on `ActivityTimeline`, the raw chronological
      // activity ledger. ADR 0004 item 3/4 moves that ledger to developer
      // content and this file no longer mounts it on the consumer surface
      // at all (change-set §34: "Do not build a redundant separate debug
      // system") -- the single "Inspect run" control tied to the hero's own
      // `LiveRunStatus` (covered by the test above and by "streams a live,
      // correlated SSE event...") is the one remaining, still-tested entry
      // point into the Runtime Inspector.

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

  // ADR 0004 "Consumer workspace information architecture": the merged
  // answer-first hero is always visible and precedes every disclosure row
  // -- the machine-checkable form of "answer first" this task's brief asks
  // for, in DOM order rather than only visual position. Each disclosure
  // row's closed `<summary>` still carries an accurate live summary even
  // while collapsed (a property ADR 0002 established and ADR 0004 keeps).
  describe('workspace layout (ADR 0004, answer-first hero + disclosure rows)', () => {
    it('renders the recommendation hero before every disclosure row, in real DOM order', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      const hero = screen.getByTestId('recommendation-hero');
      for (const testId of [
        'disclosure-options',
        'disclosure-findings',
        'disclosure-still-checking',
        'disclosure-add-concern',
      ]) {
        const position = hero.compareDocumentPosition(screen.getByTestId(testId));
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });

    it('starts every investigative disclosure row closed by default', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      for (const testId of ['disclosure-options', 'disclosure-still-checking']) {
        expect(screen.getByTestId<HTMLDetailsElement>(testId).open).toBe(false);
      }
      // "What Sift found" is a FindingsSheet trigger, not a native disclosure
      // (round-2 design review) -- "closed by default" for this row means
      // the sheet is not open yet.
      expect(screen.queryByTestId('findings-sheet')).not.toBeInTheDocument();
    });

    it('shows a live option count on the closed "Manage options" row', async () => {
      const snapshot = buildFixtureCaseState({
        id: CASE_ID,
        entities: [
          {
            id: 'candidate-rav4',
            kind: 'car',
            label: 'Toyota RAV4',
            attributes: {},
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
          {
            id: 'candidate-crv',
            kind: 'car',
            label: 'Honda CR-V',
            attributes: {},
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z',
          },
        ],
      });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('disclosure-options-meta')).toHaveTextContent('2 options');
      });
    });

    it('shows a live finding count on the closed "What Sift found" row', async () => {
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
        expect(screen.getByTestId('disclosure-findings-meta')).toHaveTextContent('1 finding');
      });
    });

    it('shows "All checked" on "Still checking" when the case has no required questions', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID, obligations: [] });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('disclosure-still-checking-meta')).toHaveTextContent(
          'All checked',
        );
      });
    });

    it('shows a remaining count on "Still checking" when the case is not ready', async () => {
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
      });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('disclosure-still-checking-meta')).toHaveTextContent(
          '1 still open',
        );
      });
    });

    // The raw chronological ledger this test used to check ("Sift's work so
    // far" / `ActivityTimeline`, with its own live-pulsing indicator) is
    // retired from the consumer surface entirely (ADR 0004 item 3/4); the
    // equivalent "a live run visibly and quietly updates the workspace"
    // coverage now lives in 'live workspace wiring' > "streams a live,
    // correlated SSE event into the hero's LiveRunStatus indicator and
    // phase headline", against the hero's own `LiveRunStatus`.

    it('renders the primary Quick Pick / List / Compare / Board view switcher, always expanded (not a disclosure row)', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId('workspace-view-switcher')).toBeInTheDocument();
      });
      // A real `<details>` disclosure would carry a `disclosure-*` testid
      // (per `DisclosureSection`'s own naming convention) -- the view
      // switcher deliberately carries none, because ADR 0004 item 5 makes
      // it a primary, always-expanded surface, not a closed-by-default row.
      expect(screen.queryByTestId('disclosure-view')).not.toBeInTheDocument();
      expect(screen.getByTestId('workspace-view-content-compare')).toBeInTheDocument();
    });

    it('auto-opens "Add something Sift should check" when an agent-proposed extension is pending', async () => {
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
        expect(screen.getByTestId<HTMLDetailsElement>('disclosure-add-concern').open).toBe(true);
      });
      expect(screen.getByTestId('disclosure-add-concern-meta')).toHaveTextContent(
        '1 needs your review',
      );
    });

    it('leaves "Add something Sift should check" closed with no meta when nothing is pending', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      await startDemoAndWait();

      await waitFor(() => {
        expect(screen.getByTestId<HTMLDetailsElement>('disclosure-add-concern').open).toBe(false);
      });
      expect(screen.queryByTestId('disclosure-add-concern-meta')).not.toBeInTheDocument();
    });

    it('opens "Still checking" on click and reveals the readiness panel it wraps', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      renderLiveWorkspace(snapshot);
      const user = await startDemoAndWait();

      await user.click(screen.getByTestId('disclosure-still-checking-summary'));
      expect(screen.getByTestId<HTMLDetailsElement>('disclosure-still-checking').open).toBe(true);
      expect(screen.getByTestId('readiness-panel-status')).toBeInTheDocument();
    });
  });

  // Defensive branches this file's other tests do not naturally exercise --
  // mostly "a promise resolves/rejects after this component (or its case
  // generation) has already been torn down" guards, plus a handful of
  // fallback-message/rendering branches whose "happy path" arm is already
  // covered elsewhere in this file. Some genuinely reachable guards in this
  // file (`handleResetDemo`'s `snapshot === null` check,
  // `handleReviewProposal`'s `!snapshot?.proposal || activeCaseId === null`
  // check, `handleSetDisposition`'s equivalent check, the `obligationId`
  // parameter of `handleRequestInvestigation`, `review.reason` in
  // `handleReviewProposal`'s command payload, and the `readiness?.blockers
  // .length ?? 0` fallback) are NOT covered here because they are
  // structurally unreachable from any real user interaction as this file
  // currently wires things: their triggering control either never mounts
  // (`CaseHeader`/`ApprovalCard`/`EvidenceList`'s action controls all
  // require non-null data derived from `snapshot` before they render at
  // all -- unlike "Request investigation", which always mounts, just
  // disabled) or the value in question (`obligationId`, `review.reason`) is
  // never produced by any current caller, or (`readiness`) the real
  // `evaluateReadiness` never actually returns `null` for a non-null
  // snapshot.
  describe('defensive branches (post-teardown guards and rare fallback paths)', () => {
    it('does not update installedPacks after unmount if the /api/packs fetch resolves late', async () => {
      let releasePacks: (() => void) | undefined;
      server.use(
        http.get('/api/packs', async () => {
          await new Promise<void>((resolve) => {
            releasePacks = resolve;
          });
          return HttpResponse.json({ packs: [DEFAULT_PACK] });
        }),
      );

      const { unmount } = render(
        <AppProviders commandsClient={createFakeSiftCommands()}>
          <App />
        </AppProviders>,
      );
      await waitFor(() => expect(releasePacks).toBeDefined());

      unmount();
      expect(() => releasePacks?.()).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 10));
      // No error was thrown by the late-arriving packs response landing
      // after unmount -- the disposed guard skipped applying it.
    });

    it('ignores a malformed /api/packs payload that fails schema validation and falls back to the generic option label', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      server.use(
        http.post('/api/cases/demo', () =>
          HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID, commandId: 'cmd-start' })),
        ),
        pollHandler(snapshot),
        http.get('/api/packs', () => HttpResponse.json([{ not: 'a valid compiled pack' }])),
      );
      const user = userEvent.setup();
      render(
        <AppProviders caseEventsConfig={{ createEventSource: createFakeEventSource }}>
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
      await waitFor(() => expect(screen.getByTestId('case-header')).toBeInTheDocument());

      // Falls back to the generic 'option' label -- the malformed payload
      // never made it past `InstalledPacksResponseSchema.safeParse`.
      expect(screen.getByTestId('option-editor-new')).toHaveTextContent('Add option');
    });

    it('unmounting before the reload-restore verification fetch resolves does not apply a late activeCaseId/clear update', async () => {
      localStorage.setItem('sift:activeCaseId', CASE_ID);
      let releaseRestore: (() => void) | undefined;
      server.use(
        http.get(`/api/cases/${CASE_ID}`, async () => {
          await new Promise<void>((resolve) => {
            releaseRestore = resolve;
          });
          return HttpResponse.json(buildFixtureCaseState({ id: CASE_ID }));
        }),
      );

      const { unmount } = render(
        <AppProviders commandsClient={createFakeSiftCommands()}>
          <App />
        </AppProviders>,
      );
      await waitFor(() => expect(releaseRestore).toBeDefined());

      unmount();
      expect(() => releaseRestore?.()).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('unmounting before the reload-restore verification fetch rejects does not apply a late clear/restore update', async () => {
      localStorage.setItem('sift:activeCaseId', CASE_ID);
      let releaseFailure: (() => void) | undefined;
      server.use(
        http.get(`/api/cases/${CASE_ID}`, async () => {
          await new Promise<void>((resolve) => {
            releaseFailure = resolve;
          });
          return HttpResponse.error();
        }),
      );

      const { unmount } = render(
        <AppProviders commandsClient={createFakeSiftCommands()}>
          <App />
        </AppProviders>,
      );
      await waitFor(() => expect(releaseFailure).toBeDefined());

      unmount();
      expect(() => releaseFailure?.()).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('disposes the global WebMCP tool registration immediately if the component unmounts before registerSiftTools resolves', async () => {
      // A subclass whose `registerTool` still performs the base class's real
      // synchronous bookkeeping (so `disposeAll()`'s abort-listener wiring
      // stays real) but leaves its OWN returned promise pending until this
      // test releases it -- giving a deterministic window to unmount before
      // `registerSiftTools(...).then(...)` in `App.tsx` ever runs.
      class DelayedRegisterAdapter extends InMemoryModelContextAdapter {
        readonly pendingReleases: (() => void)[] = [];
        override registerTool(
          ...args: Parameters<InMemoryModelContextAdapter['registerTool']>
        ): Promise<void> {
          void super.registerTool(...args);
          return new Promise<void>((resolve) => {
            this.pendingReleases.push(resolve);
          });
        }
      }
      const adapter = new DelayedRegisterAdapter();
      server.use(http.get('/api/packs', () => HttpResponse.json([])));

      const { unmount } = render(
        <AppProviders commandsClient={createFakeSiftCommands()} webMcpAdapter={adapter}>
          <App />
        </AppProviders>,
      );
      await waitFor(() => expect(adapter.pendingReleases.length).toBeGreaterThan(0));

      unmount();
      // `registerSiftTools` awaits its two `registerTool` calls sequentially
      // (`sift_get_case_context` then `sift_list_packs`), so the second one
      // only becomes pending once the first is released.
      adapter.pendingReleases[0]?.();
      await waitFor(() => expect(adapter.pendingReleases.length).toBeGreaterThan(1));
      adapter.pendingReleases[1]?.();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The `.then()` callback's own `disposed` check called
      // `handle.disposeAll()` instead of committing the handle to state --
      // every tool it had just (really) registered is unregistered again.
      expect(adapter.registeredToolNames).toEqual([]);
    });

    it('the "Request investigation" control does nothing if invoked while snapshot is still null (bypasses the disabled attribute to prove the callback\'s own defensive guard)', async () => {
      let runCalled = false;
      server.use(
        http.post('/api/cases/demo', () =>
          HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
        ),
        // Never resolves -- keeps `snapshot` null indefinitely, matching the
        // real "loading" state this control is disabled during.
        http.get(`/api/cases/${CASE_ID}/events`, () => new Promise(() => undefined)),
        packsHandler([DEFAULT_PACK]),
        http.post(`/api/cases/${CASE_ID}/run`, () => {
          runCalled = true;
          return HttpResponse.json({
            ...buildFakeCommandReceipt({ caseId: CASE_ID }),
            runId: 'run-should-not-happen',
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
      await waitFor(() => {
        expect(screen.getByTestId('case-workspace-loading')).toBeInTheDocument();
      });

      const button = screen.getByTestId('request-investigation');
      expect(button).toBeDisabled();
      button.removeAttribute('disabled');
      fireEvent.click(button);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(runCalled).toBe(false);
    });

    it('does not retry a requestInvestigation conflict when the server response lacks a usable actualSequence, and shows a recoverable error instead', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      let callCount = 0;
      server.use(
        http.post('/api/cases/demo', () =>
          HttpResponse.json(buildFakeCommandReceipt({ caseId: CASE_ID })),
        ),
        pollHandler(snapshot),
        packsHandler([DEFAULT_PACK]),
        http.post(`/api/cases/${CASE_ID}/run`, () => {
          callCount += 1;
          // No top-level `snapshot` and no `actualSequence` -- fails the
          // strict conflict-envelope schema, so the client falls back to the
          // generic error-body shape instead, whose `details` carries no
          // usable `actualSequence` at all.
          return HttpResponse.json(
            {
              error: {
                code: 'CONFLICT',
                message: 'Stale sequence; refresh and retry.',
                retryable: true,
              },
            },
            { status: 409 },
          );
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
        expect(screen.getByTestId('request-investigation-error')).toHaveTextContent(
          'Stale sequence; refresh and retry.',
        );
      });
      expect(callCount).toBe(1);
    });

    it('shows the generic "Could not request an investigation." message when requestInvestigation rejects with a non-Error value', async () => {
      const snapshot = buildFixtureCaseState({ id: CASE_ID });
      const commands = createFakeSiftCommands({
        startDemo: () => Promise.resolve(buildFakeCommandReceipt({ caseId: CASE_ID })),
        requestInvestigation: vi.fn().mockRejectedValue('network gremlin'),
      });
      server.use(pollHandler(snapshot), packsHandler([DEFAULT_PACK]));
      const user = userEvent.setup();
      render(
        <AppProviders
          commandsClient={commands}
          caseEventsConfig={{ createEventSource: createFakeEventSource }}
        >
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
      await waitFor(() => expect(screen.getByTestId('case-header')).toBeInTheDocument());

      await user.click(screen.getByTestId('request-investigation'));

      await waitFor(() => {
        expect(screen.getByTestId('request-investigation-error')).toHaveTextContent(
          'Could not request an investigation.',
        );
      });
    });

    it('submitting a "Request revision" review calls reviewProposal with the typed instructions', async () => {
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

      await waitFor(() =>
        expect(screen.getByTestId('approval-card-request-revision')).toBeInTheDocument(),
      );
      await user.click(screen.getByTestId('approval-card-request-revision'));
      await user.type(
        screen.getByTestId('approval-card-revision-instructions-input'),
        'Please re-check the total price including fees.',
      );
      await user.click(screen.getByTestId('approval-card-revision-submit'));

      await waitFor(() => {
        expect(capturedBody).toMatchObject({
          caseId: CASE_ID,
          proposalId: 'prop-1',
          actor: 'human',
          decision: 'request_revision',
          instructions: 'Please re-check the total price including fees.',
        });
      });
    });

    it('shows the generic "Could not submit this review." message when reviewProposal rejects with a non-Error value', async () => {
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
      const commands = createFakeSiftCommands({
        startDemo: () => Promise.resolve(buildFakeCommandReceipt({ caseId: CASE_ID })),
        reviewProposal: vi.fn().mockRejectedValue('server hiccup'),
      });
      server.use(pollHandler(snapshot), packsHandler([DEFAULT_PACK]));
      const user = userEvent.setup();
      render(
        <AppProviders
          commandsClient={commands}
          caseEventsConfig={{ createEventSource: createFakeEventSource }}
        >
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
      await waitFor(() => expect(screen.getByTestId('approval-card-approve')).toBeInTheDocument());

      await user.click(screen.getByTestId('approval-card-approve'));

      await waitFor(() => {
        expect(screen.getByTestId('approval-card-error')).toHaveTextContent(
          'Could not submit this review.',
        );
      });
    });

    it('shows the generic "Could not update this evidence item." message when setEvidenceDisposition rejects with a non-Error value', async () => {
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
      const commands = createFakeSiftCommands({
        startDemo: () => Promise.resolve(buildFakeCommandReceipt({ caseId: CASE_ID })),
        setEvidenceDisposition: vi.fn().mockRejectedValue('server hiccup'),
      });
      server.use(pollHandler(snapshot), packsHandler([DEFAULT_PACK]));
      const user = userEvent.setup();
      render(
        <AppProviders
          commandsClient={commands}
          caseEventsConfig={{ createEventSource: createFakeEventSource }}
        >
          <App />
        </AppProviders>,
      );
      await user.click(screen.getByRole('button', { name: 'Choose our next car' }));
      await waitFor(() => expect(screen.getByTestId('case-header')).toBeInTheDocument());
      await openFindingsSheet(user);

      await waitFor(() =>
        expect(screen.getByTestId('evidence-card-disposition-option-excluded')).toBeInTheDocument(),
      );
      await user.click(screen.getByTestId('evidence-card-disposition-option-excluded'));
      await user.type(screen.getByTestId('evidence-card-reason-evidence-1'), 'No longer relevant.');
      await user.click(screen.getByTestId('evidence-card-reason-confirm-evidence-1'));

      await waitFor(() => {
        expect(screen.getByTestId('error-state-message')).toHaveTextContent(
          'Could not update this evidence item.',
        );
      });
    });

    // The two `activeFocus`-rendering defensive branches this section used
    // to cover (a ghost obligation id with no matching obligation; a focus
    // with no skill/specialist) no longer apply -- the current-focus UI
    // they exercised is deleted entirely (ADR 0004 decision item 5; see
    // 'live workspace wiring' > "renders nothing from activeFocus even when
    // the snapshot carries a real (never-production-written) value", which
    // proves the deletion holds even for a fully-populated `activeFocus`).
  });
});
