/**
 * The bounded generative interaction.
 *
 * This is where "the model requests a component" becomes a real rendered
 * control. Everything the model supplied is content — a prompt, labels,
 * option ids — and everything about how it renders is Sift's. There is no
 * path here for markup, and no path for a preselected answer, because
 * `InteractionRequest` has no field for either.
 *
 * The tests below are mostly about the escape hatches, which is where a
 * bounded interaction either respects a person or traps them. A question a
 * person genuinely cannot answer must always have a way out, and the way out
 * must be a real recorded answer rather than a silent skip.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { InteractionRequest } from '@sift/contracts';
import { DiscoveryInteraction } from './DiscoveryInteraction.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const AT = '2026-09-02T00:00:00.000Z';

function request(overrides: Partial<InteractionRequest> = {}): InteractionRequest {
  return {
    id: 'interaction-1',
    topicIds: ['vehicle.occupants'],
    kind: 'multi_select',
    prompt: 'Who travels in it regularly, and what has to fit in with them?',
    options: [
      {
        id: 'opt-adults',
        label: 'Two adults',
        mapsTo: [{ topicId: 'vehicle.occupants', valueSummary: 'Two adults' }],
      },
      {
        id: 'opt-children',
        label: 'Children in car seats',
        detail: 'Rear-facing or forward-facing',
        mapsTo: [{ topicId: 'vehicle.occupants', valueSummary: 'Children in car seats' }],
      },
      {
        id: 'opt-dog',
        label: 'A dog',
        mapsTo: [{ topicId: 'vehicle.occupants', valueSummary: 'A dog' }],
      },
    ],
    escapeHatches: { allowCustom: true, allowNone: true, allowUnsure: true, allowDefer: false },
    requestedBy: 'model',
    createdAt: AT,
    ...overrides,
  };
}

describe('DiscoveryInteraction', () => {
  it('asks the model`s question verbatim', () => {
    render(<DiscoveryInteraction request={request()} onRespond={vi.fn()} layout="narrow" />);

    expect(screen.getByTestId('interaction-prompt')).toHaveTextContent(
      'Who travels in it regularly, and what has to fit in with them?',
    );
  });

  it('renders every option, with its detail', () => {
    render(<DiscoveryInteraction request={request()} onRespond={vi.fn()} layout="narrow" />);

    expect(screen.getByLabelText(/Two adults/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Children in car seats/)).toBeInTheDocument();
    expect(screen.getByTestId('interaction-option-opt-children')).toHaveTextContent(
      'Rear-facing or forward-facing',
    );
  });

  it('preselects nothing', () => {
    // Guaranteed by the contract (there is no field for a default) and
    // asserted here because it is the difference between asking someone and
    // answering for them.
    render(<DiscoveryInteraction request={request()} onRespond={vi.fn()} layout="narrow" />);

    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).not.toBeChecked();
    }
  });

  it('sends every chosen option`s mappings when submitted', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<DiscoveryInteraction request={request()} onRespond={onRespond} layout="narrow" />);

    await user.click(screen.getByLabelText(/Two adults/));
    await user.click(screen.getByLabelText(/A dog/));
    await user.click(screen.getByTestId('interaction-submit'));

    const response = onRespond.mock.calls[0]?.[0] as {
      selectedOptionIds: string[];
      mappings: { topicId: string; valueSummary: string; origin: string }[];
      respondedBy: string;
    };
    expect(response.selectedOptionIds).toEqual(['opt-adults', 'opt-dog']);
    expect(response.mappings.map((m) => m.valueSummary)).toEqual(['Two adults', 'A dog']);
    // The person answered, so the mappings carry their authority.
    expect(response.mappings.every((m) => m.origin === 'user')).toBe(true);
    expect(response.respondedBy).toBe('human');
  });

  it('uses a radio group for a single-select, so one answer is one answer', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(
      <DiscoveryInteraction
        request={request({ kind: 'single_select' })}
        onRespond={onRespond}
        layout="narrow"
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    await user.click(screen.getByLabelText(/A dog/));
    await user.click(screen.getByTestId('interaction-submit'));

    const response = onRespond.mock.calls[0]?.[0] as { selectedOptionIds: string[] };
    expect(response.selectedOptionIds).toEqual(['opt-dog']);
  });

  it('offers a custom answer when the pack allows one', async () => {
    // "The person provides a custom need absent from suggestions" is a
    // retained edge case, and this is the control that makes it possible.
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<DiscoveryInteraction request={request()} onRespond={onRespond} layout="narrow" />);

    await user.type(screen.getByTestId('interaction-custom'), 'A folded wheelchair has to fit too');
    await user.click(screen.getByTestId('interaction-submit'));

    const response = onRespond.mock.calls[0]?.[0] as {
      customText?: string;
      mappings: { valueSummary: string }[];
    };
    expect(response.customText).toBe('A folded wheelchair has to fit too');
    expect(response.mappings[0]?.valueSummary).toBe('A folded wheelchair has to fit too');
  });

  it('hides the custom field when the pack does not allow one', () => {
    render(
      <DiscoveryInteraction
        request={request({
          escapeHatches: {
            allowCustom: false,
            allowNone: true,
            allowUnsure: true,
            allowDefer: false,
          },
        })}
        onRespond={vi.fn()}
        layout="narrow"
      />,
    );

    expect(screen.queryByTestId('interaction-custom')).toBeNull();
  });

  it('offers "none of these" and "not sure" as real answers, not skips', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<DiscoveryInteraction request={request()} onRespond={onRespond} layout="narrow" />);

    await user.click(screen.getByTestId('interaction-escape-none'));

    const response = onRespond.mock.calls[0]?.[0] as { escape?: string; mappings: unknown[] };
    expect(response.escape).toBe('none');
    // An escape resolves the question without asserting anything about it.
    expect(response.mappings).toEqual([]);
  });

  it('never offers "skip for now" on a question that does not allow deferring', () => {
    render(<DiscoveryInteraction request={request()} onRespond={vi.fn()} layout="narrow" />);

    expect(screen.queryByTestId('interaction-escape-defer')).toBeNull();
  });

  it('offers deferring only when the pack allows it', () => {
    render(
      <DiscoveryInteraction
        request={request({
          escapeHatches: {
            allowCustom: true,
            allowNone: true,
            allowUnsure: true,
            allowDefer: true,
          },
        })}
        onRespond={vi.fn()}
        layout="narrow"
      />,
    );

    expect(screen.getByTestId('interaction-escape-defer')).toBeInTheDocument();
  });

  it('will not submit an empty answer', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(<DiscoveryInteraction request={request()} onRespond={onRespond} layout="narrow" />);

    await user.click(screen.getByTestId('interaction-submit'));

    expect(onRespond).not.toHaveBeenCalled();
    expect(screen.getByTestId('interaction-submit')).toBeDisabled();
  });

  it('renders a yes/no/not-sure question without an option list', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(
      <DiscoveryInteraction
        request={request({
          kind: 'yes_no_unsure',
          options: [],
          prompt: 'Does anything need to be towed?',
        })}
        onRespond={onRespond}
        layout="narrow"
      />,
    );

    await user.click(screen.getByTestId('interaction-yes'));

    const response = onRespond.mock.calls[0]?.[0] as { mappings: { valueSummary: string }[] };
    expect(response.mappings[0]?.valueSummary).toBe('Yes');
  });

  it('renders free text as a single field', async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn();
    render(
      <DiscoveryInteraction
        request={request({ kind: 'free_text', options: [] })}
        onRespond={onRespond}
        layout="narrow"
      />,
    );

    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.type(screen.getByTestId('interaction-custom'), 'Two adults and a dog');
    await user.click(screen.getByTestId('interaction-submit'));

    expect(onRespond).toHaveBeenCalledTimes(1);
  });

  it('fits the narrow pane at every required width', () => {
    for (const width of [390, 430, 480]) {
      const { renderResult, overflowRisks } = renderAtNarrowWidth(
        <DiscoveryInteraction request={request()} onRespond={vi.fn()} layout="narrow" />,
        width,
      );
      expect(overflowRisks, `overflow at ${String(width)}px`).toEqual([]);
      renderResult.unmount();
    }
  });

  it('has no accessibility violations for any interaction kind', async () => {
    for (const kind of ['multi_select', 'single_select', 'yes_no_unsure', 'free_text'] as const) {
      const options = kind === 'multi_select' || kind === 'single_select' ? undefined : [];
      const { container, unmount } = render(
        <DiscoveryInteraction
          request={request(options === undefined ? { kind } : { kind, options })}
          onRespond={vi.fn()}
          layout="narrow"
        />,
      );
      expect(await axe(container), kind).toHaveNoViolations();
      unmount();
    }
  });
});
