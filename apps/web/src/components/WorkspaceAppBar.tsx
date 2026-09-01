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
 */
import { PlusIcon, RotateCcwIcon, SearchCheckIcon, TerminalIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { HelpButton } from './HelpButton.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export type WorkspaceAppBarConnectionState = 'live' | 'reconnecting' | 'offline';

export interface WorkspaceAppBarProps {
  title: string;
  connectionState: WorkspaceAppBarConnectionState;
  /** Real, current count -- always rendered as a badge, including `0` (de-emphasised, never hidden; see header comment). */
  findingsCount: number;
  /** Real, current option count, rendered as the compact secondary status line beside the connection badge. */
  optionCount: number;
  onAddOption: () => void;
  onReviewFindings: () => void;
  onOpenDeveloperView: () => void;
  /** Omitted entirely (not merely disabled) when the caller has no reset affordance to offer -- matches `docs/specs/product.md`'s "Empty regions" rule against rendering a control with nothing behind it. */
  onResetDemo?: () => void;
  /** True while a reset-demo command is in flight; disables and relabels the reset control. Meaningless (ignored) when `onResetDemo` is not supplied. */
  resetPending?: boolean;
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

export function WorkspaceAppBar({
  title,
  connectionState,
  findingsCount,
  optionCount,
  onAddOption,
  onReviewFindings,
  onOpenDeveloperView,
  onResetDemo,
  resetPending = false,
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
        <h1
          data-testid="workspace-app-bar-title"
          className="min-w-0 truncate text-[length:var(--font-size-lg)]"
        >
          {title}
        </h1>
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
          <Button
            type="button"
            data-testid="workspace-app-bar-add-option"
            aria-label="Add option"
            onClick={onAddOption}
            variant="default"
            size={isExpanded ? 'sm' : 'icon'}
            className={isExpanded ? TOUCH_TARGET : TOUCH_TARGET_ICON}
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            {isExpanded ? 'Add option' : null}
          </Button>

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
          <HelpButton />

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

          {onResetDemo ? (
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
          ) : null}
        </div>
      </div>
    </header>
  );
}
