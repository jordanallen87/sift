import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { BlindSpotPromptTemplate } from '@sift/contracts';
import { BlindSpotReviewSheet } from './BlindSpotReviewSheet.js';

// Copied in shape (not by import) from the real `car-purchase` pack's
// `discovery.blindSpots`, so these tests exercise the same fields a compiled
// pack actually supplies: id, label, detail.
const PROMPTS: BlindSpotPromptTemplate[] = [
  {
    id: 'blindspot.garage_clearance',
    label: 'Where it has to park',
    detail: 'Garage length and height, or a tight communal space.',
  },
  {
    id: 'blindspot.long_term_cost',
    label: 'The cost after the purchase',
    detail: 'Insurance, servicing, tyres, and depreciation usually outweigh the sticker gap.',
  },
];

describe('BlindSpotReviewSheet', () => {
  it('does not render its content when closed', () => {
    render(
      <BlindSpotReviewSheet
        open={false}
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('blind-spot-review-sheet')).not.toBeInTheDocument();
  });

  it("renders every offered prompt in the pack's own words", () => {
    render(
      <BlindSpotReviewSheet open onOpenChange={vi.fn()} prompts={PROMPTS} onComplete={vi.fn()} />,
    );
    const sheet = screen.getByTestId('blind-spot-review-sheet');
    for (const prompt of PROMPTS) {
      expect(sheet).toHaveTextContent(prompt.label);
      expect(sheet).toHaveTextContent(prompt.detail);
    }
  });

  it('completes with no selections, because "nothing else to add" is a real answer', async () => {
    // `CompleteBlindSpotReviewInputSchema` allows an empty
    // `selectedPromptIds` on purpose. A review a person could not finish
    // without claiming a concern they do not have would be a worse gate
    // than no gate -- and this gate blocks discovery until it is cleared.
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <BlindSpotReviewSheet
        open
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={onComplete}
      />,
    );

    const submit = screen.getByTestId('blind-spot-review-submit');
    expect(submit).toBeEnabled();
    expect(submit).toHaveTextContent('Nothing else to add');
    await user.click(submit);

    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('reports the ticked prompts in pack order, whatever order they were ticked in', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <BlindSpotReviewSheet
        open
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /The cost after the purchase/ }));
    await user.click(screen.getByRole('checkbox', { name: /Where it has to park/ }));

    expect(screen.getByTestId('blind-spot-review-submit')).toHaveTextContent('Add 2 to the brief');
    await user.click(screen.getByTestId('blind-spot-review-submit'));

    expect(onComplete).toHaveBeenCalledWith([
      'blindspot.garage_clearance',
      'blindspot.long_term_cost',
    ]);
  });

  it('unticks a prompt that is ticked twice', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(
      <BlindSpotReviewSheet
        open
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={onComplete}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /Where it has to park/ });
    await user.click(checkbox);
    await user.click(checkbox);

    await user.click(screen.getByTestId('blind-spot-review-submit'));
    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('surfaces a failed review rather than swallowing it, and keeps the controls usable', () => {
    render(
      <BlindSpotReviewSheet
        open
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={vi.fn()}
        error="Sift could not record that review: sequence conflict."
      />,
    );
    expect(screen.getByTestId('blind-spot-review-error')).toHaveTextContent('sequence conflict');
    expect(screen.getByTestId('blind-spot-review-submit')).toBeEnabled();
  });

  it('disables its controls while a review is in flight', () => {
    render(
      <BlindSpotReviewSheet
        open
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={vi.fn()}
        pending
      />,
    );
    expect(screen.getByTestId('blind-spot-review-submit')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Where it has to park/ })).toBeDisabled();
  });

  it('says so plainly when the pack declares no applicable checks, rather than offering an unusable control', () => {
    // `CompleteBlindSpotReviewInputSchema` requires at least one offered
    // prompt, so there is genuinely nothing to record in this state. An
    // enabled button that could only ever fail schema validation would be
    // the same dead control this sheet exists to replace.
    render(<BlindSpotReviewSheet open onOpenChange={vi.fn()} prompts={[]} onComplete={vi.fn()} />);
    expect(screen.getByTestId('blind-spot-review-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('blind-spot-review-submit')).not.toBeInTheDocument();
  });

  it('starts clean when reopened, so a previous visit cannot record ticks nobody made this time', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <BlindSpotReviewSheet
        open
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /Where it has to park/ }));
    rerender(
      <BlindSpotReviewSheet
        open={false}
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={onComplete}
      />,
    );
    rerender(
      <BlindSpotReviewSheet
        open
        onOpenChange={vi.fn()}
        prompts={PROMPTS}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByRole('checkbox', { name: /Where it has to park/ })).not.toBeChecked();
    await user.click(screen.getByTestId('blind-spot-review-submit'));
    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('has no axe violations, open or empty', async () => {
    const { container, rerender } = render(
      <BlindSpotReviewSheet open onOpenChange={vi.fn()} prompts={PROMPTS} onComplete={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <BlindSpotReviewSheet open onOpenChange={vi.fn()} prompts={[]} onComplete={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
