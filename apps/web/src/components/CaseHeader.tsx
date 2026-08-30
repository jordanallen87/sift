/**
 * Region 1, "Case header" (docs/specs/product.md "Workspace layout"):
 * "title, Decision Pack badge, pack-selection explanation, live
 * connection/run status, reset-demo action."
 *
 * Pure presentational component: it accepts `CaseState`-grounded data as
 * props rather than fetching internally, per this task's brief -- there is
 * no live case data source wired up yet, and keeping this component
 * data-agnostic keeps it independently testable now and ready for a later
 * task to feed it real `CaseState`/connection data (see
 * `apps/web/src/app/App.tsx`'s comment on why it does not render
 * `CaseHeader` yet).
 *
 * Every user-facing string here is grounded in product.md's "User-facing
 * terminology" table or its "Required visible states" list, never invented
 * ad hoc -- see the inline comments on `CASE_STATUS_LABEL` below.
 */
import type { CaseState } from '@sift/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HelpButton } from './HelpButton.js';

export type CaseHeaderConnectionState = 'live' | 'reconnecting' | 'polling' | 'offline';

export interface CaseHeaderProps {
  title: CaseState['title'];
  pack: CaseState['pack'];
  status: CaseState['status'];
  connectionState: CaseHeaderConnectionState;
  onResetDemo: () => void;
  /** True while a reset-demo command is in flight; disables and relabels the reset control. */
  resetPending?: boolean;
}

/**
 * Case-status -> UI label.
 *
 * Only two statuses exist (ADR 0004). `CASE_STATUSES` previously declared six,
 * but the audit found that no code path anywhere in `packages/` or `apps/`
 * ever assigned `investigating`, `waiting`, `ready`, or `failed` -- the only
 * writes are `'draft'` at case creation (`create-case.ts`, `reducer.ts`) and
 * `'decided'` on approval (`reducer.ts`, `policy.ts`). This map used to carry
 * carefully-sourced labels for all six, which is exactly what made the gap
 * invisible: the UI looked complete while four of its branches were
 * unreachable, and the badge read "Draft" beside a finished investigation
 * because `recommendation.ready` never touches `status` at all.
 *
 * The four unreachable values were removed from the contract rather than
 * wired up, because change set section 37 replaces this lifecycle vocabulary
 * wholesale with task-shaped stages. Do not reintroduce a label here without
 * a real producer for the status it names.
 */
const CASE_STATUS_LABEL: Record<CaseState['status'], string> = {
  draft: 'Draft',
  decided: 'Decided',
};

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
  pack,
  status,
  connectionState,
  onResetDemo,
  resetPending = false,
}: CaseHeaderProps) {
  const connection = CONNECTION_META[connectionState];
  const shortHash = pack.compiledHash.slice(0, 8);

  return (
    <header
      data-testid="case-header"
      // Flat by design: no border-b -- the case-workspace flex gap between
      // this header and the next card (App.tsx) already lets bg-background
      // (the page) show through as the visual separator, the same
      // white-island-on-tinted-page mechanism as every other card.
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <div className="flex items-start justify-between gap-[var(--space-3)]">
        <h1 data-testid="case-header-title" className="min-w-0 flex-1">
          {title}
        </h1>
        <div className="flex shrink-0 items-start gap-[var(--space-1)]">
          <HelpButton />
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

      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Badge
          data-testid="case-header-pack-badge"
          title={pack.compiledHash}
          variant="outline"
          // min-w-0 + max-w-full: a flex item's default `min-width: auto`
          // refuses to shrink below its content's natural width (the
          // classic flex/truncate gotcha), which is what let this badge
          // silently overflow past the viewport edge at 390px instead of
          // truncating. `text-overflow: ellipsis` also does not apply
          // directly to a flex container's own box (this badge is
          // `inline-flex`) -- it only affects a normal block/inline-block
          // box's own inline content -- so the actual `truncate` utility
          // lives on the nested span below, which wraps all of the badge's
          // text as that single truncatable inline run.
          className="label-caps min-w-0 max-w-full gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)] text-[var(--color-brand-strong)]"
        >
          <span className="min-w-0 truncate">
            Decision Pack: {pack.id}@{pack.version}{' '}
            <span className="font-[family-name:var(--font-mono)] normal-case tracking-normal">
              #{shortHash}
            </span>
          </span>
        </Badge>

        <Badge
          data-testid="case-header-run-status"
          className="label-caps rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
          style={{
            color: 'var(--color-status-active-ink)',
            backgroundColor: 'var(--color-status-active-bg)',
          }}
        >
          {CASE_STATUS_LABEL[status]}
        </Badge>

        <Badge
          data-testid="case-header-connection-status"
          role="status"
          className="label-caps gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
          style={{ color: connection.inkVar, backgroundColor: connection.bgVar }}
        >
          <span
            aria-hidden="true"
            className={`h-[6px] w-[6px] shrink-0 rounded-full ${connection.pulse ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: connection.inkVar }}
          />
          {connection.label}
        </Badge>
      </div>

      <p
        data-testid="case-header-pack-explanation"
        className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
      >
        {pack.selectedBy === 'user'
          ? 'You selected this Decision Pack.'
          : 'Sift selected this Decision Pack automatically.'}
        {pack.reasons.length > 0 ? ` ${pack.reasons.join(' ')}` : null}
      </p>
    </header>
  );
}
