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
import type { CaseState } from '@pax/contracts';

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
 * Case-status -> UI label. Grounded per status:
 * - `ready` uses "Ready for decision" -- product.md's terminology table maps
 *   `Convergence` -> "Ready for decision" verbatim, and `ready` is the case
 *   status that convergence produces.
 * - `waiting` uses "Waiting for confirmation" -- copied verbatim from
 *   product.md's "Required visible states" list.
 * - `failed` uses "Recoverable error" -- copied verbatim from the same list,
 *   rather than borrowing "Action blocked" (that label is reserved for the
 *   `Deny` intervention outcome, a distinct policy concept from a technical
 *   run failure -- design-system.md draws the same distinction between the
 *   `blocked` and `error` status tokens).
 * - `draft`/`investigating`/`decided` are plain, non-ambiguous state names
 *   with no separate terminology-table entry to defer to.
 */
const CASE_STATUS_LABEL: Record<CaseState['status'], string> = {
  draft: 'Draft',
  investigating: 'Investigating',
  waiting: 'Waiting for confirmation',
  ready: 'Ready for decision',
  decided: 'Decided',
  failed: 'Recoverable error',
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
      className="flex flex-col gap-[var(--space-3)] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <div className="flex items-start justify-between gap-[var(--space-3)]">
        <h1 data-testid="case-header-title" className="min-w-0 flex-1">
          {title}
        </h1>
        <button
          type="button"
          data-testid="case-header-reset-demo"
          aria-label="Reset demo"
          aria-busy={resetPending}
          disabled={resetPending}
          onClick={onResetDemo}
          className="min-h-[var(--size-touch-target-min)] shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-[var(--space-3)] text-[length:var(--font-size-sm)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resetPending ? 'Resetting…' : 'Reset demo'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <span
          data-testid="case-header-pack-badge"
          title={pack.compiledHash}
          className="label-caps inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] border border-[var(--color-border-subtle)] bg-[var(--color-brand-tint)] px-[var(--space-2)] py-[var(--space-0-5)] text-[var(--color-brand-strong)]"
        >
          Decision Pack: {pack.id}@{pack.version}{' '}
          <span className="font-[family-name:var(--font-mono)] normal-case tracking-normal">
            #{shortHash}
          </span>
        </span>

        <span
          data-testid="case-header-run-status"
          className="label-caps inline-flex items-center rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
          style={{
            color: 'var(--color-status-active-ink)',
            backgroundColor: 'var(--color-status-active-bg)',
          }}
        >
          {CASE_STATUS_LABEL[status]}
        </span>

        <span
          data-testid="case-header-connection-status"
          role="status"
          className="label-caps inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
          style={{ color: connection.inkVar, backgroundColor: connection.bgVar }}
        >
          <span
            aria-hidden="true"
            className={`h-[6px] w-[6px] shrink-0 rounded-full ${connection.pulse ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: connection.inkVar }}
          />
          {connection.label}
        </span>
      </div>

      <p
        data-testid="case-header-pack-explanation"
        className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
      >
        {pack.selectedBy === 'user'
          ? 'You selected this Decision Pack.'
          : 'Pax selected this Decision Pack automatically.'}
        {pack.reasons.length > 0 ? ` ${pack.reasons.join(' ')}` : null}
      </p>
    </header>
  );
}
