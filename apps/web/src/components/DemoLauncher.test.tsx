import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { DemoLauncher } from './DemoLauncher.js';
import { AppProviders } from '../app/AppProviders.js';
import {
  buildFakeEnergyBillFeedCheckResult,
  createFakeSiftCommands,
  buildFakeCommandReceipt,
} from '../test/fake-sift-commands.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function renderLauncher(overrides: Parameters<typeof createFakeSiftCommands>[0] = {}, props = {}) {
  const commands = createFakeSiftCommands(overrides);
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

  it('renders the Sift logo as decoration, leaving the heading to name the product', () => {
    const { container } = renderLauncher();

    // The asset actually shipped, at the path the production build serves it
    // from -- `apps/web/public/brand/sift-logo.svg` -> `/brand/sift-logo.svg`,
    // the same static-asset convention index.html documents for the favicons.
    // Asserting the path is what would catch the logo silently 404ing.
    const logo = container.querySelector('img[src="/brand/sift-logo.svg"]');
    expect(logo).toBeInTheDocument();

    // Decorative, deliberately: `<h1>Start a Sift case</h1>` below it already
    // names the product in real text, so an accessible name here would make a
    // screen reader announce "Sift" and then "Start a Sift case". `alt=""` is
    // what keeps it out of the accessibility tree entirely.
    expect(logo).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Start a Sift case' })).toBeInTheDocument();

    // Intrinsic dimensions, so the browser reserves the box before the SVG
    // loads instead of collapsing to zero and then shoving the heading and
    // both demo cards down the page. The rendered size is CSS's job.
    expect(logo).toHaveAttribute('width', '748');
    expect(logo).toHaveAttribute('height', '276');
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

  it('routes the second option through the deterministic bill-feed gate, not startDemo, and still opens a case', async () => {
    const user = userEvent.setup();
    const receipt = buildFakeCommandReceipt({ caseId: 'case-energy-1' });
    const onDemoStarted = vi.fn();
    const { commands } = renderLauncher(
      {
        checkEnergyBillFeed: vi
          .fn()
          .mockResolvedValue(buildFakeEnergyBillFeedCheckResult({ receipt })),
      },
      { onDemoStarted },
    );

    await user.click(screen.getByRole('button', { name: 'Investigate my energy bill' }));

    // The threshold gate genuinely runs on the real default click: the
    // anomalous fixture, not startDemo directly.
    expect(commands.checkEnergyBillFeed).toHaveBeenCalledWith({ billFeedId: 'anomalous' });
    expect(commands.startDemo).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onDemoStarted).toHaveBeenCalledWith(receipt);
    });
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
    const commands = createFakeSiftCommands();
    const { overflowRisks } = renderAtNarrowWidth(
      <AppProviders commandsClient={commands}>
        <DemoLauncher />
      </AppProviders>,
    );
    expect(overflowRisks).toEqual([]);
  });
});

/**
 * The deterministic bill-feed gate's real, reachable UI (task brief: "The
 * person must be told what happened when no case is opened ... not left
 * staring at a dead button"). Both outcomes go through the SAME
 * `checkEnergyBillFeed` call the "Investigate my energy bill" button always
 * makes -- a `?billFeed=normal` URL param, read once per click, only picks
 * which fixture (`billFeedId`) that one call names. This is deliberately
 * NOT a new always-visible launcher element: a new visible control would
 * appear in EVERY `initial-launcher-*` Playwright visual baseline (both
 * `home-energy-guardian-journey.spec.ts` and `car-purchase-journey.spec.ts`
 * screenshot this exact shared launcher screen), and none of that existing
 * coverage ever navigates with a query string (`tests/e2e/pages/sift-page.ts`
 * always does `page.goto('/')`) -- so the default render this describe
 * block does NOT touch stays byte-identical, and every test above this one
 * keeps passing unmodified.
 */
