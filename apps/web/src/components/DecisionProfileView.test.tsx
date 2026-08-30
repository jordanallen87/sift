import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type {
  DecisionProfile,
  DecisionProfileConcern,
  DecisionProfilePersonalConcern,
  DecisionProfileSuggestedQuestion,
} from './decision-profile.js';
import { DecisionProfileView } from './DecisionProfileView.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildConcern(overrides: Partial<DecisionProfileConcern> = {}): DecisionProfileConcern {
  return {
    id: 'crit-safety',
    label: 'Safety',
    kind: 'preference',
    weight: 80,
    priorityBand: 'very_important',
    origin: 'pack',
    target: null,
    question: null,
    ...overrides,
  };
}

function buildSuggestedQuestion(
  overrides: Partial<DecisionProfileSuggestedQuestion> = {},
): DecisionProfileSuggestedQuestion {
  return {
    id: 'guide:0',
    text: 'Do you need AWD?',
    source: 'pack_guide',
    ...overrides,
  };
}

function buildPersonalConcern(
  overrides: Partial<DecisionProfilePersonalConcern> = {},
): DecisionProfilePersonalConcern {
  return {
    id: 'ext-1',
    label: 'Laptop work fit',
    reason: 'I work from the car sometimes.',
    origin: 'user',
    confirmation: 'confirmed',
    proposedBy: 'user-123',
    ...overrides,
  };
}

const EMPTY_PROFILE: DecisionProfile = {
  mustHave: [],
  important: [],
  niceToHave: [],
  context: [],
  personalConcerns: [],
  missing: [],
  suggestedQuestions: [],
};

const FULL_PROFILE: DecisionProfile = {
  mustHave: [
    buildConcern({
      id: 'custom.budget_cap',
      label: 'Budget cap',
      kind: 'hard_constraint',
      weight: 90,
      priorityBand: 'very_important',
      target: '40000 USD',
    }),
  ],
  important: [
    buildConcern({
      id: 'crit-safety',
      label: 'Safety',
      weight: 80,
      priorityBand: 'very_important',
    }),
  ],
  niceToHave: [
    buildConcern({
      id: 'crit-color',
      label: 'Color',
      weight: 10,
      priorityBand: 'somewhat_important',
    }),
  ],
  context: [
    buildConcern({
      id: 'crit-commute',
      label: 'Commute distance',
      kind: 'consideration',
      weight: 15,
      priorityBand: 'somewhat_important',
    }),
  ],
  personalConcerns: [
    buildPersonalConcern({
      id: 'custom.laptop_work_fit',
      label: 'Laptop work fit',
      origin: 'user',
      confirmation: 'confirmed',
    }),
    buildPersonalConcern({
      id: 'custom.dog_crate_fit',
      label: 'Dog crate fit',
      origin: 'agent_proposed',
      confirmation: 'pending',
      proposedBy: 'sift-runtime',
      reason: 'You mentioned two dog crates during intake.',
    }),
  ],
  missing: [
    {
      id: 'criterion:crit-budget:no-target',
      relatedId: 'crit-budget',
      reasonKind: 'no_target',
      text: 'The exact limit for "Budget" hasn\'t been set yet.',
    },
  ],
  suggestedQuestions: [
    buildSuggestedQuestion({ id: 'guide:0', text: 'Do you need AWD?', source: 'pack_guide' }),
    buildSuggestedQuestion({
      id: 'obligation:obl-price',
      text: 'What is the out-the-door price?',
      source: 'unmet_obligation',
      relatedId: 'obl-price',
    }),
  ],
};

