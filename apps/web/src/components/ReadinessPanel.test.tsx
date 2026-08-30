import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { ObligationState } from '@sift/contracts';
import { ReadinessPanel, type ReadinessPanelData } from './ReadinessPanel.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildObligation(overrides: Partial<ObligationState> = {}): ObligationState {
  return {
    id: 'obligation-1',
    label: 'Confirm out-the-door price',
    question: 'What is the total out-the-door price including fees?',
    category: 'pricing',
    required: true,
    priority: 100,
    requiredEvidenceLevel: 'E2',
    maxAttempts: 3,
    acceptedUncertaintyAllowed: false,
    dependsOn: [],
    preferredSkills: [],
    preferredSpecialists: [],
    completionRule: {
      minimumEvidenceLevel: 'E2',
      minimumIndependentSources: 1,
      acceptedUncertaintyAllowed: false,
    },
    origin: 'pack',
    status: 'open',
    attemptsUsed: 0,
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildReadiness(overrides: Partial<ReadinessPanelData> = {}): ReadinessPanelData {
  return {
    ready: false,
    satisfied: [],
    active: [],
    blocked: [],
    acceptedUncertainty: [],
    open: [],
    blockers: [],
    ...overrides,
  };
}

describe('ReadinessPanel', () => {
  it('renders the initial/empty state when no case is open (readiness is null)', () => {
    render(<ReadinessPanel readiness={null} />);
    expect(screen.getByTestId('readiness-panel-empty')).toHaveTextContent(/no case is open yet/i);
    expect(screen.queryByTestId('readiness-panel-status')).not.toBeInTheDocument();
  });

  it('renders a loading state before any readiness has been computed', () => {
    render(<ReadinessPanel readiness={null} loading />);
    const loading = screen.getByTestId('readiness-panel-loading');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('readiness-panel-empty')).not.toBeInTheDocument();
  });

  it('shows an "Updating" note while preserving the last valid readiness data during a refresh', () => {
    const readiness = buildReadiness({
      ready: true,
      satisfied: [buildObligation({ id: 'ob-1', status: 'satisfied' })],
    });
    render(<ReadinessPanel readiness={readiness} loading />);

    expect(screen.getByTestId('readiness-panel-updating')).toHaveTextContent(/updating/i);
    // The last-good data stays rendered underneath, not blanked.
    expect(screen.getByTestId('readiness-panel-status')).toBeInTheDocument();
    expect(screen.getByTestId('readiness-panel-obligation-ob-1')).toBeInTheDocument();
  });

  it('renders a non-vacuous "ready" message for a case with zero obligations, not a bare "Ready"', () => {
    render(<ReadinessPanel readiness={buildReadiness({ ready: true })} />);

    expect(screen.getByTestId('readiness-panel-status')).toHaveTextContent(/ready for decision/i);
    expect(screen.getByTestId('readiness-panel-status-detail')).toHaveTextContent(
      'This case has no required questions to resolve yet.',
    );
  });

  it('renders a "ready" case with resolved obligations showing a concrete resolved count', () => {
    const readiness = buildReadiness({
      ready: true,
      satisfied: [
        buildObligation({ id: 'ob-1', status: 'satisfied' }),
        buildObligation({ id: 'ob-2', status: 'satisfied', label: 'Confirm mileage' }),
      ],
      acceptedUncertainty: [
        buildObligation({
          id: 'ob-3',
          status: 'accepted_uncertainty',
          label: 'Test-drive comfort',
        }),
      ],
    });
    render(<ReadinessPanel readiness={readiness} />);

    expect(screen.getByTestId('readiness-panel-status')).toHaveTextContent(/ready for decision/i);
    expect(screen.getByTestId('readiness-panel-status-detail')).toHaveTextContent(
      '3 of 3 questions resolved.',
    );
    expect(screen.getByTestId('readiness-panel-bucket-satisfied-count')).toHaveTextContent('2');
    expect(
      screen.getByTestId('readiness-panel-bucket-accepted-uncertainty-count'),
    ).toHaveTextContent('1');
    expect(screen.getByTestId('readiness-panel-obligation-ob-2')).toHaveTextContent(
      'Confirm mileage',
    );
  });

  it('renders a partial-evidence state showing satisfied and open obligations side by side', () => {
    const readiness = buildReadiness({
      ready: false,
      satisfied: [buildObligation({ id: 'ob-1', status: 'satisfied' })],
      open: [buildObligation({ id: 'ob-2', status: 'open', label: 'Confirm dealer fees' })],
      blockers: [
        '"Confirm dealer fees" is open: it has not yet reached its required E2 evidence level.',
      ],
    });
    render(<ReadinessPanel readiness={readiness} />);

    expect(screen.getByTestId('readiness-panel-bucket-satisfied-count')).toHaveTextContent('1');
    expect(screen.getByTestId('readiness-panel-bucket-open-count')).toHaveTextContent('1');
    expect(screen.getByTestId('readiness-panel-obligation-ob-1')).toBeInTheDocument();
    expect(screen.getByTestId('readiness-panel-obligation-ob-2')).toHaveTextContent(
      'Confirm dealer fees',
    );
  });

  it('renders the blocked state with concrete blocker reasons, not just a color', () => {
    const readiness = buildReadiness({
      ready: false,
      blocked: [
        buildObligation({
          id: 'ob-1',
          status: 'blocked',
          label: 'Verify dealer inventory',
          attemptsUsed: 3,
          maxAttempts: 3,
        }),
      ],
      blockers: [
        '"Verify dealer inventory" is blocked: 3 of 3 attempts used and accepted uncertainty is not allowed for this obligation.',
      ],
    });
    render(<ReadinessPanel readiness={readiness} />);

    expect(screen.getByTestId('readiness-panel-status')).toHaveTextContent(
      /not ready for decision/i,
    );
    const blockers = screen.getByTestId('readiness-panel-blockers');
    expect(blockers).toHaveTextContent('"Verify dealer inventory" is blocked');
    expect(blockers).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('readiness-panel-bucket-blocked-count')).toHaveTextContent('1');
  });

  it('does not render a blockers callout when the case is not ready but has no blockers yet', () => {
    render(<ReadinessPanel readiness={buildReadiness({ ready: false, blockers: [] })} />);
    expect(screen.queryByTestId('readiness-panel-blockers')).not.toBeInTheDocument();
  });

  it('always shows a zero count for an empty bucket rather than omitting it', () => {
    render(<ReadinessPanel readiness={buildReadiness({ ready: true })} />);
    expect(screen.getByTestId('readiness-panel-bucket-active-count')).toHaveTextContent('0');
    expect(screen.getByTestId('readiness-panel-bucket-active')).toHaveTextContent(
      /none right now/i,
    );
  });

  it('does not label a non-required obligation as "(required)"', () => {
    const readiness = buildReadiness({
      ready: false,
      open: [
        buildObligation({
          id: 'ob-1',
          status: 'open',
          required: false,
          label: 'Nice-to-have check',
        }),
      ],
    });
    render(<ReadinessPanel readiness={readiness} />);

    const item = screen.getByTestId('readiness-panel-obligation-ob-1');
    expect(item).toHaveTextContent('Nice-to-have check');
    expect(item).not.toHaveTextContent('(required)');
  });

  it('has no axe violations in the empty, loading, and populated states', async () => {
    const { container: empty } = render(<ReadinessPanel readiness={null} />);
    expect(await axe(empty)).toHaveNoViolations();

    const { container: loading } = render(<ReadinessPanel readiness={null} loading />);
    expect(await axe(loading)).toHaveNoViolations();

    const { container: populated } = render(
      <ReadinessPanel
        readiness={buildReadiness({
          ready: false,
          blocked: [buildObligation({ id: 'ob-1', status: 'blocked' })],
          blockers: ['blocked reason'],
        })}
      />,
    );
    expect(await axe(populated)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <ReadinessPanel
        readiness={buildReadiness({
          ready: false,
          blocked: [buildObligation({ id: 'ob-1', status: 'blocked' })],
          blockers: ['blocked reason'],
        })}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
