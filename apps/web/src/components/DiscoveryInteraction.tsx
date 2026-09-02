/**
 * Renders one bounded `InteractionRequest`.
 *
 * This is the component that makes "the model asks for a UI component" a
 * real thing rather than a claim. The model supplies content — a prompt,
 * option labels, an interaction kind from a closed vocabulary — and Sift
 * supplies every bit of the rendering. There is no path here through which
 * markup could arrive, and no field anywhere in `InteractionRequest` that
 * could preselect an answer.
 *
 * ## Escape hatches are answers, not skips
 *
 * The escape controls are where a bounded interaction either respects
 * someone or traps them. Each one produces a real, recorded response:
 *
 * - **None of these** says the offered options do not describe this person.
 * - **Not sure** creates an information need rather than a verdict — it is
 *   the honest answer to a question someone cannot answer yet, and it is
 *   very different from a value of "no".
 * - **Skip for now** appears *only* when the pack allows deferring, which
 *   `DiscoveryTopicTemplateSchema` refuses outright for a required topic.
 *
 * None of them assert anything about the topic, which is why an escape
 * response carries no mappings at all.
 *
 * ## Why the response is assembled here
 *
 * The person is answering, so every mapping this component emits carries
 * `origin: 'user'` and full confidence. A model-authored mapping travels a
 * different path entirely (`sift_record_discovery`, which can only propose).
 * Keeping the two apart at the point of construction is what stops a
 * suggestion the person merely saw from being recorded as something they
 * said.
 */
import { useId, useState } from 'react';
import type { InteractionRequest, InteractionResponse, TopicMapping } from '@sift/contracts';
import { Button } from '@/components/ui/button';

export interface DiscoveryInteractionProps {
  readonly request: InteractionRequest;
  /** Receives a complete `InteractionResponse` ready to submit. The caller owns the command call. */
  readonly onRespond: (response: InteractionResponse) => void;
  readonly layout: 'narrow' | 'expanded';
  /** Overridable for deterministic tests and recordings; defaults to the real clock. */
  readonly now?: () => string;
}

/** Kinds whose answers come from the option list rather than a typed or binary control. */
const OPTION_KINDS = new Set([
  'single_select',
  'multi_select',
  'checklist',
  'ranking',
  'importance_sort',
]);

