import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { DisclosureSection } from './DisclosureSection.js';

describe('DisclosureSection', () => {
  it('renders the title and closes by default', () => {
    render(
      <DisclosureSection testId="findings" title="What Pax found">
        <p>Hidden content</p>
      </DisclosureSection>,
    );
    expect(screen.getByText('What Pax found')).toBeInTheDocument();
    const details = screen.getByTestId('disclosure-findings');
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it('opens on click and exposes its content', async () => {
    const user = userEvent.setup();
    render(
      <DisclosureSection testId="findings" title="What Pax found">
        <p>Hidden content</p>
      </DisclosureSection>,
    );
    await user.click(screen.getByTestId('disclosure-findings-summary'));
    expect(screen.getByTestId<HTMLDetailsElement>('disclosure-findings').open).toBe(true);
  });

  it('renders open by default when defaultOpen is true', () => {
    render(
      <DisclosureSection testId="add-concern" title="Add something Pax should check" defaultOpen>
        <p>Form</p>
      </DisclosureSection>,
    );
    expect(screen.getByTestId<HTMLDetailsElement>('disclosure-add-concern').open).toBe(true);
  });

  it('renders a live meta count when provided', () => {
    render(
      <DisclosureSection testId="compare" title="Compare the options" meta="4 options">
        <p>Table</p>
      </DisclosureSection>,
    );
    expect(screen.getByText('4 options')).toBeInTheDocument();
  });

  it('omits the meta line when not provided', () => {
    render(
      <DisclosureSection testId="compare" title="Compare the options">
        <p>Table</p>
      </DisclosureSection>,
    );
    expect(screen.queryByTestId('disclosure-compare-meta')).not.toBeInTheDocument();
  });

  it('shows a live indicator only when live is true', () => {
    const { rerender } = render(
      <DisclosureSection testId="work" title="Pax's work so far" live>
        <p>Timeline</p>
      </DisclosureSection>,
    );
    expect(screen.getByTestId('disclosure-work-live')).toBeInTheDocument();

    rerender(
      <DisclosureSection testId="work" title="Pax's work so far">
        <p>Timeline</p>
      </DisclosureSection>,
    );
    expect(screen.queryByTestId('disclosure-work-live')).not.toBeInTheDocument();
  });

  it('resolves the summary to a real 44px touch target', () => {
    render(
      <DisclosureSection testId="findings" title="What Pax found">
        <p>Hidden content</p>
      </DisclosureSection>,
    );
    expect(screen.getByTestId('disclosure-findings-summary')).toHaveClass(
      'min-h-[var(--size-touch-target-min)]',
    );
  });

  it('has no axe violations open or closed', async () => {
    const { container, rerender } = render(
      <DisclosureSection testId="findings" title="What Pax found" meta="3 findings">
        <p>Hidden content</p>
      </DisclosureSection>,
    );
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <DisclosureSection testId="findings" title="What Pax found" meta="3 findings" defaultOpen>
        <p>Hidden content</p>
      </DisclosureSection>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
