/**
 * Case identity line (`docs/decisions/
 * 0004-consumer-workspace-information-architecture.md`, decision item 1;
 * change-set `docs/change-sets/2026-08-30-generic-decision-workspace.md`
 * §6's Header sketch: "a decision title, a compact status summary, and
 * nothing else").
 *
 * This component used to also carry the Decision Pack badge (id, version,
 * a truncated compiled hash) and a pack-selection explanation sentence.
 * ADR 0004 removes both from the consumer surface directly: "Decision Pack
 * id, version, and compiled hash leave the consumer surface entirely, per
 * change-set §4's terminology table (`compiled hash -> Developer view
 * only`) and §6's explicit instruction: 'Do NOT put pack hashes, IDs,
 * command IDs, or developer metadata here.'" The same decision item also
 * observes that the case-status enum badge (`draft`/`decided`) never
 * carried the "compact status summary" §6 actually asks for (it only ever
 * read "Draft" or "Decided," never something like "2 things need
 * attention"); ADR 0004's own explicit list of what this component keeps --
 * "title + live connection status + reset" -- has no third badge in it
 * either, so it is dropped rather than kept as an orphaned, low-information
 * pill. The richer "what do I need to know / do" summary the change-set
 * sketch describes is now the merged answer-first hero's job
 * (`RecommendationHero.tsx`, driven by `workspace-status.ts`), not this
 * header's -- the header only orients the reader to *which* case they are
 * looking at and whether the connection to it is live, exactly as ADR
 * 0004 specifies.
 *
 * `CaseHeaderProps.status` and `CaseHeaderProps.pack` (previously required
 * so the removed badge/sentence had something to render) are gone from this
 * component's contract entirely, not merely unrendered -- there is no
 * lingering unused prop a caller could pass and wonder why it does
 * nothing.
 *
 * Task A5, "a real developer-mode entry point": before this task there was
 * no explicit, discoverable way for a person to reach the Runtime Inspector
 * at all -- the only existing trigger ("Inspect run" on `RecommendationHero`
 * /`LiveRunStatus`) only appears once a run has actually happened this
 * session. `onOpenDeveloperView` is that entry point: one small, clearly
 * secondary icon control alongside the existing Help/Reset controls, so it
 * never competes with the primary action or adds height that could push
 * the recommendation hero below the fold (the above-the-fold invariant this
 * task's brief gates on `assertRecommendationHeroAboveTheFold`). It opens
 * the SAME `RuntimeInspector` every other trigger opens (§34: "reuse the
 * existing Runtime Inspector wherever possible... do not build a redundant
 * separate debug system") -- `App.tsx` owns what exactly it opens to
 * (developer view generally, vs. a specific run/event).
 */
import type { CaseState } from '@sift/contracts';
import { TerminalIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpButton } from './HelpButton.js';

export type CaseHeaderConnectionState = 'live' | 'reconnecting' | 'polling' | 'offline';

export interface CaseHeaderProps {
  title: CaseState['title'];
  connectionState: CaseHeaderConnectionState;
  onResetDemo: () => void;
  /** True while a reset-demo command is in flight; disables and relabels the reset control. */
  resetPending?: boolean;
  /** Opens the developer/inspect view (Task A5; change-set §36 "Provide an intentional developer/inspect entry point"). Always available once a case is open -- unlike the run-scoped "Inspect run" control, this needs no prior activity to be reachable. */
  onOpenDeveloperView: () => void;
}

/**
 * Connection-state -> UI label and status-token class. `reconnecting` and
 * `polling` map to design-system.md's documented treatment ("a small
 * connection indicator using `active` (pulsing, motion-token-driven) for
 * reconnecting, and `open`/muted for polling fallback"); `live` reuses the
 * same `active` token for the steady connected state -- design-system.md's
 * own Palette rationale names `--color-brand` as "the active" signal, and a
 * live SSE connection is exactly that; `offline` uses the `error` token
 * (a technical connection failure, not a case-domain `blocked` state).
 */
const CONNECTION_META: Record<
  CaseHeaderConnectionState,
  { label: string; inkVar: string; bgVar: string; pulse: boolean }
> = {
  live: {
    label: 'Live',
    inkVar: 'var(--color-status-active-ink)',
    bgVar: 'var(--color-status-active-bg)',
    pulse: false,
  },
  reconnecting: {
    label: 'Reconnecting…',
    inkVar: 'var(--color-status-active-ink)',
    bgVar: 'var(--color-status-active-bg)',
    pulse: true,
  },
  polling: {
    label: 'Polling for updates',
    inkVar: 'var(--color-status-open-ink)',
    bgVar: 'var(--color-status-open-bg)',
    pulse: false,
  },
  offline: {
    label: 'Offline',
    inkVar: 'var(--color-status-error-ink)',
    bgVar: 'var(--color-status-error-bg)',
    pulse: false,
  },
};

export function CaseHeader({
  title,
  connectionState,
  onResetDemo,
  resetPending = false,
  onOpenDeveloperView,
}: CaseHeaderProps) {
  const connection = CONNECTION_META[connectionState];

  return (
    <header
      data-testid="case-header"
      // Flat by design: no border-b -- the case-workspace flex gap between
      // this header and the next region (App.tsx) already lets
      // bg-background (the page) show through as the visual separator, the
      // same white-island-on-tinted-page mechanism as every other card.
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <div className="flex items-start justify-between gap-[var(--space-3)]">
        <h1 data-testid="case-header-title" className="min-w-0 flex-1">
          {title}
        </h1>
        <div className="flex shrink-0 items-start gap-[var(--space-1)]">
          <HelpButton />
          {/*
           * A terminal glyph is the least self-explanatory control in this
           * header, so it is the one that most benefits from a pointer-only
           * label -- which is all this is. The `aria-label` below still
           * carries the name; deleting the tooltip changes nothing about
           * how this button is announced or operated.
           */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                data-testid="case-header-developer-view"
                aria-label="Developer view"
                onClick={onOpenDeveloperView}
                variant="ghost"
                size="icon"
                className="min-h-[var(--size-touch-target-min)] min-w-[var(--size-touch-target-min)] shrink-0 text-[var(--color-ink-secondary)] hover:text-foreground"
              >
                <TerminalIcon className="size-5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Developer view</TooltipContent>
          </Tooltip>
          <Button
            type="button"
            data-testid="case-header-reset-demo"
            aria-label="Reset demo"
            aria-busy={resetPending}
            disabled={resetPending}
            onClick={onResetDemo}
            variant="secondary"
            size="sm"
            className="min-h-[var(--size-touch-target-min)] shrink-0"
          >
            {resetPending ? 'Resetting…' : 'Reset demo'}
          </Button>
        </div>
      </div>

      <Badge
        data-testid="case-header-connection-status"
        role="status"
        className="label-caps w-fit gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
        style={{ color: connection.inkVar, backgroundColor: connection.bgVar }}
      >
        <span
          aria-hidden="true"
          className={`h-[6px] w-[6px] shrink-0 rounded-full ${connection.pulse ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: connection.inkVar }}
        />
        {connection.label}
      </Badge>
    </header>
  );
}
