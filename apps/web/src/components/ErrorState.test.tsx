import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { ErrorState } from './ErrorState.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

describe('ErrorState', () => {
  it('renders the recoverable error message', () => {
    render(<ErrorState message="Lost connection to the live case stream." />);
    expect(screen.getByTestId('error-state')).toHaveTextContent(
      'Lost connection to the live case stream.',
    );
  });

  it('announces itself assertively so it is not missed, per product.md\'s "recoverable error" required state', () => {
    render(<ErrorState message="Something recoverable happened." />);
    expect(screen.getByTestId('error-state')).toHaveAttribute('role', 'alert');
  });

  it('calls onRetry when the retry control is activated', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState message="Could not reach Pax." onRetry={onRetry} />);

    await user.click(screen.getByTestId('error-state-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders no retry control when onRetry is not provided', () => {
    render(<ErrorState message="Could not reach Pax." />);
    expect(screen.queryByTestId('error-state-retry')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ErrorState message="Something went wrong." onRetry={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <ErrorState message="Something went wrong." onRetry={vi.fn()} />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
