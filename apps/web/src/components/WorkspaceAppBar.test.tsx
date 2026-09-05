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
    onAddNote: vi.fn(),
    onAddConcern: vi.fn(),
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

  it.each(['narrow', 'expanded'] as const)(
    'renders the Sift mark beside the title as decoration at %s layout',
    (layout) => {
      render(<WorkspaceAppBar {...buildProps({ layout, title: 'Vehicle Selection' })} />);

      const mark = screen.getByTestId('workspace-app-bar-brand-mark');
      // The one-colour symbol, at the path the production build serves
      // (`apps/web/public/brand/sift-mark.svg`), in both layouts -- the
      // product's identity is not a wide-screen luxury.
      expect(mark).toHaveAttribute('src', '/brand/sift-mark.svg');

      // Decorative. The heading beside it is this banner's accessible name
      // and it names the *case*, which is what someone arriving here needs;
      // the product is already named by the document title. A mark that
      // announced "Sift" ahead of every case title is noise a sighted user
      // skips and a screen-reader user cannot.
      expect(mark).toHaveAttribute('alt', '');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Vehicle Selection' })).toBeInTheDocument();
    },
  );

  it('keeps the title truncating rather than letting the mark squeeze it', () => {
    render(<WorkspaceAppBar {...buildProps({ layout: 'narrow' })} />);

    // The row is genuinely tight at 390px, so which of the two absorbs the
    // squeeze is a real decision and not a detail: `shrink-0` on the mark
    // plus `min-w-0 truncate` on the title means a long case title ellipses,
    // exactly as it did before the mark existed, instead of crushing it.
    expect(screen.getByTestId('workspace-app-bar-brand-mark').className).toContain('shrink-0');
    const title = screen.getByTestId('workspace-app-bar-title');
    expect(title.className).toContain('truncate');
    expect(title.className).toContain('min-w-0');
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

  /**
   * The three create actions this row owns are one menu, not three buttons.
   * "Add a note" and "Add a question" used to be `DisclosureSection` rows at
   * the very bottom of the narrow content stack -- the same defect this
   * component was originally built to fix for "Add option"/"Findings," and
   * the project owner's own follow-up: "Add a note and add a question should
   * be in either the header or footer toolbars, not at the bottom of the
   * stack," plus "the header is consuming more space than it needs to... I
   * think it's possible by using things like menus."
   *
   * The load-bearing property is ADR 0008's "every capability must be
   * reachable in both [modes]": the menu is the SAME menu with the SAME three
   * items at narrow and expanded, so nothing became wide-only, and every item
   * is reachable with the keyboard alone.
   */
  describe('create menu', () => {
    it('renders one create control that announces itself as a menu button', () => {
      render(<WorkspaceAppBar {...buildProps()} />);

      const trigger = screen.getByTestId('workspace-app-bar-create-menu');
      expect(trigger).toHaveAccessibleName('Add or adjust');
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it.each(['narrow', 'expanded'] as const)(
      'offers all three create actions at %s layout (ADR 0008: reachable in both modes)',
      async (layout) => {
        const user = userEvent.setup();
        render(<WorkspaceAppBar {...buildProps({ layout })} />);

        await user.click(screen.getByTestId('workspace-app-bar-create-menu'));

        expect(await screen.findByRole('menu')).toBeInTheDocument();
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
          'Add option',
          'Add a note',
          'Add a question',
        ]);
      },
    );

    it.each([
      ['workspace-app-bar-add-option', 'onAddOption'],
      ['workspace-app-bar-add-note', 'onAddNote'],
      ['workspace-app-bar-add-concern', 'onAddConcern'],
    ] as const)('calls exactly %s -> %s and nothing else', async (testId, expectedCallback) => {
      const user = userEvent.setup();
      const callbacks = {
        onAddOption: vi.fn(),
        onAddNote: vi.fn(),
        onAddConcern: vi.fn(),
      };
      render(<WorkspaceAppBar {...buildProps(callbacks)} />);

      await user.click(screen.getByTestId('workspace-app-bar-create-menu'));
      await user.click(await screen.findByTestId(testId));

      for (const [name, callback] of Object.entries(callbacks)) {
        expect(callback, name).toHaveBeenCalledTimes(name === expectedCallback ? 1 : 0);
      }
    });

    it('renders a visible "Add" label at expanded layout', () => {
      render(<WorkspaceAppBar {...buildProps({ layout: 'expanded' })} />);
      expect(screen.getByTestId('workspace-app-bar-create-menu')).toHaveTextContent('Add');
    });

    it('collapses to an icon-only control at narrow layout, keeping the accessible name', () => {
      render(<WorkspaceAppBar {...buildProps({ layout: 'narrow' })} />);
      const control = screen.getByTestId('workspace-app-bar-create-menu');
      expect(control).not.toHaveTextContent('Add');
      expect(control).toHaveAccessibleName('Add or adjust');
    });

    it('is fully operable with the keyboard alone, arrow keys included', async () => {
      const user = userEvent.setup();
      const onAddConcern = vi.fn();
      render(<WorkspaceAppBar {...buildProps({ layout: 'narrow', onAddConcern })} />);

      await user.tab();
      expect(screen.getByTestId('workspace-app-bar-create-menu')).toHaveFocus();

      await user.keyboard('{Enter}');
      await screen.findByRole('menu');
      // Radix focuses the first item on open; two ArrowDowns reach the third.
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(screen.getByTestId('workspace-app-bar-add-concern')).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(onAddConcern).toHaveBeenCalledTimes(1);
    });

    it('returns focus to its trigger on Escape, so the toolbar is never lost', async () => {
      const user = userEvent.setup();
      render(<WorkspaceAppBar {...buildProps()} />);
      const trigger = screen.getByTestId('workspace-app-bar-create-menu');

      await user.click(trigger);
      await screen.findByRole('menu');
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).toBeNull();
      expect(trigger).toHaveFocus();
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
      ['workspace-app-bar-create-menu', 'Add or adjust'],
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
      await user.hover(screen.getByTestId('workspace-app-bar-create-menu'));

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

      // The create control is now a menu button, so its own name opens the
      // menu and the item inside it carries the action's name -- both still
      // found by accessible name, with no tooltip involved.
      await user.click(screen.getByRole('button', { name: 'Add or adjust' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Add option' }));
      await user.click(screen.getByRole('button', { name: 'Developer view' }));

      expect(onAddOption).toHaveBeenCalledTimes(1);
      expect(onOpenDeveloperView).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
    });
  });
});

describe('WorkspaceAppBar switch-decision control', () => {
  // Until 2026-09-05 there was no way out of a case. "Reset demo" restarts
  // the *same* pack (App.tsx's `handleResetDemo` reads `snapshot.pack.id`),
  // the launcher only renders when there is no active case, and that case id
  // is restored from localStorage on every load -- so a person who opened
  // one demo could never reach the other without clearing site data. That is
  // a dead end for anyone evaluating the deployed product, not just for the
  // demo recording.
  it('offers a way back to the launcher, and calls it on select', async () => {
    const user = userEvent.setup();
    const onSwitchDecision = vi.fn();
    render(<WorkspaceAppBar {...buildProps({ onSwitchDecision })} />);

    await user.click(screen.getByTestId('workspace-app-bar-create-menu'));
    await user.click(screen.getByTestId('workspace-app-bar-switch-decision'));

    expect(onSwitchDecision).toHaveBeenCalledTimes(1);
  });

  it('omits the control entirely when no handler is supplied, rather than rendering a dead item', async () => {
    const user = userEvent.setup();
    render(<WorkspaceAppBar {...buildProps()} />);

    await user.click(screen.getByTestId('workspace-app-bar-create-menu'));
    expect(screen.queryByTestId('workspace-app-bar-switch-decision')).toBeNull();
  });
});
