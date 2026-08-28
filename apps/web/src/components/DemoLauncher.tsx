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
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    // The standalone-browser page shell (docs/build-log.md's dated entry):
    // the canonical surface is a 390-480px right pane (CLAUDE.md), which
    // reads correctly once embedded in ChatGPT's own chrome, but a judge
    // opening the deployed URL directly in a full desktop tab has no such
    // chrome to dock inside -- min-h-screen + centered flex here gives that
    // same pane a real, intentional-looking home instead of floating
    // unstyled top-left in an otherwise blank page.
    <div className="flex min-h-screen w-full items-start justify-center bg-background p-[var(--space-4)] min-[900px]:items-center">
      <section
        data-testid="demo-launcher"
        aria-labelledby="demo-launcher-heading"
        className="flex w-full max-w-[480px] flex-col gap-[var(--space-4)]"
      >
        <div className="flex flex-col gap-[var(--space-1)]">
          <h1
            id="demo-launcher-heading"
            className="font-[family-name:var(--font-display)] text-[length:var(--font-size-xl)] font-semibold text-foreground"
          >
            Start a Pax case
          </h1>
          <p className="text-[length:var(--font-size-sm)] text-muted-foreground">
            Choose a decision to investigate. Starting a demo resets it to the checked-in fixture
            and creates a fresh case.
          </p>
        </div>

        <div className="flex flex-col gap-[var(--space-3)] min-[900px]:flex-row">
          {DEMO_OPTIONS.map((option) => {
            const optionIsStarting = status.kind === 'starting' && status.demoId === option.demoId;
            return (
              // A native <button>, not the Card *component* (Card has no
              // `asChild` -- only Button/Badge get Radix's Slot support) --
              // styled with the same flat bg-card/rounded-[var(--radius-lg)]
              // classes Card itself uses, so this option keeps real button
              // semantics (keyboard activation, disabled state, focus ring)
              // while still reading as a card.
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
                className="flex min-h-[var(--size-touch-target-min)] flex-1 cursor-pointer flex-col gap-[var(--space-1)] rounded-[var(--radius-lg)] bg-card px-[var(--space-4)] py-[var(--space-4)] text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CardTitle className="font-[family-name:var(--font-display)] text-[length:var(--font-size-md)]">
                  {option.label}
                </CardTitle>
                <CardDescription id={`${option.testId}-description`}>
                  {option.description}
                </CardDescription>
              </button>
            );
          })}
        </div>

        <p
          data-testid="demo-launcher-status"
          aria-live="polite"
          className="min-h-[1em] text-[length:var(--font-size-sm)] text-muted-foreground"
        >
          {statusMessage}
        </p>

        {status.kind === 'error' ? (
          <Alert
            role="alert"
            data-testid="demo-launcher-error"
            variant="destructive"
            className="flex-col items-start gap-[var(--space-2)]"
          >
            <AlertDescription>Pax could not start that demo: {status.message}</AlertDescription>
            <Button
              type="button"
              data-testid="demo-launcher-retry"
              variant="secondary"
              size="sm"
              className="min-h-[var(--size-touch-target-min)]"
              onClick={() => {
                startDemo(status.demoId);
              }}
            >
              Try again
            </Button>
          </Alert>
        ) : null}
      </section>
    </div>
  );
}
