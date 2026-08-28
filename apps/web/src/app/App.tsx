/**
 * The route-free launcher/workspace shell (locked file map:
 * `apps/web/src/app/App.tsx  Route-free launcher/workspace shell`).
 *
 * product.md's "Primary experience" describes one page, not a multi-page
 * site: "The page contains a seeded demo launcher and the active case
 * workspace." There is no router -- `App` is a plain state machine with
 * exactly two branches: `DemoLauncher` when no case exists yet, and the
 * live case workspace once `startDemo` has returned a receipt.
 *
 * This pass wires the entire workspace to real data: `useCaseEvents` (the
 * real SSE/poll-fallback subscription) supplies the canonical `CaseState`
 * snapshot and ordered `PublicActivityEvent[]` every region below renders
 * from; `registerPaxTools` mounts the full WebMCP catalog only while a case
 * is active, re-registering its case-scoped tools whenever the active case
 * changes; every visible control calls through the one shared `PaxCommands`
 * instance from `usePaxCommands()` -- there is no parallel mutation path
 * (CLAUDE.md "Visible UI controls and WebMCP callbacks use the same command
 * implementation").
 *
 * Region order matches product.md's "Workspace layout" exactly (ADR 0002,
 * "answer-first, everything else one tap away"): case header, what Pax is
 * doing, our pick (recommendation + approval, always expanded), then four
 * closed-by-default `DisclosureSection` rows -- compare the options, what
 * Pax found, still checking, Pax's work so far -- and a fifth disclosure
 * for adding a concern that opens itself only when an agent-proposed case
 * extension is awaiting confirmation. Region 9 (Runtime Inspector) is the
 * minimum-viable Overview + Timeline slice this task adds -- not the full
 * six-view spec (Execution/State/Context/Errors remain later Tier-2 work).
 * Reachable two ways, both
 * feeding the same `inspectingRunId` state: an "Inspect run" control next to
 * `LiveRunStatus` (enabled once a real `runId` exists this session) and a
 * per-item "Inspect run" button `ActivityTimeline` renders for any streamed
 * activity event that carries a `runId`. Per
 * debugging-and-observability.md ("The inspector replaces the case body
 * within the right pane and includes a clear return action; it is not a
 * desktop-only modal"), opening it swaps out everything below `CaseHeader`
 * for `RuntimeInspector`, which owns its own "Return to case" control.
 *
 * `readiness` is computed by calling the REAL `evaluateReadiness` from
 * `@pax/core` directly (this task added `@pax/core` as a runtime dependency
 * of `apps/web` -- see `apps/web/package.json` and `ReadinessPanel.tsx`'s own
 * forward-looking doc comment, which named this exact moment: "the moment a
 * later task wires it in"). This app never re-implements readiness,
 * satisfying CLAUDE.md's "The deterministic core, not an LLM, owns ...
 * readiness."
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import {
  CompiledDecisionPackSchema,
  DEMO_IDS,
  type CommandReceipt,
  type CompiledDecisionPack,
  type EvidenceDisposition,
  type PublicActivityEvent,
} from '@pax/contracts';
import { evaluateReadiness } from '@pax/core';
import { Button } from '@/components/ui/button';
import { PaxClientError } from '../api/pax-client.js';
import { readStoredCaseId, writeStoredCaseId, clearStoredCaseId } from './active-case-storage.js';
import { DemoLauncher } from '../components/DemoLauncher.js';
import { CaseHeader, type CaseHeaderConnectionState } from '../components/CaseHeader.js';
import { DisclosureSection } from '../components/DisclosureSection.js';
import { ReadinessPanel } from '../components/ReadinessPanel.js';
import { EvidenceList } from '../components/EvidenceList.js';
import { ActivityTimeline } from '../components/ActivityTimeline.js';
import { RecommendationCard } from '../components/RecommendationCard.js';
import { ApprovalCard, type ApprovalCardReview } from '../components/ApprovalCard.js';
import { OptionEditor } from '../components/OptionEditor.js';
import { OptionComparison } from '../components/OptionComparison.js';
import { CustomConcernForm } from '../components/CustomConcernForm.js';
import { CaseExtensionReviewCard } from '../components/CaseExtensionReviewCard.js';
import { LiveRunStatus, type LiveRunStatusReceipt } from '../components/LiveRunStatus.js';
import { WebMcpStatus } from '../components/WebMcpStatus.js';
import { ErrorState } from '../components/ErrorState.js';
import { RuntimeInspector } from '../components/RuntimeInspector.js';
import { useApiConfig, usePaxCommands, useWebMcpAdapter } from './AppProviders.js';
import { useCaseEvents, type CaseEventsConnectionState } from '../hooks/use-case-events.js';
import {
  registerPaxTools,
  type PaxToolRegistrationHandle,
} from '../model-context/register-pax-tools.js';

const InstalledPacksResponseSchema = z.array(CompiledDecisionPackSchema);

/**
 * Reconstructs a fallback `LiveRunStatusReceipt` from replayed
 * `PublicActivityEvent`s, for the moment before any command has been sent
 * *this browser lifetime* -- a fresh page load or hard reload. Without
 * this, `lastRunReceipt` (session-local `useState`, only ever set inside a
 * live command's own promise-resolution handlers) naturally starts `null`
 * and stays `null` regardless of how much real history the case actually
 * has, even though `events` already carries that full replayed history and
 * is what Readiness/Evidence/Activity correctly derive their own
 * post-reload state from -- producing "No command has been sent yet."
 * directly above a Readiness panel and Activity log that both correctly
 * show a fully decided case.
 *
 * Walks `events` from the most recent backward for the latest event that
 * carries a `runId` (preferred, matching `LiveRunStatus`'s own correlation
 * preference). Only the run-starting event itself carries both `commandId`
 * and `runId` together (see `run-service.ts`'s `run.queued` append) --
 * every later event in that run (specialist/tool/completion events) carries
 * only `runId` -- so this also searches the full history for the real
 * originating `commandId` of that same run rather than fabricating one.
 * Falls back to the most recent event carrying only a `commandId` (a
 * command that has not yet started a run), matching
 * `LiveRunStatus.tsx`'s own documented "brief window before a run-starting
 * command has an established `runId`" case. Returns `null` when `events`
 * has nothing to derive from -- a genuinely fresh case must still show the
 * real empty state, not a fabricated receipt.
 */