describe('DecisionProfileView', () => {
  it('renders the empty state when the profile is entirely empty', () => {
    render(<DecisionProfileView profile={EMPTY_PROFILE} />);
    expect(screen.getByTestId('decision-profile-view-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-profile-view-section-must-have')).not.toBeInTheDocument();
  });

  it('renders every populated section', () => {
    render(<DecisionProfileView profile={FULL_PROFILE} />);
    expect(screen.getByTestId('decision-profile-view-section-must-have')).toBeInTheDocument();
    expect(screen.getByTestId('decision-profile-view-section-important')).toBeInTheDocument();
    expect(screen.getByTestId('decision-profile-view-section-nice-to-have')).toBeInTheDocument();
    expect(screen.getByTestId('decision-profile-view-section-context')).toBeInTheDocument();
    expect(
      screen.getByTestId('decision-profile-view-section-personal-concerns'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('decision-profile-view-section-missing')).toBeInTheDocument();
    expect(
      screen.getByTestId('decision-profile-view-section-suggested-questions'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('decision-profile-view-empty')).not.toBeInTheDocument();
  });

  it('suppresses every other section while only mustHave is populated -- no card announces its own emptiness', () => {
    const profile: DecisionProfile = {
      ...EMPTY_PROFILE,
      mustHave: [buildConcern({ kind: 'hard_constraint' })],
    };
    render(<DecisionProfileView profile={profile} />);
    expect(screen.getByTestId('decision-profile-view-section-must-have')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-profile-view-section-important')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('decision-profile-view-section-nice-to-have'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-profile-view-section-context')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('decision-profile-view-section-personal-concerns'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-profile-view-section-missing')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('decision-profile-view-section-suggested-questions'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-profile-view-empty')).not.toBeInTheDocument();
  });

  it('never leaks a raw criterion or custom.* extension id into visible rendered text', () => {
    const { container } = render(<DecisionProfileView profile={FULL_PROFILE} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('custom.budget_cap');
    expect(text).not.toContain('custom.laptop_work_fit');
    expect(text).not.toContain('custom.dog_crate_fit');
    expect(text).not.toContain('crit-safety');
    expect(text).not.toContain('crit-budget');
    expect(text).not.toContain('obl-price');
  });

  describe('suggestedQuestions (§16, sourced honestly per task D4)', () => {
    it('renders each suggested question\'s text', () => {
      render(<DecisionProfileView profile={FULL_PROFILE} />);
      expect(
        screen.getByTestId('decision-profile-view-suggested-question-guide:0'),
      ).toHaveTextContent('Do you need AWD?');
      expect(
        screen.getByTestId('decision-profile-view-suggested-question-obligation:obl-price'),
      ).toHaveTextContent('What is the out-the-door price?');
    });

    it('renders nothing for the section when suggestedQuestions is empty -- an honest empty state, not an invented one', () => {
      render(<DecisionProfileView profile={EMPTY_PROFILE} />);
      expect(
        screen.queryByTestId('decision-profile-view-section-suggested-questions'),
      ).not.toBeInTheDocument();
    });

    it('treats a guide-only profile (only suggestedQuestions populated) as non-empty', () => {
      const profile: DecisionProfile = {
        ...EMPTY_PROFILE,
        suggestedQuestions: [buildSuggestedQuestion()],
      };
      render(<DecisionProfileView profile={profile} />);
      expect(screen.queryByTestId('decision-profile-view-empty')).not.toBeInTheDocument();
      expect(
        screen.getByTestId('decision-profile-view-section-suggested-questions'),
      ).toBeInTheDocument();
    });
  });

  it('shows "Added by you" for a user-added personal concern', () => {
    render(<DecisionProfileView profile={FULL_PROFILE} />);
    expect(
      screen.getByTestId('decision-profile-view-personal-concern-status-custom.laptop_work_fit'),
    ).toHaveTextContent('Added by you');
  });

  it('shows a distinct "needs your OK" status for a still-pending agent-proposed concern', () => {
    render(<DecisionProfileView profile={FULL_PROFILE} />);
    expect(
      screen.getByTestId('decision-profile-view-personal-concern-status-custom.dog_crate_fit'),
    ).toHaveTextContent(/Sift.*needs your OK/);
  });

  it('shows a settled "Suggested by Sift" status for a confirmed agent-proposed concern, without action controls', () => {
    const profile: DecisionProfile = {
      ...EMPTY_PROFILE,
      personalConcerns: [
        buildPersonalConcern({
          id: 'ext-confirmed',
          origin: 'agent_proposed',
          confirmation: 'confirmed',
        }),
      ],
    };
    render(
      <DecisionProfileView
        profile={profile}
        onConfirmConcern={vi.fn()}
        onRejectConcern={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId('decision-profile-view-personal-concern-status-ext-confirmed'),
    ).toHaveTextContent('Suggested by Sift');
    expect(
      screen.queryByTestId('decision-profile-view-personal-concern-confirm-ext-confirmed'),
    ).not.toBeInTheDocument();
  });

  it('shows Confirm/Reject controls only on the pending concern when callbacks are supplied', () => {
    render(
      <DecisionProfileView
        profile={FULL_PROFILE}
        onConfirmConcern={vi.fn()}
        onRejectConcern={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId('decision-profile-view-personal-concern-confirm-custom.dog_crate_fit'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('decision-profile-view-personal-concern-reject-custom.dog_crate_fit'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('decision-profile-view-personal-concern-confirm-custom.laptop_work_fit'),
    ).not.toBeInTheDocument();
  });

  it('omits Confirm/Reject controls entirely when no callback is supplied, even for a pending concern', () => {
    render(<DecisionProfileView profile={FULL_PROFILE} />);
    expect(
      screen.queryByTestId('decision-profile-view-personal-concern-confirm-custom.dog_crate_fit'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('decision-profile-view-personal-concern-reject-custom.dog_crate_fit'),
    ).not.toBeInTheDocument();
  });

  it('fires onConfirmConcern with the concern id when Confirm is clicked', async () => {
    const user = userEvent.setup();
    const onConfirmConcern = vi.fn();
    render(<DecisionProfileView profile={FULL_PROFILE} onConfirmConcern={onConfirmConcern} />);
    await user.click(
      screen.getByTestId('decision-profile-view-personal-concern-confirm-custom.dog_crate_fit'),
    );
    expect(onConfirmConcern).toHaveBeenCalledExactlyOnceWith('custom.dog_crate_fit');
  });

  it('fires onRejectConcern with the concern id when Reject is clicked', async () => {
    const user = userEvent.setup();
    const onRejectConcern = vi.fn();
    render(<DecisionProfileView profile={FULL_PROFILE} onRejectConcern={onRejectConcern} />);
    await user.click(
      screen.getByTestId('decision-profile-view-personal-concern-reject-custom.dog_crate_fit'),
    );
    expect(onRejectConcern).toHaveBeenCalledExactlyOnceWith('custom.dog_crate_fit');
  });

  it('is keyboard operable: pressing Enter on a focused Confirm button fires the callback', async () => {
    const user = userEvent.setup();
    const onConfirmConcern = vi.fn();
    render(<DecisionProfileView profile={FULL_PROFILE} onConfirmConcern={onConfirmConcern} />);
    const confirmButton = screen.getByTestId(
      'decision-profile-view-personal-concern-confirm-custom.dog_crate_fit',
    );
    confirmButton.focus();
    expect(confirmButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onConfirmConcern).toHaveBeenCalledExactlyOnceWith('custom.dog_crate_fit');
  });

  it('shows the priority band badge only on Important-section concerns', () => {
    render(<DecisionProfileView profile={FULL_PROFILE} />);
    expect(screen.getByTestId('decision-profile-view-band-crit-safety')).toHaveTextContent(
      'Very important',
    );
    expect(
      screen.queryByTestId('decision-profile-view-band-custom.budget_cap'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-profile-view-band-crit-color')).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-profile-view-band-crit-commute')).not.toBeInTheDocument();
  });

  it('keeps exact numeric weights behind a closed-by-default disclosure, not the default view', () => {
    render(<DecisionProfileView profile={FULL_PROFILE} />);
    const details = screen.getByTestId<HTMLDetailsElement>('disclosure-decision-profile-weights');
    expect(details.open).toBe(false);
    expect(screen.getByTestId('decision-profile-view-weight-crit-safety')).toHaveTextContent('80%');
  });

  it('omits the weights disclosure entirely when there are no weighted concerns', () => {
    const profile: DecisionProfile = {
      ...EMPTY_PROFILE,
      personalConcerns: [buildPersonalConcern()],
    };
    render(<DecisionProfileView profile={profile} />);
    expect(screen.queryByTestId('disclosure-decision-profile-weights')).not.toBeInTheDocument();
  });

  it('shows a target threshold only when one is present', () => {
    render(<DecisionProfileView profile={FULL_PROFILE} />);
    expect(screen.getByTestId('decision-profile-view-target-custom.budget_cap')).toHaveTextContent(
      '40000 USD',
    );
    expect(
      screen.queryByTestId('decision-profile-view-target-crit-safety'),
    ).not.toBeInTheDocument();
  });

  it('renders a "not settled yet" item derived from the profile\'s missing list', () => {
    render(<DecisionProfileView profile={FULL_PROFILE} />);
    expect(
      screen.getByTestId('decision-profile-view-missing-criterion:crit-budget:no-target'),
    ).toHaveTextContent('Budget');
  });

  it('has no axe violations, empty or fully populated with actions available', async () => {
    const { container: empty } = render(<DecisionProfileView profile={EMPTY_PROFILE} />);
    expect(await axe(empty)).toHaveNoViolations();

    const { container: full } = render(
      <DecisionProfileView
        profile={FULL_PROFILE}
        onConfirmConcern={vi.fn()}
        onRejectConcern={vi.fn()}
      />,
    );
    expect(await axe(full)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <DecisionProfileView
        profile={FULL_PROFILE}
        onConfirmConcern={vi.fn()}
        onRejectConcern={vi.fn()}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