export function DiscoveryInteraction({
  request,
  onRespond,
  layout,
  now,
}: DiscoveryInteractionProps): React.JSX.Element {
  const [selected, setSelected] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const groupId = useId();

  const timestamp = (): string => (now === undefined ? new Date().toISOString() : now());
  const single = request.kind === 'single_select';
  const usesOptions = OPTION_KINDS.has(request.kind);
  const acceptsText = request.escapeHatches.allowCustom || request.kind === 'free_text';

  function toggle(optionId: string): void {
    setSelected((current) => {
      if (single) return [optionId];
      return current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
    });
  }

  function mappingsFor(optionIds: readonly string[]): TopicMapping[] {
    const mappings: TopicMapping[] = [];
    for (const optionId of optionIds) {
      const option = request.options.find((candidate) => candidate.id === optionId);
      for (const draft of option?.mapsTo ?? []) {
        mappings.push({
          topicId: draft.topicId,
          valueSummary: draft.valueSummary,
          ...(draft.importance === undefined ? {} : { importance: draft.importance }),
          // The person chose this option. That is a stated fact, not an
          // inference, so it needs no further confirmation.
          origin: 'user',
          confidence: 1,
          requiresConfirmation: false,
        });
      }
    }
    return mappings;
  }

  function submit(): void {
    const trimmed = customText.trim();
    const mappings = mappingsFor(selected);
    if (trimmed.length > 0) {
      mappings.push({
        // A custom answer maps to the interaction's first topic: that is the
        // topic the person was being asked about, and the grammar guarantees
        // at least one exists.
        topicId: request.topicIds[0] ?? '',
        valueSummary: trimmed,
        origin: 'user',
        confidence: 1,
        requiresConfirmation: false,
      });
    }

    onRespond({
      interactionId: request.id,
      respondedBy: 'human',
      selectedOptionIds: selected,
      ...(trimmed.length > 0 ? { customText: trimmed } : {}),
      mappings,
      respondedAt: timestamp(),
    });
  }

  function escape(kind: 'none' | 'unsure' | 'defer'): void {
    onRespond({
      interactionId: request.id,
      respondedBy: 'human',
      selectedOptionIds: [],
      escape: kind,
      // An escape resolves the question without asserting anything about
      // the topic. Recording a mapping here would turn "I do not know" into
      // a value.
      mappings: [],
      respondedAt: timestamp(),
    });
  }

  function answerBinary(answer: 'Yes' | 'No'): void {
    onRespond({
      interactionId: request.id,
      respondedBy: 'human',
      selectedOptionIds: [],
      mappings: [
        {
          topicId: request.topicIds[0] ?? '',
          valueSummary: answer,
          origin: 'user',
          confidence: 1,
          requiresConfirmation: false,
        },
      ],
      respondedAt: timestamp(),
    });
  }

  const canSubmit = selected.length > 0 || customText.trim().length > 0;

  return (
    <section
      data-testid="discovery-interaction"
      aria-labelledby={`${groupId}-prompt`}
      className={[
        'flex flex-col gap-[var(--space-3)]',
        layout === 'expanded' ? 'max-w-[42rem]' : '',
      ].join(' ')}
    >
      <h2
        id={`${groupId}-prompt`}
        data-testid="interaction-prompt"
        className="text-[length:var(--text-base)] font-medium text-[color:var(--color-foreground)]"
      >
        {request.prompt}
      </h2>

      {request.helpText !== undefined && (
        <p className="text-[length:var(--text-sm)] text-[color:var(--color-muted-foreground)]">
          {request.helpText}
        </p>
      )}

      {usesOptions && (
        <div
          role={single ? 'radiogroup' : 'group'}
          aria-labelledby={`${groupId}-prompt`}
          className="flex flex-col gap-[var(--space-2)]"
        >
          {request.options.map((option) => (
            <label
              key={option.id}
              data-testid={`interaction-option-${option.id}`}
              className="flex min-h-[var(--size-touch-target-min)] items-start gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-[var(--space-3)]"
            >
              <input
                type={single ? 'radio' : 'checkbox'}
                name={single ? groupId : undefined}
                checked={selected.includes(option.id)}
                onChange={() => {
                  toggle(option.id);
                }}
                className="mt-[2px]"
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-[length:var(--text-sm)] text-[color:var(--color-foreground)]">
                  {option.label}
                </span>
                {option.detail !== undefined && (
                  <span className="text-[length:var(--text-xs)] text-[color:var(--color-muted-foreground)]">
                    {option.detail}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      {request.kind === 'yes_no_unsure' && (
        <div className="flex flex-wrap gap-[var(--space-2)]">
          <Button
            type="button"
            data-testid="interaction-yes"
            className="min-h-[var(--size-touch-target-min)]"
            onClick={() => {
              answerBinary('Yes');
            }}
          >
            Yes
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="interaction-no"
            className="min-h-[var(--size-touch-target-min)]"
            onClick={() => {
              answerBinary('No');
            }}
          >
            No
          </Button>
        </div>
      )}

      {acceptsText && (
        <label className="flex flex-col gap-[var(--space-1)]">
          <span className="text-[length:var(--text-sm)] text-[color:var(--color-foreground)]">
            {usesOptions ? 'Something else' : 'Your answer'}
          </span>
          <textarea
            data-testid="interaction-custom"
            value={customText}
            rows={2}
            onChange={(event) => {
              setCustomText(event.target.value);
            }}
            className="w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-[var(--space-2)] text-[length:var(--text-sm)]"
          />
        </label>
      )}

      {request.kind !== 'yes_no_unsure' && (
        <Button
          type="button"
          data-testid="interaction-submit"
          disabled={!canSubmit}
          className="min-h-[var(--size-touch-target-min)]"
          onClick={submit}
        >
          Continue
        </Button>
      )}

      <div className="flex flex-wrap gap-[var(--space-3)]">
        {request.escapeHatches.allowNone && (
          <button
            type="button"
            data-testid="interaction-escape-none"
            className="text-[length:var(--text-sm)] underline underline-offset-2 text-[color:var(--color-muted-foreground)]"
            onClick={() => {
              escape('none');
            }}
          >
            None of these
          </button>
        )}
        {(request.escapeHatches.allowUnsure || request.kind === 'yes_no_unsure') && (
          <button
            type="button"
            data-testid="interaction-escape-unsure"
            className="text-[length:var(--text-sm)] underline underline-offset-2 text-[color:var(--color-muted-foreground)]"
            onClick={() => {
              escape('unsure');
            }}
          >
            Not sure
          </button>
        )}
        {request.escapeHatches.allowDefer && (
          <button
            type="button"
            data-testid="interaction-escape-defer"
            className="text-[length:var(--text-sm)] underline underline-offset-2 text-[color:var(--color-muted-foreground)]"
            onClick={() => {
              escape('defer');
            }}
          >
            Skip for now
          </button>
        )}
      </div>
    </section>
  );
}
