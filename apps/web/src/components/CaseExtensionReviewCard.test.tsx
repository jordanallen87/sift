import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { CaseExtension } from '@sift/contracts';
import { CaseExtensionReviewCard } from './CaseExtensionReviewCard.js';
import { AppProviders } from '../app/AppProviders.js';
import { createFakeSiftCommands, buildFakeCommandReceipt } from '../test/fake-sift-commands.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildExtension(overrides: Partial<CaseExtension> = {}): CaseExtension {
  return {
    id: 'ext-1',
    caseId: 'case-1',
    definition: {
      id: 'custom.pet_sensory_fit',
      label: 'Pet sensory fit',
      valueType: 'string',
      required: false,
      appliesTo: ['car'],
      evidenceExpectation: 'assertion',
      comparison: 'none',
      sensitive: false,
      origin: 'agent_proposed',
      reason: 'The household mentioned a sound-sensitive dog during intake.',
      confirmation: 'pending',
      proposedBy: 'lead-investigator',
      createdAt: '2026-08-27T00:00:00.000Z',
    },
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function renderCard(
  props: Partial<React.ComponentProps<typeof CaseExtensionReviewCard>> = {},
  commandsOverrides: Parameters<typeof createFakeSiftCommands>[0] = {},
) {
  const commands = createFakeSiftCommands(commandsOverrides);
  const utils = render(
    <AppProviders commandsClient={commands}>
      <CaseExtensionReviewCard
        caseId="case-1"
        expectedSequence={3}
        extension={buildExtension()}
        {...props}
      />
    </AppProviders>,
  );
  return { ...utils, commands };
}

describe('CaseExtensionReviewCard', () => {
  it('renders the empty state when nothing is pending review', () => {
    renderCard({ extension: null });
    expect(screen.getByTestId('case-extension-review-card-empty')).toBeInTheDocument();
  });

  it('renders the proposed concern label, reason, and proposer', () => {
    renderCard();
    expect(screen.getByTestId('case-extension-review-card-label')).toHaveTextContent(
      'Pet sensory fit',
    );
    expect(screen.getByTestId('case-extension-review-card-reason')).toHaveTextContent(
      'sound-sensitive dog',
    );
    expect(screen.getByTestId('case-extension-review-card-proposed-by')).toHaveTextContent(
      'lead-investigator',
    );
  });

  it('confirms the extension by calling reviewCaseExtension with decision "confirm"', async () => {
    const user = userEvent.setup();
    const { commands } = renderCard(
      {},
      { reviewCaseExtension: vi.fn().mockResolvedValue(buildFakeCommandReceipt()) },
    );

    await user.click(screen.getByTestId('case-extension-review-card-confirm'));

    await waitFor(() => {
      expect(commands.reviewCaseExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: 'case-1',
          extensionId: 'ext-1',
          decision: 'confirm',
          expectedSequence: 3,
        }),
      );
    });
  });

  it('rejects the extension with an optional note as the reason', async () => {
    const user = userEvent.setup();
    const { commands } = renderCard(
      {},
      { reviewCaseExtension: vi.fn().mockResolvedValue(buildFakeCommandReceipt()) },
    );

    await user.type(
      screen.getByTestId('case-extension-review-card-note'),
      'Not relevant to this decision.',
    );
    await user.click(screen.getByTestId('case-extension-review-card-reject'));

    await waitFor(() => {
      expect(commands.reviewCaseExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'reject',
          reason: 'Not relevant to this decision.',
        }),
      );
    });
  });

  it('shows a recoverable error when the review command fails', async () => {
    const user = userEvent.setup();
    renderCard(
      {},
      { reviewCaseExtension: vi.fn().mockRejectedValue(new Error('Stale sequence.')) },
    );

    await user.click(screen.getByTestId('case-extension-review-card-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('case-extension-review-card-error')).toHaveTextContent(
        'Stale sequence.',
      );
    });
  });

  it('shows a generic error message when the review command rejects with a non-Error value', async () => {
    const user = userEvent.setup();
    renderCard({}, { reviewCaseExtension: vi.fn().mockRejectedValue('not an Error instance') });

    await user.click(screen.getByTestId('case-extension-review-card-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('case-extension-review-card-error')).toHaveTextContent(
        'Could not record this review.',
      );
    });
  });

  it('ignores a second review submission while one is already in flight (defends against a fast double-tap racing the disabled attribute)', async () => {
    const user = userEvent.setup();
    let resolveReview: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      resolveReview = resolve;
    });
    const { commands } = renderCard({}, { reviewCaseExtension: vi.fn().mockReturnValue(pending) });

    await user.click(screen.getByTestId('case-extension-review-card-confirm'));
    expect(commands.reviewCaseExtension).toHaveBeenCalledTimes(1);

    // Both controls are `disabled` the instant `pending` becomes true, so a
    // normal (or even synthetic) click on either can no longer reach
    // `submit()` -- this simulates the one real race that still can: a fast
    // double-tap landing on the same frame the disabled attribute is being
    // committed, which is exactly the scenario `submit()`'s own `pending`
    // guard exists to make a no-op.
    const rejectButton = screen.getByTestId('case-extension-review-card-reject');
    rejectButton.removeAttribute('disabled');
    fireEvent.click(rejectButton);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(commands.reviewCaseExtension).toHaveBeenCalledTimes(1);

    resolveReview(buildFakeCommandReceipt());
  });

  it('renders no confirm/reject controls when nothing is pending review (extension is null)', () => {
    const { commands } = renderCard({ extension: null });

    expect(screen.queryByTestId('case-extension-review-card-confirm')).not.toBeInTheDocument();
    expect(commands.reviewCaseExtension).not.toHaveBeenCalled();
  });

  it('renders a settled "Rejected" badge with a distinct tone from "Confirmed"', () => {
    renderCard({
      extension: buildExtension({
        definition: { ...buildExtension().definition, confirmation: 'rejected' },
      }),
    });
    expect(screen.getByTestId('case-extension-review-card-settled')).toHaveTextContent(/rejected/i);
    expect(screen.queryByTestId('case-extension-review-card-reject')).not.toBeInTheDocument();
  });

  it('renders a settled "Confirmed" badge instead of controls once the extension is no longer pending', () => {
    renderCard({
      extension: buildExtension({
        definition: { ...buildExtension().definition, confirmation: 'confirmed' },
      }),
    });
    expect(screen.getByTestId('case-extension-review-card-settled')).toHaveTextContent(
      /confirmed/i,
    );
    expect(screen.queryByTestId('case-extension-review-card-confirm')).not.toBeInTheDocument();
  });

  it('has no axe violations in the empty and pending states', async () => {
    const { container: empty } = renderCard({ extension: null });
    expect(await axe(empty)).toHaveNoViolations();

    const { container: pending } = renderCard();
    expect(await axe(pending)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const commands = createFakeSiftCommands();
    const { overflowRisks } = renderAtNarrowWidth(
      <AppProviders commandsClient={commands}>
        <CaseExtensionReviewCard
          caseId="case-1"
          expectedSequence={1}
          extension={buildExtension()}
        />
      </AppProviders>,
    );
    expect(overflowRisks).toEqual([]);
  });
});