describe('DemoLauncher: the "Investigate my energy bill" button honors ?billFeed=normal', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('with no query param present, calls checkEnergyBillFeed with the anomalous fixture (default behavior genuinely passes through the gate, and the visible outcome is unchanged)', async () => {
    const user = userEvent.setup();
    const receipt = buildFakeCommandReceipt();
    const onDemoStarted = vi.fn();
    const { commands } = renderLauncher(
      {
        checkEnergyBillFeed: vi
          .fn()
          .mockResolvedValue(buildFakeEnergyBillFeedCheckResult({ receipt })),
      },
      { onDemoStarted },
    );

    await user.click(screen.getByRole('button', { name: 'Investigate my energy bill' }));

    expect(commands.checkEnergyBillFeed).toHaveBeenCalledWith({ billFeedId: 'anomalous' });
    expect(commands.startDemo).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onDemoStarted).toHaveBeenCalledWith(receipt);
    });
  });

  it('with ?billFeed=normal, calls checkEnergyBillFeed instead, and transitions to the workspace when it opens a case', async () => {
    window.history.pushState({}, '', '/?billFeed=normal');
    const user = userEvent.setup();
    const onDemoStarted = vi.fn();
    const receipt = buildFakeCommandReceipt();
    const { commands } = renderLauncher(
      {
        checkEnergyBillFeed: vi
          .fn()
          .mockResolvedValue(buildFakeEnergyBillFeedCheckResult({ receipt })),
      },
      { onDemoStarted },
    );

    await user.click(screen.getByRole('button', { name: 'Investigate my energy bill' }));

    await waitFor(() => {
      expect(commands.checkEnergyBillFeed).toHaveBeenCalledWith({ billFeedId: 'normal' });
    });
    expect(commands.startDemo).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onDemoStarted).toHaveBeenCalledWith(receipt);
    });
  });

  it('with ?billFeed=normal, tells the person honestly when the gate opens no case at all', async () => {
    window.history.pushState({}, '', '/?billFeed=normal');
    const user = userEvent.setup();
    const onDemoStarted = vi.fn();
    const { commands } = renderLauncher(
      {
        checkEnergyBillFeed: vi.fn().mockResolvedValue(
          buildFakeEnergyBillFeedCheckResult({
            caseOpened: false,
            receipt: undefined,
            percentAboveBaseline: 4.42,
            thresholdPercent: 15,
            reason: 'Your bill looks normal this month; no case opened.',
          }),
        ),
      },
      { onDemoStarted },
    );

    await user.click(screen.getByRole('button', { name: 'Investigate my energy bill' }));

    const notice = await screen.findByTestId('demo-launcher-bill-normal');
    expect(notice).toHaveTextContent(/normal this month/i);
    expect(notice).toHaveTextContent(/no case opened/i);

    // Not left staring at a dead button: the option is usable again, and a
    // real retry is offered rather than a silent, unexplained stop.
    expect(screen.getByRole('button', { name: 'Investigate my energy bill' })).toBeEnabled();
    expect(onDemoStarted).not.toHaveBeenCalled();
    expect(commands.startDemo).not.toHaveBeenCalled();
  });

  it('with ?billFeed=normal, a checkEnergyBillFeed rejection still shows the normal recoverable-error state', async () => {
    window.history.pushState({}, '', '/?billFeed=normal');
    const user = userEvent.setup();
    renderLauncher({
      checkEnergyBillFeed: vi.fn().mockRejectedValue(new Error('network down')),
    });

    await user.click(screen.getByRole('button', { name: 'Investigate my energy bill' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/network down/i);
  });

  it('has no axe violations when the "bill looks normal" notice is showing', async () => {
    window.history.pushState({}, '', '/?billFeed=normal');
    const user = userEvent.setup();
    const { container } = renderLauncher({
      checkEnergyBillFeed: vi
        .fn()
        .mockResolvedValue(
          buildFakeEnergyBillFeedCheckResult({ caseOpened: false, receipt: undefined }),
        ),
    });

    await user.click(screen.getByRole('button', { name: 'Investigate my energy bill' }));
    await screen.findByTestId('demo-launcher-bill-normal');

    expect(await axe(container)).toHaveNoViolations();
  });
});
