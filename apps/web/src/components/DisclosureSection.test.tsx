import { describe, expect, it, vi } from 'vitest';
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

  it('renders as a plain trigger button when onTriggerClick is supplied, not a details element', () => {
    const onTriggerClick = vi.fn();
    render(
      <DisclosureSection
        testId="findings"
        title="What Pax found"
        meta="2 need a look"
        onTriggerClick={onTriggerClick}
      />,
    );
    const row = screen.getByTestId('disclosure-findings');
    expect(row).not.toBeInstanceOf(HTMLDetailsElement);
    const trigger = screen.getByTestId('disclosure-findings-summary');
    expect(trigger.tagName).toBe('BUTTON');
    expect(screen.getByText('2 need a look')).toBeInTheDocument();
  });

  it('calls onTriggerClick and never renders children when in trigger mode', async () => {
    const user = userEvent.setup();
    const onTriggerClick = vi.fn();
    render(
      <DisclosureSection testId="findings" title="What Pax found" onTriggerClick={onTriggerClick}>
        <p>Should never render</p>
      </DisclosureSection>,
    );
    expect(screen.queryByText('Should never render')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('disclosure-findings-summary'));
    expect(onTriggerClick).toHaveBeenCalledTimes(1);
  });

  it('the trigger button resolves to a real 44px touch target', () => {
    render(<DisclosureSection testId="findings" title="What Pax found" onTriggerClick={vi.fn()} />);
    expect(screen.getByTestId('disclosure-findings-summary')).toHaveClass(
      'min-h-[var(--size-touch-target-min)]',
    );
  });

  it('applies a flagged tone to the trigger row when flagged is true', () => {
    render(
      <DisclosureSection
        testId="findings"
        title="What Pax found"
        flagged
        onTriggerClick={vi.fn()}
      />,
    );
    const trigger = screen.getByTestId('disclosure-findings-summary');
    expect(trigger).toHaveStyle({ color: 'var(--color-status-accepted-uncertainty-ink)' });
  });

  it('has no axe violations in trigger mode, flagged or not', async () => {
    const { container, rerender } = render(
      <DisclosureSection
        testId="findings"
        title="What Pax found"
        meta="2 need a look"
        onTriggerClick={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <DisclosureSection
        testId="findings"
        title="What Pax found"
        meta="2 need a look"
        flagged
        onTriggerClick={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
