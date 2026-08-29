/**
 * The demo launcher (docs/specs/product.md "Demo launcher"). Since ADR 0003
 * (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md), this
 * renders one primary, non-demo action ("Compare vehicles", handled by
 * `onCompareVehicles` -- `App.tsx` owns what happens next) above the two
 * original demo cards, grouped under an "Or try a finished example" heading.
 * Both demo option labels below are still copied verbatim from product.md's
 * "Demo launcher" section -- they are also the exact accessible names
 * product.md's demo video scripts (docs/demo/*.md) expect a judge/host to
 * see and click, and their `startDemo` wiring, copy, and `data-testid`s are
 * completely unchanged by that ADR.
 *
 * Both demo options call `startDemo` on the one shared `PaxCommands` client
 * from `usePaxCommands()` (CLAUDE.md "Visible UI controls and WebMCP
 * callbacks use the same command implementation") -- there is no separate
 * launcher-only fetch call.
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
  /** Called when the primary "Compare vehicles" action is clicked (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md) -- lets `App` transition into `VehicleCatalogFlow`. Optional so this component still renders correctly (minus that one action) in isolation/tests that don't need it. */
  onCompareVehicles?: () => void;
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

export function DemoLauncher({ onDemoStarted, onCompareVehicles }: DemoLauncherProps) {
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
        className="page-enter flex w-full max-w-[480px] flex-col gap-[var(--space-4)]"
      >
        <div className="flex flex-col gap-[var(--space-1)]">
          <h1
            id="demo-launcher-heading"
            className="font-[family-name:var(--font-display)] text-[length:var(--font-size-xl)] font-semibold text-foreground"
          >
            Start a Pax case
          </h1>
          <p className="text-[length:var(--font-size-sm)] text-muted-foreground">
            Compare real vehicles from the bundled catalog, or try a finished example.
          </p>
        </div>

        {/* Primary, non-demo entry point (ADR 0003): a normal, useful
            product action, not a fixture reset -- placed above the demo
            cards and visually distinguished by the default (filled) Button
            variant instead of the demo cards' flat bg-card treatment. */}
        <button
          type="button"
          data-testid="demo-launcher-compare-vehicles"
          onClick={onCompareVehicles}
          className="flex min-h-[var(--size-touch-target-min)] cursor-pointer flex-col gap-[var(--space-1)] rounded-[var(--radius-lg)] bg-primary px-[var(--space-4)] py-[var(--space-4)] text-left text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <CardTitle className="font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] text-primary-foreground">
            Compare vehicles
          </CardTitle>
          <CardDescription className="text-primary-foreground/80">
            Browse a real vehicle catalog, build a shortlist, and start your own comparison.
          </CardDescription>
        </button>

        <div className="flex flex-col gap-[var(--space-2)]">
          <p className="label-caps text-[length:var(--font-size-xs)] text-muted-foreground">
            Or try a finished example
          </p>
          <div className="flex flex-col gap-[var(--space-3)] min-[900px]:flex-row">
            {DEMO_OPTIONS.map((option) => {
              const optionIsStarting =
                status.kind === 'starting' && status.demoId === option.demoId;
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
