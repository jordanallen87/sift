import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { WorkspaceAppBar, type WorkspaceAppBarProps } from './WorkspaceAppBar.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildProps(overrides: Partial<WorkspaceAppBarProps> = {}): WorkspaceAppBarProps {
  return {
    title: 'Choose Our Next Car',
    connectionState: 'live',
    findingsCount: 0,
    optionCount: 4,
    onAddOption: vi.fn(),
    onReviewFindings: vi.fn(),
    onOpenDeveloperView: vi.fn(),
    layout: 'expanded',
    ...overrides,
  };
}

describe('WorkspaceAppBar', () => {
  it('renders the title as the page heading', () => {
    render(<WorkspaceAppBar {...buildProps({ title: 'Choose Our Next Car' })} />);
    expect(screen.getByRole('heading', { name: 'Choose Our Next Car' })).toBeInTheDocument();
  });

  it.each([
    ['live', 'Live'],
    ['reconnecting', 'Reconnecting'],
    ['offline', 'Offline'],
  ] as const)('renders connection state %s with label "%s"', (connectionState, expectedLabel) => {
    render(<WorkspaceAppBar {...buildProps({ connectionState })} />);
    expect(screen.getByTestId('workspace-app-bar-connection-status')).toHaveTextContent(
      expectedLabel,
    );
  });

  it('renders the option count as a compact status line', () => {
    render(<WorkspaceAppBar {...buildProps({ optionCount: 4 })} />);
    expect(screen.getByTestId('workspace-app-bar-option-count')).toHaveTextContent('4 options');
  });

  it('uses singular "option" for a count of exactly one', () => {
    render(<WorkspaceAppBar {...buildProps({ optionCount: 1 })} />);
    expect(screen.getByTestId('workspace-app-bar-option-count')).toHaveTextContent('1 option');
    expect(screen.getByTestId('workspace-app-bar-option-count')).not.toHaveTextContent('1 options');
  });

  describe('Add option', () => {
    it('calls onAddOption when activated', async () => {
      const user = userEvent.setup();
      const onAddOption = vi.fn();
      render(<WorkspaceAppBar {...buildProps({ onAddOption })} />);

      await user.click(screen.getByTestId('workspace-app-bar-add-option'));

      expect(onAddOption).toHaveBeenCalledTimes(1);
    });

    it('renders a visible "Add option" label at expanded layout', () => {
      render(<WorkspaceAppBar {...buildProps({ layout: 'expanded' })} />);
      expect(screen.getByTestId('workspace-app-bar-add-option')).toHaveTextContent('Add option');
    });

    it('collapses to an icon-only control at narrow layout, keeping the accessible name', () => {
      render(<WorkspaceAppBar {...buildProps({ layout: 'narrow' })} />);
      const control = screen.getByTestId('workspace-app-bar-add-option');
      expect(control).not.toHaveTextContent('Add option');
      expect(control).toHaveAccessibleName('Add option');
    });
  });

  describe('Findings', () => {
    it('renders a real, clickable control even at zero findings (de-emphasised, never hidden)', () => {
      render(<WorkspaceAppBar {...buildProps({ findingsCount: 0 })} />);
      const control = screen.getByTestId('workspace-app-bar-findings');
      expect(control).toBeInTheDocument();
      expect(control).toBeEnabled();
      expect(screen.getByTestId('workspace-app-bar-findings-count')).toHaveTextContent('0');
    });

    it('shows the count badge and calls onReviewFindings when activated', async () => {
      const user = userEvent.setup();
      const onReviewFindings = vi.fn();
      render(<WorkspaceAppBar {...buildProps({ findingsCount: 3, onReviewFindings })} />);

      expect(screen.getByTestId('workspace-app-bar-findings-count')).toHaveTextContent('3');
      expect(screen.getByTestId('workspace-app-bar-findings')).toHaveAccessibleName('Findings, 3');

      await user.click(screen.getByTestId('workspace-app-bar-findings'));
      expect(onReviewFindings).toHaveBeenCalledTimes(1);
    });

    it('visually de-emphasises the control at zero findings compared to a non-zero count', () => {
      const { unmount } = render(<WorkspaceAppBar {...buildProps({ findingsCount: 0 })} />);
      const zeroStateColor = screen.getByTestId('workspace-app-bar-findings').style.backgroundColor;
      unmount();

      render(<WorkspaceAppBar {...buildProps({ findingsCount: 5 })} />);
      const nonZeroStateColor = screen.getByTestId('workspace-app-bar-findings').style
        .backgroundColor;

      // Zero-findings never gets the "needs attention" tint (it has no
      // background-color override at all -- ghost variant); a non-zero
      // count always does. Asserting the two states are visually distinct
      // is the behavioural proof behind "de-emphasised, not hidden."
      expect(zeroStateColor).toBe('');
      expect(nonZeroStateColor).not.toBe('');
    });

    it('renders a visible "Findings" label at expanded layout and collapses it at narrow layout', () => {
      const { unmount } = render(
        <WorkspaceAppBar {...buildProps({ findingsCount: 2, layout: 'expanded' })} />,
      );
      expect(screen.getByTestId('workspace-app-bar-findings')).toHaveTextContent('Findings');
      unmount();

      render(<WorkspaceAppBar {...buildProps({ findingsCount: 2, layout: 'narrow' })} />);
      const narrowControl = screen.getByTestId('workspace-app-bar-findings');
      expect(narrowControl).not.toHaveTextContent('Findings');
      expect(narrowControl).toHaveAccessibleName('Findings, 2');
    });
  });

  it('renders a discoverable Help control', () => {
    render(<WorkspaceAppBar {...buildProps()} />);
    expect(screen.getByTestId('help-button')).toBeInTheDocument();
  });

  it('renders a discoverable developer-view control and calls onOpenDeveloperView when activated', async () => {
    const user = userEvent.setup();
    const onOpenDeveloperView = vi.fn();
    render(<WorkspaceAppBar {...buildProps({ onOpenDeveloperView })} />);

    const control = screen.getByTestId('workspace-app-bar-developer-view');
    expect(control).toHaveAccessibleName('Developer view');

    await user.click(control);
    expect(onOpenDeveloperView).toHaveBeenCalledTimes(1);
  });

  describe('Reset demo', () => {
    it('does not render a reset control when onResetDemo is not supplied', () => {
      // `buildProps()`'s own base object never sets `onResetDemo` (see its
      // definition above), so the default call already covers "not
      // supplied" -- `exactOptionalPropertyTypes` forbids explicitly
      // passing `onResetDemo: undefined` here to force the same thing.
      render(<WorkspaceAppBar {...buildProps()} />);
      expect(screen.queryByTestId('workspace-app-bar-reset-demo')).not.toBeInTheDocument();
    });

    it('calls onResetDemo when activated', async () => {
      const user = userEvent.setup();
      const onResetDemo = vi.fn();
      render(<WorkspaceAppBar {...buildProps({ onResetDemo })} />);

      await user.click(screen.getByTestId('workspace-app-bar-reset-demo'));
      expect(onResetDemo).toHaveBeenCalledTimes(1);
    });

    it('disables and relabels the reset control while pending, at expanded layout', () => {
      render(
        <WorkspaceAppBar
          {...buildProps({ onResetDemo: vi.fn(), resetPending: true, layout: 'expanded' })}
        />,
      );
      const control = screen.getByTestId('workspace-app-bar-reset-demo');
      expect(control).toBeDisabled();
      expect(control).toHaveAttribute('aria-busy', 'true');
      expect(control).toHaveTextContent('Resetting…');
    });

    it('collapses to an icon-only control at narrow layout, keeping the accessible name', () => {
      render(<WorkspaceAppBar {...buildProps({ onResetDemo: vi.fn(), layout: 'narrow' })} />);
      const control = screen.getByTestId('workspace-app-bar-reset-demo');
      expect(control).not.toHaveTextContent('Reset demo');
      expect(control).toHaveAccessibleName('Reset demo');
    });
  });

  it('has no axe violations at expanded layout', async () => {
    const { container } = render(
      <WorkspaceAppBar
        {...buildProps({ layout: 'expanded', findingsCount: 3, onResetDemo: vi.fn() })}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations at narrow layout', async () => {
    const { container } = render(
      <WorkspaceAppBar
        {...buildProps({ layout: 'narrow', findingsCount: 3, onResetDemo: vi.fn() })}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <WorkspaceAppBar {...buildProps({ layout: 'narrow', onResetDemo: vi.fn() })} />,
    );
    expect(overflowRisks).toEqual([]);
  });

  /**
   * At narrow width this row collapses to bare glyphs, which is precisely the
   * case `ui/tooltip.tsx` exists for. These assert the two halves of that
   * primitive's own rule -- the tooltip appears where the label went, and
   * nothing depends on it.
   */
  describe('tooltips on the collapsed icon controls', () => {
    it.each([
      ['workspace-app-bar-add-option', 'Add option'],
      ['workspace-app-bar-findings', 'Findings, 0'],
      ['workspace-app-bar-references', 'References, 0'],
      ['workspace-app-bar-reset-demo', 'Reset demo'],
    ])('labels %s on hover once it is icon-only at narrow width', async (testId, expected) => {
      const user = userEvent.setup();
      render(
        <WorkspaceAppBar
          {...buildProps({
            layout: 'narrow',
            onResetDemo: vi.fn(),
            onOpenReferenceLibrary: vi.fn(),
          })}
        />,
      );

      await user.hover(screen.getByTestId(testId));

      expect(await screen.findByTestId('tooltip-content')).toHaveTextContent(expected);
    });

    it('labels the developer view at expanded width too, because it is never given a text label', async () => {
      const user = userEvent.setup();
      render(<WorkspaceAppBar {...buildProps({ layout: 'expanded' })} />);

      await user.hover(screen.getByTestId('workspace-app-bar-developer-view'));

      expect(await screen.findByTestId('tooltip-content')).toHaveTextContent('Developer view');
    });

    it('does not repeat a label the expanded row already shows', async () => {
      const user = userEvent.setup();
      render(<WorkspaceAppBar {...buildProps({ layout: 'expanded', onResetDemo: vi.fn() })} />);

      // The control carries its own visible text here, so a tooltip saying
      // the same word twice is noise rather than help.
      await user.hover(screen.getByTestId('workspace-app-bar-add-option'));

      expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
    });

    it('keeps every wrapped control usable with no pointer involved at all', async () => {
      // The rule `ui/tooltip.tsx` is built around: a tooltip is a
      // description, never an accessible name, so a touch or screen-reader
      // user who never sees one must lose nothing. Each control is still
      // findable by its own accessible name and still fires its callback.
      const user = userEvent.setup();
      const onAddOption = vi.fn();
      const onOpenDeveloperView = vi.fn();
      render(
        <WorkspaceAppBar {...buildProps({ layout: 'narrow', onAddOption, onOpenDeveloperView })} />,
      );

      await user.click(screen.getByRole('button', { name: 'Add option' }));
      await user.click(screen.getByRole('button', { name: 'Developer view' }));

      expect(onAddOption).toHaveBeenCalledTimes(1);
      expect(onOpenDeveloperView).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
    });
  });
});
