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
 * Both demo options call `startDemo` on the one shared `SiftCommands` client
 * from `useSiftCommands()` (CLAUDE.md "Visible UI controls and WebMCP
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
import type { CommandReceipt } from '@sift/contracts';
import type { DemoId } from '@sift/contracts';
import { useSiftCommands } from '../app/AppProviders.js';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { HelpButton } from './HelpButton.js';

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
  const commands = useSiftCommands();
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
        className="pane-shell page-enter flex flex-col gap-[var(--space-4)]"
      >
        <div className="flex flex-col gap-[var(--space-3)]">
          {/* The full horizontal lockup, and the only place in the product
              that carries it. This is the first screen anyone -- a judge
              included -- meets, and before a case exists there is no case
              title, no app bar and no chrome of any kind saying whose
              software this is; the heading below says "Sift" in passing, in
              body copy. So the logo is doing identification work here that
              nothing else is doing, which is what earns it the space.

              `logo-horizontal-primary` (the `/brand/sift-logo.svg` build
              already serves) rather than the one-colour `-green` variant:
              its near-black `IFT` gives the wordmark materially more
              contrast against `--color-background` than green-on-paper
              does, and the green symbol beside it is the same
              `--color-brand` (#1F5C52) the app was just recoloured to, so
              it harmonises rather than competing.

              40px (`--space-10`) is a floor, not a taste call.
              docs/brand/BRAND-GUIDE.md "Small sizes" warns that "the
              decorative sift particles can become visually dense" at small
              scale, and rendering every candidate variant at 28/32/40/48/64
              px and looking at them (see docs/build-log.md's dated entry)
              puts the point where the particle field stops muddying at
              ~40px. At the horizontal lockup's 748:276 ratio that is 108px
              wide -- comfortably inside even the 390px pane, and the mark
              still has its "width of the `I` stem" clear space, which the
              `--space-3` gap below and the shell's own padding supply.

              `alt=""`, deliberately: the `<h1>` directly below already reads
              "Start a Sift case", so a screen-reader user is told the
              product's name by real text. Giving this an accessible name
              would announce "Sift" and then immediately "Start a Sift
              case" -- noise, not information, and precisely the redundant
              image labelling that makes people turn images off.

              `width`/`height` are the artwork's own viewBox dimensions, not
              a rendered size (`h-[...] w-auto` decides that). They are here
              so the browser knows the aspect ratio before the SVG has
              loaded and reserves the right box for it, rather than
              collapsing to zero and then shoving the heading, the primary
              action and both demo cards down the page on load. */}
          <div className="flex items-center justify-between gap-[var(--space-2)]">
            <img
              src="/brand/sift-logo.svg"
              alt=""
              width={748}
              height={276}
              className="h-[var(--space-10)] w-auto"
            />
            <HelpButton />
          </div>
          <div className="flex flex-col gap-[var(--space-1)]">
            <h1
              id="demo-launcher-heading"
              className="font-[family-name:var(--font-display)] text-[length:var(--font-size-xl)] font-semibold text-foreground"
            >
              Start a Sift case
            </h1>
            <p className="text-[length:var(--font-size-sm)] text-muted-foreground">
              Compare real vehicles from the bundled catalog, or try a finished example.
            </p>
          </div>
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
            <AlertDescription>Sift could not start that demo: {status.message}</AlertDescription>
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
