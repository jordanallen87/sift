import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { DemoLauncher } from './DemoLauncher.js';
import { AppProviders } from '../app/AppProviders.js';
import { createFakePaxCommands, buildFakeCommandReceipt } from '../test/fake-pax-commands.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function renderLauncher(overrides: Parameters<typeof createFakePaxCommands>[0] = {}, props = {}) {
  const commands = createFakePaxCommands(overrides);
  const utils = render(
    <AppProviders commandsClient={commands}>
      <DemoLauncher {...props} />
    </AppProviders>,
  );
  return { commands, ...utils };
}

describe('DemoLauncher', () => {
  it('renders the two demo options from product.md, with the exact required labels', () => {
    renderLauncher();

    const carOption = screen.getByRole('button', { name: 'Choose our next car' });
    const energyOption = screen.getByRole('button', { name: 'Investigate my energy bill' });

    expect(carOption).toHaveAttribute('data-testid', 'demo-launcher-car-purchase');
    expect(energyOption).toHaveAttribute('data-testid', 'demo-launcher-home-energy-guardian');
    // Four buttons total: the help trigger, the primary "Compare vehicles"
    // action (ADR 0003), and the two unchanged demo cards.
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('renders the primary "Compare vehicles" action and calls onCompareVehicles when clicked', async () => {
    const onCompareVehicles = vi.fn();
    const user = userEvent.setup();
    renderLauncher({}, { onCompareVehicles });

    const compareButton = screen.getByTestId('demo-launcher-compare-vehicles');
    expect(compareButton).toBeInTheDocument();
    await user.click(compareButton);

    expect(onCompareVehicles).toHaveBeenCalledTimes(1);
  });

  it('calls startDemo with the matching demoId when an option is clicked (initial/empty state -> command)', async () => {
    const user = userEvent.setup();
    const { commands } = renderLauncher();

    await user.click(screen.getByRole('button', { name: 'Choose our next car' }));

    expect(commands.startDemo).toHaveBeenCalledWith({ demoId: 'car-purchase' });
  });

  it('calls startDemo with home-energy-guardian for the second option', async () => {
    const user = userEvent.setup();
    const { commands } = renderLauncher();

    await user.click(screen.getByRole('button', { name: 'Investigate my energy bill' }));

    expect(commands.startDemo).toHaveBeenCalledWith({ demoId: 'home-energy-guardian' });
  });

  it('shows a loading state while startDemo is in flight and disables both options', async () => {
    let resolveStartDemo!: (value: ReturnType<typeof buildFakeCommandReceipt>) => void;
    const pending = new Promise((resolvePromise) => {
      resolveStartDemo = resolvePromise;
    });
    const user = userEvent.setup();
    renderLauncher({ startDemo: vi.fn().mockReturnValue(pending) });

    const carButton = screen.getByRole('button', { name: 'Choose our next car' });
    const energyButton = screen.getByRole('button', { name: 'Investigate my energy bill' });

    await user.click(carButton);

    expect(carButton).toBeDisabled();
    expect(energyButton).toBeDisabled();
    expect(carButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('demo-launcher-status')).toHaveTextContent(/starting/i);

    resolveStartDemo(buildFakeCommandReceipt());
    await waitFor(() => {
      expect(carButton).not.toBeDisabled();
    });
  });

  it('calls onDemoStarted with the receipt once startDemo resolves', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-car-1' });
    const onDemoStarted = vi.fn();
    const user = userEvent.setup();
    renderLauncher({ startDemo: vi.fn().mockResolvedValue(receipt) }, { onDemoStarted });

    await user.click(screen.getByRole('button', { name: 'Choose our next car' }));

    await waitFor(() => {
      expect(onDemoStarted).toHaveBeenCalledWith(receipt);
    });
  });

  it('shows a recoverable error and allows retry when startDemo rejects', async () => {
    const user = userEvent.setup();
    const { commands } = renderLauncher({
      startDemo: vi
        .fn()
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue(buildFakeCommandReceipt()),
    });

    await user.click(screen.getByRole('button', { name: 'Choose our next car' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/network down/i);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(commands.startDemo).toHaveBeenCalledTimes(2);
    });
  });

  it('falls back to a generic error message when the rejection is not an Error instance', async () => {
    const user = userEvent.setup();
    renderLauncher({ startDemo: vi.fn().mockRejectedValueOnce('boom') });

    await user.click(screen.getByRole('button', { name: 'Choose our next car' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not start the demo/i);
  });

  it('has no axe violations in the initial state', async () => {
    const { container } = renderLauncher();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const commands = createFakePaxCommands();
    const { overflowRisks } = renderAtNarrowWidth(
      <AppProviders commandsClient={commands}>
        <DemoLauncher />
      </AppProviders>,
    );
    expect(overflowRisks).toEqual([]);
  });
});
