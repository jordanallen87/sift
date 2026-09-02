/**
 * A persistent "?" help affordance, rendered once at the top of every
 * top-level screen (`DemoLauncher`, `VehicleCatalogFlow`, `CaseHeader`) so
 * a first-time visitor -- or a judge who lands on the deployed URL cold --
 * always has an immediate, in-app answer to "what is this and how do I use
 * it," without needing the README. Fully self-contained (uncontrolled
 * `Sheet` -- Radix's own `Root`/`Trigger` own the open state, matching this
 * file's single static-content use case) so every caller can drop it in
 * with no props and no lifted state, unlike `FindingsSheet`/the Runtime
 * Inspector sheet, which are controlled because they render live case data
 * `App.tsx` itself owns.
 *
 * Copy here is grounded in `README.md`'s own pitch/usage sections and
 * `docs/specs/webmcp.md` -- never invented ad hoc -- kept short enough to
 * scan at the 390px canonical pane width without turning into a second
 * README inside the app.
 */
import type { ReactNode } from 'react';
import { CircleQuestionMarkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function HelpSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <p className="label-caps text-[length:var(--font-size-xs)] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function HelpButton() {
  return (
    <Sheet>
      {/*
       * The tooltip only repeats the `aria-label` that already names this
       * button -- it is a pointer-only reminder of what a bare "?" glyph
       * does, and this control is unchanged for the touch and screen-reader
       * users who never see it (see `ui/tooltip.tsx`'s header comment).
       * `side="bottom"`: every caller renders this in the top row of the
       * pane, where a top-side tooltip would immediately be flipped by
       * collision handling anyway.
       */}
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              type="button"
              data-testid="help-button"
              aria-label="Help and instructions"
              variant="ghost"
              size="icon"
              className="min-h-[var(--size-touch-target-min)] min-w-[var(--size-touch-target-min)] shrink-0 text-muted-foreground hover:text-foreground"
            >
              <CircleQuestionMarkIcon className="size-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Help and instructions</TooltipContent>
      </Tooltip>
      <SheetContent data-testid="help-sheet" side="bottom">
        <SheetHeader>
          <SheetTitle>How Sift works</SheetTitle>
          <SheetDescription>
            A real-time, source-linked decision workspace. You and a bounded agent work in the same
            case together -- it investigates open questions, but only you can approve a
            recommendation.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-[var(--space-4)]">
          <HelpSection label="Two ways to start">
            <p className="text-[length:var(--font-size-sm)] text-foreground">
              <strong className="font-[var(--font-weight-semibold)]">Compare vehicles</strong>{' '}
              browses a real, offline vehicle catalog so you can build your own shortlist and start
              a real case. Or try a finished example -- two ready-made cases under &quot;Or try a
              finished example.&quot;
            </p>
          </HelpSection>

          <HelpSection label="While a case is open">
            <ul className="flex flex-col gap-[var(--space-1)] text-[length:var(--font-size-sm)] text-foreground">
              <li>Request investigation to let the agent gather evidence on its own.</li>
              <li>Review findings, adjust criteria or candidates, and add your own concerns.</li>
              <li>Nothing is decided without you -- every recommendation waits for your say.</li>
            </ul>
          </HelpSection>

          <HelpSection label="Inspect a run">
            <p className="text-[length:var(--font-size-sm)] text-foreground">
              Click &quot;Inspect run&quot; next to the live status, or on any activity item, to see
              the agent&apos;s real steps, tool calls, and state changes as they happened.
            </p>
          </HelpSection>

          <HelpSection label="WebMCP">
            <p className="text-[length:var(--font-size-sm)] text-foreground">
              Every control here also works from a WebMCP-enabled agent host through the exact same
              commands as this page -- there is no separate, hidden path.
            </p>
          </HelpSection>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
