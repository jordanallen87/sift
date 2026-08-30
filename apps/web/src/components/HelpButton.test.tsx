import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { HelpButton } from './HelpButton.js';

describe('HelpButton', () => {
  it('renders a labeled help trigger and no sheet content until opened', () => {
    render(<HelpButton />);
    expect(screen.getByTestId('help-button')).toHaveAccessibleName('Help and instructions');
    expect(screen.queryByTestId('help-sheet')).not.toBeInTheDocument();
  });

  it('opens the help sheet with instructions when clicked', async () => {
    const user = userEvent.setup();
    render(<HelpButton />);

    await user.click(screen.getByTestId('help-button'));

    const sheet = await screen.findByTestId('help-sheet');
    expect(within(sheet).getByText('How Sift works')).toBeInTheDocument();
    expect(within(sheet).getByText(/Compare vehicles/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Request investigation/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Inspect run/)).toBeInTheDocument();
    expect(within(sheet).getByText('WebMCP')).toBeInTheDocument();
  });

  it('closes the help sheet when its close control is used', async () => {
    const user = userEvent.setup();
    render(<HelpButton />);

    await user.click(screen.getByTestId('help-button'));
    expect(await screen.findByTestId('help-sheet')).toBeInTheDocument();

    await user.click(screen.getByTestId('sheet-close'));
    expect(screen.queryByTestId('help-sheet')).not.toBeInTheDocument();
  });

  it('has no axe violations closed or open', async () => {
    const user = userEvent.setup();
    const { container } = render(<HelpButton />);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByTestId('help-button'));
    await screen.findByTestId('help-sheet');
    expect(await axe(container)).toHaveNoViolations();
  });
});
