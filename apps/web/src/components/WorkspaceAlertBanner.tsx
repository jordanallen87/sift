/**
 * The thing the bottom-of-page disclosure rows were burying (see
 * `WorkspaceAppBar.tsx`'s header comment for the full origin quote): "What
 * Sift found," a ready-for-review recommendation, or any other notice the
 * workspace needs the user to actually see renders here, immediately below
 * `WorkspaceAppBar`, as real, differentiated alerts -- never as a sixth
 * identical `DisclosureSection` row a user would have to expand to
 * discover.
 *
 * Purely presentational, like `WorkspaceAppBar.tsx`: no data fetching, no
 * context, no command dispatch, no knowledge of *why* an item exists. The
 * caller decides what belongs in `items` (a findings-ready notice, a
 * recommendation-ready notice, a plain informational note, ...); this
 * component only knows how to render whatever tone/message/action it is
 * handed, legibly and consistently.
 *
 * **Renders nothing at all -- not even an empty wrapper element -- when
 * `items` is empty.** `docs/specs/product.md`'s "Empty regions" rule is
 * explicit and is quoted directly here because it is this component's whole
 * contract: "Do not render an empty conceptual region merely because
 * `CaseState` contains a corresponding field... An empty state must be
 * intentional, compact, and attached to the region that owns the concept --
 * never its own full-height card whose entire content is an announcement of
 * its own emptiness." An empty alert banner has no non-vacuous content to
 * announce (contrast `findingsCount: 0` in `WorkspaceAppBar`, which is a
 * real, meaningful fact worth a de-emphasised badge) -- there is nothing to
 * de-emphasise here, only nothing to show, so this component returns `null`
 * outright rather than an empty `<div>` a screen reader or a visual scan
 * would have to confirm is empty. Matches `CaseExtensionReviewCard`'s
 * already-established precedent, cited by the same product.md paragraph:
 * "mounts only while an extension is genuinely pending rather than
 * rendering its own 'nothing pending' copy."
 *
 * Tone -> `STATUS_TONE_META` (`activity-labels.ts`) mapping, chosen from
 * existing tokens only (no new colours, per this task's constraint):
 *
 * - `ready` -> `STATUS_TONE_META.ready` (teal): a direct name match, and the
 *   same tone `ApprovalCard.tsx`'s "Your approval needed" badge already
 *   uses for "attention has shifted from the agent to the human" --
 *   `docs/design-system.md`'s own required-states table names that exact
 *   phrase for this exact tone ("waiting for confirmation | `ready`").
 * - `attention` -> `STATUS_TONE_META['accepted-uncertainty']` (ochre): the
 *   same choice `WorkspaceAppBar.tsx` makes for its findings-count badge,
 *   for the same reason -- `docs/design-system.md` groups `blocked`,
 *   `accepted-uncertainty`, and `ready` together as "states that need
 *   attention," and `accepted-uncertainty` is the one of those three not
 *   already carrying a more specific claimed meaning ("stuck on a human,"
 *   "awaiting your approval") that a generic "notice this" alert would
 *   collide with.
 * - `info` -> `STATUS_TONE_META.open` (stone gray): `docs/design-system.md`'s
 *   own Runtime Inspector section already establishes this exact
 *   equivalence for a plain informational severity level -- "an event's
 *   `level` maps... `info`/`debug` -> `open`/`--color-ink-muted`" -- reused
 *   verbatim here for the identical semantic (a low-urgency notice, not a
 *   case status).
 *
 * Each item reuses `STATUS_TONE_META.icon`, the same "single aria-hidden
 * decorative glyph shared by every tone" `ReadinessPanel.tsx`/
 * `FindingsSheet.tsx` already render, rather than importing a fresh set of
 * lucide icons for a fourth place in the app to invent tone iconography.
 *
 * Built on the shadcn `Alert`/`AlertDescription` primitives
 * (`components/ui/alert.tsx`) per this task's explicit instruction to use
 * them, with the tone's ink/bg layered on top via inline `style` --  the
 * same "keep the shared primitive's structure, override only the specific
 * colour" technique `ApprovalCard.tsx`/`ReadinessPanel.tsx` already use, since
 * `alertVariants` only ships two variants (`default`/`destructive`), neither
 * of which is any of this component's three tones.
 *
 * `layout` is an explicit caller-supplied prop, never computed here (the
 * same discipline as `WorkspaceAppBar.tsx`/`OptionCompareView.tsx` -- see
 * either header comment). At `narrow`, alerts stack full-width, one per
 * row, matching the pane's single-column reading order. At `expanded`, they
 * lay out as a wrapping row of cards -- a genuinely different arrangement
 * for the wider "shopping site" web-app view the project owner asked for,
 * not the same markup merely stretched by CSS -- while `flex-wrap` still
 * guarantees no horizontal page overflow if there are more alerts than fit
 * one row.
 */
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export type WorkspaceAlertBannerTone = 'attention' | 'ready' | 'info';

