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
 * TWO-MODE LAYOUT (rewritten this task per `docs/decisions/
 * 0008-two-mode-product-architecture.md`, replacing the single "one column
 * that gets wider" stack the ADR's own screenshot -- five identical
 * collapsible rows crammed at the bottom of the page -- was built on top
 * of). The project owner's verdict, quoted directly in the ADR: "These
 * bottom sections should be at the top, but not in this format... if it
 * finds things, wouldn't we want to surface that at the top and stand out
 * so the user clicks on it? Right now you've got it at the bottom - they'll
 * never even see it... You literally just crammed everything into a
 * collapsible section." And on the product as a whole: "It's supposed to
 * emulate a shopping website at full width. When it's in the side pane,
 * it's in WebMCP mode."
 *
 * `layout = useWidthMode()` is read exactly ONCE, here, and threaded down
 * as a plain prop -- the same discipline `WorkspaceAppBar.tsx`/
 * `WorkspaceAlertBanner.tsx`/`WorkspaceSidebar.tsx`/`OptionCompareView.tsx`
 * already establish ("this component never calls matchMedia itself"). jsdom
 * has no `matchMedia`, so every test in this file that does not explicitly
 * `vi.stubGlobal('matchMedia', ...)` exercises the `narrow` branch below --
 * expanded-mode behavior is covered by the tests that do stub it (see
 * `stubExpandedLayout()`).
 *
 * GLOBAL CHROME (both modes, rendered once, above the layout branch):
 *
 *  1. `WorkspaceAppBar` -- supersedes `CaseHeader` (title, connection
 *     status, reset, developer view) AND absorbs two former bottom-of-page
 *     actions with real top-of-page visual weight: "Add option" (formerly
 *     the "Manage options" disclosure wrapping `OptionEditor`) and
 *     "Findings" (formerly the "What Sift found" disclosure-as-button).
 *     `CaseHeader.tsx` itself is UNCHANGED and still exported/tested on its
 *     own (`CaseHeader.test.tsx`) -- nothing else in the app renders it any
 *     more (confirmed: `grep -rn '<CaseHeader' apps/web/src` matches only
 *     this file's own former usage and that component's own test file), so
 *     it is orphaned-but-intact, not deleted, exactly as this task requires.
 *  2. `WorkspaceAlertBanner` -- real, differentiated alerts DERIVED from
 *     canonical state (`alertItems` below): findings needing review, a
 *     recommendation ready for decision, a pending agent-proposed case
 *     extension, or a lost connection. Renders nothing at all when none of
 *     those are true -- never a fabricated "all clear" notice.
 *  3. `WebMcpStatus` / `ErrorState` -- unchanged content and behavior, only
 *     moved below the alert banner so the "stand out" chrome the owner
 *     asked for is never separated from the app bar by quieter status text.
 *  4. `RecommendationHero` -- unchanged: still the answer-first hero, still
 *     the first substantial content after the chrome above, in both modes,
 *     verified by the same DOM-order test this task updates rather than
 *     removes.
 *
 * WEB APP MODE (`layout === 'expanded'`, ADR 0008 decision 2) -- a
 * persistent left `WorkspaceSidebar` beside a main column holding the
 * primary view switcher:
 *
 *  - Sidebar: priorities (`decisionProfile`, read-only ranked list),
 *    filters (`snapshot.view.filters`, written through the presentation-
 *    only path -- see the filters-writer block below), and a "Still
 *    checking" count/button. All three were disclosure rows before this
 *    task; ADR 0008 decision 2 moves them into the persistent column a
 *    "shopping site" shell is expected to have.
 *  - Main column: a small utility toolbar (this file's own plain buttons,
 *    not a locked component -- `workspace-expanded-open-*` testids) for the
 *    three regions that have no natural sidebar slot -- "What you're
 *    looking for" (the FULL `DecisionProfileView`, including the
 *    context/personalConcerns/missing/suggestedQuestions fields the
 *    sidebar's own header comment explicitly excludes from its cut-down
 *    priorities list), "Notes", and "Add something Sift should check" --
 *    each opening its own controlled `Sheet` built from this file's owned
 *    JSX, then `WorkspaceViewSwitcher` (unchanged).
 *
 * PANE MODE (`layout === 'narrow'`) -- the existing single-column stack,
 * MINUS the two regions promoted into the app bar above (options, findings)
 * PLUS the alert banner. The owner: "I'm not opposed to the collapsable
 * type design, but this isn't how it's supposed to work" -- the objection
 * is to *everything* being a collapsible, not to collapsibles existing, so
 * `WorkspaceViewSwitcher`, then closed-by-default `DisclosureSection` rows
 * for "What you're looking for," "Notes"/"Add a note," "Still checking,"
 * and "Add something Sift should check" remain exactly as they were.
 *
 * WHERE EACH OF THE FIVE ORIGINAL BOTTOM DISCLOSURES WENT (ADR 0008's own
 * literal quoted list, in order):
 *
 *  - "What you're looking for" -> sidebar priorities (expanded) / unchanged
 *    disclosure (narrow); the FULL profile is also reachable via a sheet in
 *    expanded mode (see above).
 *  - "Add a note" -> unchanged disclosure (narrow, wrapping `CaseNotes` +
 *    `AddNoteForm` as before) / a "Notes" sheet reached from the main-column
 *    toolbar (expanded).
 *  - "What Sift found" -> `WorkspaceAppBar`'s "Findings" control plus the
 *    alert banner's findings item, in BOTH modes -- the one region this
 *    task's brief explicitly requires to leave the bottom-of-stack pattern
 *    even in pane mode, since it is "the single most valuable event in the
 *    product" (ADR 0008).
 *  - "Still checking" -> sidebar button + sheet (expanded) / unchanged
 *    disclosure (narrow).
 *  - "Add something Sift should check" -> unchanged disclosure (narrow,
 *    still self-opening via `defaultOpen` while a proposal is pending) /
 *    main-column toolbar sheet (expanded). The alert banner's own
 *    "Sift proposed something" action is layout-aware
 *    (`handleReviewPendingExtension`): in narrow mode the disclosure is
 *    already auto-open, so the action only scrolls it into view rather than
 *    mounting a SECOND copy of the same `CustomConcernForm`/
 *    `CaseExtensionReviewCard` in a sheet, which would double-register their
 *    testids in the DOM simultaneously.
 *
 * "Manage options" (`OptionEditor`) was never one of the five the owner's
 * screenshot named -- it already sat right below the hero, not at the
 * bottom -- but it is unambiguously "a create action... disguised as a
 * disclosure row" in the ADR's own general sense (`WorkspaceAppBar`'s own
 * header comment attributes its "Add option" control to the owner's "add
 * action at the top" language), so this task promotes it too, uniformly, in
 * BOTH modes, into the app bar's "Add option" button opening one controlled
 * `Sheet` -- eliminating the disclosure row entirely rather than running two
 * parallel entry points to the same `OptionEditor` instance (which would
 * double-mount its `option-editor-new` testid whenever both were open at
 * once).
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
  type WorkspaceFilter,
  type WorkspaceViewMode,
  type WorkspaceViewState,
} from '@sift/contracts';
import { evaluateReadiness } from '@sift/core';
import { SiftClientError } from '../api/sift-client.js';
import { readStoredCaseId, writeStoredCaseId, clearStoredCaseId } from './active-case-storage.js';
import { DemoLauncher } from '../components/DemoLauncher.js';
import { VehicleCatalogFlow } from '../components/VehicleCatalogFlow.js';
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
import { AddNoteForm } from '../components/AddNoteForm.js';
import { CustomConcernForm } from '../components/CustomConcernForm.js';
import { CaseExtensionReviewCard } from '../components/CaseExtensionReviewCard.js';
import type { LiveRunStatusReceipt } from '../components/LiveRunStatus.js';
import { WebMcpStatus } from '../components/WebMcpStatus.js';
import { ErrorState } from '../components/ErrorState.js';
import { RuntimeInspector } from '../components/RuntimeInspector.js';
import {
  WorkspaceAppBar,
  type WorkspaceAppBarConnectionState,
} from '../components/WorkspaceAppBar.js';
import {
  WorkspaceAlertBanner,
  type WorkspaceAlertBannerItem,
} from '../components/WorkspaceAlertBanner.js';
import { WorkspaceSidebar } from '../components/WorkspaceSidebar.js';
import { useWidthMode } from '../hooks/use-width-mode.js';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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

