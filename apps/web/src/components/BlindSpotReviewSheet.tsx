/**
 * The contextual blind-spot review — "the one required challenge pass before
 * model discovery" (`packages/contracts/src/discovery.ts`,
 * `BlindSpotReviewStateSchema`), and until now the one part of adaptive
 * discovery with no surface at all in the running product.
 *
 * ## The gap this closes
 *
 * Everything except the screen already existed: `completeBlindSpotReview`
 * (`packages/contracts/src/commands.ts`), the command handler
 * (`apps/agent/src/services/command-service.ts`), the
 * `discovery.blind_spot_reviewed` event and its reducer branch, the
 * `blind_spot_review_incomplete` readiness blocker, `applicableBlindSpotIds`
 * on `DiscoveryReadiness`, and the `review_blind_spots` next-move the dock
 * renders as its primary button once every required topic is answered. The
 * web app called none of it, so the button was inert and the readiness gate
 * it guards could not be cleared from the pane at all.
 *
 * ## Why a sheet, and why the pack's own words
 *
 * A sheet, for the same reason `FindingsSheet` is one: this is reached from
 * a still-visible trigger (the dock) and returns the person to exactly where
 * they were, rather than becoming a view they have to navigate back out of.
 * Radix's Dialog underneath supplies focus trapping, Escape-to-close, and
 * `role="dialog"`, so the dock action is keyboard-complete without this file
 * managing focus itself.
 *
 * Every prompt rendered here comes verbatim from the compiled pack's
 * `discovery.blindSpots`, filtered by the same `deriveDiscoveryReadiness`
 * the rest of the app uses — the caller passes `applicableBlindSpotIds`
 * already resolved to their templates. Nothing on this screen is generated,
 * and there is no field through which a model could add, reword, or preselect
 * a prompt.
 *
 * ## Selecting nothing is a real answer
 *
 * `CompleteBlindSpotReviewInputSchema` allows an empty `selectedPromptIds`
 * ("May be empty: 'None of these' is a real answer, and the review is
 * complete either way"), so the submit control is never disabled for want of
 * a selection — it only changes what it says. A review a person could not
 * finish without claiming a concern they do not have would be a worse gate
 * than no gate.
 *
 * ## Human-only, structurally
 *
 * `CompleteBlindSpotReviewInputSchema` refuses any `actor` other than
 * `'human'`, and — like `ApprovalCard` — this component has no `actor` prop
 * for a caller to pass. Nobody else can say what a person did not think of.
 */
import { useEffect, useState } from 'react';
import type { BlindSpotPromptTemplate } from '@sift/contracts';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export interface BlindSpotReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The prompts this case is actually being offered, in pack order. These
   * become `offeredPromptIds` verbatim: a completed review has to record
   * what the person was genuinely shown, not the pack's whole catalogue.
   */
  prompts: readonly BlindSpotPromptTemplate[];
  /** Receives the ids the person ticked. The caller owns the command call. */
  onComplete: (selectedPromptIds: string[]) => void;
  pending?: boolean;
  error?: string | null;
}

export function BlindSpotReviewSheet({
  open,
  onOpenChange,
  prompts,
  onComplete,
  pending = false,
  error = null,
}: BlindSpotReviewSheetProps) {
  const [selected, setSelected] = useState<string[]>([]);

  // A reopened sheet starts clean. Carrying the previous visit's ticks
  // forward would show a person choices they never made on this pass, and
  // the review records what was selected as if they had.
  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  function toggle(promptId: string): void {
    setSelected((current) =>
      current.includes(promptId)
        ? current.filter((id) => id !== promptId)
        : // Kept in pack order rather than click order: `offeredPromptIds`
          // is in pack order too, and a stable pairing is what makes the
          // recorded review readable back.
          prompts
            .map((prompt) => prompt.id)
            .filter((id) => id === promptId || current.includes(id)),
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="blind-spot-review-sheet">
        <SheetHeader>
          <SheetTitle>Anything missed?</SheetTitle>
          <SheetDescription>
            These are things people commonly forget until it is too late to change the answer. Tick
            any that matter to you — Sift will treat them as part of the brief.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {error ? (
            <Alert variant="destructive" data-testid="blind-spot-review-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {prompts.length === 0 ? (
            // Honest rather than empty: a pack that declares no applicable
            // prompt has nothing to challenge the person with, and
            // `CompleteBlindSpotReviewInputSchema` requires at least one
            // offered prompt, so there is genuinely nothing to record here.
            <p
              data-testid="blind-spot-review-empty"
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
            >
              This decision pack does not declare any contextual checks for this case yet.
            </p>
          ) : (
            <div className="flex flex-col gap-[var(--space-3)]">
              <div role="group" aria-label="Things people commonly miss">
                <div className="flex flex-col gap-[var(--space-2)]">
                  {prompts.map((prompt) => (
                    <label
                      key={prompt.id}
                      data-testid={`blind-spot-option-${prompt.id}`}
                      className="flex min-h-[var(--size-touch-target-min)] items-start gap-[var(--space-2)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(prompt.id)}
                        disabled={pending}
                        onChange={() => {
                          toggle(prompt.id);
                        }}
                        className="mt-[2px]"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[length:var(--font-size-sm)] text-[color:var(--color-foreground)]">
                          {prompt.label}
                        </span>
                        <span className="text-[length:var(--font-size-xs)] text-[color:var(--color-muted-foreground)]">
                          {prompt.detail}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                data-testid="blind-spot-review-submit"
                aria-busy={pending}
                disabled={pending}
                className="min-h-[var(--size-touch-target-min)] w-full"
                onClick={() => {
                  onComplete([...selected]);
                }}
              >
                {selected.length === 0
                  ? 'Nothing else to add'
                  : `Add ${String(selected.length)} to the brief`}
              </Button>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
