/**
 * The persistent top app bar for the generic decision workspace.
 *
 * Origin: the project owner's own review of the shipped workspace singled
 * out the bottom-of-page disclosure row as the concrete defect this
 * component fixes -- "These bottom sections should be at the top, but not
 * in this format. Buttons, icon buttons, alerts, etc. For example, if it
 * finds things, wouldn't we want to surface that at the top and stand out
 * so the user clicks on it? Right now you've got it at the bottom -- they'll
 * never even see it... You literally just crammed everything into a
 * collapsible section." Before this component, "What Sift found," "Add
 * something Sift should check," case identity, and case controls were five
 * visually identical `DisclosureSection` rows at the very end of the page --
 * a write action, a create action, and a findings count buried at exactly
 * the point a user is least likely to keep scrolling. This component and
 * its sibling `WorkspaceAlertBanner` are the fix: real, differentiated,
 * always-visible chrome pinned to the top of both the narrow pane and the
 * expanded "shopping site" web-app view (the same owner direction: "this is
 * supposed to have a web app view too... It's supposed to emulate a
 * shopping website at full width").
 *
 * This component is purely presentational (no data fetching, no context,
 * no command dispatch) -- it owns no state and calls nothing but the
 * callback props it is given, exactly like `CaseHeader.tsx`, whose
 * title/connection-status/developer-view/reset-demo responsibilities it
 * supersedes as the primary top-of-page chrome. `CaseHeader.tsx` itself is
 * deliberately left untouched by this task -- the integrating orchestrator
 * (not this file) decides whether/when `App.tsx` swaps one for the other,
 * so every `data-testid` here is prefixed `workspace-app-bar-`, distinct
 * from `case-header-*`, so the two can coexist without collision during
 * that transition.
 *
 * Two responsibilities beyond the old header's three (title, connection,
 * reset/dev-view):
 *
 * - **"Add option"** and **"Findings N"** move from bottom-of-page write/
 *   read actions to top-of-page, always-visible controls with real visual
 *   weight -- directly answering the owner's "add action at the top" and
 *   "stand out so the user clicks on it" requests. `findingsCount` renders
 *   as a real `Badge` chip at every count (never conditionally hidden), but
 *   is deliberately de-emphasised at `0` (ghost/muted) and given the
 *   `accepted-uncertainty` status tint the moment there is something to
 *   review, matching `docs/design-system.md`'s own grouping of "states that
 *   need attention" as `blocked`, `accepted-uncertainty`, `ready` --
 *   `accepted-uncertainty` (ochre) reads as "notice this" without
 *   `blocked`'s specific "stuck on a human" meaning or `ready`'s
 *   already-claimed "awaiting your approval" meaning (`ApprovalCard.tsx`).
 * - **`optionCount`** renders as a compact secondary line beside the
 *   connection badge -- the same "compact status summary" idea
 *   `docs/specs/product.md` §59's Case identity region describes ("4
 *   vehicles · Comparing · 2 things need attention"), which the shipped
 *   `CaseHeader` never actually implemented (its own header comment records
 *   that gap explicitly). It is not in the task's approved ASCII sketch, but
 *   is a required prop; this is the smallest addition consistent with that
 *   sketch rather than a bolted-on extra region.
 *
 * `layout` is an explicit caller-supplied prop, never computed here via
 * `matchMedia` -- the same discipline `OptionCompareView.tsx`/
 * `OptionListView.tsx`/`OptionBoardView.tsx` already established ("this
 * component never calls matchMedia itself... that mechanism... belongs to
 * the caller that owns `WorkspaceViewState`, not to this presentational
 * leaf"). The narrow/expanded split changes concrete rendering, not just
 * CSS: at `expanded` every control that has room gets a real label; at
 * `narrow` "Add option," "Findings," and "Reset demo" collapse to icon-only
 * buttons (still real, un-hidden, >=44px controls, per
 * `docs/design-system.md`'s touch-target section) because five fully
 * labelled controls cannot fit a 390px row without wrapping into a second
 * line that would itself compete with the page below it. "Developer view"
 * and Help stay icon-only at every width -- exactly how the approved
 * sketch renders them (`[?] [>_]`) even in its "expanded" example, and
 * exactly how `CaseHeader.tsx` already treats both today.
 *
 * The connection-status treatment (dot + pill, `active` tone for
 * live/reconnecting with a pulse while reconnecting, `error` tone for
 * offline) is a deliberate visual match for `CaseHeader.tsx`'s own
 * `CONNECTION_META`, re-expressed through `STATUS_TONE_META`
 * (`activity-labels.ts`) rather than inlined `var(--color-status-*)`
 * strings, per this task's explicit instruction to follow the
 * `STATUS_TONE_META` pattern `RecommendationCard.tsx`/`ApprovalCard.tsx`
 * already use. `connectionState` intentionally omits `CaseHeader`'s
 * `'polling'` value -- the task's own prop contract specifies exactly
 * `'live' | 'reconnecting' | 'offline'`, and this component has no polling-
 * specific affordance to attach a fourth state to.
 *
 * Help is not a callback prop: `<HelpButton />` is already a fully
 * self-contained, prop-less control (its own trigger button plus its own
 * uncontrolled `Sheet`, per `HelpButton.tsx`'s header comment) reused
 * verbatim from `CaseHeader.tsx`'s identical usage, rather than re-built or
 * threaded through a new `onOpenHelp` callback this component's approved
 * prop list never asked for.
 *
 * ---
 *
 * **Post-ship visual repair (owner click-through at 430px width) -- three
 * fixes, all inside this file, no prop-contract change:**
 *
 * 1. **Findings badge attachment.** The narrow-layout Findings control used
 *    to render its count as an `absolute -top-1 -right-1` corner overlay on
 *    a `size="icon"` ghost button. That is a standard "notification badge"
 *    pattern, and the box math was correct (measured live: the badge's
 *    bottom edge lands almost exactly at the search icon's top edge), but
 *    it reads as detached anyway, because a ghost button has no visible
 *    fill/boundary and its 16px icon glyph is centered inside a 44px hit
 *    box -- the badge ends up floating in that invisible padding "dead
 *    zone" above and right of the glyph, nowhere near anything the eye
 *    reads as "the control." There is nothing to visually attach *to*.
 *    Fixed by dropping the absolute overlay entirely and laying the count
 *    out **inline**, in normal flex flow, directly beside the icon --
 *    exactly the "inline count beside the icon" alternative this task's
 *    brief names, and exactly the technique the *expanded*-layout badge
 *    already used correctly (that one was never broken). The control is no
 *    longer forced into a fixed square (`size="icon"`); it is sized by its
 *    own content (icon + gap + count chip) with only a touch-target *floor*
 *    (`TOUCH_TARGET`, not `TOUCH_TARGET_ICON`'s added `min-w`), so the count
 *    is always physically touching the icon it belongs to, at every width,
 *    by construction rather than by offset arithmetic against invisible
 *    padding.
 * 2. **Narrow toolbar decoding load.** Five undifferentiated icon buttons in
 *    a row forces a reader to inspect each glyph to find the two that
 *    matter. The row is now two explicit visual clusters separated by a
 *    `Separator` (docs/design-system.md's existing divider primitive, not a
 *    new one): **primary** (Add option, Findings -- unchanged strength:
 *    filled/tinted, full 44px icon box) and **secondary** (Help, Developer
 *    view, Reset demo -- all recede together: smaller glyphs, `icon-sm`
 *    visual footprint still floored at the same 44px hit area via
 *    `TOUCH_TARGET_ICON`, muted ink). The task's own defect description
 *    names Help and Developer view as "secondary" by example, not as an
 *    exhaustive pair; Reset demo is exactly as non-primary (a demo/utility
 *    control, not a shopping action) and was previously the visually
 *    *loudest* element in the row (`variant="secondary"`, a filled chip) --
 *    leaving it out of the recede treatment would trade "five
 *    undifferentiated icons" for "one accidentally-loudest icon," not fix
 *    the crowding. `HelpButton` cannot be resized from here (it is a
 *    separate, prop-less, self-contained component -- see above), but it
 *    was already ghost/muted at `size-5`, i.e. already visually consistent
 *    with the other two once they recede to match. No capability moves
 *    behind a menu or becomes harder to reach (ADR 0008): every control
 *    stays a direct, always-mounted, single-click target in both layouts;
 *    only relative visual weight changes. Grouping (not hiding) is the
 *    chosen fix because a real overflow menu would need a new interactive
 *    disclosure primitive this task's file-ownership boundary does not
 *    include, and would force every currently-flat `getByTestId(...)`
 *    assertion in the sibling test file into an "open the menu first" shape
 *    for no behavioural gain -- the crowding complaint is about *visual*
 *    differentiation, which grouping solves directly.
 * 3. **`reconnecting` pill prominence.** `CaseHeader.tsx` (the component
 *    this one supersedes) already draws the correct distinction, and
 *    docs/design-system.md §"reconnecting / replaying / polling fallback"
 *    already documents it: a genuinely-transient reconnect attempt gets the
 *    loud `active` tone with a pulse; a settled **polling fallback** --
 *    still delivering real data, nothing broken -- gets the calm, muted
 *    `open` tone with no animation. This component's prop contract
 *    (`'live' | 'reconnecting' | 'offline'`, per this task's locked
 *    interface) has no fourth `'polling'` value to carry that distinction,
 *    so every non-live, non-offline moment -- including a long-settled,
 *    perfectly healthy polling fallback -- arrived here as `'reconnecting'`
 *    and, before this fix, was rendered with the loud, perpetually-pulsing
 *    `active` treatment forever. An animation that claims "actively
 *    retrying right now" and never resolves is not an honest signal, and a
 *    shopping site does not need alarm-toned chrome for "still getting you
 *    data, just not over the fastest channel." `reconnecting` now renders
 *    with the same calm `open` tone and no pulse that design-system.md
 *    already assigns to polling fallback specifically -- the signal is
 *    never hidden (the pill and its "Reconnecting…" label still render,
 *    unconditionally, exactly like every other state), it is only no
 *    longer overstated. See `docs/build-log.md`'s dated entry for the
 *    upstream finding (confirmed live against the running dev server) that
 *    the real, five-state connection hook this maps from is otherwise
 *    reporting the truth -- `App.tsx`'s own `mapAppBarConnectionState` is
 *    not a bug, so this fix is entirely a rendering-prominence change
 *    inside this file, not a prop or caller change.
 *
 * ---
 *
 * **Second post-ship repair: "Add option" becomes a create MENU.**
 *
 * The project owner's follow-up review made two related complaints. First,
 * about the two remaining create surfaces: "Add a note and add a question
 * should be in either the header or footer toolbars -- not at the bottom of
 * the stack." Both were still `DisclosureSection` rows at the very end of the
 * narrow content column, which is the exact defect this component was built
 * to fix for "Add option" and "What Sift found"; they were simply not in the
 * original fix's scope. Second, about this row itself: "The header is
 * consuming more space than it needs to. Need to see if we can figure out
 * how to get all of this into one row. I think it's possible by using things
 * like menus."
 *
 * Those two pull in opposite directions -- three create actions cannot each
 * take a slot in a row that is already tight at 390px -- and a menu is what
 * resolves them, which is also what was asked for by name. The single "Add
 * option" button is now a `DropdownMenu` trigger ("Add or adjust") over
 * three items: **Add option**, **Add a note**, and **Add a question**. Each
 * item calls a plain callback prop, exactly as the button did; this component
 * still owns no state and still fetches nothing. The pane gets *shorter*
 * (two bottom-of-stack disclosure rows deleted) while the header grows by
 * nothing at all -- the trigger occupies the same slot the old button did.
 *
 * This is not a reversal of fix 2's decision above ("Grouping (not hiding) is
 * the chosen fix... a real overflow menu would need a new interactive
 * disclosure primitive this task's file-ownership boundary does not
 * include"). That decision was about *secondary* controls whose problem was
 * purely visual differentiation, and it stands -- Help, Developer view and
 * Reset demo are still flat, always-mounted, single-click targets. This menu
 * groups the three *create* actions, which is a different problem (there is
 * genuinely no room for three), and the primitive it needs now exists:
 * `ui/dropdown-menu.tsx`, whose own header comment carries the accessibility
 * contract in full.
 *
 * ADR 0008's "every capability must be reachable in both [modes]" is met by
 * construction rather than by a layout branch: the trigger renders in both
 * layouts (labelled "Add" at expanded, icon-only with a tooltip at narrow,
 * exactly like the button it replaces) and holds the same three items at
 * every width. Nothing became wide-only, nothing became pointer-only --
 * Radix supplies arrow keys, typeahead, Enter/Space and Escape-restores-
 * focus, all asserted behaviourally in the sibling test file rather than
 * assumed.
 */
