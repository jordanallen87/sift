/**
 * The route-free launcher/workspace shell (locked file map:
 * `apps/web/src/app/App.tsx  Route-free launcher/workspace shell`).
 *
 * product.md's "Primary experience" describes one page, not a multi-page
 * site: "The page contains a seeded demo launcher and the active case
 * workspace." There is no router -- `App` is a plain state machine. While
 * `activeCaseId === null`, `launcherMode` picks between `DemoLauncher`
 * (`startDemo`/two example cases) and `VehicleCatalogFlow`
 * (`startCase` + `upsertOption`, docs/decisions/0003-vehicle-catalog-and-
 * normal-case-creation.md's "Compare vehicles" primary entry point); either
 * one calling back with a real receipt sets `activeCaseId` and renders the
 * live case workspace below.
 *
 * The workspace is wired to real data: `useCaseEvents` (the real SSE/poll-
 * fallback subscription) supplies the canonical `CaseState` snapshot and
 * ordered `PublicActivityEvent[]` every region below renders from;
 * `registerSiftTools` mounts the full WebMCP catalog only while a case is
 * active, re-registering its case-scoped tools whenever the active case
 * changes; every visible control calls through the one shared
 * `SiftCommands` instance from `useSiftCommands()` -- there is no parallel
 * mutation path (CLAUDE.md "Visible UI controls and WebMCP callbacks use
 * the same command implementation").
 *
 * REGION ORDER (rewritten this task per `docs/decisions/
 * 0004-consumer-workspace-information-architecture.md`, replacing the
 * eleven-region stack `docs/audits/2026-08-30-generic-decision-workspace-
 * audit.md` §1-§2 measured at 2040px tall with the answer starting below
 * the fold at 430px):
 *
 *  1. `CaseHeader` -- title, live connection status, reset, and (Task A5)
 *     a small "Developer view" control. No Decision Pack badge/id/hash, no
 *     pack-selection sentence (ADR 0004 item 1/3; those move to developer
 *     detail -- now a real, explicit, discoverable entry point rather than
 *     detail with no way in, see the Runtime Inspector paragraph below).
 *  2. `WebMcpStatus` -- unchanged, already a single quiet line (audit §5:
 *     "already matches §45's 'keep subtle'").
 *  3. `ErrorState` -- only while the live stream has actually errored.
 *  4. `RecommendationHero` -- the answer-first hero (ADR 0004 item 1): one
 *     region, one state machine (`workspace-status.ts`'s extended
 *     `deriveWorkspaceStatus`), merging what used to be three separate,
 *     occasionally-contradicting regions (the retired `WorkspaceStatusHeader`
 *     tracker/banner, `RecommendationCard`, `ApprovalCard`). This is
 *     deliberately the first substantial content below the header --
 *     verified directly by this task's own DOM-order test, and every region
 *     below it (including the two added since, item 6a and the developer
 *     view) stays below it too, by construction of DOM order.
 *  5. "Manage options" -- a closed-by-default `DisclosureSection` wrapping
 *     `OptionEditor` (add/edit candidates), with a live option count.
 *     Kept as its own disclosure, separate from viewing/comparing them,
 *     since ADR 0005 elevates comparison itself to a top-level primary
 *     surface (next).
 *  6. `WorkspaceViewSwitcher` -- the primary workspace view switcher (ADR
 *     0004 item 5; change-set §6, §8-§13): Quick Pick / List / Compare /
 *     Board tabs. Always expanded, never a disclosure row -- this is the
 *     region ADR 0005 elevates to replace `OptionComparison`'s old
 *     unconditional table, which this file no longer renders at all. Its
 *     `mode` derives from the persisted `CaseState.view` (Task A11 -- see
 *     that state's own header comment further below), not an independent
 *     local default.
 *  6a. "What you're looking for" (`DecisionProfileView`, change-set §15/16)
 *      -- a closed-by-default `DisclosureSection` wrapping a PURE
 *      projection of already-canonical case state (`deriveDecisionProfile`,
 *      no new stored state). Mounted and exported for the first time this
 *      task (a separate spec-audit finding: the component was fully built
 *      and fully tested but never reachable in the shipped product,
 *      matching this task's own A11-shaped "each half is individually
 *      correct" defect class). Absent entirely, not merely empty, when the
 *      derived profile has nothing to show (global constraint 4) -- gated
 *      here at the orchestration level, the same pattern this file already
 *      uses for `CaseExtensionReviewCard` below.
 *  6b. "Notes" (`CaseNotes`, change-set §28/§63) -- NOT a `DisclosureSection`;
 *      the component renders `null` itself when `CaseState.notes` is empty
 *      (global constraint 4), so no wrapping/gating is needed at this call
 *      site the way region 6a needs it. A note is real content but
 *      deliberately not evidence (`CaseNoteSchema`'s own doc comment); this
 *      region only displays what already exists -- adding a note today goes
 *      through the `sift_add_note` WebMCP tool (`register-sift-tools.ts`),
 *      this task's own scoped write path, not a form mounted here.
 *  7. "What Sift found" -- a `DisclosureSection` trigger opening
 *     `FindingsSheet` (unchanged from the prior design).
 *  8. "Still checking" -- a closed-by-default `DisclosureSection` wrapping
 *     `ReadinessPanel`.
 *  9. "Add something Sift should check" -- a `DisclosureSection` (opens
 *     itself only while an agent-proposed extension awaits confirmation)
 *     wrapping `CustomConcernForm` and, only when one is actually pending,
 *     `CaseExtensionReviewCard` (ADR 0004 item 2: an empty conceptual
 *     region must be absent, not a card announcing its own emptiness --
 *     applied here at the orchestration level rather than editing that
 *     component's own internals).
 *
 * Retired from this file entirely, per ADR 0004:
 *  - `WorkspaceStatusHeader` (the four-stage tracker + next-step banner) --
 *    folded into `RecommendationHero`/`workspace-status.ts`.
 *  - The "What Sift is doing" / `activeFocus` current-focus card (item 7 of
 *    this task's brief; ADR 0004 decision item 5). `CaseState.activeFocus`
 *    is written only as `null` by every production code path (`create-
 *    case.ts`, `reducer.ts`) -- this file's old rendering of it was
 *    unreachable dead code whose only visible branch was a permanently-true
 *    "Nothing is being actively investigated right now." Deleted outright,
 *    not replaced with a fabricated substitute: nothing may render from
 *    `activeFocus` again until a real production writer exists for it.
 *  - "Sift's work so far" (`ActivityTimeline`, the raw chronological
 *    activity ledger) as an unconditional consumer-surface region -- ADR
 *    0004 item 3/4 moves it to developer content. It still exists and still
 *    renders real data, just not here: it is the Runtime Inspector's own
 *    Activity tab now (Task A5/I2b, see below), fed `caseScopedActivityEvents`.
 *
 * The Runtime Inspector is a Sheet overlay, not a route/full-body swap:
 * `RuntimeInspector` renders as a sibling of the normal workspace (mounted
 * only while `runtimeInspectorOpen` is true) rather than replacing it, so
 * the case body stays visible underneath. Task A5 gives it a real,
 * explicit, discoverable entry point that needs no prior activity to reach
 * (`CaseHeader`'s "Developer view" control, `handleOpenDeveloperView`) --
 * before this task, the ONLY way in was the run-scoped "Inspect run"
 * control (`RecommendationHero`/`LiveRunStatus`, still present and
 * unchanged), which stays hidden until a run has actually happened this
 * session. It is extended, not duplicated (§34): `runId` can now be `null`
 * (opened generally) as well as a specific run, and its new Activity tab
 * reuses `ActivityTimeline` itself, not a second ledger. Task I2b threads
 * the missing trigger half of I2 ("a consumer event opens its exact runtime
 * event") all the way through: `ActivityTimeline`'s own "Inspect event"
 * button (rendered only when an item carries a `debugEventId`) calls
 * `handleInspectEvent`, which re-targets the same open Inspector to that
 * event's exact Timeline entry via `focusEventId`.
 *
 * `readiness` is computed by calling the REAL `evaluateReadiness` from
 * `@sift/core` directly. This app never re-implements readiness, satisfying
 * CLAUDE.md's "The deterministic core, not an LLM, owns ... readiness."
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
  type WorkspaceViewMode,
  type WorkspaceViewState,
} from '@sift/contracts';
import { evaluateReadiness } from '@sift/core';
import { SiftClientError } from '../api/sift-client.js';
import { readStoredCaseId, writeStoredCaseId, clearStoredCaseId } from './active-case-storage.js';
import { DemoLauncher } from '../components/DemoLauncher.js';
import { VehicleCatalogFlow } from '../components/VehicleCatalogFlow.js';
import { CaseHeader, type CaseHeaderConnectionState } from '../components/CaseHeader.js';
import { DisclosureSection } from '../components/DisclosureSection.js';
import { RecommendationHero } from '../components/RecommendationHero.js';
import type { ApprovalCardReview } from '../components/ApprovalCard.js';
import { deriveWorkspaceStatus } from '../components/workspace-status.js';
import { ReadinessPanel } from '../components/ReadinessPanel.js';
import { FindingsSheet } from '../components/FindingsSheet.js';
import { OptionEditor } from '../components/OptionEditor.js';
import { WorkspaceViewSwitcher } from '../components/WorkspaceViewSwitcher.js';
import { DecisionProfileView } from '../components/DecisionProfileView.js';
import { deriveDecisionProfile } from '../components/decision-profile.js';
import { CaseNotes } from '../components/CaseNotes.js';
import { CustomConcernForm } from '../components/CustomConcernForm.js';
import { CaseExtensionReviewCard } from '../components/CaseExtensionReviewCard.js';
import type { LiveRunStatusReceipt } from '../components/LiveRunStatus.js';
import { WebMcpStatus } from '../components/WebMcpStatus.js';
import { ErrorState } from '../components/ErrorState.js';
import { RuntimeInspector } from '../components/RuntimeInspector.js';
import { useApiConfig, useSiftCommands, useWebMcpAdapter } from './AppProviders.js';
import { useCaseEvents, type CaseEventsConnectionState } from '../hooks/use-case-events.js';
import {
  registerSiftTools,
  type SiftToolRegistrationHandle,
} from '../model-context/register-sift-tools.js';

// Matches the real server contract exactly (`apps/agent/src/routes/packs.ts`
// `ListPacksResponseSchema`: `{ packs: CompiledDecisionPack[] }`, a `.strict()`
// wrapper object, never a bare array). A prior version of this schema was a
// bare `z.array(CompiledDecisionPackSchema)` -- a genuine, silent client/
// server contract mismatch (confirmed directly against the real running
// app): `safeParse` on the real `{ packs: [...] }` payload always failed,
// and the failure was swallowed by this fetch's own deliberately-lenient
// `if (parsed.success) setInstalledPacks(...)` degrade-gracefully path (see
// that effect's own comment below), so `installedPacks` silently stayed `[]`
// forever in every real (non-test) session -- `activePack` was always
// `null`, the Compare view (`OptionComparison` at the time; superseded by
// `WorkspaceViewSwitcher`/`OptionCompareView`, see this file's own header
// comment) always fell back to one ungrouped "All attributes" row instead
// of the pack's real named groups, and `OptionEditor`'s `optionKind`/
// `optionLabel` always fell back to the
// generic `'option'` default, which matches none of `car-purchase`'s
// declared attributes' `appliesTo: ['candidate']` -- so the manual
// candidate-entry form (product.md "Explicit scope cuts": "users may
// manually enter up to five car candidates ... ") silently rendered zero
// attribute fields for every real user. Caught by
// `vehicle-catalog-journey.spec.ts` (this task), which is the first
// Playwright spec to actually open `OptionEditor`'s attribute fields against
// the real server rather than a component test's own hand-built props or a
// (also incorrectly bare-array) mocked `/api/packs` MSW handler.
const InstalledPacksResponseSchema = z
  .object({ packs: z.array(CompiledDecisionPackSchema) })
  .strict();

/**
 * Reconstructs a fallback `LiveRunStatusReceipt` from replayed
 * `PublicActivityEvent`s, for the moment before any command has been sent
 * *this browser lifetime* -- a fresh page load or hard reload. Without
 * this, `lastRunReceipt` (session-local `useState`, only ever set inside a
 * live command's own promise-resolution handlers) naturally starts `null`
 * and stays `null` regardless of how much real history the case actually
 * has, even though `events` already carries that full replayed history and
 * is what Readiness correctly derives its own post-reload state from --
 * producing a hero that looks like nothing has ever happened directly
 * above a Readiness panel that correctly shows a fully decided case.
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
 *
 * Task A9 (`docs/superpowers/plans/2026-08-30-generic-decision-workspace.md`
 * Phase A): the commandId-only fallback above must NOT surface fixture/demo
 * seeding as if it were a real completed command the human asked for. Live
 * inspection at 430px caught the hero rendering "Nothing's been looked into
 * yet." directly above a "completed" status block reading `Added option
 * "2022 Subaru Outback Premium AWD"` -- individually true, contradictory
 * together. Root cause, confirmed directly in `apps/agent/src/services/
 * command-service.ts`'s `startDemo`/`startCase`: case creation AND every
 * seeded entity are appended under ONE shared `commandId` (the case's own
 * `case.created` event, always the earliest event with a `commandId`), and
 * none of it carries a `runId` -- seeding is not an investigation run. So
 * when the most recent commandId-only event's id still matches that very
 * first (case-creation) commandId, nothing beyond fixture/demo seeding has
 * ever happened in this case, and this function returns `null` instead --
 * exactly the same "nothing real to show" answer the hero's own headline
 * gives. A real, distinct command the user issues afterward (e.g. manually
 * adding an option before ever requesting an investigation) carries its own,
 * different `commandId` and is unaffected by this check.
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

  const creationCommandId = bySequence.find((event) => event.commandId !== undefined)?.commandId;

  for (let i = bySequence.length - 1; i >= 0; i -= 1) {
    const commandId = bySequence[i]?.commandId;
    if (commandId !== undefined) {
      if (commandId === creationCommandId) return null;
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
  const commands = useSiftCommands();
  const apiConfig = useApiConfig();
  const webMcpAdapter = useWebMcpAdapter();

  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  // Pre-case launcher mode (docs/decisions/0003-vehicle-catalog-and-normal-
  // case-creation.md): only meaningful while `activeCaseId === null`. Starts
  // on the plain launcher; "Compare vehicles" switches to the catalog/
  // shortlist flow without creating anything yet.
  const [launcherMode, setLauncherMode] = useState<'launcher' | 'catalog'>('launcher');
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
  // Runtime Inspector (Task A5 extends this beyond the pre-existing
  // run-scoped "Inspect run" trigger): `runtimeInspectorOpen` is the single
  // mount gate -- true whenever the Sheet should be showing at all, whether
  // opened generally (`CaseHeader`'s "Developer view" control, no run in
  // hand) or scoped to a specific run/event. `inspectingRunId` is `null`
  // for the general case, matching `RuntimeInspector`'s own now-nullable
  // `runId` prop. `inspectingDebugEventId` is the exact correlated runtime
  // event to jump straight to (Task I2b's "Inspect event" trigger,
  // `RuntimeInspector`'s `focusEventId` prop) -- `undefined` for every
  // other entry point.
  const [runtimeInspectorOpen, setRuntimeInspectorOpen] = useState(false);
  const [inspectingRunId, setInspectingRunId] = useState<string | null>(null);
  const [inspectingDebugEventId, setInspectingDebugEventId] = useState<string | undefined>(
    undefined,
  );
  const [findingsSheetOpen, setFindingsSheetOpen] = useState(false);
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

  // Primary workspace view switcher state (ADR 0004 item 5; ADR 0005;
  // Task A11). `CommandService.setView` (`apps/agent/src/services/
  // command-service.ts`) now genuinely persists `WorkspaceViewState`
  // through `updateSelection()`, so `CaseState.view` is a real, durable
  // source of truth once anything has set it -- and this file must derive
  // its rendered view from that field rather than from an independent
  // local `useState`, or the two silently disagree (global constraint 5:
  // "consumer and developer views are two projections of the same events,
  // never two sources of truth"; the same principle applies to the two
  // *directions* a single view can be set from). Before this task, `App`
  // held `viewMode` purely as local state -- individually correct (it drove
  // real UI), and the backend command was also individually correct (it
  // genuinely persisted), but together they meant a `sift_set_view` WebMCP
  // call could report success while the open page never moved.
  //
  // `snapshot?.view?.mode` (both `.optional()` and `.nullable()` on
  // `CaseState.view` -- see `packages/contracts/src/case.ts`) is therefore
  // the primary source once a case has ever had a view set; a case that has
  // never set one has no `view` at all, and `'quick_pick'` remains the
  // correct fallback default (Task A10, change-set §64 "reduce apparent
  // complexity" -- see that task's own reasoning, preserved below).
  // `optimisticViewMode` gives a user-initiated tap on the tab strip
  // immediate visual feedback without waiting on a round trip; the
  // reconciliation effect below clears it the moment the persisted value
  // actually catches up, so it never becomes a second permanent source of
  // truth (the brief's own explicit "optimistic local update reconciled
  // against the persisted value is fine; two permanently independent
  // states are not").
  //
  // `handleViewModeChange` below writes through the real `setView` command
  // (`commands.setView`, `SiftCommands` / `apps/web/src/api/sift-client.ts`)
  // -- the exact same command implementation a `sift_set_view` WebMCP call
  // reaches once that tool is wired to it too, rather than its own
  // in-memory-only session state (see `register-sift-tools.ts`'s own header
  // comment for that separate, not-yet-closed gap, which is outside this
  // file's ownership). It sends the FULL `WorkspaceViewState` the command
  // contract requires (`SetViewInput.view` is the complete object, not a
  // partial patch -- matching how `CaseState.view` itself is stored),
  // spreading the currently-persisted view first so a plain mode change
  // never clobbers other view fields (e.g. a Compare configuration a
  // WebMCP `sift_configure_comparison` call previously set). A failed write
  // is a fire-and-forget miss, matching `handleFocusOption` immediately
  // below: ADR 0005 designed presentation commands to be "safe to be called
  // freely and repeatedly without human confirmation," so this does not
  // earn its own blocking error UI the way a decision-mutating command
  // does; the optimistic override above simply stays in effect until this
  // file's own case-scoped remount (`key={activeCaseId}`, further below).
  //
  // Defaults to `'quick_pick'`, not `'compare'` (Task A10, change-set §64
  // "reduce apparent complexity"): the regenerated 390px baseline measured
  // ~3379px tall, and the always-fully-expanded Compare attribute table --
  // rendered unconditionally as *the default view a freshly opened case
  // shows* -- was the single largest contributor. Quick Pick renders one
  // option at a time, which is both a legitimate first-class triage view in
  // its own right (ADR 0005) and, as a side effect, the shortest of the
  // four. Nothing becomes unreachable: every view, including Compare, is
  // still exactly one tap away on the always-visible tab strip immediately
  // below the hero (`WorkspaceViewSwitcher`'s own contract never hides a
  // tab). Collapsing Compare's own attribute groups by default was the
  // other legitimate option per this task's brief; defaulting away from
  // Compare was chosen instead because it fixes the actual measured
  // regression (the *default* first-paint height) without adding new
  // accordion/expand-collapse interaction surface to a view that, once a
  // user deliberately chooses it, is reasonably expected to show everything.
  const persistedViewMode = snapshot?.view?.mode;
  const [optimisticViewMode, setOptimisticViewMode] = useState<WorkspaceViewMode | null>(null);
  const viewMode = optimisticViewMode ?? persistedViewMode ?? 'quick_pick';

  // Reconciliation: once the persisted value actually catches up with an
  // optimistic override, drop the override so the persisted field resumes
  // being the sole authority (able to reflect a later externally-driven
  // change, e.g. a real WebMCP `sift_set_view` call once that tool writes
  // through the real command instead of its own session-local state).
  useEffect(() => {
    if (optimisticViewMode !== null && persistedViewMode === optimisticViewMode) {
      setOptimisticViewMode(null);
    }
  }, [persistedViewMode, optimisticViewMode]);

  const handleViewModeChange = useCallback(
    (mode: WorkspaceViewMode) => {
      setOptimisticViewMode(mode);
      if (snapshot === null || activeCaseId === null) return;
      const view: WorkspaceViewState = { ...(snapshot.view ?? {}), mode };
      commands
        .setView({ caseId: activeCaseId, expectedSequence: snapshot.eventSequence, view })
        .catch(() => undefined);
    },
    [commands, snapshot, activeCaseId],
  );
  // Quick Pick's queue position over `snapshot.entities`, in the same
  // session-local spirit as `viewMode` above (`WorkspaceViewState.quickPick`
  // has no real writer yet either).
  const [quickPickPosition, setQuickPickPosition] = useState(0);
  // Board placement, session-local for the same disclosed reason as
  // `viewMode` above: `WorkspaceViewState.board` exists in the contract but
  // has no command that writes it yet. Deliberately NOT derived from case
  // state -- where an option sits on the board is the user's working
  // arrangement, not a verdict the engine has reached about it
  // (change-set §12), so it must never be inferred from readiness or
  // recommendation status.
  const [boardPlacement, setBoardPlacement] = useState<Record<string, string>>({});
  const handleMoveOption = useCallback((optionId: string, toColumnId: string) => {
    setBoardPlacement((prev) => ({ ...prev, [optionId]: toColumnId }));
  }, []);

  const handleDemoStarted = useCallback((receipt: CommandReceipt) => {
    setActiveCaseId(receipt.caseId);
    setLastRunReceipt(null);
  }, []);

  const handleCaseCreated = useCallback((receipt: CommandReceipt) => {
    setActiveCaseId(receipt.caseId);
    setLastRunReceipt(null);
    setLauncherMode('launcher');
  }, []);

  // Installed Decision Pack catalog -- fetched once (independent of the
  // active case) and reused both for the `sift_list_packs` WebMCP tool and
  // `WorkspaceViewSwitcher`'s pack presentation metadata. `GET /api/packs`
  // has no dedicated `SiftCommands` method (it is a read-only route, per
  // architecture.md's "HTTP service" list); a transient failure here
  // degrades gracefully -- the comparison view falls back to one flat
  // attribute group and `sift_list_packs` simply reports zero installed
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
        if (parsed.success) setInstalledPacks(parsed.data.packs);
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

  const [toolHandle, setToolHandle] = useState<SiftToolRegistrationHandle | null>(null);
  // A parallel ref, disposed directly from the cleanup function below rather
  // than through `setToolHandle`'s functional-updater form: React does not
  // guarantee a state updater callback passed to a setter invoked *during
  // unmount cleanup* actually runs (the fiber is being torn down, so there
  // is no next render to compute state for) -- relying on it here would
  // make `disposeAll()` unreliable on unmount specifically, exactly the
  // lifecycle moment webmcp.md's "Abort the previous registration
  // controller whenever ... the component unmounts" most needs to hold.
  const toolHandleRef = useRef<SiftToolRegistrationHandle | null>(null);

  useEffect(() => {
    let disposed = false;
    registerSiftTools({
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
  // stale `runId`/`debugEventId` from a case that no longer applies would
  // otherwise still be showing when the new case's workspace renders.
  useEffect(() => {
    setRuntimeInspectorOpen(false);
    setInspectingRunId(null);
    setInspectingDebugEventId(undefined);
  }, [activeCaseId]);

  // Runtime Inspector open/close/navigate handlers (Task A5 / I2b). Every
  // entry point funnels through these three so `runtimeInspectorOpen`/
  // `inspectingRunId`/`inspectingDebugEventId` never drift out of sync with
  // each other.
  const handleOpenDeveloperView = useCallback(() => {
    setInspectingRunId(null);
    setInspectingDebugEventId(undefined);
    setRuntimeInspectorOpen(true);
  }, []);

  const handleInspectRun = useCallback((runId: string) => {
    setInspectingRunId(runId);
    setInspectingDebugEventId(undefined);
    setRuntimeInspectorOpen(true);
  }, []);

  // Task I2b's trigger: opens (or re-targets an already-open) Inspector to
  // the exact runtime event correlated with a consumer activity item.
  const handleInspectEvent = useCallback((runId: string, debugEventId: string) => {
    setInspectingRunId(runId);
    setInspectingDebugEventId(debugEventId);
    setRuntimeInspectorOpen(true);
  }, []);

  const handleCloseRuntimeInspector = useCallback(() => {
    setRuntimeInspectorOpen(false);
    setInspectingRunId(null);
    setInspectingDebugEventId(undefined);
  }, []);

  const readiness = useMemo(() => (snapshot ? evaluateReadiness(snapshot) : null), [snapshot]);

  // `lastRunReceipt` (session-local) takes priority once a real command has
  // been sent this browser lifetime; before that -- a fresh load or a
  // reload -- fall back to a receipt derived from the case's own replayed
  // history. See `deriveReceiptFromEvents`.
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

  // The Runtime Inspector's Activity tab (Task A5: "the activity ledger
  // moves here") gets the same case-scoped filter `derivedRunReceipt`
  // above uses, for the identical reason: on a case switch, `events` can
  // briefly still hold the outgoing case's history for one frame.
  const caseScopedActivityEvents = useMemo(
    () => events.filter((event) => event.caseId === activeCaseId),
    [events, activeCaseId],
  );

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
      // sequence so ChatGPT can call sift_get_case_context before retrying."
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
            if (
              !alreadyRetried &&
              caught instanceof SiftClientError &&
              caught.code === 'CONFLICT'
            ) {
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

  // Real WebMCP-parity focus wiring (change-set §30 "WebMCP should control
  // focus"): the same `focusOption` command a `sift_focus_option` tool call
  // uses (CLAUDE.md "Visible UI controls and WebMCP callbacks use the same
  // command implementation"). Deliberately fire-and-forget with no pending/
  // error UI state of its own: ADR 0005 designed `focusOption` to route
  // through `updateSelection()` specifically so a presentation-only action
  // like this is "safe to be called freely and repeatedly without human
  // confirmation" (ADR 0005 consequences) -- a dropped click here is a
  // missed visual focus update, not a lost decision, so it does not earn a
  // new blocking error surface the way `requestInvestigation`/
  // `reviewProposal`/`setEvidenceDisposition` do.
  const handleFocusOption = useCallback(
    (optionId: string) => {
      if (snapshot === null || activeCaseId === null) return;
      commands
        .focusOption({ caseId: activeCaseId, optionId, expectedSequence: snapshot.eventSequence })
        .catch(() => undefined);
    },
    [commands, snapshot, activeCaseId],
  );

  const handleQuickPickAdvance = useCallback(() => {
    setQuickPickPosition((position) => position + 1);
  }, []);

  const handleQuickPickShortlist = useCallback(
    (optionId: string) => {
      handleFocusOption(optionId);
      handleQuickPickAdvance();
    },
    [handleFocusOption, handleQuickPickAdvance],
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
          className="loading-pulse mx-auto flex min-h-screen w-full max-w-[480px] items-center justify-center bg-background p-[var(--space-4)] text-[var(--color-ink-secondary)]"
        >
          Restoring your case…
        </div>
      );
    }
    if (launcherMode === 'catalog') {
      return (
        <VehicleCatalogFlow
          onCaseCreated={handleCaseCreated}
          onCancel={() => setLauncherMode('launcher')}
        />
      );
    }
    return (
      <DemoLauncher
        onDemoStarted={handleDemoStarted}
        onCompareVehicles={() => setLauncherMode('catalog')}
      />
    );
  }

  const activePack = installedPacks.find((pack) => pack.identity.id === snapshot?.pack.id) ?? null;
  const optionKind = activePack?.entities[0]?.id ?? 'option';
  const optionLabel = activePack?.presentation.optionLabel ?? 'option';
  const applicableKinds =
    activePack !== null ? activePack.entities.map((entity) => entity.id) : [optionKind];

  // Decision Profile ("What you're looking for," change-set §15/§16;
  // spec-audit finding, addressed this task): a PURE projection of already-
  // canonical case state -- `deriveDecisionProfile` reads only
  // `snapshot.criteria`/`attributeDefinitions`/`caseExtensions`; nothing new
  // is stored, satisfying §15's explicit "not a second source of truth."
  // `activePack?.decisionGuide` (`CompiledDecisionPack.decisionGuide`,
  // packs.ts) supplies the real pack-authored guidance that populates
  // `suggestedQuestions`' `pack_guide` source -- both hero packs now declare
  // one, and it is genuinely reachable here via the same `activePack`
  // resolution every other pack-driven region on this page already uses, so
  // this is wired for real rather than reported as a gap. `DecisionProfileView`
  // itself is untouched (owned by another task) -- gating an empty profile
  // out of the DOM entirely happens here, at the orchestration level, the
  // same pattern this file already uses for `CaseExtensionReviewCard` (ADR
  // 0004 item 2: an empty conceptual region must be absent, not a card
  // announcing its own emptiness -- `DecisionProfileView`'s own internal
  // empty-state copy exists for a caller that has a real reason to show it
  // regardless, which this orchestration is not).
  //
  // Personal concerns render read-only here (`onConfirmConcern`/
  // `onRejectConcern` both omitted): `CaseExtensionReviewCard`, already
  // wired above (further below in this file) for the one currently-pending
  // agent-proposed extension, is the existing, tested review surface for
  // exactly this action. Wiring a SECOND independent confirm/reject control
  // here, over the same underlying `CaseExtension` records, would risk two
  // controls racing each other over one review decision for no requirement
  // this task names -- a deliberate, disclosed scope limit, not an
  // oversight (see this task's report).
  const decisionProfile = snapshot
    ? deriveDecisionProfile(snapshot, activePack?.decisionGuide)
    : null;
  const decisionProfileIsEmpty =
    decisionProfile === null ||
    (decisionProfile.mustHave.length === 0 &&
      decisionProfile.important.length === 0 &&
      decisionProfile.niceToHave.length === 0 &&
      decisionProfile.context.length === 0 &&
      decisionProfile.personalConcerns.length === 0 &&
      decisionProfile.missing.length === 0 &&
      decisionProfile.suggestedQuestions.length === 0);

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

  // Disclosure-row live summaries (ADR 0002: "nothing is hidden -- every
  // row's live state is visible without opening it"). Computed here, not
  // inside DisclosureSection or the wrapped child components, which stay
  // generic/unaware of their position in the workspace.
  const optionsCount = snapshot?.entities.length ?? 0;
  const evidenceCount = evidenceItems?.length ?? 0;
  const decisionProfileConcernCount = decisionProfile
    ? decisionProfile.mustHave.length +
      decisionProfile.important.length +
      decisionProfile.niceToHave.length +
      decisionProfile.context.length
    : 0;
  const decisionProfileMeta =
    decisionProfileConcernCount > 0
      ? `${decisionProfileConcernCount} priorit${decisionProfileConcernCount === 1 ? 'y' : 'ies'} set`
      : undefined;
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
  const addConcernMeta = pendingExtension !== null ? '1 needs your review' : undefined;

  // "What Sift found" urgency signal (round-2 design review): a real count
  // of findings that are not fully verified or have aged past their
  // validity window -- never a fabricated "unread" count. Deliberately
  // excludes `evidence.conflicted` correlation, which the public activity
  // stream does not currently thread back onto individual evidence items
  // (see docs/build-log.md's dated entry for this task).
  const flaggedFindingsCount =
    evidenceItems?.filter((item) => item.evidenceLink.verdict !== 'pass' || item.evidenceLink.stale)
      .length ?? 0;

  const workspaceStatus = deriveWorkspaceStatus({
    isRunActive,
    recommendation: snapshot?.recommendation ?? null,
    proposal: snapshot?.proposal ?? null,
    flaggedFindingsCount,
    withheld: withheld !== null,
  });

  return (
    <div
      // Keyed by `activeCaseId` (manual QA finding, this task): several
      // case-scoped children below -- `OptionEditor`, `CustomConcernForm`,
      // `CaseExtensionReviewCard` -- own local `useState` (in-progress form
      // fields, a submission `success`/`error` flag) that is otherwise never
      // reset by a prop change alone, since React reuses the same component
      // instance across a re-render with no identity change. Keying the
      // whole workspace by the case it belongs to forces every case-scoped
      // child to remount -- resetting all such local state, including this
      // file's own `viewMode`/`quickPickPosition` -- exactly when the
      // active case actually changes.
      key={activeCaseId}
      data-testid="case-workspace"
      className="page-enter mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-[var(--space-4)] p-[var(--space-4)]"
    >
      {snapshot ? (
        <CaseHeader
          title={snapshot.title}
          connectionState={mapConnectionState(connectionState)}
          onResetDemo={handleResetDemo}
          resetPending={resetPending}
          onOpenDeveloperView={handleOpenDeveloperView}
        />
      ) : (
        <div
          data-testid="case-workspace-loading"
          aria-busy="true"
          aria-live="polite"
          className="loading-pulse flex items-center justify-center rounded-[var(--radius-md)] bg-card p-[var(--space-4)] text-[var(--color-ink-secondary)]"
        >
          Loading case…
        </div>
      )}

      <WebMcpStatus adapter={webMcpAdapter} />

      {streamError ? <ErrorState message={streamError} /> : null}

      <RecommendationHero
        status={workspaceStatus}
        recommendation={snapshot?.recommendation ?? null}
        withheld={withheld}
        sources={sources}
        proposal={snapshot?.proposal ?? null}
        onReview={handleReviewProposal}
        reviewPending={proposalReviewPending}
        reviewError={proposalReviewError}
        onRequestInvestigation={() => handleRequestInvestigation()}
        requestPending={runRequestPending}
        requestDisabled={snapshot === null}
        requestError={runRequestError}
        onReviewFindingsClick={() => setFindingsSheetOpen(true)}
        liveRunReceipt={liveRunStatusReceipt}
        liveEvents={events}
        onInspectRun={handleInspectRun}
      />

      <DisclosureSection
        testId="options"
        title="Manage options"
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
      </DisclosureSection>

      <WorkspaceViewSwitcher
        mode={viewMode}
        onModeChange={handleViewModeChange}
        options={snapshot?.entities ?? []}
        attributeDefinitions={snapshot?.attributeDefinitions ?? []}
        presentation={activePack?.presentation ?? null}
        selectedOptionId={snapshot?.selectedOptionId ?? null}
        onFocusOption={handleFocusOption}
        quickPickPosition={quickPickPosition}
        onQuickPickPass={handleQuickPickAdvance}
        onQuickPickMaybe={handleQuickPickAdvance}
        onQuickPickShortlist={handleQuickPickShortlist}
        onQuickPickFocusChange={() => undefined}
        boardPlacement={boardPlacement}
        onMoveOption={handleMoveOption}
      />

      {!decisionProfileIsEmpty && decisionProfile !== null ? (
        <DisclosureSection
          testId="decision-profile"
          title="What you're looking for"
          meta={decisionProfileMeta}
        >
          <DecisionProfileView profile={decisionProfile} />
        </DisclosureSection>
      ) : null}

      {/* CaseNotes (§28/§63) renders `null` itself when there are no notes
          (global constraint 4) -- mounted unconditionally here rather than
          gated a second time at this call site, matching how this
          component is meant to be used. */}
      <CaseNotes notes={snapshot?.notes ?? []} options={snapshot?.entities ?? []} />

      <DisclosureSection
        testId="findings"
        title="What Sift found"
        meta={
          flaggedFindingsCount > 0
            ? `${flaggedFindingsCount} need${flaggedFindingsCount === 1 ? 's' : ''} a look`
            : `${evidenceCount} finding${evidenceCount === 1 ? '' : 's'}`
        }
        flagged={flaggedFindingsCount > 0}
        onTriggerClick={() => setFindingsSheetOpen(true)}
      />
      {dispositionError ? <ErrorState message={dispositionError} /> : null}

      <FindingsSheet
        open={findingsSheetOpen}
        onOpenChange={setFindingsSheetOpen}
        items={evidenceItems ?? []}
        onSetDisposition={handleSetDisposition}
        dispositionPendingId={dispositionPendingId}
      />

      <DisclosureSection testId="still-checking" title="Still checking" meta={stillCheckingMeta}>
        <ReadinessPanel readiness={readiness} loading={snapshot === null} />
      </DisclosureSection>

      <DisclosureSection
        testId="add-concern"
        title="Add something Sift should check"
        meta={addConcernMeta}
        defaultOpen={pendingExtension !== null}
      >
        <CustomConcernForm
          caseId={activeCaseId}
          expectedSequence={snapshot?.eventSequence ?? 0}
          applicableKinds={applicableKinds}
        />

        {/* ADR 0004 item 2 / audit §2: an empty conceptual region must be
            absent, not a card announcing its own emptiness. Mounted only
            once a real agent-proposed extension is actually pending review
            -- fixed here, at the orchestration level, rather than editing
            `CaseExtensionReviewCard`'s own internals. */}
        {pendingExtension !== null ? (
          <CaseExtensionReviewCard
            caseId={activeCaseId}
            expectedSequence={snapshot?.eventSequence ?? 0}
            extension={pendingExtension}
          />
        ) : null}
      </DisclosureSection>

      {runtimeInspectorOpen ? (
        <RuntimeInspector
          runId={inspectingRunId}
          {...(inspectingDebugEventId !== undefined
            ? { focusEventId: inspectingDebugEventId }
            : {})}
          onClose={handleCloseRuntimeInspector}
          apiConfig={apiConfig}
          events={caseScopedActivityEvents}
          onInspectEvent={handleInspectEvent}
        />
      ) : null}
    </div>
  );
}
