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
 *  - Sidebar: priorities (`decisionProfile`, read-only ranked list) and a
 *    "Still checking" count/button. Both were disclosure rows before ADR
 *    0008, which moved them into the persistent column a "shopping site"
 *    shell is expected to have.
 *
 *    Filters USED to live here too, and no longer do (ADR 0009). Two
 *    reasons, both found by looking at the running product: the filter list
 *    ran longer than the main column at 1440, and -- more seriously --
 *    `WorkspaceSidebar` renders `null` at `layout: 'narrow'`, so filters
 *    living in it meant pane/WebMCP mode had NO filter entry point at all,
 *    contradicting ADR 0008's "still has to have the same functionalities."
 *    They now live in a `FilterSheet` mounted as global chrome, opened from
 *    a `FilterBar` that both shells render above their view switcher.
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
 *  - Filters -> `FilterBar` + `FilterSheet`, identical in BOTH modes
 *    (ADR 0009). `visibleOptions` below is what makes them do anything at
 *    all; before it, every filter control wrote durable state no code read.
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
  PRESENTATION_ONLY_ACTIVITY_DETAIL,
  type CommandReceipt,
  type CompiledDecisionPack,
  type EvidenceDisposition,
  type PublicActivityEvent,
  type WorkspaceFilter,
  type WorkspaceViewMode,
  type WorkspaceViewState,
} from '@sift/contracts';
import { deriveNextMoves, evaluateReadiness } from '@sift/core';
import { SiftClientError } from '../api/sift-client.js';
import { readStoredCaseId, writeStoredCaseId, clearStoredCaseId } from './active-case-storage.js';
import { DemoLauncher } from '../components/DemoLauncher.js';
import { VehicleCatalogFlow } from '../components/VehicleCatalogFlow.js';
import { DisclosureSection } from '../components/DisclosureSection.js';
import { RecommendationHero } from '../components/RecommendationHero.js';
import type { CandidateDisposition, InteractionResponse, NextMove } from '@sift/contracts';
import type { ApprovalCardReview } from '../components/ApprovalCard.js';
import { deriveWorkspaceStatus } from '../components/workspace-status.js';
import { ReadinessPanel } from '../components/ReadinessPanel.js';
import { FindingsSheet } from '../components/FindingsSheet.js';
import { OptionEditor } from '../components/OptionEditor.js';
import { WorkspaceViewSwitcher } from '../components/WorkspaceViewSwitcher.js';
import { DecisionProfileView } from '../components/DecisionProfileView.js';
import {
  DecisionOrientationShell,
  type WorkInFlight,
} from '../components/DecisionOrientationShell.js';
import { summarizeRunPlanResponse } from './run-plan-summary.js';
import { buildScoringAlerts } from './scoring-alerts.js';
import { buildInteractionForTopic } from './build-interaction.js';
import { DiscoveryInteraction } from '../components/DiscoveryInteraction.js';
import { ContextActionDock } from '../components/ContextActionDock.js';
import { buildDecisionOrientation } from '../components/decision-orientation.js';
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
import { FilterBar } from '../components/FilterBar.js';
import { FilterSheet } from '../components/FilterSheet.js';
import { applyAssistantNarrowing, applyWorkspaceFilters } from '../components/workspace-filters.js';
import { OptionProfileSheet } from '../components/OptionProfileSheet.js';
import { CaseInsightsPanel } from '../components/CaseInsightsPanel.js';
import { buildWorkspaceScoreboard, selectOptionRanking } from '../components/case-scoreboard.js';
import { ReferenceLibrarySheet } from '../components/ReferenceLibrary.js';
import { deriveOptionProfile } from '../components/option-profile.js';
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
    const event = bySequence[i];
    // A presentation-only command (`setView`/`focusOption`/`focusEvidence`
    // -- the three that write through `updateSelection` and append no
    // `CaseEvent`) never answers the question this block exists to answer:
    // "what did Sift last do about my decision." Found in the running
    // product at 390px the moment filters started writing `setView` on every
    // chip press -- picking "Body style: compact crossover SUV" surfaced
    // "Latest command / Set workspace view to "quick_pick". / Completed"
    // directly under a hero still reading "Nothing's been looked into yet."
    //
    // Same shape as the seeding exclusion below, discovered the same way: an
    // individually-true status line that is a non-sequitur where it lands.
    // The event itself is untouched and still fully visible in the activity
    // stream and Runtime Inspector -- this only declines to PROMOTE it.
    if (event?.safeDetails?.[PRESENTATION_ONLY_ACTIVITY_DETAIL] === true) continue;
    const commandId = event?.commandId;
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