import type { Ref } from 'react';
import {
  ChevronDownIcon,
  CircleQuestionMarkIcon,
  LibraryIcon,
  NotebookPenIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchCheckIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpButton } from './HelpButton.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export type WorkspaceAppBarConnectionState = 'live' | 'reconnecting' | 'offline';

export interface WorkspaceAppBarProps {
  title: string;
  connectionState: WorkspaceAppBarConnectionState;
  /** Real, current count -- always rendered as a badge, including `0` (de-emphasised, never hidden; see header comment). */
  findingsCount: number;
  /** Opens the case's reference library. Optional: a caller that has not wired it renders no control rather than a dead one. */
  onOpenReferenceLibrary?: (() => void) | undefined;
  /** How many sources the case holds, shown so the control reports something real rather than an unexplained icon. */
  referenceCount?: number | undefined;
  /** Real, current option count, rendered as the compact secondary status line beside the connection badge. */
  optionCount: number;
  /** The create menu's first item. Same contract as the button it replaces: open the caller's "add an option" surface. */
  onAddOption: () => void;
  /** The create menu's second item -- opens the caller's "add a note" surface (formerly a bottom-of-stack disclosure row). */
  onAddNote: () => void;
  /** The create menu's third item -- opens the caller's "add a question" surface (formerly a bottom-of-stack disclosure row). */
  onAddConcern: () => void;
  /**
   * Opens the weights surface. Optional, and rendered as nothing rather
   * than as a disabled control when a caller has not wired it -- the same
   * rule `onOpenReferenceLibrary` follows.
   *
   * It lives in the bar rather than in `WorkspaceSidebar`'s Priorities
   * region because the sidebar does not render at all in the narrow pane,
   * and the narrow pane is where this product is actually used.
   */
  onAdjustPriorities?: (() => void) | undefined;
  onReviewFindings: () => void;
  onOpenDeveloperView: () => void;
  /** Omitted entirely (not merely disabled) when the caller has no reset affordance to offer -- matches `docs/specs/product.md`'s "Empty regions" rule against rendering a control with nothing behind it. */
  onResetDemo?: () => void;
  /** True while a reset-demo command is in flight; disables and relabels the reset control. Meaningless (ignored) when `onResetDemo` is not supplied. */
  resetPending?: boolean;
  /**
   * Optional handle on the Help control's own button, forwarded straight to
   * `HelpButton`. `App.tsx` passes it so `FirstRunGuide` -- a dialog that
   * opens on its own, with no trigger for Radix to restore focus to -- can
   * hand focus back to the one control that reopens the same content. Every
   * other prop here is behaviour this bar owns; this one is a pass-through,
   * so the bar neither reads nor reacts to it.
   */
  helpButtonRef?: Ref<HTMLButtonElement>;
  layout: 'narrow' | 'expanded';
}