export interface WorkspaceAlertBannerItem {
  id: string;
  tone: WorkspaceAlertBannerTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface WorkspaceAlertBannerProps {
  items: WorkspaceAlertBannerItem[];
  layout: 'narrow' | 'expanded';
}

/** See header comment's "Tone -> STATUS_TONE_META mapping" section for the reasoning behind each of these three choices. */
const TONE_META: Record<WorkspaceAlertBannerTone, StatusTone> = {
  attention: 'accepted-uncertainty',
  ready: 'ready',
  info: 'open',
};

export function WorkspaceAlertBanner({ items, layout }: WorkspaceAlertBannerProps) {
  if (items.length === 0) {
    return null;
  }

  const isExpanded = layout === 'expanded';

  return (
    <div
      data-testid="workspace-alert-banner"
      data-layout={layout}
      className={
        isExpanded
          ? 'flex flex-wrap items-stretch gap-[var(--space-3)]'
          : 'flex flex-col gap-[var(--space-2)]'
      }
    >
      {items.map((item) => {
        const meta = STATUS_TONE_META[TONE_META[item.tone]];
        const hasAction = Boolean(item.actionLabel) && Boolean(item.onAction);

        return (
          <Alert
            key={item.id}
            data-testid={`workspace-alert-banner-item-${item.id}`}
            data-tone={item.tone}
            // `flex-1 min-w-[260px]` only matters in the expanded wrapping
            // row (ignored by the narrow single-column stack, which sets
            // its own full-width flow via the parent's `flex-col`); it lets
            // several alerts share a row without ever forcing a fixed
            // width narrower than 260px reads comfortably.
            className={isExpanded ? 'min-w-[260px] flex-1' : undefined}
            style={{ backgroundColor: meta.bg }}
          >
            {/*
              `AlertDescription` is deliberately this component's ONLY
              direct child -- `alertVariants`'s grid only opens a real icon
              column via its `has-[>svg]:` selector, which needs a literal
              `<svg>` child; this component intentionally reuses
              `STATUS_TONE_META.icon`'s plain-text glyph instead (see header
              comment), so the icon is laid out inside this single
              `col-start-2` cell via ordinary flex, rather than as a
              sibling grid item that would be auto-placed into the
              (intentionally 0-width, icon-less) first grid column.
            */}
            <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-[var(--space-2)]">
              <span className="flex min-w-0 flex-1 items-start gap-[var(--space-2)]">
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[length:var(--font-size-md)] leading-none"
                  style={{ color: meta.ink }}
                >
                  {meta.icon}
                </span>
                <p
                  className="min-w-0 text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)]"
                  style={{ color: meta.ink }}
                >
                  {item.message}
                </p>
              </span>
              {hasAction ? (
                <Button
                  type="button"
                  data-testid={`workspace-alert-banner-action-${item.id}`}
                  onClick={item.onAction}
                  variant="secondary"
                  size="sm"
                  // Same fix `ApprovalCard.tsx`/`ReadinessPanel.tsx` already
                  // apply: this button sits on a tinted status background
                  // (`meta.bg`), and the default `secondary` fill
                  // (`--color-surface-sunken`) sits too close in lightness
                  // to several of these tints to read as a real button.
                  // `bg-card` (pure white/`--color-surface`) restores
                  // contrast regardless of which tone this item carries.
                  className="min-h-[var(--size-touch-target-min)] shrink-0 bg-card text-card-foreground hover:bg-card/90"
                >
                  {item.actionLabel}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