// `WorkspaceAppBar`'s `WorkspaceAppBarConnectionState` union
// (`'live' | 'reconnecting' | 'offline'`) is narrower than the real hook's
// five-state `CaseEventsConnectionState` -- it has no separate tokens for
// "still establishing the first connection" or "SSE unsupported, degraded
// to polling." Both collapse onto `reconnecting`: from the reader's point
// of view, "we don't have a live stream right now but we're getting you
// data another way" reads the same either way, and `WorkspaceAppBar`'s own
// contract has no fourth tone to attach a polling-specific meaning to (this
// is an explicit, disclosed simplification, not an oversight -- the locked
// component's prop union is the ceiling here).
function mapAppBarConnectionState(
  state: CaseEventsConnectionState,
): WorkspaceAppBarConnectionState {
  if (state === 'live' || state === 'offline') return state;
  return 'reconnecting';
}

export function App() {
  const commands = useSiftCommands();
  const apiConfig = useApiConfig();
  const webMcpAdapter = useWebMcpAdapter();
  // Read exactly once, per this file's own header comment -- every region
  // below that cares about narrow-vs-expanded takes `layout` as a plain
  // value, never calls `useWidthMode()`/`matchMedia` itself.
  const layout = useWidthMode();

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
  // ADR 0008 sheet-based entry points -- each replaces (expanded mode) or
  // supplements (narrow mode, via the app bar's now-uniform "Add option")
  // a former bottom-of-page disclosure. All five are mounted unconditionally
  // (matching `FindingsSheet`'s own pre-existing "always mounted, controlled
  // by `open`" pattern) and Radix does not render `SheetContent` into the
  // DOM at all while `open` is false, so none of these collide with the
  // narrow-mode disclosures that render the SAME underlying components --
  // see this file's own header comment for why "Manage options" has no
  // narrow-mode disclosure any more specifically to avoid that collision.
  const [manageOptionsSheetOpen, setManageOptionsSheetOpen] = useState(false);
  const [stillCheckingSheetOpen, setStillCheckingSheetOpen] = useState(false);
  const [decisionProfileSheetOpen, setDecisionProfileSheetOpen] = useState(false);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const [addConcernSheetOpen, setAddConcernSheetOpen] = useState(false);
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

  // Compare view configuration -- the other half of this same "persisted
  // WorkspaceViewState never reaches the rendered page" seam `viewMode`
  // above already closes for `mode`. `sift_configure_comparison`/
  // `sift_set_view` genuinely persist `CaseState.view.compare.optionIds`/
  // `visibleAttributeIds`/`pinnedAttributeIds` through the real `setView`
  // command (see that command's own tests), and `OptionCompareView`
  // genuinely implements those as real narrowing props -- but until this
  // fix nothing here read `snapshot.view` and passed them to
  // `WorkspaceViewSwitcher`, so a real `sift_configure_comparison` WebMCP
  // call (§58's own named demo moment) reported success while the rendered
  // table never moved. No optimistic-override treatment is needed here the
  // way `viewMode` gets one: these three are read-and-forward only (nothing
  // in this file writes them locally), so they simply track whatever is
  // currently persisted, `undefined` when a case has never configured
  // Compare at all -- `OptionCompareView` already renders its full,
  // unnarrowed table for `undefined`, so an unconfigured case looks exactly
  // as it did before this fix.
  //
  // `compare.optionIds` (not the top-level `visibleOptionIds`, which
  // overlaps in intent) is deliberately what governs the Compare table's
  // visible option set -- see `WorkspaceViewSwitcher.tsx`'s own header
  // comment for the full reasoning (the tool named in §58's demo moment,
  // `sift_configure_comparison`, writes exactly this field; ADR 0005's
  // "Consequences" section names it explicitly for this purpose).
  const compareOptionIds = snapshot?.view?.compare?.optionIds;
  const compareVisibleAttributeIds = snapshot?.view?.visibleAttributeIds;
  const comparePinnedAttributeIds = snapshot?.view?.pinnedAttributeIds;

  // Reconciliation: adopt the persisted view only when it genuinely CHANGES,
  // never merely when it happens to equal the local override.
  //
  // The earlier rule ("clear the override once persisted catches up") caused
  // a real, reproducible defect that the visual gate caught: the workspace
  // would silently revert to a previously-selected tab. Two runs of the same
  // journey rendered different tabs — one Compare, one List — because after
  // the override was cleared, `viewMode` fell back to `persistedViewMode`
  // alone, and any later re-delivery of an older snapshot (a poll or SSE
  // refresh that raced the write) flipped the view back underneath the user.
  //
  // The `setView` write is especially likely to lose that race during an
  // active investigation: it carries `expectedSequence`, the run is
  // advancing `eventSequence` continuously, so a conflict is normal and the
  // persisted view never catches up at all. Combined with the swallowed
  // rejection below, the UI could show a tab the user did not choose with no
  // signal that anything failed.
  //
  // Tracking the last persisted value and reacting only to a genuine
  // transition keeps both directions working: a real external change (a
  // WebMCP `sift_set_view` from ChatGPT, or another viewer) still moves the
  // page, while a stale re-delivery of the value we already had does not.
  const lastPersistedViewMode = useRef<WorkspaceViewMode | undefined>(persistedViewMode);
  useEffect(() => {
    if (persistedViewMode === lastPersistedViewMode.current) return;
    lastPersistedViewMode.current = persistedViewMode;
    // A genuine remote/durable change wins over a local override.
    setOptimisticViewMode(null);
  }, [persistedViewMode]);

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
  const activeCaseIdRef = useRef(activeCaseId);
  activeCaseIdRef.current = activeCaseId;

  // Serializes view writes so the LAST intent wins, not the last response.
  //
  // Three failed repair attempts got here, and the evidence that settled it
  // was two baseline images showing different tabs: the page was genuinely
  // bistable between List and Compare. The cause is not rendering timing and
  // not snapshot staleness -- it is that rapid tab switches issue concurrent
  // `setView` writes with no ordering. Select Compare then List and both are
  // in flight; whichever response lands last decides the persisted view, so
  // the older intent can overwrite the newer one. (A conflict retry, tried
  // first, made this strictly worse by adding a round-trip for the older
  // write to lose even later.)
  //
  // A single in-flight writer that always drains to the newest requested
  // view removes the race by construction: at most one request outstanding,
  // and when it settles the loop re-issues only if the user has since asked
  // for something else. The final persisted value therefore always equals
  // the last thing the person actually chose.
  const desiredViewRef = useRef<WorkspaceViewMode | null>(null);
  const viewWriteInFlightRef = useRef(false);

  const drainViewWrites = useCallback(async () => {
    if (viewWriteInFlightRef.current) return;
    viewWriteInFlightRef.current = true;
    try {
      while (desiredViewRef.current !== null) {
        const mode = desiredViewRef.current;
        const caseId = activeCaseIdRef.current;
        const current = snapshotRef.current;
        if (caseId === null || current === null) {
          desiredViewRef.current = null;
          return;
        }
        const view: WorkspaceViewState = { ...(current.view ?? {}), mode };
        try {
          await commands.setView({ caseId, expectedSequence: current.eventSequence, view });
        } catch {
          // Swallowed deliberately, and deliberately NOT a revert. A
          // rejection here is almost always a stale `expectedSequence`
          // during a live run: the run advances `eventSequence` constantly,
          // while this command routes through `updateSelection()` and
          // changes no decision state at all (change-set §54). The person is
          // still looking at the view they chose, so an error toast would be
          // noise about something that did not affect them.
          //
          // The real cost is that an unpersisted choice may not survive a
          // reload. That is a stated limitation, not a hidden one.
        }
        // Only clear if nothing newer arrived while this write was in flight.
        if (desiredViewRef.current === mode) desiredViewRef.current = null;
      }
    } finally {
      viewWriteInFlightRef.current = false;
    }
  }, [commands]);

  const handleViewModeChange = useCallback(
    (mode: WorkspaceViewMode) => {
      setOptimisticViewMode(mode);
      desiredViewRef.current = mode;
      void drainViewWrites();
    },
    [drainViewWrites],
  );

  // `WorkspaceSidebar`'s filter controls (ADR 0008 decision 3, change-set
  // §54, ADR 0005 decision 1): "every change calls `onFiltersChange` with
  // the COMPLETE next `WorkspaceFilter[]`... this component never calls a
  // command itself" (`WorkspaceSidebar.tsx`'s own header comment). This
  // writes through the exact same `commands.setView`/`updateSelection()`
  // path `viewMode` above already uses -- narrowing which already-known
  // options are VISIBLE can never advance `eventSequence` or touch
  // criteria/weights.
  //
  // A SEPARATE serialized single-flight writer, not a generalization of
  // `desiredViewRef`/`drainViewWrites` above: that mechanism is already
  // hardened against a real, reproduced race (three failed repair attempts,
  // see its own comment) and this task does not touch it. Filters get their
  // own queue/in-flight ref, mirroring the identical "last intent always
  // wins, at most one request outstanding" shape. A mode write and a filter
  // write racing each other is a known, disclosed residual limitation --
  // both spread `snapshotRef.current.view`, which can lag the other
  // writer's own in-flight change -- exactly the same class of limitation
  // the mode writer's own comment already discloses for a stale
  // `expectedSequence`.
  const persistedFilters = snapshot?.view?.filters;
  const [optimisticFilters, setOptimisticFilters] = useState<WorkspaceFilter[] | null>(null);
  const filters = optimisticFilters ?? persistedFilters ?? [];

  // Content-based (not reference-based) comparison, unlike
  // `lastPersistedViewMode` above: a fresh snapshot poll always constructs a
  // brand-new `filters` ARRAY even when its contents are unchanged, so
  // reference equality (correct for `WorkspaceViewMode`, a primitive) would
  // treat every routine poll as "genuinely changed" here and clear a
  // just-set optimistic filter before its own write has had any chance to
  // round-trip -- the exact flicker/revert bug the mode writer's own
  // comment describes, just triggered by polling cadence instead of a race.
  const lastPersistedFiltersKey = useRef<string>(JSON.stringify(persistedFilters ?? []));
  useEffect(() => {
    const key = JSON.stringify(persistedFilters ?? []);
    if (key === lastPersistedFiltersKey.current) return;
    lastPersistedFiltersKey.current = key;
    setOptimisticFilters(null);
  }, [persistedFilters]);

  const desiredFiltersRef = useRef<WorkspaceFilter[] | null>(null);
  const filtersWriteInFlightRef = useRef(false);

  const drainFilterWrites = useCallback(async () => {
    if (filtersWriteInFlightRef.current) return;
    filtersWriteInFlightRef.current = true;
    try {
      while (desiredFiltersRef.current !== null) {
        const nextFilters = desiredFiltersRef.current;
        const caseId = activeCaseIdRef.current;
        const current = snapshotRef.current;
        if (caseId === null || current === null) {
          desiredFiltersRef.current = null;
          return;
        }
        // `mode` is a required field of `WorkspaceViewState` (unlike every
        // other member, which is optional) -- a case that has never set a
        // view has no `current.view` to spread from at all, so this always
        // supplies the exact same 'quick_pick' fallback the read side
        // already uses (`viewMode` above, Task A10) rather than producing
        // an invalid patch with no `mode`.
        const view: WorkspaceViewState = {
          ...(current.view ?? {}),
          mode: current.view?.mode ?? 'quick_pick',
          filters: nextFilters,
        };
        try {
          await commands.setView({ caseId, expectedSequence: current.eventSequence, view });
        } catch {
          // Swallowed deliberately, same reasoning as the view-mode writer
          // above: a stale `expectedSequence` during a live run is expected
          // and this command changes no decision state, so the visible
          // filters (still reflecting the user's real choice via
          // `optimisticFilters`) do not need a blocking error surface.
        }
        if (desiredFiltersRef.current === nextFilters) desiredFiltersRef.current = null;
      }
    } finally {
      filtersWriteInFlightRef.current = false;
    }
  }, [commands]);

  const handleFiltersChange = useCallback(
    (nextFilters: WorkspaceFilter[]) => {
      setOptimisticFilters(nextFilters);
      desiredFiltersRef.current = nextFilters;
      void drainFilterWrites();
    },
    [drainFilterWrites],
  );

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

  // Scroll target for the narrow-mode "Add something Sift should check"
  // disclosure -- only ever used by `handleReviewPendingExtension` below.
  const addConcernSectionRef = useRef<HTMLDivElement>(null);

  // The alert banner's "Sift proposed something" action (ADR 0008): layout-
  // aware because the underlying content has two different homes. In
  // expanded mode there is no narrow-style disclosure at all, so this opens
  // the main-column sheet. In narrow mode, `defaultOpen={pendingExtension
  // !== null}` on the "add-concern" disclosure below ALREADY force-opens it
  // the moment a proposal is pending -- opening `addConcernSheetOpen` here
  // too would mount a SECOND, simultaneous copy of `CustomConcernForm`/
  // `CaseExtensionReviewCard`, double-registering their testids in the DOM.
  // Scrolling the already-open disclosure into view is the real, honest
  // action available in that mode.
  const handleReviewPendingExtension = useCallback(() => {
    if (layout === 'expanded') {
      setAddConcernSheetOpen(true);
      return;
    }
    addConcernSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [layout]);

  if (activeCaseId === null) {
    if (restoringCaseId !== null) {
      // Avoids a launcher-then-workspace flash while the reload-restore
      // verification effect above confirms the stored case still resolves.
      return (
        <div
          data-testid="case-workspace-restoring"
          aria-busy="true"
          aria-live="polite"
          className="page-shell loading-pulse flex min-h-screen items-center justify-center bg-background p-[var(--space-4)] text-[var(--color-ink-secondary)]"
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

  // `WorkspaceAlertBanner` items (ADR 0008 decision 2/req 2 of this task):
  // DERIVED from real, already-canonical state -- never fabricated. Each
  // condition below is the exact same signal an existing region already
  // renders from (flaggedFindingsCount drives the app bar's findings badge
  // and used to drive the "What Sift found" disclosure meta;
  // `workspaceStatus.phase` is the hero's own single source of truth for
  // "a decision is pending human approval," reusing its `headline` text
  // verbatim rather than composing new copy that could drift from the
  // hero's; `pendingExtension` already gates `CaseExtensionReviewCard`
  // below; `connectionState` is the hook's own raw five-state union, not
  // the app bar's collapsed three-state version, so this only fires on a
  // genuine `offline`, not a transient `connecting`/`reconnecting` blip the
  // app bar's own pulsing badge already communicates). An empty array here
  // renders nothing at all -- `WorkspaceAlertBanner` returns `null` outright
  // for `items: []`.
  const alertItems: WorkspaceAlertBannerItem[] = [];
  if (flaggedFindingsCount > 0) {
    alertItems.push({
      id: 'findings',
      tone: 'attention',
      message: `${flaggedFindingsCount} finding${flaggedFindingsCount === 1 ? '' : 's'} need${flaggedFindingsCount === 1 ? 's' : ''} your attention.`,
      actionLabel: 'Review findings',
      onAction: () => setFindingsSheetOpen(true),
    });
  }
  if (workspaceStatus.phase === 'pending_approval') {
    alertItems.push({
      id: 'recommendation-ready',
      tone: 'ready',
      // Reuses the hero's own headline text verbatim (see comment above) --
      // no action, since `RecommendationHero` (with its live `ApprovalCard`
      // Approve/Reject/Revise controls) is the very next region rendered.
      message: workspaceStatus.headline,
    });
  }
  if (pendingExtension !== null) {
    alertItems.push({
      id: 'pending-extension',
      tone: 'attention',
      message: 'Sift proposed something new to check on this case.',
      actionLabel: 'Review',
      onAction: handleReviewPendingExtension,
    });
  }
  if (connectionState === 'offline') {
    alertItems.push({
      id: 'connection-offline',
      tone: 'attention',
      message: 'Connection lost. Sift will keep trying to reconnect.',
    });
  }

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
      className="page-shell page-enter flex min-h-screen flex-col gap-[var(--space-4)] p-[var(--space-4)]"
    >
      {snapshot ? (
        <WorkspaceAppBar
          title={snapshot.title}
          connectionState={mapAppBarConnectionState(connectionState)}
          findingsCount={flaggedFindingsCount}
          optionCount={optionsCount}
          onAddOption={() => setManageOptionsSheetOpen(true)}
          onReviewFindings={() => setFindingsSheetOpen(true)}
          onOpenDeveloperView={handleOpenDeveloperView}
          onResetDemo={handleResetDemo}
          resetPending={resetPending}
          layout={layout}
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

      <WorkspaceAlertBanner items={alertItems} layout={layout} />

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

      {layout === 'expanded' ? (
        // Web app mode (ADR 0008 decision 2): a persistent left sidebar
        // (priorities/filters/still-checking) beside a main column holding
        // a small utility toolbar for the regions with no sidebar slot,
        // then the primary view switcher. See this file's own header
        // comment for the full "where did region X go" mapping.
        <div
          data-testid="workspace-expanded-layout"
          // 300px, not 240px: a live-browser check against the real
          // `car-purchase` pack found `WorkspaceSidebar`'s priority rows
          // (full pack-authored sentences like "Driver assistance
          // effectiveness rating," not the ADR mock's single-word "Safety")
          // truncating hard at 240px. `WorkspaceSidebar.tsx` itself is
          // locked, so the fix lives here, at the column width this file
          // owns.
          className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-x-[var(--space-6)]"
        >
          <WorkspaceSidebar
            layout={layout}
            decisionProfile={decisionProfile}
            attributeDefinitions={snapshot?.attributeDefinitions ?? []}
            // The real saved cars, so the filter panel can derive its facets
            // from values that actually exist rather than offering blank
            // "Search make" boxes over a four-option case. Same array the
            // option views already receive; without it the sidebar falls back
            // to its generic per-type controls.
            options={snapshot?.entities ?? []}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            openQuestionsCount={remainingObligationCount}
            onOpenQuestions={() => setStillCheckingSheetOpen(true)}
          />
          <div className="flex min-w-0 flex-col gap-[var(--space-4)]">
            <div
              role="toolbar"
              aria-label="More workspace regions"
              className="flex flex-wrap items-center gap-[var(--space-2)]"
            >
              {/* The sidebar only renders `mustHave`/`important`/
                  `niceToHave` (its own header comment names the exclusion
                  explicitly); this reaches the FULL profile, including
                  `context`/`personalConcerns`/`missing`/`suggestedQuestions`,
                  which would otherwise be unreachable in expanded mode --
                  same "every capability reachable in both modes" constraint
                  the app bar's "Add option"/"Findings" controls satisfy for
                  their own regions. Gated like the narrow disclosure above
                  it (ADR 0004 item 2: absent, not merely empty). */}
              {!decisionProfileIsEmpty && decisionProfile !== null ? (
                <Button
                  type="button"
                  data-testid="workspace-expanded-open-decision-profile"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDecisionProfileSheetOpen(true)}
                >
                  Your priorities
                </Button>
              ) : null}
              <Button
                type="button"
                data-testid="workspace-expanded-open-notes"
                variant="secondary"
                size="sm"
                onClick={() => setNotesSheetOpen(true)}
              >
                Notes
              </Button>
              <Button
                type="button"
                data-testid="workspace-expanded-open-add-concern"
                variant="secondary"
                size="sm"
                onClick={() => setAddConcernSheetOpen(true)}
              >
                Add a question
              </Button>
            </div>

            <WorkspaceViewSwitcher
              mode={viewMode}
              onModeChange={handleViewModeChange}
              options={snapshot?.entities ?? []}
              attributeDefinitions={snapshot?.attributeDefinitions ?? []}
              caseExtensions={snapshot?.caseExtensions ?? []}
              presentation={activePack?.presentation ?? null}
              selectedOptionId={snapshot?.selectedOptionId ?? null}
              onFocusOption={handleFocusOption}
              compareOptionIds={compareOptionIds}
              compareVisibleAttributeIds={compareVisibleAttributeIds}
              comparePinnedAttributeIds={comparePinnedAttributeIds}
              quickPickPosition={quickPickPosition}
              onQuickPickPass={handleQuickPickAdvance}
              onQuickPickMaybe={handleQuickPickAdvance}
              onQuickPickShortlist={handleQuickPickShortlist}
              onQuickPickFocusChange={() => undefined}
              boardPlacement={boardPlacement}
              onMoveOption={handleMoveOption}
            />
          </div>
        </div>
      ) : (
        // Pane mode: the existing single-column stack, minus the two
        // regions promoted into the app bar above (options, findings) --
        // see this file's own header comment for the full mapping.
        <>
          <WorkspaceViewSwitcher
            mode={viewMode}
            onModeChange={handleViewModeChange}
            options={snapshot?.entities ?? []}
            attributeDefinitions={snapshot?.attributeDefinitions ?? []}
            caseExtensions={snapshot?.caseExtensions ?? []}
            presentation={activePack?.presentation ?? null}
            selectedOptionId={snapshot?.selectedOptionId ?? null}
            onFocusOption={handleFocusOption}
            compareOptionIds={compareOptionIds}
            compareVisibleAttributeIds={compareVisibleAttributeIds}
            comparePinnedAttributeIds={comparePinnedAttributeIds}
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
              title="Your priorities"
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

          {/* "Add a note" -- the human-facing add affordance for the write half
              of §28/§63 (`AddNoteForm.tsx`'s own header comment has the full
              reasoning for why this is a sibling disclosure row rather than
              something mounted inside `CaseNotes` itself). A closed-by-default
              `DisclosureSection`, like every other investigative row, so it
              stays reachable even when `snapshot.notes` is empty without
              growing a permanent visible empty region. */}
          <DisclosureSection testId="add-note" title="Add a note">
            <AddNoteForm caseId={activeCaseId} expectedSequence={snapshot?.eventSequence ?? 0} />
          </DisclosureSection>

          <DisclosureSection testId="still-checking" title="Researching…" meta={stillCheckingMeta}>
            <ReadinessPanel readiness={readiness} loading={snapshot === null} />
          </DisclosureSection>

          <div ref={addConcernSectionRef}>
            <DisclosureSection
              testId="add-concern"
              title="Add a question"
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
          </div>
        </>
      )}

      {dispositionError ? <ErrorState message={dispositionError} /> : null}

      <FindingsSheet
        open={findingsSheetOpen}
        onOpenChange={setFindingsSheetOpen}
        items={evidenceItems ?? []}
        onSetDisposition={handleSetDisposition}
        dispositionPendingId={dispositionPendingId}
      />

      {/* Sheet-based entry points for ADR 0008's dismantled create/detail
          regions -- see this file's own header comment for why each of
          these five is mounted unconditionally (always controlled by
          `open`, never duplicated alongside a narrow-mode disclosure over
          the same underlying component). */}
      <Sheet open={manageOptionsSheetOpen} onOpenChange={setManageOptionsSheetOpen}>
        <SheetContent data-testid="workspace-add-option-sheet">
          <SheetHeader>
            <SheetTitle>{`Add ${optionLabel}`}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <OptionEditor
              caseId={activeCaseId}
              expectedSequence={snapshot?.eventSequence ?? 0}
              optionKind={optionKind}
              optionLabel={optionLabel}
              attributeDefinitions={snapshot?.attributeDefinitions ?? []}
              options={snapshot?.entities ?? []}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet open={stillCheckingSheetOpen} onOpenChange={setStillCheckingSheetOpen}>
        <SheetContent data-testid="workspace-still-checking-sheet">
          <SheetHeader>
            <SheetTitle>Still checking</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <ReadinessPanel readiness={readiness} loading={snapshot === null} />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet open={decisionProfileSheetOpen} onOpenChange={setDecisionProfileSheetOpen}>
        <SheetContent data-testid="workspace-decision-profile-sheet">
          <SheetHeader>
            <SheetTitle>Your priorities</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {decisionProfile !== null ? <DecisionProfileView profile={decisionProfile} /> : null}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet open={notesSheetOpen} onOpenChange={setNotesSheetOpen}>
        <SheetContent data-testid="workspace-notes-sheet">
          <SheetHeader>
            <SheetTitle>Notes</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-[var(--space-4)]">
            <CaseNotes notes={snapshot?.notes ?? []} options={snapshot?.entities ?? []} />
            <AddNoteForm caseId={activeCaseId} expectedSequence={snapshot?.eventSequence ?? 0} />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet open={addConcernSheetOpen} onOpenChange={setAddConcernSheetOpen}>
        <SheetContent data-testid="workspace-add-concern-sheet">
          <SheetHeader>
            <SheetTitle>Add a question</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-[var(--space-4)]">
            <CustomConcernForm
              caseId={activeCaseId}
              expectedSequence={snapshot?.eventSequence ?? 0}
              applicableKinds={applicableKinds}
            />
            {pendingExtension !== null ? (
              <CaseExtensionReviewCard
                caseId={activeCaseId}
                expectedSequence={snapshot?.eventSequence ?? 0}
                extension={pendingExtension}
              />
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>

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