/**
 * Connection-state -> label/tone/pulse. Mirrors `CaseHeader.tsx`'s
 * `CONNECTION_META` for `live`/`offline`, but deliberately *diverges* from
 * `CaseHeader`'s `reconnecting` entry (see this file's header comment, fix
 * 3): `CaseHeader` has a real fourth `'polling'` state to carry "settled,
 * healthy fallback" separately from "actively retrying," so it can afford
 * to give `reconnecting` the loud, pulsing `active` treatment. This
 * component's locked three-state prop contract collapses both meanings onto
 * `reconnecting`, so `reconnecting` here uses `open` -- design-system.md's
 * own documented tone for the *polling-fallback* case specifically -- with
 * no pulse, because that is the calmer, still-true-either-way reading:
 * "not on the fastest channel," not "something is actively wrong."
 */
const CONNECTION_META: Record<
  WorkspaceAppBarConnectionState,
  { label: string; tone: StatusTone; pulse: boolean }
> = {
  live: { label: 'Live', tone: 'active', pulse: false },
  reconnecting: { label: 'Reconnecting…', tone: 'open', pulse: false },
  offline: { label: 'Offline', tone: 'error', pulse: false },
};

/** Shared >=44px CSS-pixel hit area (`docs/design-system.md`'s touch-target section, backed by `--size-touch-target-min`) -- applied to every actionable control below regardless of its visual size. */
const TOUCH_TARGET = 'min-h-[var(--size-touch-target-min)]';
const TOUCH_TARGET_ICON = `${TOUCH_TARGET} min-w-[var(--size-touch-target-min)]`;

