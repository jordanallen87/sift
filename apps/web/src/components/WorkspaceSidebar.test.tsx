import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { WorkspaceSidebar, type WorkspaceSidebarProps } from './WorkspaceSidebar.js';
import type { DecisionProfile, DecisionProfileConcern } from './decision-profile.js';

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
      weight: 95,
      priorityBand: 'very_important',
    }),
  ],
  important: [
    buildConcern({
      id: 'crit-safety',
      label: 'Safety',
      weight: 80,
      priorityBand: 'very_important',
    }),
    buildConcern({ id: 'crit-price', label: 'Price', weight: 50, priorityBand: 'important' }),
  ],
  niceToHave: [
    buildConcern({
      id: 'crit-color',
      label: 'Color',
      weight: 10,
      priorityBand: 'somewhat_important',
    }),
  ],
  // Deliberately non-empty -- these must NOT appear in the Priorities
  // section (see WorkspaceSidebar.tsx's file header on why `context` and
  // `personalConcerns` are excluded from the weighted priority list).
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
    {
      id: 'custom.laptop_work_fit',
      label: 'Laptop work fit',
      reason: 'I work from the car sometimes.',
      origin: 'user',
      confirmation: 'confirmed',
      proposedBy: 'user',
    },
  ],
  missing: [],
  suggestedQuestions: [],
};

function baseProps(overrides: Partial<WorkspaceSidebarProps> = {}): WorkspaceSidebarProps {
  return {
    layout: 'expanded',
    decisionProfile: FULL_PROFILE,
    openQuestionsCount: 3,
    onOpenQuestions: vi.fn(),
    ...overrides,
  };
}

describe('WorkspaceSidebar', () => {
  describe('layout gate', () => {
    it('renders nothing at layout="narrow" -- this content is carried by other WebMCP-pane surfaces', () => {
      const { container } = render(<WorkspaceSidebar {...baseProps({ layout: 'narrow' })} />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByTestId('workspace-sidebar')).not.toBeInTheDocument();
    });

    it('renders the sidebar at layout="expanded"', () => {
      render(<WorkspaceSidebar {...baseProps()} />);
      expect(screen.getByTestId('workspace-sidebar')).toBeInTheDocument();
    });
  });

  describe('Priorities', () => {
    it('shows only mustHave/important/niceToHave concerns, sorted by weight descending, excluding context and personal concerns', () => {
      render(<WorkspaceSidebar {...baseProps()} />);
      const priorities = screen.getByTestId('workspace-sidebar-priorities');
      const rows = within(priorities).getAllByRole('listitem');
      expect(rows).toHaveLength(4);
      // Descending weight order: Budget cap (95), Safety (80), Price (50), Color (10).
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Budget cap'),
        expect.stringContaining('Safety'),
        expect.stringContaining('Price'),
        expect.stringContaining('Color'),
      ]);
      expect(within(priorities).queryByText('Commute distance')).not.toBeInTheDocument();
      expect(within(priorities).queryByText('Laptop work fit')).not.toBeInTheDocument();
    });

    it('shows simplified weight bands, never a raw numeric weight or percentage', () => {
      render(<WorkspaceSidebar {...baseProps()} />);
      const priorities = screen.getByTestId('workspace-sidebar-priorities');
      expect(
        within(priorities).getByTestId('workspace-sidebar-priority-band-custom.budget_cap'),
      ).toHaveTextContent('Very important');
      expect(
        within(priorities).getByTestId('workspace-sidebar-priority-band-crit-price'),
      ).toHaveTextContent('Important');
      expect(
        within(priorities).getByTestId('workspace-sidebar-priority-band-crit-color'),
      ).toHaveTextContent('Somewhat important');
      // No raw weight (95, 80, 50, 10) or a "%" sign appears anywhere in the section.
      expect(within(priorities).queryByText(/95|80|50|10|%/)).not.toBeInTheDocument();
    });

    it('renders an intentional empty state when there is no case yet', () => {
      render(<WorkspaceSidebar {...baseProps({ decisionProfile: null })} />);
      expect(screen.getByTestId('workspace-sidebar-priorities-empty')).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('renders an intentional empty state when every weighted section is empty', () => {
      render(<WorkspaceSidebar {...baseProps({ decisionProfile: EMPTY_PROFILE })} />);
      expect(screen.getByTestId('workspace-sidebar-priorities-empty')).toBeInTheDocument();
    });
  });

  describe('Still checking', () => {
    it('shows the compact open-questions count', () => {
      render(<WorkspaceSidebar {...baseProps({ openQuestionsCount: 3 })} />);
      expect(screen.getByTestId('workspace-sidebar-still-checking-count')).toHaveTextContent('3');
    });

    it('renders an honest zero state rather than hiding the control', () => {
      render(<WorkspaceSidebar {...baseProps({ openQuestionsCount: 0 })} />);
      expect(screen.getByTestId('workspace-sidebar-still-checking-count')).toHaveTextContent('0');
      expect(screen.getByTestId('workspace-sidebar-still-checking-button')).toBeInTheDocument();
    });

    it('calls onOpenQuestions when clicked -- never opens anything itself', async () => {
      const user = userEvent.setup();
      const onOpenQuestions = vi.fn();
      render(<WorkspaceSidebar {...baseProps({ onOpenQuestions })} />);

      await user.click(screen.getByTestId('workspace-sidebar-still-checking-button'));
      expect(onOpenQuestions).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('has no axe violations with a full profile', async () => {
      const { container } = render(<WorkspaceSidebar {...baseProps()} />);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations in the fully-empty state', async () => {
      const { container } = render(
        <WorkspaceSidebar
          {...baseProps({
            decisionProfile: EMPTY_PROFILE,
            openQuestionsCount: 0,
          })}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
