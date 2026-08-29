/**
 * A pure presentation layer over an already-computed `WorkspaceStatus`
 * (`./workspace-status.ts` owns the derivation; the derivation is proven
 * exhaustively in `workspace-status.test.ts`). Pairs the four-stage progress
 * tracker with the "what do I do next" banner as one fixed header unit
 * (round-2 design review, "Knowing what to do next").
 *
 * The tracker is deliberately an honest *progress* indicator, not a
 * checkout-style stepper: `current` can trail a stage that previously
 * looked `done` (see `workspace-status.ts`'s file header on reopened
 * cases), so `upcoming` never renders a locked/disabled treatment -- it
 * only means "not reached yet," never "blocked."
 */
import type { CSSProperties, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { STATUS_TONE_META } from './activity-labels.js';
import {
  WORKSPACE_STAGE_LABEL,
  type NextStep,
  type NextStepTone,
  type WorkspaceStageState,
  type WorkspaceStatus,
} from './workspace-status.js';

function stageDotStyle(state: WorkspaceStageState): CSSProperties {
  if (state === 'done') {
    return {
      backgroundColor: STATUS_TONE_META.satisfied.ink,
      borderColor: STATUS_TONE_META.satisfied.ink,
      color: 'var(--color-ink-on-brand)',
    };
  }
  if (state === 'current') {
    return {
      backgroundColor: 'var(--color-brand-tint)',
      borderColor: 'var(--color-brand)',
      color: 'var(--color-brand)',
    };
  }
  return {
    backgroundColor: 'var(--color-surface)',
    borderColor: 'var(--color-border-strong)',
    color: 'var(--color-ink-muted)',
  };
}

// A connector reflects whether the transition *into* this stage from the
// previous one has been crossed -- true only once the previous stage itself
// reads `done`, never merely `current`.
function connectorColor(previousState: WorkspaceStageState): string {
  return previousState === 'done'
    ? STATUS_TONE_META.satisfied.border
    : 'var(--color-border-subtle)';
}

function ProgressTracker({ stages }: { stages: WorkspaceStatus['stages'] }) {
  return (
    <ol
      data-testid="workspace-progress-tracker"
      aria-label="Case progress"
      className="m-0 flex list-none items-start gap-0 p-0"
    >
      {stages.map((entry, index) => {
        const previous = index > 0 ? stages[index - 1] : undefined;
        return (
          <li
            key={entry.stage}
            data-testid={`tracker-stage-${entry.stage}`}
            data-state={entry.state}
            aria-current={entry.state === 'current' ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-[var(--space-1)]"
          >
            {previous ? (
              <span
                aria-hidden="true"
                data-testid={`tracker-connector-${entry.stage}`}
                data-state={previous.state === 'done' ? 'done' : 'upcoming'}
                className="absolute top-[10px] right-1/2 z-0 h-[2px] w-full"
                style={{ backgroundColor: connectorColor(previous.state) }}
              />
            ) : null}
            <span
              aria-hidden="true"
              className="relative z-[1] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[var(--radius-full)] border-2 text-[length:var(--font-size-2xs)] font-[var(--font-weight-semibold)]"
              style={stageDotStyle(entry.state)}
            >
              {entry.state === 'done' ? '✓' : null}
            </span>
            <span className="text-center text-[length:var(--font-size-2xs)] text-[var(--color-ink-secondary)]">
              {WORKSPACE_STAGE_LABEL[entry.stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const NEXT_STEP_TONE_META: Record<NextStepTone, { ink: string; bg: string; icon: string }> = {
  // "Nothing started" is deliberately not one of the nine status colors --
  // a plain neutral surface, not STATUS_TONE_META.open's claimed-hue tint.
  open: {
    ink: 'var(--color-ink-secondary)',
    bg: 'var(--color-surface-sunken)',
    icon: STATUS_TONE_META.open.icon,
  },
  active: {
    ink: STATUS_TONE_META.active.ink,
    bg: STATUS_TONE_META.active.bg,
    icon: STATUS_TONE_META.active.icon,
  },
  accepted: {
    ink: STATUS_TONE_META['accepted-uncertainty'].ink,
    bg: STATUS_TONE_META['accepted-uncertainty'].bg,
    icon: STATUS_TONE_META['accepted-uncertainty'].icon,
  },
  ready: {
    ink: STATUS_TONE_META.ready.ink,
    bg: STATUS_TONE_META.ready.bg,
    icon: STATUS_TONE_META.ready.icon,
  },
  calm: {
    ink: STATUS_TONE_META.satisfied.ink,
    bg: STATUS_TONE_META.satisfied.bg,
    icon: STATUS_TONE_META.satisfied.icon,
  },
};

function NextStepBanner({
  nextStep,
  onAction,
}: {
  nextStep: NextStep;
  onAction?: (() => void) | undefined;
}): ReactNode {
  const meta = NEXT_STEP_TONE_META[nextStep.tone];
  return (
    <div
      data-testid="workspace-next-step"
      data-tone={nextStep.tone}
      role="status"
      className="flex flex-col items-start gap-[var(--space-2)] rounded-[var(--radius-md)] p-[var(--space-3)]"
      style={{ backgroundColor: meta.bg, color: meta.ink }}
    >
      <p data-testid="workspace-next-step-text" className="text-[length:var(--font-size-sm)]">
        <span aria-hidden="true">{meta.icon} </span>
        {nextStep.text}
      </p>
      {nextStep.action ? (
        <Button
          type="button"
          data-testid="workspace-next-step-action"
          onClick={onAction}
          variant="default"
          className="min-h-[var(--size-touch-target-min)] w-fit"
        >
          {nextStep.action.label}
        </Button>
      ) : null}
    </div>
  );
}

export interface WorkspaceStatusHeaderProps {
  status: WorkspaceStatus;
  onNextStepAction?: () => void;
}

export function WorkspaceStatusHeader({ status, onNextStepAction }: WorkspaceStatusHeaderProps) {
  return (
    <section
      data-testid="workspace-status-header"
      aria-label="Case progress and next step"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] bg-card p-[var(--space-4)]"
    >
      <ProgressTracker stages={status.stages} />
      <NextStepBanner nextStep={status.nextStep} onAction={onNextStepAction} />
    </section>
  );
}