/**
 * The create menu trigger's accessible name, and (at narrow width) its
 * tooltip. Deliberately longer than its visible "Add" label: an icon-only
 * `+` announced as just "Add" tells a screen-reader or voice-control user
 * nothing about what gets added, and WCAG 2.5.3 ("Label in Name") only
 * requires the visible text to be CONTAINED in the accessible name, which
 * "Add" is.
 */
const CREATE_MENU_LABEL = 'Add or adjust';
const PRIORITIES_LABEL = 'Adjust priorities';

/**
 * A pointer-only label for a control that is currently rendering as a bare
 * glyph, following the precedent `HelpButton` already sets in this row.
 *
 * `enabled` rather than always-on, because this row's controls change shape
 * with `layout`: at expanded width `Add option`, `Findings`, `References` and
 * `Reset demo` render their own visible text, and a tooltip that repeats a
 * label the user is already reading is noise. At narrow width the same
 * controls collapse to icon-and-count, which is exactly the case
 * `ui/tooltip.tsx` describes -- "a control whose meaning is otherwise carried
 * by an icon alone". `Developer view` is icon-only at every width, so it is
 * always wrapped.
 *
 * The label passed here is deliberately the control's `aria-label` verbatim,
 * per that primitive's own convention: the two can then never drift, and a
 * voice-control user can say the words they see (WCAG 2.5.3, "Label in
 * Name"). Nothing depends on the tooltip -- every control below already
 * carries a real accessible name and stays fully usable with the tooltip
 * deleted, which is what keeps this honest for the touch and screen-reader
 * users who never see one.
 *
 * `side="bottom"` for the same reason `HelpButton` uses it: this is the top
 * row of the pane, so a top-side panel would only be flipped by collision
 * handling anyway.
 */