/**
 * Applies the person's standing intent about the assistant's option
 * narrowing to a `WorkspaceViewState` payload about to be written.
 *
 * Shared by BOTH view writers below (`drainViewWrites` and
 * `drainFilterWrites`), which is the entire point: each rebuilds the full
 * view by spreading the last-seen snapshot, so a `visibleOptionIds` the
 * person has already dismissed would otherwise be re-persisted by whichever
 * of them happens to write next. `intendedViewRef` exists precisely to stop
 * one writer rolling the other back, and this keeps that guarantee true for
 * the model-owned field too.
 *
 * The key is REMOVED rather than set to an empty array: `[]` is a real,
 * schema-valid "show none of them" (see `applyAssistantNarrowing`), so
 * writing it would replace one narrowing with a stricter one instead of
 * lifting it.
 */
function applyIntendedNarrowing(
  intent: { clearedAssistantNarrowing?: boolean },
  view: WorkspaceViewState,
): WorkspaceViewState {
  if (intent.clearedAssistantNarrowing !== true) return view;
  const { visibleOptionIds: _dismissed, ...withoutNarrowing } = view;
  return withoutNarrowing;
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
  /**
   * What Sift is currently working on, read from `GET /api/cases/:id/run-plan`.
   *
   * `null` until a plan exists, which is most of discovery — a case has no
   * plan until someone asks for an investigation. A transient failure here
   * degrades to `null` rather than blocking the workspace: the plan is a
   * derived projection and the pane is fully usable without it.
   */
  const [workInFlight, setWorkInFlight] = useState<WorkInFlight | null>(null);
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
  // Filters live in a sheet reachable from BOTH layouts, not in the
  // expanded-only sidebar they used to occupy (ADR 0009). That placement is
  // what makes filtering exist at all in pane/WebMCP mode, where
  // `WorkspaceSidebar` renders `null` outright.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  // Which option's detail profile is open, by id -- NOT the option record
  // itself. Holding the id means the open sheet re-derives from each new
  // snapshot, so a live run that adds evidence about this option updates the
  // sheet under the reader instead of freezing a copy taken when it opened.
  const [profileOptionId, setProfileOptionId] = useState<string | null>(null);
  // The case's reference library -- every `Source` on the case, tagged and
  // browsable. Global chrome like the other sheets: it is the model's
  // durable memory made legible, and must be reachable in both layouts.
  const [referenceLibraryOpen, setReferenceLibraryOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [runRequestPending, setRunRequestPending] = useState(false);
  const [runRequestError, setRunRequestError] = useState<string | null>(null);
  const [proposalReviewPending, setProposalReviewPending] = useState(false);
  const [proposalReviewError, setProposalReviewError] = useState<string | null>(null);
  const [dispositionPendingId, setDispositionPendingId] = useState<string | null>(null);
  const [dispositionError, setDispositionError] = useState<string | null>(null);
  /**
   * A failed discovery interaction, surfaced rather than swallowed.
   *
   * The bare `.catch(() => undefined)` this replaces hid a schema rejection
   * for an entire debugging session: the button did nothing, the console
   * said nothing, and the only symptom was a question that never appeared.
   */
  const [interactionError, setInteractionError] = useState<string | null>(null);
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

  // The RunPlan, refreshed whenever the case's activity sequence moves.
  //
  // Keyed on `eventSequence` rather than polling: every command that can
  // change the plan also advances the case, so this refetches exactly when
  // there is something new to show and never in between.
  useEffect(() => {
    const caseId = snapshot?.id;
    if (caseId === undefined) {
      setWorkInFlight(null);
      return;
    }
    let cancelled = false;
    const baseUrl = apiConfig.baseUrl ?? '';
    const fetchImpl = apiConfig.fetchImpl ?? fetch;
    fetchImpl(`${baseUrl}/api/cases/${encodeURIComponent(caseId)}/run-plan`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (cancelled) return;
        const summary = summarizeRunPlanResponse(payload);
        setWorkInFlight(summary);
      })
      .catch(() => {
        if (!cancelled) setWorkInFlight(null);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot?.id, snapshot?.eventSequence, apiConfig]);

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
  /**
   * The highest `eventSequence` the server has confirmed, taken from command
   * receipts rather than from the event stream.
   *
   * `snapshot` arrives over SSE (or the polling fallback), so immediately
   * after a command it is one behind. A `CommandReceipt.acceptedSequence` is
   * the server's authoritative sequence *after* that command, and it is
   * available the moment the call resolves. Presentation writes consult this
   * so an ordinary human sequence -- press Keep, then press Compare -- does
   * not send a stale `expectedSequence` and take an avoidable 409.
   */
  const lastAcceptedSequenceRef = useRef(0);

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

  // The person's standing intent for `WorkspaceViewState`, shared by BOTH
  // writers below and deliberately never cleared once set.
  //
  // The two writers stay separate single-flight queues (the mode writer is
  // hardened against the reproduced race described above and is not worth
  // re-opening), but they were each rebuilding the FULL `WorkspaceViewState`
  // by spreading `snapshotRef.current.view` -- a snapshot that lags whatever
  // the other writer has in flight. So the filter writer would compute
  // `mode` from a stale snapshot and persist it, silently undoing a view
  // change the user had just made.
  //
  // That was disclosed here as an accepted residual limitation, and it was
  // genuinely harmless while nothing READ `filters` -- persisting a stale
  // mode alongside a filter nobody applied changed no pixel. Making filters
  // real (`visibleOptions`) turned it into a visible defect with a
  // one-sentence repro: **switch to List, apply a filter, and the workspace
  // jumps back to Best Match.** Caught by the new e2e journey failing
  // consistently under four parallel workers while passing in isolation --
  // the timing signature of a genuine race, not a flaky selector.
  //
  // Reading intent from here instead of from the snapshot makes each write
  // carry the newest value of BOTH fields, so neither writer can roll the
  // other back regardless of which response lands first.
  //
  // `clearedAssistantNarrowing` is the third member, and it joined for
  // exactly the reason the second one did. `visibleOptionIds` is a durable
  // field the MODEL writes; when the person dismisses it, both writers
  // above still rebuild their payload by spreading `current.view`, which
  // still carries it. Without the clear being shared intent, switching tabs
  // a moment later would spread the dismissed narrowing straight back out
  // of the snapshot and silently undo the person's dismissal -- the same
  // "one writer rolls the other back" defect, one field over.
  //
  // A flag rather than a value because the human side of this field has
  // exactly one move (remove it); setting it belongs to the model. It is
  // cleared again the moment a genuinely new narrowing is persisted (see
  // the reconciliation effect below), so it can never become a standing
  // veto on the model ever narrowing again.
  const intendedViewRef = useRef<{
    mode?: WorkspaceViewMode;
    filters?: WorkspaceFilter[];
    clearedAssistantNarrowing?: boolean;
  }>({});

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
        // `filters` comes from shared intent when the person has set any,
        // so this write cannot roll back an in-flight filter change.
        const intendedFilters = intendedViewRef.current.filters;
        const view = applyIntendedNarrowing(intendedViewRef.current, {
          ...(current.view ?? {}),
          ...(intendedFilters !== undefined ? { filters: intendedFilters } : {}),
          mode,
        });
        // The freshest sequence either side knows about: the streamed
        // snapshot, or the last receipt the server handed back.
        const expectedSequence = Math.max(current.eventSequence, lastAcceptedSequenceRef.current);
        try {
          await commands.setView({ caseId, expectedSequence, view });
        } catch {
          // One retry against the freshest sequence, then give up quietly.
          //
          // The retry was added when Quick Pick became canonical. Before
          // that, "Shortlist" wrote through `updateSelection()` and never
          // advanced `eventSequence`, so the stale-sequence conflict this
          // comment already disclosed was rare enough to live with. Keep,
          // Pass, and Unsure append real events, which makes an ordinary
          // human sequence -- press Keep, then press Compare -- land a view
          // write with a sequence that is one behind. Silently dropping that
          // one makes a tab look broken, which is a different and worse
          // thing than an unpersisted preference.
          //
          // `snapshotRef.current` is re-read rather than reused: by the time
          // the first attempt failed, the event that invalidated it has
          // usually already arrived over SSE.
          const refreshed = snapshotRef.current;
          const retrySequence =
            refreshed === null
              ? lastAcceptedSequenceRef.current
              : Math.max(refreshed.eventSequence, lastAcceptedSequenceRef.current);
          if (retrySequence !== expectedSequence) {
            try {
              await commands.setView({
                caseId,
                expectedSequence: retrySequence,
                view: applyIntendedNarrowing(intendedViewRef.current, {
                  ...(refreshed?.view ?? {}),
                  ...(intendedFilters !== undefined ? { filters: intendedFilters } : {}),
                  mode,
                }),
              });
            } catch {
              // Still swallowed, and still deliberately NOT a revert. The
              // person is looking at the view they chose; this command routes
              // through `updateSelection()` and changes no decision state at
              // all (change-set §54), so an error toast would be noise about
              // something that did not affect them. The real cost is that an
              // unpersisted choice may not survive a reload -- a stated
              // limitation, not a hidden one.
            }
          }
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
      intendedViewRef.current.mode = mode;
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
        // `mode` comes from shared intent first, falling back to the
        // snapshot and finally to the same `'quick_pick'` default the read
        // side uses. Reading the snapshot ALONE here is what let a filter
        // press silently undo a just-made view change -- see
        // `intendedViewRef`'s comment for the repro.
        const view = applyIntendedNarrowing(intendedViewRef.current, {
          ...(current.view ?? {}),
          mode: intendedViewRef.current.mode ?? current.view?.mode ?? 'quick_pick',
          filters: nextFilters,
        });
        // The freshest sequence either side knows about: the streamed
        // snapshot, or the last receipt the server handed back.
        const expectedSequence = Math.max(current.eventSequence, lastAcceptedSequenceRef.current);
        try {
          await commands.setView({ caseId, expectedSequence, view });
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
      intendedViewRef.current.filters = nextFilters;
      desiredFiltersRef.current = nextFilters;
      // Changing the filters changes the queue Quick Pick is walking, so its
      // position has to return to the start of the NEW queue. Without this, a
      // user three cars into a five-car triage who narrows to two cars lands
      // past the end of the filtered queue and sees the "you've reviewed
      // everything" end state over a list they have not seen at all --
      // `QuickPickView` renders exactly that for `position >= options.length`
      // (`QuickPickView.tsx:180`). Restarting the queue is also what every
      // faceted browse UI does when the result set changes underneath it.
      setQuickPickPosition(0);
      void drainFilterWrites();
    },
    [drainFilterWrites],
  );

  // The assistant's own narrowing (`WorkspaceViewState.visibleOptionIds`,
  // written by `sift_set_view`) -- the second reader this file was missing,
  // and the exact twin of the `compare.optionIds` seam §58 closed. The
  // field was persisted by a real WebMCP call and implemented as a real
  // narrowing prop by `OptionListView`/`OptionCompareView`, but nothing
  // here read it, so "show her just those two" collected a success receipt
  // while the page did not move.
  //
  // It is read-and-forward with ONE local move: dismissal. The person can
  // say "no, show me everything again" without going back to chat, and
  // because the field is durable that dismissal has to persist (see
  // `handleClearAssistantNarrowing` below), not merely hide locally.
  const persistedVisibleOptionIds = snapshot?.view?.visibleOptionIds;
  const [assistantNarrowingDismissed, setAssistantNarrowingDismissed] = useState(false);

  // Content-based key, for the identical reason `lastPersistedFiltersKey`
  // above uses one: every poll rebuilds this array even when its contents
  // are unchanged, so reference equality would read routine polling as a
  // genuine change and undo the dismissal before its write round-trips.
  //
  // Reacting only to a REAL transition is what keeps the dismissal from
  // becoming permanent: the moment the model narrows again -- a different
  // set, after the person cleared the last one -- the key changes, both the
  // local override and the shared write intent are released, and the new
  // narrowing renders.
  const persistedNarrowingKey = JSON.stringify(persistedVisibleOptionIds ?? null);
  const lastPersistedNarrowingKey = useRef(persistedNarrowingKey);
  useEffect(() => {
    if (persistedNarrowingKey === lastPersistedNarrowingKey.current) return;
    lastPersistedNarrowingKey.current = persistedNarrowingKey;
    setAssistantNarrowingDismissed(false);
    intendedViewRef.current.clearedAssistantNarrowing = false;
  }, [persistedNarrowingKey]);

  const assistantVisibleOptionIds = assistantNarrowingDismissed
    ? undefined
    : persistedVisibleOptionIds;

  const handleClearAssistantNarrowing = useCallback(() => {
    setAssistantNarrowingDismissed(true);
    intendedViewRef.current.clearedAssistantNarrowing = true;
    // Deliberately reusing the FILTER writer's queue rather than opening a
    // third one. Both existing writers are single-flight queues over the
    // same `WorkspaceViewState`, and this dismissal is a chip press in the
    // same row as the filter chips -- so it takes the same path they do,
    // carrying the filters unchanged while `applyIntendedNarrowing` strips
    // the dismissed field. A third queue would add a third way for these
    // writes to race each other, which is the one thing this area of the
    // file has already paid for twice.
    desiredFiltersRef.current = filters;
    // Same reason `handleFiltersChange` restarts the queue: the set Quick
    // Pick is walking just got longer, and a position past the old end
    // would show the "you've reviewed everything" state over options the
    // person has not seen.
    setQuickPickPosition(0);
    void drainFilterWrites();
  }, [drainFilterWrites, filters]);

  // THE READER THAT MAKES EVERY FILTER CONTROL MEAN SOMETHING.
  //
  // Until this line existed, `WorkspaceFilter` was written by the filter
  // controls, persisted durably through `setView`, and read by NOBODY -- a
  // repo-wide grep matched only the schema, this file's writer, and the
  // control that produced it. Toggling "AWD only" changed stored state and
  // changed nothing a person could see.
  //
  // Scope is deliberate and narrow: this narrows the OPTION BROWSING
  // SURFACE only (`WorkspaceViewSwitcher`, the one prop every view reads).
  // It is deliberately NOT applied to `RecommendationHero`, readiness,
  // `CaseNotes`, or `OptionEditor`:
  //
  //  - a recommendation Sift already reached about an option must stay
  //    visible even while a filter hides that option from the list, or the
  //    product appears to silently retract its own answer;
  //  - a note referencing a hidden option would lose its subject;
  //  - the "Add option" editor reads existing options to avoid duplicates,
  //    which a filtered list would defeat.
  //
  // ADR 0005 (Consequences) requires Compare specifically to be driven by
  // `filters`; applying them to every option view is a superset of that,
  // chosen because a filter bar that silently affected only one tab is
  // exactly the "nothing familiar" problem this round of work exists to fix.
  const allOptions = useMemo(() => snapshot?.entities ?? [], [snapshot?.entities]);
  const filterableDefinitions = useMemo(
    () => snapshot?.attributeDefinitions ?? [],
    [snapshot?.attributeDefinitions],
  );
  // TWO independent narrowings, composed -- an option has to survive BOTH.
  //
  // The assistant's `visibleOptionIds` is a literal SET it named; the
  // person's `filters` are a RULE they stated. Neither is a special case of
  // the other, so neither may quietly win: composing them is what makes
  // "only the AWD ones" still mean something after the model has already
  // narrowed to three, and vice versa.
  //
  // Applied first, purely for readability of the count that follows -- the
  // functions are pure and order-independent (proven in
  // `workspace-filters.test.ts`). Both are presentation only: this can no
  // more reach scoring, readiness, or the recommendation than a filter can,
  // and for the same structural reason (see the note above about which
  // surfaces deliberately do NOT read this).
  //
  // The result is honest ONLY because `FilterBar` states both reasons the
  // list is short and offers a way out of each; a narrowing the person
  // cannot see or undo would be worse than not implementing it at all.
  const assistantNarrowedOptions = useMemo(
    () => applyAssistantNarrowing(allOptions, assistantVisibleOptionIds),
    [allOptions, assistantVisibleOptionIds],
  );
  const visibleOptions = useMemo(
    () => applyWorkspaceFilters(assistantNarrowedOptions, filters, filterableDefinitions),
    [assistantNarrowedOptions, filters, filterableDefinitions],
  );

  // Hoisted above this component's `activeCaseId === null` early return
  // (the launcher branch) together with `openProfile` below it: a
  // `useMemo` placed after a conditional return changes hook order
  // between renders, which React answers by rendering nothing at all.
  // Both depend only on `installedPacks`/`snapshot`, declared far above.
  const activePack = installedPacks.find((pack) => pack.identity.id === snapshot?.pack.id) ?? null;

  /**
   * The persistent frame's two halves, both derived rather than tracked.
   *
   * `deriveNextMoves` is the single source of "what should I do next" -- the
   * same list the WebMCP `sift_get_interaction_context` tool returns -- so
   * the pane and the model cannot disagree about it. The dock renders at
   * most the first two.
   */
  const decisionOrientation = useMemo(
    () => (snapshot === null ? null : buildDecisionOrientation(snapshot, activePack)),
    [snapshot, activePack],
  );
  const nextMoves = useMemo(
    () => (snapshot === null || activePack === null ? [] : deriveNextMoves(snapshot, activePack)),
    [snapshot, activePack],
  );

  // The human counterpart to `sift_get_option_details`, the WebMCP tool that
  // has been handing ChatGPT a complete per-option profile this whole time
  // while no screen showed one. Re-derived from the live snapshot on every
  // change (see `profileOptionId` above for why the id, not the record, is
  // what state holds).
  //
  // Deliberately built from `snapshot`, never from `visibleOptions`: a
  // filter narrows what you are BROWSING, and it must not be able to blank
  // out a detail view you already have open. `deriveOptionProfile` returns
  // `null` for an unknown id, which is also what a removed option should
  // produce -- an honest absence rather than an empty shell.
  const openProfile = useMemo(
    () =>
      snapshot === null || profileOptionId === null
        ? null
        : deriveOptionProfile(snapshot, profileOptionId, activePack?.presentation ?? null),
    [snapshot, profileOptionId, activePack],
  );

  // The deterministic ranking (ADR 0012), computed IN THE BROWSER from the
  // snapshot this component already holds rather than fetched. That is not an
  // optimization: `scoreCaseState` is pure and cheap, so a reweight arriving
  // over SSE re-renders the ranking in the same frame as every other
  // snapshot-derived value -- no request, no cache to invalidate, and no
  // window in which the visible order disagrees with the visible weights.
  // It is also the SAME function `apps/agent` calls when it validates a
  // recommendation, so the workspace can never show one leader while the
  // recommendation names another.
  //
  // Built from `snapshot`, deliberately never from `visibleOptions`: a rank
  // is a claim about the whole candidate set, and recomputing it over a
  // filtered subset would silently renumber "#2 of 4" to "#1 of 2" the moment
  // someone hid a car -- a different claim, made without saying so.
  const scoreboard = useMemo(() => buildWorkspaceScoreboard(snapshot), [snapshot]);

  // Read through the shared selector rather than off the board directly, so
  // the "no ranking when there is nothing to rank" gate lives in exactly one
  // place for all three surfaces that render it.
  const openProfileRanking = useMemo(
    () => (profileOptionId === null ? null : selectOptionRanking(scoreboard, profileOptionId)),
    [scoreboard, profileOptionId],
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

  /**
   * A Quick Pick judgment, persisted.
   *
   * Before this, Keep/Pass/Unsure only moved a local counter and "Shortlist"
   * merely focused the option -- the person's judgment vanished on reload
   * and ChatGPT could not read it back on its next turn, which made the
   * whole bidirectional claim untrue at exactly the beat the demo rests on.
   *
   * `unreviewed` is how undo is expressed: it puts the candidate back in the
   * queue as a normal forward command, so the history of what someone
   * considered and rejected stays in the event log rather than being erased.
   */
  const handleQuickPickDisposition = useCallback(
    (optionId: string, disposition: CandidateDisposition) => {
      if (snapshot === null || activeCaseId === null) return;
      commands
        .setCandidateDisposition({
          caseId: activeCaseId,
          expectedSequence: Math.max(snapshot.eventSequence, lastAcceptedSequenceRef.current),
          actor: 'human',
          entityId: optionId,
          disposition,
        })
        .then((receipt) => {
          lastAcceptedSequenceRef.current = Math.max(
            lastAcceptedSequenceRef.current,
            receipt.acceptedSequence,
          );
        })
        .catch(() => undefined);
      // Undo puts the candidate back in the queue rather than moving past
      // it; every other judgment advances.
      if (disposition !== 'unreviewed') handleQuickPickAdvance();
    },
    [commands, snapshot, activeCaseId, handleQuickPickAdvance],
  );

  /**
   * Taking a move from the action dock.
   *
   * The dock offers what `deriveNextMoves` says is valid, and each move
   * names the view it needs. A human-only move -- confirming a shortlist,
   * deciding -- carries no `toolName` by contract, and this handler does not
   * perform it either: it brings the person to the view where the real,
   * human-only control lives. Nothing here can approve anything.
   */
  /**
   * Puts the next question on screen.
   *
   * Everything in the request is read from the compiled pack -- the prompt
   * is the topic's own question, the options its declared seeds, the
   * escapes the ones it allows. Nothing is generated here.
   *
   * This closed the gap that made adaptive discovery unanswerable in the
   * running product: the dock rendered the next question as a button that
   * only switched views, so a person could not answer anything in the pane.
   */
  const handleAskTopic = useCallback(
    (topicId: string) => {
      const current = snapshotRef.current;
      if (current === null || activePack === null) return;
      const request = buildInteractionForTopic({
        pack: activePack,
        topicId,
        id: `interaction-${topicId}-${String(current.eventSequence)}`,
        now: new Date().toISOString(),
      });
      if (request === null) return;
      setInteractionError(null);
      commands
        .requestInteraction({
          caseId: current.id,
          expectedSequence: Math.max(current.eventSequence, lastAcceptedSequenceRef.current),
          interaction: request,
        })
        .then((receipt) => {
          lastAcceptedSequenceRef.current = Math.max(
            lastAcceptedSequenceRef.current,
            receipt.acceptedSequence,
          );
        })
        .catch((error: unknown) => {
          // Surfaced, not swallowed. A bare `.catch(() => undefined)` here
          // hid a schema rejection for an entire debugging session: the
          // button did nothing and the console said nothing.
          setInteractionError(
            error instanceof Error
              ? `Sift could not open that question: ${error.message}`
              : 'Sift could not open that question.',
          );
        });
    },
    [activePack, commands],
  );

  const handleInteractionResponse = useCallback(
    (response: InteractionResponse) => {
      const current = snapshotRef.current;
      if (current === null) return;
      commands
        .submitInteractionResponse({
          caseId: current.id,
          expectedSequence: Math.max(current.eventSequence, lastAcceptedSequenceRef.current),
          response,
        })
        .then((receipt) => {
          lastAcceptedSequenceRef.current = Math.max(
            lastAcceptedSequenceRef.current,
            receipt.acceptedSequence,
          );
        })
        .catch(() => undefined);
    },
    [commands],
  );

  const handleDockAction = useCallback(
    (move: NextMove) => {
      // A question is answered in place, not by navigating somewhere.
      if (
        (move.kind === 'answer_topic' || move.kind === 'confirm_inference') &&
        move.topicId !== undefined
      ) {
        handleAskTopic(move.topicId);
        return;
      }

      const viewForMove: Partial<Record<string, WorkspaceViewMode>> = {
        quick_pick: 'quick_pick',
        compare_retained: 'compare',
        discover_candidates: 'list',
      };
      const mode = viewForMove[move.kind];
      if (mode !== undefined) {
        handleViewModeChange(mode);
        return;
      }
      if (move.kind === 'discover_candidates' || move.kind === 'await_investigation') {
        handleRequestInvestigation();
      }
    },
    [handleViewModeChange, handleRequestInvestigation, handleAskTopic],
  );

  const handleQuickPickKeep = useCallback(
    (optionId: string) => {
      handleQuickPickDisposition(optionId, 'keep');
    },
    [handleQuickPickDisposition],
  );
  const handleQuickPickPass = useCallback(
    (optionId: string) => {
      handleQuickPickDisposition(optionId, 'pass');
    },
    [handleQuickPickDisposition],
  );
  const handleQuickPickUnsure = useCallback(
    (optionId: string) => {
      handleQuickPickDisposition(optionId, 'unsure');
    },
    [handleQuickPickDisposition],
  );
  const handleQuickPickUndo = useCallback(
    (optionId: string) => {
      handleQuickPickDisposition(optionId, 'unreviewed');
    },
    [handleQuickPickDisposition],
  );

  /** Canonical Quick Pick judgments, projected for the view. Derived from case state, never held locally. */
  const quickPickDispositions = useMemo<Record<string, CandidateDisposition>>(() => {
    const map: Record<string, CandidateDisposition> = {};
    for (const record of snapshot?.discovery?.dispositions ?? []) {
      map[record.entityId] = record.disposition;
    }
    return map;
  }, [snapshot]);

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
  // Scoring warnings, which say what could *not* be ranked and why.
  // Derivation and its cap live in `scoring-alerts.ts` so they are testable
  // without mounting the workspace.
  alertItems.push(...buildScoringAlerts(scoreboard.board.warnings));

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
          onOpenReferenceLibrary={() => setReferenceLibraryOpen(true)}
          referenceCount={snapshot?.sources.length ?? 0}
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

      {/*
        Rendered only for a case that has genuinely begun adaptive discovery.

        A seeded demo case arrives with candidates already present and no
        discovery at all, and forcing this shell onto one produces
        contradictions rather than orientation: it read "Narrowing down what
        you found" above "0 of 0 covered" above "Next: What this vehicle is
        for", which is three statements about three different journeys. The
        app bar and the recommendation hero already orient a seeded case;
        the shell has nothing true to add to one, so it says nothing.

        Found by rendering it and looking, not by a unit test -- every
        individual field was correct in isolation.
      */}
      {/*
        The pending interaction, rendered wherever the case has one.
        `submitInteractionResponse` clears it, so this appears and
        disappears purely from case state -- no local "is a question open"
        flag that a reload could disagree with.
      */}
      {snapshot?.discovery?.pendingInteraction != null && (
        <DiscoveryInteraction
          request={snapshot.discovery.pendingInteraction}
          onRespond={handleInteractionResponse}
          layout={layout}
        />
      )}

      {decisionOrientation !== null && snapshot?.discovery !== undefined && (
        <DecisionOrientationShell
          orientation={decisionOrientation}
          layout={layout}
          workInFlight={workInFlight}
          // `WorkspaceAppBar` directly above already names the decision.
          // Repeating it here stacked the same words twice, which no unit
          // test could see because they render the shell on its own.
          showDecisionTitle={false}
        />
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

      {/* What the deterministic scoreboard found -- rendered once, outside
          both layout branches, for the same reason the alert banner and the
          hero are: it is a summary of the whole case rather than a region
          either shell owns. `CaseInsightsPanel` returns `null` outright when
          the engine found nothing, so an uninteresting case grows no empty
          region (product.md's "Empty regions" rule). */}
      <CaseInsightsPanel insights={scoreboard.insights} layout={layout} />

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

            <FilterBar
              attributeDefinitions={filterableDefinitions}
              options={allOptions}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onOpenFilters={() => setFilterSheetOpen(true)}
              matchingCount={visibleOptions.length}
              totalCount={allOptions.length}
              presentation={activePack?.presentation ?? null}
              assistantVisibleOptionIds={assistantVisibleOptionIds}
              onClearAssistantNarrowing={handleClearAssistantNarrowing}
            />

            <WorkspaceViewSwitcher
              mode={viewMode}
              onModeChange={handleViewModeChange}
              // The FILTERED list -- see the `visibleOptions` comment above
              // for why this one prop is narrowed and the hero/notes/editor
              // deliberately are not.
              options={visibleOptions}
              attributeDefinitions={snapshot?.attributeDefinitions ?? []}
              caseExtensions={snapshot?.caseExtensions ?? []}
              presentation={activePack?.presentation ?? null}
              selectedOptionId={snapshot?.selectedOptionId ?? null}
              onFocusOption={handleFocusOption}
              compareOptionIds={compareOptionIds}
              compareVisibleAttributeIds={compareVisibleAttributeIds}
              comparePinnedAttributeIds={comparePinnedAttributeIds}
              quickPickPosition={quickPickPosition}
              quickPickDispositions={quickPickDispositions}
              onQuickPickKeep={handleQuickPickKeep}
              onQuickPickPass={handleQuickPickPass}
              onQuickPickUnsure={handleQuickPickUnsure}
              onQuickPickUndo={handleQuickPickUndo}
              onQuickPickFocusChange={() => undefined}
              // Real `Criterion[]`, so a card can rank its few facts by what
              // the person actually said matters whenever a pack declares no
              // `prominentAttributeIds` of its own.
              criteria={snapshot?.criteria ?? []}
              // The FULL board, not one narrowed to `visibleOptions` -- see
              // the `scoreboard` memo above for why a rank must not be
              // recomputed over a filtered subset.
              scoreboard={scoreboard}
              onOpenProfile={setProfileOptionId}
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
          {/* Same filter entry point as web-app mode, and the reason the
              filter surface moved out of the sidebar at all: this component
              tree has no sidebar, so filters previously did not exist here
              in any form (ADR 0009). */}
          <FilterBar
            attributeDefinitions={filterableDefinitions}
            options={allOptions}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onOpenFilters={() => setFilterSheetOpen(true)}
            matchingCount={visibleOptions.length}
            totalCount={allOptions.length}
            presentation={activePack?.presentation ?? null}
            assistantVisibleOptionIds={assistantVisibleOptionIds}
            onClearAssistantNarrowing={handleClearAssistantNarrowing}
          />

          <WorkspaceViewSwitcher
            mode={viewMode}
            onModeChange={handleViewModeChange}
            options={visibleOptions}
            attributeDefinitions={snapshot?.attributeDefinitions ?? []}
            caseExtensions={snapshot?.caseExtensions ?? []}
            presentation={activePack?.presentation ?? null}
            selectedOptionId={snapshot?.selectedOptionId ?? null}
            onFocusOption={handleFocusOption}
            compareOptionIds={compareOptionIds}
            compareVisibleAttributeIds={compareVisibleAttributeIds}
            comparePinnedAttributeIds={comparePinnedAttributeIds}
            quickPickPosition={quickPickPosition}
            quickPickDispositions={quickPickDispositions}
            onQuickPickKeep={handleQuickPickKeep}
            onQuickPickPass={handleQuickPickPass}
            onQuickPickUnsure={handleQuickPickUnsure}
            onQuickPickUndo={handleQuickPickUndo}
            onQuickPickFocusChange={() => undefined}
            criteria={snapshot?.criteria ?? []}
            scoreboard={scoreboard}
            onOpenProfile={setProfileOptionId}
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
      {interactionError ? <ErrorState message={interactionError} /> : null}

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
      {/* Mounted unconditionally, like every sheet below it, and NOT inside
          either layout branch: the filter surface is the one region that
          must be identical in both modes (ADR 0009), so it is global chrome
          rather than something each shell renders its own copy of. */}
      {/* The per-option detail surface, mounted as global chrome for the
          same reason the filter sheet is: both grids open it, in both
          layouts, so neither shell owns a copy. Closing clears the id
          rather than leaving a stale option selected behind a shut sheet. */}
      <OptionProfileSheet
        open={profileOptionId !== null}
        onOpenChange={(open) => {
          if (!open) setProfileOptionId(null);
        }}
        profile={openProfile}
        presentation={activePack?.presentation ?? null}
        ranking={openProfileRanking}
      />

      <ReferenceLibrarySheet
        open={referenceLibraryOpen}
        onOpenChange={setReferenceLibraryOpen}
        sources={snapshot?.sources ?? []}
        // `claims`/`evidenceLinks` are REQUIRED, not decorative: they are
        // the only way to tell a REFERENCE (kept because it is relevant)
        // from EVIDENCE (it answers a specific question). Passing them
        // empty would label every evidence source a bare reference --
        // a false claim about the case, not a cosmetic downgrade.
        claims={snapshot?.claims ?? []}
        evidenceLinks={snapshot?.evidenceLinks ?? []}
      />

      <FilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        attributeDefinitions={filterableDefinitions}
        options={allOptions}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        matchingCount={visibleOptions.length}
        totalCount={allOptions.length}
      />

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

      {/*
        Last in the flow, and sticky rather than fixed: Sift renders inside an
        iframe in the companion case, where a `fixed` element positions
        against the iframe viewport and ends up covering the last line of
        content. Sticky keeps the dock in flow, so the content above it is
        genuinely offset rather than merely appearing to be.
      */}
      {snapshot?.discovery !== undefined && (
        <ContextActionDock moves={nextMoves} onAct={handleDockAction} layout={layout} />
      )}
    </div>
  );
}
