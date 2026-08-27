/**
 * The demo launcher (docs/specs/product.md "Demo launcher"): "The initial
 * page presents exactly two options: Choose our next car ... Investigate my
 * energy bill ... Starting a demo resets its case to the checked-in fixture
 * and generates a fresh case ID." Both option labels below are copied
 * verbatim from that section -- they are also the exact accessible names
 * product.md's demo video scripts (docs/demo/*.md) expect a judge/host to
 * see and click.
 *
 * Both options call `startDemo` on the one shared `PaxCommands` client from
 * `usePaxCommands()` (CLAUDE.md "Visible UI controls and WebMCP callbacks
 * use the same command implementation") -- there is no separate launcher-only
 * fetch call.
 *
 * Required visible states covered here (product.md "Required visible
 * states"): initial/empty (both options enabled, nothing started yet),
 * loading (a command in flight), and recoverable error (a failed
 * `startDemo` call preserves the launcher -- it does not blank the page --
 * and offers a retry). The remaining states in that list (partial evidence,
 * active investigation, guided retry, ...) describe the case *workspace*,
 * not the launcher, and are out of scope for this component.
 */
import { useCallback, useState } from 'react';
import type { CommandReceipt } from '@pax/contracts';
import type { DemoId } from '@pax/contracts';
import { usePaxCommands } from '../app/AppProviders.js';

export interface DemoLauncherProps {
  /** Called once `startDemo` resolves, with the real `CommandReceipt` (carrying the fresh `caseId`) -- lets `App` transition from the launcher to the case workspace. */
  onDemoStarted?: (receipt: CommandReceipt) => void;
}

interface DemoOption {
  demoId: DemoId;
  testId: string;
  label: string;
  description: string;
}

const DEMO_OPTIONS: readonly DemoOption[] = [
  {
    demoId: 'car-purchase',
    testId: 'demo-launcher-car-purchase',
    label: 'Choose our next car',
    description: 'Compare shortlisted vehicles and dealer offers before you buy.',
  },
  {
    demoId: 'home-energy-guardian',
    testId: 'demo-launcher-home-energy-guardian',
    label: 'Investigate my energy bill',
    description: 'Find out why a utility bill changed and what to do about it.',
  },
];

type LauncherStatus =
  | { kind: 'idle' }
  | { kind: 'starting'; demoId: DemoId }
  | { kind: 'error'; demoId: DemoId; message: string };

export function DemoLauncher({ onDemoStarted }: DemoLauncherProps) {
  const commands = usePaxCommands();
  const [status, setStatus] = useState<LauncherStatus>({ kind: 'idle' });

  const startDemo = useCallback(
    (demoId: DemoId) => {
      setStatus({ kind: 'starting', demoId });
      commands
        .startDemo({ demoId })
        .then((receipt) => {
          setStatus({ kind: 'idle' });
          onDemoStarted?.(receipt);
        })
        .catch((error: unknown) => {
          setStatus({
            kind: 'error',
            demoId,
            message: error instanceof Error ? error.message : 'Could not start the demo.',
          });
        });
    },
    [commands, onDemoStarted],
  );

  const isBusy = status.kind === 'starting';
  const statusMessage =
    status.kind === 'starting'
      ? `Starting "${DEMO_OPTIONS.find((option) => option.demoId === status.demoId)?.label}"…`
      : '';

  return (
    <section
      data-testid="demo-launcher"
      aria-labelledby="demo-launcher-heading"
      className="mx-auto flex w-full max-w-[480px] flex-col gap-[var(--space-4)] p-[var(--space-4)]"
    >
      <div className="flex flex-col gap-[var(--space-1)]">
        <h1 id="demo-launcher-heading">Start a Pax case</h1>
        <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]">
          Choose a decision to investigate. Starting a demo resets it to the checked-in fixture and
          creates a fresh case.
        </p>
      </div>

      <div className="flex flex-col gap-[var(--space-3)] min-[900px]:flex-row">
        {DEMO_OPTIONS.map((option) => {
          const optionIsStarting = status.kind === 'starting' && status.demoId === option.demoId;
          return (
            <button
              key={option.demoId}
              type="button"
              data-testid={option.testId}
              aria-label={option.label}
              aria-describedby={`${option.testId}-description`}
              aria-busy={optionIsStarting}
              disabled={isBusy}
              onClick={() => {
                startDemo(option.demoId);
              }}
              className="flex min-h-[var(--size-touch-target-min)] flex-1 flex-col gap-[var(--space-1)] rounded-[var(--radius-xl)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)] text-left transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:border-[var(--color-brand)]"
            >
              <span className="font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] font-semibold text-[var(--color-ink)]">
                {option.label}
              </span>
              <span
                id={`${option.testId}-description`}
                className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <p
        data-testid="demo-launcher-status"
        aria-live="polite"
        className="min-h-[1em] text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
      >
        {statusMessage}
      </p>

      {status.kind === 'error' ? (
        <div
          role="alert"
          data-testid="demo-launcher-error"
          className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] p-[var(--space-3)] text-[var(--color-status-error-ink)]"
        >
          <p>Pax could not start that demo: {status.message}</p>
          <button
            type="button"
            data-testid="demo-launcher-retry"
            onClick={() => {
              startDemo(status.demoId);
            }}
            className="min-h-[var(--size-touch-target-min)] self-start rounded-[var(--radius-sm)] border border-[var(--color-status-error-border)] px-[var(--space-3)]"
          >
            Try again
          </button>
        </div>
      ) : null}
    </section>
  );
}