function GlyphTooltip({
  label,
  enabled,
  children,
}: {
  readonly label: string;
  readonly enabled: boolean;
  readonly children: React.ReactElement;
}): React.JSX.Element {
  if (!enabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkspaceAppBar({
  title,
  connectionState,
  findingsCount,
  onOpenReferenceLibrary,
  referenceCount = 0,
  optionCount,
  onAddOption,
  onAddNote,
  onAddConcern,
  onAdjustPriorities,
  onReviewFindings,
  onOpenDeveloperView,
  onResetDemo,
  resetPending = false,
  helpButtonRef,
  layout,
}: WorkspaceAppBarProps) {
  const connection = CONNECTION_META[connectionState];
  const connectionMeta = STATUS_TONE_META[connection.tone];
  const isExpanded = layout === 'expanded';

  const hasFindings = findingsCount > 0;
  // See header comment: `accepted-uncertainty` is this component's chosen
  // "needs your attention" tint the moment there is something to review;
  // `neutral` (the same muted/subtle pairing `activity-labels.ts` reserves
  // for "nothing has happened yet") is the de-emphasised zero-count state --
  // still a real, clickable control, never removed from the row.
  const findingsMeta = STATUS_TONE_META[hasFindings ? 'accepted-uncertainty' : 'neutral'];

  return (
    <header
      data-testid="workspace-app-bar"
      data-layout={layout}
      // `--z-sticky`/`--shadow-soft` are tokens.css's own named-for-this
      // purpose values ("case header, primary action bar" / "sticky
      // header/action bar" respectively) -- this is the first component to
      // actually claim that intended role. Sticky positioning is the
      // literal mechanism for "these should be at the top" staying true
      // even after the user has scrolled the workspace body below it.
      className="sticky top-0 z-[var(--z-sticky)] flex flex-wrap items-center justify-between gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-3)] shadow-[var(--shadow-soft)]"
    >
      <div className="flex min-w-0 flex-col gap-[var(--space-1)]">
        {/* The symbol, beside the case title, as the workspace's only
            persistent statement of whose software this is. Sift's canonical
            surface is a pane docked inside somebody else's product, where
            there is no browser chrome, no tab strip and no page header to
            supply that -- the case title names the decision, and nothing
            names the tool.

            Measured before it was added rather than after, because this row
            is genuinely tight (see fix 2 above). At 390px the bar already
            wraps into two rows -- identity above, toolbar below -- and the
            identity row uses 156 of the 358px available to it. A 24px mark
            plus a `--space-2` gap grows that row to ~188px and leaves the
            bar's height, the toolbar's row and the title's own truncation
            point unchanged; nothing moves and no control loses its place.

            `shrink-0` next to the title's existing `min-w-0 truncate` is
            what keeps that true for a long title: the title absorbs the
            squeeze by truncating, exactly as it does today, instead of
            crushing the mark.

            The one-colour `sift-mark.svg` (`symbol-green`), not the
            multi-tone `symbol-primary`, and not `symbol-core`:
            docs/brand/BRAND-GUIDE.md "Small sizes" calls for the one-colour
            symbol below ~48px, and `symbol-core-*` -- which the same section
            recommends below ~64px -- turns out to be a single-path master
            that renders as a bare crescent rather than a legible S, so it is
            not usable in the product as exported. 24px (`--space-6`) is
            where the particle field was still reading cleanly when the
            variants were rendered and inspected side by side.

            `alt=""`: the `<h1>` beside it is the accessible name of this
            banner, and it names the case, which is what someone arriving
            here needs. The product is already named by the document title.
            A branded image announcing "Sift" ahead of every case title is
            noise a sighted user can skip and a screen-reader user cannot.

            `width`/`height` are the viewBox's, for aspect ratio before load
            (`h-[...] w-auto` sets the real size) -- see `DemoLauncher`. */}
        <div className="flex min-w-0 items-center gap-[var(--space-2)]">
          <img
            src="/brand/sift-mark.svg"
            alt=""
            width={290}
            height={277}
            data-testid="workspace-app-bar-brand-mark"
            className="h-[var(--space-6)] w-auto shrink-0"
          />
          <h1
            data-testid="workspace-app-bar-title"
            className="min-w-0 truncate text-[length:var(--font-size-lg)]"
          >
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <Badge
            data-testid="workspace-app-bar-connection-status"
            role="status"
            className="label-caps w-fit gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
            style={{ color: connectionMeta.ink, backgroundColor: connectionMeta.bg }}
          >
            <span
              aria-hidden="true"
              className={`h-[6px] w-[6px] shrink-0 rounded-full ${connection.pulse ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: connectionMeta.ink }}
            />
            {connection.label}
          </Badge>
          <span
            data-testid="workspace-app-bar-option-count"
            className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
          >
            {optionCount} {optionCount === 1 ? 'option' : 'options'}
          </span>
        </div>
      </div>

      <div
        role="toolbar"
        aria-label="Workspace actions"
        className="flex shrink-0 flex-wrap items-center gap-[var(--space-2)]"
      >
        {/* Primary cluster: the two content-changing shopping actions this
            task's brief names explicitly. Full-strength styling (filled for
            Add option, tinted-on-active for Findings) -- unchanged by this
            repair (see fix 2 in the header comment). */}
        <div className="flex shrink-0 items-center gap-[var(--space-1-5)]">
          {/* One trigger, three create actions -- see this file's header
              comment (second post-ship repair) for why this is a menu now
              and why that does not contradict fix 2's grouping decision.
              `GlyphTooltip` sits OUTSIDE `DropdownMenuTrigger` so both Radix
              layers anchor to the one real `Button` element underneath;
              the tooltip only fires at narrow width, where the trigger has
              no visible text of its own. */}
          <DropdownMenu
            // `modal={false}` on purpose. Every item here opens a `Sheet`
            // (a Radix Dialog), and a modal menu closing in the same tick a
            // modal dialog opens makes two `react-remove-scroll` locks fight
            // over `document.body` -- the documented failure mode being a
            // body left at `pointer-events: none` with nothing on the page
            // clickable. A non-modal menu keeps arrow keys, typeahead,
            // Escape, outside-click dismissal and focus restoration (all
            // asserted in this file's sibling test); it only drops the
            // scroll lock and the `aria-hidden` blanket over the rest of the
            // page, neither of which a three-item create menu needs.
            modal={false}
          >
            <GlyphTooltip label={CREATE_MENU_LABEL} enabled={!isExpanded}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  data-testid="workspace-app-bar-create-menu"
                  // Radix supplies `aria-haspopup="menu"`/`aria-expanded`; it
                  // does not supply a name, so this stays explicit.
                  aria-label={CREATE_MENU_LABEL}
                  variant="default"
                  size={isExpanded ? 'sm' : 'icon'}
                  className={isExpanded ? TOUCH_TARGET : TOUCH_TARGET_ICON}
                >
                  <PlusIcon aria-hidden="true" className="size-4" />
                  {isExpanded ? 'Add' : null}
                  {isExpanded ? (
                    <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-70" />
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
            </GlyphTooltip>
            {/* `align="end"`: this trigger sits at the right edge of the row
                in both layouts, so an end-aligned panel opens inward instead
                of being shifted back in by collision handling. */}
            <DropdownMenuContent
              align="end"
              data-testid="workspace-app-bar-create-menu-content"
              aria-label={CREATE_MENU_LABEL}
            >
              <DropdownMenuItem
                data-testid="workspace-app-bar-add-option"
                // `onSelect`, not `onClick`: Radix fires it for pointer AND
                // keyboard activation, so an Enter/Space user is not a
                // second code path that can silently rot.
                onSelect={onAddOption}
              >
                <PlusIcon aria-hidden="true" />
                Add option
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="workspace-app-bar-add-note" onSelect={onAddNote}>
                <NotebookPenIcon aria-hidden="true" />
                Add a note
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="workspace-app-bar-add-concern" onSelect={onAddConcern}>
                <CircleQuestionMarkIcon aria-hidden="true" />
                Add a question
              </DropdownMenuItem>
              {/* Not a create action, which is why the menu is named "Add or
                  adjust" rather than "Add to this case". It lives here
                  because the bar is genuinely full at 390px -- see the
                  header's note on crowding -- and a seventh always-mounted
                  icon overflowed the pane by 34px. This is a new capability
                  arriving behind a menu, not an existing one being moved
                  there, so ADR 0008's "no capability moves behind a menu"
                  rule is untouched. */}
              {onAdjustPriorities !== undefined ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid="workspace-app-bar-priorities"
                    onSelect={onAdjustPriorities}
                  >
                    <SlidersHorizontalIcon aria-hidden="true" />
                    {PRIORITIES_LABEL}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <GlyphTooltip label={`Findings, ${String(findingsCount)}`} enabled={!isExpanded}>
            <Button
              type="button"
              data-testid="workspace-app-bar-findings"
              // A single accessible name carrying the count in both layouts --
              // the visible `Badge` count below is always `aria-hidden` (see
              // its own comment) so the number is never announced twice.
              aria-label={`Findings, ${findingsCount}`}
              onClick={onReviewFindings}
              variant="ghost"
              // `size="sm"` at every width, not `isExpanded ? 'sm' : 'icon'` --
              // see fix 1 in the header comment. The control is sized by its
              // own inline content (icon, optional label, count chip) instead
              // of a fixed square, so the count chip is always laid out
              // touching the icon by construction; `TOUCH_TARGET` supplies
              // the height floor `sm`'s own `h-8` doesn't reach on its own.
              size="sm"
              className={`gap-[var(--space-1)] ${TOUCH_TARGET} ${isExpanded ? '' : 'px-[var(--space-2)]'}`}
              style={
                hasFindings
                  ? { color: findingsMeta.ink, backgroundColor: findingsMeta.bg }
                  : undefined
              }
            >
              <SearchCheckIcon aria-hidden="true" className="size-4" />
              {isExpanded ? 'Findings' : null}
              <Badge
                data-testid="workspace-app-bar-findings-count"
                aria-hidden="true"
                className="label-caps rounded-[var(--radius-pill)] px-[var(--space-1-5)] py-0"
                style={{ color: findingsMeta.ink, backgroundColor: 'var(--color-surface)' }}
              >
                {findingsCount}
              </Badge>
            </Button>
          </GlyphTooltip>

          {/* The reference library: the case's collected research, and the
              durable half of what the model remembers about this decision.
              Sits beside Findings because they answer adjacent questions --
              "what did Sift conclude" and "what did Sift read" -- and both
              are global chrome, reachable identically in both layouts.
              Absent, not disabled, when no caller wired it. */}
          {onOpenReferenceLibrary !== undefined ? (
            <GlyphTooltip label={`References, ${String(referenceCount)}`} enabled={!isExpanded}>
              <Button
                type="button"
                data-testid="workspace-app-bar-references"
                onClick={onOpenReferenceLibrary}
                aria-label={`References, ${referenceCount}`}
                variant="ghost"
                size="sm"
                className={`gap-[var(--space-1)] ${TOUCH_TARGET} ${isExpanded ? '' : 'px-[var(--space-2)]'}`}
              >
                <LibraryIcon aria-hidden="true" className="size-4" />
                {isExpanded ? 'References' : null}
                <Badge
                  data-testid="workspace-app-bar-references-count"
                  aria-hidden="true"
                  className="label-caps rounded-[var(--radius-pill)] px-[var(--space-1-5)] py-0"
                >
                  {referenceCount}
                </Badge>
              </Button>
            </GlyphTooltip>
          ) : null}
        </div>

        {/* `decorative` (Radix's default) keeps this out of the a11y tree --
            it is a purely visual grouping cue, not a semantic boundary a
            screen reader needs to announce. Height is an inline `style`,
            not a `className`, on purpose: `ui/separator.tsx`'s own base
            classes set `data-[orientation=vertical]:h-full`, a
            data-attribute-conditioned selector whose specificity beats a
            plain `h-6` class regardless of source order (confirmed live --
            a plain `className="h-6"` override rendered at a measured 0px
            height, because `h-full`'s `100%` had no definite parent height
            to resolve against). An inline style always wins the cascade, so
            it is the only override that is not fragile against that
            specificity quirk. */}
        <Separator orientation="vertical" style={{ height: 'var(--space-6)' }} />

        {/* Secondary cluster: Help, Developer view, Reset demo -- utility/
            informational controls, not shopping actions. Deliberately
            receded (smaller glyphs, muted ink) so the primary cluster keeps
            visual priority in the narrow row; see fix 2 in the header
            comment for why Reset demo is grouped here too even though the
            defect text named only Help/Developer view by example. Nothing
            here is hidden or moved behind a menu -- every control stays a
            single, always-mounted, directly clickable element in both
            layouts, per ADR 0008's "every capability must be reachable in
            both [modes]." */}
        <div className="flex shrink-0 items-center gap-[var(--space-1)]">
          <HelpButton {...(helpButtonRef !== undefined ? { ref: helpButtonRef } : {})} />

          {/* Icon-only at every width, so unlike its neighbours this one is
              always wrapped. */}
          <GlyphTooltip label="Developer view" enabled>
            <Button
              type="button"
              data-testid="workspace-app-bar-developer-view"
              aria-label="Developer view"
              onClick={onOpenDeveloperView}
              variant="ghost"
              size="icon-sm"
              className={`${TOUCH_TARGET_ICON} shrink-0 text-[var(--color-ink-secondary)] hover:text-foreground`}
            >
              <TerminalIcon aria-hidden="true" className="size-4" />
            </Button>
          </GlyphTooltip>

          {onResetDemo ? (
            <GlyphTooltip label="Reset demo" enabled={!isExpanded}>
              <Button
                type="button"
                data-testid="workspace-app-bar-reset-demo"
                aria-label="Reset demo"
                aria-busy={resetPending}
                disabled={resetPending}
                onClick={onResetDemo}
                // Expanded keeps the original labelled `secondary` (filled
                // chip) treatment; collapsed-to-icon-only at narrow recedes to
                // the same ghost/muted look as Help and Developer view, so the
                // secondary cluster reads as one consistent group rather than
                // one loud icon among two quiet ones.
                variant={isExpanded ? 'secondary' : 'ghost'}
                size={isExpanded ? 'sm' : 'icon-sm'}
                className={
                  isExpanded
                    ? TOUCH_TARGET
                    : `${TOUCH_TARGET_ICON} text-[var(--color-ink-secondary)] hover:text-foreground`
                }
              >
                {isExpanded ? (
                  resetPending ? (
                    'Resetting…'
                  ) : (
                    'Reset demo'
                  )
                ) : (
                  <RotateCcwIcon aria-hidden="true" className="size-4" />
                )}
              </Button>
            </GlyphTooltip>
          ) : null}
        </div>
      </div>
    </header>
  );
}