function deriveReceiptFromEvents(events: PublicActivityEvent[]): LiveRunStatusReceipt | null {
  const bySequence = [...events].sort((a, b) => a.sequence - b.sequence);

  for (let i = bySequence.length - 1; i >= 0; i -= 1) {
    const runId = bySequence[i]?.runId;
    if (runId !== undefined) {
      const originating = bySequence.find(
        (event) => event.runId === runId && event.commandId !== undefined,
      );
      return { commandId: originating?.commandId ?? runId, runId };
    }
  }

  for (let i = bySequence.length - 1; i >= 0; i -= 1) {
    const commandId = bySequence[i]?.commandId;
    if (commandId !== undefined) {
      return { commandId };
    }
  }

  return null;
}

function mapConnectionState(state: CaseEventsConnectionState): CaseHeaderConnectionState {
  // `CaseHeader` (built in an earlier pass) has no separate "connecting"
  // token of its own -- its visual/copy treatment for "attempting to
  // establish a connection" and "attempting to re-establish one" is
  // identical (`reconnecting`), so the one genuinely new hook state maps
  // onto it rather than requiring a `CaseHeader` contract change.
  return state === 'connecting' ? 'reconnecting' : state;
}

export function App() {
  const commands = usePaxCommands();
  const apiConfig = useApiConfig();
  const webMcpAdapter = useWebMcpAdapter();

  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  // Reload persistence (product.md real-time contract: a mid-case reload
  // must restore state from the server, not local state). Only a *pointer*
  // to which case was open is ever read from `localStorage` synchronously
  // here, at initial state -- it is not trusted as the active case until
  // the verification effect below confirms the id still resolves against
  // the real server. `null` means either nothing was stored, or nothing is
  // being restored (both render the plain launcher immediately).
  const [restoringCaseId, setRestoringCaseId] = useState<string | null>(() => readStoredCaseId());
  const [installedPacks, setInstalledPacks] = useState<CompiledDecisionPack[]>([]);
  const [lastRunReceipt, setLastRunReceipt] = useState<LiveRunStatusReceipt | null>(null);
  // Runtime Inspector (Region 7, this task) -- the runId currently open in
  // the Inspector, or `null` when the normal case body is showing. See this
  // file's own header comment for how it is reached and closed.
  const [inspectingRunId, setInspectingRunId] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const [runRequestPending, setRunRequestPending] = useState(false);
  const [runRequestError, setRunRequestError] = useState<string | null>(null);
  const [proposalReviewPending, setProposalReviewPending] = useState(false);
  const [proposalReviewError, setProposalReviewError] = useState<string | null>(null);
  const [dispositionPendingId, setDispositionPendingId] = useState<string | null>(null);
  const [dispositionError, setDispositionError] = useState<string | null>(null);

  const {
    snapshot,
    events,
    connectionState,
    error: streamError,
  } = useCaseEvents({ caseId: activeCaseId, ...apiConfig });

  const handleDemoStarted = useCallback((receipt: CommandReceipt) => {
    setActiveCaseId(receipt.caseId);
    setLastRunReceipt(null);
  }, []);

  // Installed Decision Pack catalog -- fetched once (independent of the
  // active case) and reused both for the `pax_list_packs` WebMCP tool and
  // `OptionComparison`'s pack presentation metadata. `GET /api/packs` has no
  // dedicated `PaxCommands` method (it is a read-only route, per
  // architecture.md's "HTTP service" list); a transient failure here
  // degrades gracefully -- `OptionComparison` falls back to one flat
  // attribute group and `pax_list_packs` simply reports zero installed
  // packs rather than blocking the rest of the workspace.
  useEffect(() => {
    let cancelled = false;
    const baseUrl = apiConfig.baseUrl ?? '';
    const fetchImpl = apiConfig.fetchImpl ?? fetch;
    fetchImpl(`${baseUrl}/api/packs`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error(`status ${response.status}`)),
      )
      .then((payload: unknown) => {
        if (cancelled) return;
        const parsed = InstalledPacksResponseSchema.safeParse(payload);
        if (parsed.success) setInstalledPacks(parsed.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiConfig]);

  // Reload-restore verification: a stored caseId is never trusted directly
  // (product.md "Canonical snapshots update only from committed case
  // events") -- it is confirmed against the real `GET /api/cases/:caseId`
  // route first. A case that no longer resolves (deleted, a stale id from a
  // previous server/data directory, ...) clears the stored pointer and
  // falls through to the plain launcher rather than leaving the workspace
  // stuck showing a perpetual loading state.
  useEffect(() => {
    if (restoringCaseId === null) return;
    let cancelled = false;
    const baseUrl = apiConfig.baseUrl ?? '';
    const fetchImpl = apiConfig.fetchImpl ?? fetch;
    fetchImpl(`${baseUrl}/api/cases/${encodeURIComponent(restoringCaseId)}`)
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setActiveCaseId(restoringCaseId);
        } else {
          clearStoredCaseId();
        }
        setRestoringCaseId(null);
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredCaseId();
        setRestoringCaseId(null);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately runs once per mount (`restoringCaseId`'s initial value is
    // only ever set once, from `readStoredCaseId()`) -- this effect's own
    // `setRestoringCaseId(null)` calls do not re-trigger it because they
    // move the value to `null`, which the guard above short-circuits on.
  }, [restoringCaseId, apiConfig]);

  // Persists the active case pointer (not its content -- see
  // `active-case-storage.ts`'s header comment) so the effect above can
  // restore it on a later reload. Also fires on a reset-demo/return-to-
  // launcher transition, correctly overwriting or clearing the stored
  // pointer.
  useEffect(() => {
    if (activeCaseId !== null) {
      writeStoredCaseId(activeCaseId);
    } else if (restoringCaseId === null) {
      // Only clears once restoration (if any) has settled -- clearing while
      // `restoringCaseId` is still non-null would erase the very pointer
      // the verification effect above is about to check.
      clearStoredCaseId();
    }
  }, [activeCaseId, restoringCaseId]);

  // WebMCP registration (webmcp.md "Registration lifecycle"): global read
  // tools register once per (adapter, commands) identity; `getActiveCase`/
  // `listPacks` read fresh values via refs on every call rather than
  // re-registering the two global tools on every snapshot/pack-list change.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const installedPacksRef = useRef(installedPacks);
  installedPacksRef.current = installedPacks;

  const [toolHandle, setToolHandle] = useState<PaxToolRegistrationHandle | null>(null);
  // A parallel ref, disposed directly from the cleanup function below rather
  // than through `setToolHandle`'s functional-updater form: React does not
  // guarantee a state updater callback passed to a setter invoked *during
  // unmount cleanup* actually runs (the fiber is being torn down, so there
  // is no next render to compute state for) -- relying on it here would
  // make `disposeAll()` unreliable on unmount specifically, exactly the
  // lifecycle moment webmcp.md's "Abort the previous registration
  // controller whenever ... the component unmounts" most needs to hold.
  const toolHandleRef = useRef<PaxToolRegistrationHandle | null>(null);

  useEffect(() => {
    let disposed = false;
    registerPaxTools({
      adapter: webMcpAdapter,
      commands,
      getActiveCase: () => snapshotRef.current,
      listPacks: () => installedPacksRef.current,
    })
      .then((handle) => {
        if (disposed) {
          handle.disposeAll();
          return;
        }
        toolHandleRef.current = handle;
        setToolHandle(handle);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      toolHandleRef.current?.disposeAll();
      toolHandleRef.current = null;
      setToolHandle(null);
    };
    // Deliberately depends only on [webMcpAdapter, commands], not
    // snapshot/installedPacks -- `getActiveCase`/`listPacks` read those
    // fresh via the refs above on every call instead of retriggering
    // registration on every snapshot/pack-list change.
  }, [webMcpAdapter, commands]);

  // Case-scoped tools re-register (aborting the previous generation) every
  // time the active case changes -- including a reset (a fresh caseId) or a
  // return to the launcher (`null`).
  useEffect(() => {
    toolHandle?.setActiveCase(activeCaseId).catch(() => undefined);
  }, [toolHandle, activeCaseId]);

  // Never leaves the Inspector open across a reset-demo/case change -- a
  // stale `runId` from a case that no longer applies would otherwise still
  // be showing when the new case's workspace renders.
  useEffect(() => {
    setInspectingRunId(null);
  }, [activeCaseId]);

  const readiness = useMemo(() => (snapshot ? evaluateReadiness(snapshot) : null), [snapshot]);

  // `lastRunReceipt` (session-local) takes priority once a real command has
  // been sent this browser lifetime; before that -- a fresh load or a
  // reload -- fall back to a receipt derived from the case's own replayed
  // history, so "Latest command" never contradicts the Readiness panel and
  // Activity log rendered right below it. See `deriveReceiptFromEvents`.
  //
  // Scoped to `activeCaseId` here, not just handed the raw `events` array:
  // on "Reset demo" (`handleResetDemo` below), `setActiveCaseId(newId)` and
  // `setLastRunReceipt(null)` can commit and render before `useCaseEvents`'s
  // own internal `events` state (keyed by `caseId`) has cleared for the
  // outgoing case, so for one frame `events` can still hold the *previous*
  // case's history. Filtering by each event's own `caseId` here (rather than
  // trusting the hook's timing) keeps the derived fallback from ever
  // reflecting a case other than the one currently active.
  const derivedRunReceipt = useMemo(
    () => deriveReceiptFromEvents(events.filter((event) => event.caseId === activeCaseId)),
    [events, activeCaseId],
  );
  const liveRunStatusReceipt = lastRunReceipt ?? derivedRunReceipt;

  const handleResetDemo = useCallback(() => {
    if (snapshot === null) return;
    const demoId = DEMO_IDS.find((id) => id === snapshot.pack.id);
    if (demoId === undefined) return;
    setResetPending(true);
    commands
      .startDemo({ demoId })
      .then((receipt) => {
        setResetPending(false);
        setActiveCaseId(receipt.caseId);
        setLastRunReceipt(null);
      })
      .catch(() => {
        setResetPending(false);
      });
  }, [commands, snapshot]);

  const handleRequestInvestigation = useCallback(
    (obligationId?: string) => {
      if (snapshot === null || activeCaseId === null) return;
      setRunRequestPending(true);
      setRunRequestError(null);

      // A conflict here (a stale `expectedSequence`) is a real, expected
      // occurrence of the real-time system, not just a test artifact: the
      // browser's own SSE-delivered snapshot can be one event behind the
      // server at the exact instant this control is pressed (e.g. right
      // after confirming a case-specific concern). architecture.md's
      // conflict envelope exists precisely so a caller can recover without
      // asking the human to do anything: "Conflicts return the latest
      // sequence so ChatGPT can call pax_get_case_context before retrying."
      // This performs that same recovery for the visible control -- one
      // automatic retry using the server-reported `actualSequence` -- before
      // ever surfacing an error to the human.
      const attempt = (expectedSequence: number, alreadyRetried: boolean): void => {
        commands
          .requestInvestigation({
            caseId: activeCaseId,
            expectedSequence,
            ...(obligationId !== undefined ? { obligationId } : {}),
          })
          .then((receipt) => {
            setRunRequestPending(false);
            setLastRunReceipt({ commandId: receipt.commandId, runId: receipt.runId });
          })
          .catch((caught: unknown) => {
            if (!alreadyRetried && caught instanceof PaxClientError && caught.code === 'CONFLICT') {
              const details = caught.details as { actualSequence?: unknown } | undefined;
              if (typeof details?.actualSequence === 'number') {
                attempt(details.actualSequence, true);
                return;
              }
            }
            setRunRequestPending(false);
            setRunRequestError(
              caught instanceof Error ? caught.message : 'Could not request an investigation.',
            );
          });
      };
      attempt(snapshot.eventSequence, false);
    },
    [commands, snapshot, activeCaseId],
  );

  const handleReviewProposal = useCallback(
    (review: ApprovalCardReview) => {
      if (!snapshot?.proposal || activeCaseId === null) return;
      setProposalReviewPending(true);
      setProposalReviewError(null);
      commands
        .reviewProposal({
          caseId: activeCaseId,
          proposalId: snapshot.proposal.id,
          actor: review.actor,
          decision: review.decision,
          expectedSequence: snapshot.eventSequence,
          ...(review.instructions !== undefined ? { instructions: review.instructions } : {}),
          ...(review.reason !== undefined ? { reason: review.reason } : {}),
        })
        .then(() => {
          setProposalReviewPending(false);
        })
        .catch((caught: unknown) => {
          setProposalReviewPending(false);
          setProposalReviewError(
            caught instanceof Error ? caught.message : 'Could not submit this review.',
          );
        });
    },
    [commands, snapshot, activeCaseId],
  );

  const handleSetDisposition = useCallback(
    (evidenceId: string, disposition: EvidenceDisposition, reason: string) => {
      if (snapshot === null || activeCaseId === null) return;
      setDispositionPendingId(evidenceId);
      setDispositionError(null);
      commands
        .setEvidenceDisposition({
          caseId: activeCaseId,
          evidenceId,
          disposition,
          reason,
          expectedSequence: snapshot.eventSequence,
        })
        .then(() => {
          setDispositionPendingId(null);
        })
        .catch((caught: unknown) => {
          setDispositionPendingId(null);
          setDispositionError(
            caught instanceof Error ? caught.message : 'Could not update this evidence item.',
          );
        });
    },
    [commands, snapshot, activeCaseId],
  );

  if (activeCaseId === null) {
    if (restoringCaseId !== null) {
      // Avoids a launcher-then-workspace flash while the reload-restore
      // verification effect above confirms the stored case still resolves.
      return (
        <div
          data-testid="case-workspace-restoring"
          aria-busy="true"
          aria-live="polite"
          className="mx-auto flex min-h-screen w-full max-w-[480px] items-center justify-center bg-background p-[var(--space-4)] text-[var(--color-ink-secondary)]"
        >
          Restoring your case…
        </div>
      );
    }
    return <DemoLauncher onDemoStarted={handleDemoStarted} />;
  }

  const activePack = installedPacks.find((pack) => pack.identity.id === snapshot?.pack.id) ?? null;
  const optionKind = activePack?.entities[0]?.id ?? 'option';
  const optionLabel = activePack?.presentation.optionLabel ?? 'option';
  const applicableKinds =
    activePack !== null ? activePack.entities.map((entity) => entity.id) : [optionKind];

  const evidenceItems = snapshot
    ? snapshot.evidenceLinks.map((link) => ({
        evidenceLink: link,
        claim:
          link.claimId !== undefined
            ? snapshot.claims.find((c) => c.id === link.claimId)
            : undefined,
        source:
          link.sourceId !== undefined
            ? snapshot.sources.find((s) => s.id === link.sourceId)
            : undefined,
      }))
    : null;

  const sources = snapshot ? Object.fromEntries(snapshot.sources.map((s) => [s.id, s])) : {};

  const pendingExtension =
    snapshot?.caseExtensions.find(
      (ext) =>
        ext.definition.origin === 'agent_proposed' && ext.definition.confirmation === 'pending',
    ) ?? null;

  const lastEvent = events.at(-1) ?? null;
  const withheld =
    snapshot !== null && snapshot.recommendation === null && lastEvent?.type === 'draft.withheld'
      ? { unresolvedRequiredCount: readiness?.blockers.length ?? 0 }
      : null;

  const activeFocus = snapshot?.activeFocus ?? null;
  const focusedObligation =
    activeFocus !== null
      ? (snapshot?.obligations.find((o) => o.id === activeFocus.obligationId) ?? null)
      : null;

  // Disclosure-row live summaries (ADR 0002: "nothing is hidden -- every
  // row's live state is visible without opening it"). Computed here, not
  // inside DisclosureSection or the wrapped child components, which stay
  // generic/unaware of their position in the workspace.
  const optionsCount = snapshot?.entities.length ?? 0;
  const evidenceCount = evidenceItems?.length ?? 0;
  const remainingObligationCount =
    readiness !== null
      ? readiness.active.length + readiness.blocked.length + readiness.open.length
      : 0;
  const stillCheckingMeta =
    readiness === null
      ? undefined
      : readiness.ready
        ? 'All checked'
        : `${remainingObligationCount} still open`;
  const isRunActive =
    lastEvent !== null &&
    (lastEvent.phase === 'active' || lastEvent.phase === 'queued' || lastEvent.phase === 'waiting');
  const workSoFarLive = runRequestPending || isRunActive;
  const addConcernMeta = pendingExtension !== null ? '1 needs your review' : undefined;

  return (
    <div
      data-testid="case-workspace"
      className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-[var(--space-4)] p-[var(--space-4)]"
    >
      {snapshot ? (
        <CaseHeader
          title={snapshot.title}
          pack={snapshot.pack}
          status={snapshot.status}
          connectionState={mapConnectionState(connectionState)}
          onResetDemo={handleResetDemo}
          resetPending={resetPending}
        />
      ) : (
        <div
          data-testid="case-workspace-loading"
          aria-busy="true"
          aria-live="polite"
          className="flex items-center justify-center rounded-[var(--radius-md)] bg-card p-[var(--space-4)] text-[var(--color-ink-secondary)]"
        >
          Loading case…
        </div>
      )}

      {inspectingRunId !== null ? (
        <RuntimeInspector
          runId={inspectingRunId}
          onClose={() => setInspectingRunId(null)}
          apiConfig={apiConfig}
        />
      ) : (
        <>
          <WebMcpStatus adapter={webMcpAdapter} />

          {streamError ? <ErrorState message={streamError} /> : null}

          <section
            data-testid="current-focus"
            aria-labelledby="current-focus-heading"
            className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-card p-[var(--space-4)]"
          >
            <h2 id="current-focus-heading">What Pax is doing</h2>
            {activeFocus !== null ? (
              <div
                data-testid="current-focus-detail"
                className="flex flex-col gap-[var(--space-1)]"
              >
                <p
                  data-testid="current-focus-obligation"
                  className="font-[var(--font-weight-semibold)] text-[var(--color-ink)]"
                >
                  {focusedObligation?.label ?? activeFocus.obligationId}
                </p>
                <p
                  data-testid="current-focus-reason"
                  className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
                >
                  {activeFocus.reason}
                </p>
                <div className="flex flex-wrap gap-[var(--space-2)] text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]">
                  {activeFocus.skillId !== undefined ? (
                    <span data-testid="current-focus-skill">Skill: {activeFocus.skillId}</span>
                  ) : null}
                  {activeFocus.specialistId !== undefined ? (
                    <span data-testid="current-focus-specialist">
                      Specialist: {activeFocus.specialistId}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <p
                data-testid="current-focus-empty"
                className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
              >
                Nothing is being actively investigated right now.
              </p>
            )}

            <Button
              type="button"
              data-testid="request-investigation"
              aria-busy={runRequestPending}
              disabled={runRequestPending || snapshot === null}
              onClick={() => {
                handleRequestInvestigation();
              }}
              size="sm"
              className="min-h-[var(--size-touch-target-min)] self-start"
            >
              {runRequestPending ? 'Requesting…' : 'Request investigation'}
            </Button>

            {runRequestError ? (
              <p
                role="alert"
                data-testid="request-investigation-error"
                className="text-[length:var(--font-size-sm)]"
                style={{ color: 'var(--color-status-error-ink)' }}
              >
                {runRequestError}
              </p>
            ) : null}

            <LiveRunStatus receipt={liveRunStatusReceipt} events={events} />

            {liveRunStatusReceipt?.runId !== undefined ? (
              <Button
                type="button"
                data-testid="open-runtime-inspector"
                onClick={() => setInspectingRunId(liveRunStatusReceipt.runId!)}
                variant="secondary"
                size="sm"
                className="min-h-[var(--size-touch-target-min)] self-start"
              >
                Inspect run
              </Button>
            ) : null}
          </section>

          {/* Region 3, "Our pick" (ADR 0002): the recommendation and the
              human decision controls, grouped as one always-visible hero
              directly below "What Pax is doing" -- the first substantial
              content a user reaches, deliberately never a disclosure row. */}
          <div data-testid="recommendation-hero" className="flex flex-col gap-[var(--space-3)]">
            <RecommendationCard
              recommendation={snapshot?.recommendation ?? null}
              withheld={withheld}
              loading={snapshot === null}
              sources={sources}
            />

            <ApprovalCard
              proposal={snapshot?.proposal ?? null}
              onReview={handleReviewProposal}
              reviewPending={proposalReviewPending}
              error={proposalReviewError}
            />
          </div>

          <DisclosureSection
            testId="compare"
            title="Compare the options"
            meta={`${optionsCount} option${optionsCount === 1 ? '' : 's'}`}
          >
            <OptionEditor
              caseId={activeCaseId}
              expectedSequence={snapshot?.eventSequence ?? 0}
              optionKind={optionKind}
              optionLabel={optionLabel}
              attributeDefinitions={snapshot?.attributeDefinitions ?? []}
              options={snapshot?.entities ?? []}
            />

            <OptionComparison
              options={snapshot?.entities ?? []}
              attributeDefinitions={snapshot?.attributeDefinitions ?? []}
              presentation={activePack?.presentation ?? null}
              selectedOptionId={snapshot?.selectedOptionId ?? null}
            />
          </DisclosureSection>

          <DisclosureSection
            testId="findings"
            title="What Pax found"
            meta={`${evidenceCount} finding${evidenceCount === 1 ? '' : 's'}`}
          >
            <EvidenceList
              items={evidenceItems}
              loading={snapshot === null}
              error={dispositionError}
              onSetDisposition={handleSetDisposition}
              dispositionPendingId={dispositionPendingId}
            />
          </DisclosureSection>

          <DisclosureSection
            testId="still-checking"
            title="Still checking"
            meta={stillCheckingMeta}
          >
            <ReadinessPanel readiness={readiness} loading={snapshot === null} />
          </DisclosureSection>

          <DisclosureSection
            testId="work-so-far"
            title="Pax's work so far"
            meta={`${events.length} step${events.length === 1 ? '' : 's'}`}
            live={workSoFarLive}
          >
            <ActivityTimeline
              events={snapshot === null ? null : events}
              loading={snapshot === null}
              onInspectRun={setInspectingRunId}
            />
          </DisclosureSection>

          <DisclosureSection
            testId="add-concern"
            title="Add something Pax should check"
            meta={addConcernMeta}
            defaultOpen={pendingExtension !== null}
          >
            <CustomConcernForm
              caseId={activeCaseId}
              expectedSequence={snapshot?.eventSequence ?? 0}
              applicableKinds={applicableKinds}
            />

            <CaseExtensionReviewCard
              caseId={activeCaseId}
              expectedSequence={snapshot?.eventSequence ?? 0}
              extension={pendingExtension}
            />
          </DisclosureSection>
        </>
      )}
    </div>
  );
}
