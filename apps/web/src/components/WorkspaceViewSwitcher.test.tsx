import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { AttributeDefinition, EntityRecord } from '@sift/contracts';
import { WorkspaceViewSwitcher, type WorkspaceViewSwitcherProps } from './WorkspaceViewSwitcher.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildOption(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    id: 'candidate-rav4',
    kind: 'car',
    label: 'Toyota RAV4',
    attributes: {},
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildDefinition(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    id: 'price',
    label: 'Price',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'lower_better',
    sensitive: false,
    ...overrides,
  };
}

function buildProps(
  overrides: Partial<WorkspaceViewSwitcherProps> = {},
): WorkspaceViewSwitcherProps {
  return {
    mode: 'compare',
    onModeChange: vi.fn(),
    options: [buildOption()],
    attributeDefinitions: [buildDefinition()],
    presentation: null,
    selectedOptionId: null,
    onFocusOption: vi.fn(),
    quickPickPosition: 0,
    onQuickPickPass: vi.fn(),
    onQuickPickMaybe: vi.fn(),
    onQuickPickShortlist: vi.fn(),
    onQuickPickFocusChange: vi.fn(),
    boardPlacement: {},
    onMoveOption: vi.fn(),
    ...overrides,
  };
}

describe('WorkspaceViewSwitcher', () => {
  it('renders all four view tabs with consumer-facing labels', () => {
    render(<WorkspaceViewSwitcher {...buildProps()} />);
    expect(screen.getByTestId('workspace-view-tab-quick_pick')).toHaveTextContent('Quick Pick');
    expect(screen.getByTestId('workspace-view-tab-list')).toHaveTextContent('List');
    expect(screen.getByTestId('workspace-view-tab-compare')).toHaveTextContent('Compare');
    expect(screen.getByTestId('workspace-view-tab-board')).toHaveTextContent('Board');
  });

  it('renders the real OptionCompareView when mode is compare', () => {
    render(<WorkspaceViewSwitcher {...buildProps({ mode: 'compare' })} />);
    expect(screen.getByTestId('option-compare-view')).toBeInTheDocument();
    expect(screen.getByTestId('option-compare-view-header-candidate-rav4')).toHaveTextContent(
      'Toyota RAV4',
    );
  });

  it('renders the real QuickPickView when mode is quick_pick', () => {
    render(<WorkspaceViewSwitcher {...buildProps({ mode: 'quick_pick' })} />);
    expect(screen.getByTestId('quick-pick-view')).toBeInTheDocument();
    expect(screen.getByTestId('quick-pick-option-label')).toHaveTextContent('Toyota RAV4');
  });

  // Supersedes an earlier test that asserted List and Board rendered an
  // honest "not built yet" placeholder. That placeholder was correct while
  // those components were still being written in parallel -- rendering a
  // fabricated board over real option data would have been the worse
  // failure -- but both now exist and are wired, so the assertion is
  // inverted rather than deleted: the placeholder path must be GONE, and
  // each tab must render its real view over the real options it was given.
  it('renders every one of the four views over real option data, with no placeholder path left', () => {
    const { rerender } = render(<WorkspaceViewSwitcher {...buildProps({ mode: 'list' })} />);
    expect(screen.getByTestId('option-list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-view-gap-list')).not.toBeInTheDocument();

    rerender(<WorkspaceViewSwitcher {...buildProps({ mode: 'board' })} />);
    expect(screen.getByTestId('option-board-view')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-view-gap-board')).not.toBeInTheDocument();

    rerender(<WorkspaceViewSwitcher {...buildProps({ mode: 'quick_pick' })} />);
    expect(screen.getByTestId('quick-pick-view')).toBeInTheDocument();

    rerender(<WorkspaceViewSwitcher {...buildProps({ mode: 'compare' })} />);
    expect(screen.getByTestId('option-compare-view')).toBeInTheDocument();
  });

  it('routes a board move request up to the caller rather than repositioning the card itself', async () => {
    const user = userEvent.setup();
    const onMoveOption = vi.fn();
    render(<WorkspaceViewSwitcher {...buildProps({ mode: 'board', onMoveOption })} />);

    const moveControl = screen.getAllByTestId(/board-move-/)[0];
    expect(moveControl).toBeDefined();
    await user.selectOptions(moveControl as HTMLSelectElement, 'top_choices');

    expect(onMoveOption).toHaveBeenCalledWith('candidate-rav4', 'top_choices');
  });

  it('calls onModeChange with the real selected mode when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(<WorkspaceViewSwitcher {...buildProps({ onModeChange })} />);

    await user.click(screen.getByTestId('workspace-view-tab-quick_pick'));
    expect(onModeChange).toHaveBeenCalledWith('quick_pick');
  });

  it('routes Quick Pick actions to the supplied handlers', async () => {
    const user = userEvent.setup();
    const onQuickPickShortlist = vi.fn();
    render(<WorkspaceViewSwitcher {...buildProps({ mode: 'quick_pick', onQuickPickShortlist })} />);

    await user.click(screen.getByTestId('quick-pick-shortlist'));
    expect(onQuickPickShortlist).toHaveBeenCalledWith('candidate-rav4');
  });

  it('routes OptionCompareView focus clicks to onFocusOption', async () => {
    const user = userEvent.setup();
    const onFocusOption = vi.fn();
    render(<WorkspaceViewSwitcher {...buildProps({ mode: 'compare', onFocusOption })} />);

    await user.click(screen.getByTestId('option-compare-view-focus-candidate-rav4'));
    expect(onFocusOption).toHaveBeenCalledWith('candidate-rav4');
  });

  it('has no axe violations', async () => {
    const { container } = render(<WorkspaceViewSwitcher {...buildProps()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(<WorkspaceViewSwitcher {...buildProps()} />);
    expect(overflowRisks).toEqual([]);
  });

  // Task B3 (`useWidthMode`, `apps/web/src/hooks/use-width-mode.ts`): Compare
  // is its first real consumer -- narrow width renders the two-option
  // head-to-head layout, wider than the canonical 480px pane renders the
  // full multi-column table (ADR 0005 Decision 4). jsdom has no
  // `window.matchMedia` at all, so the "narrow" case below exercises this
  // hook's own SSR/JSDOM-safe default rather than a stub.
  it('drives OptionCompareView narrow (head-to-head) layout from the real width, defaulting narrow with no matchMedia present', () => {
    render(<WorkspaceViewSwitcher {...buildProps({ mode: 'compare' })} />);
    expect(screen.getByTestId('option-compare-view-table')).toHaveAttribute(
      'data-layout',
      'narrow',
    );
  });

  it('drives OptionCompareView expanded (multi-column) layout once the viewport reports wider than the canonical narrow pane', () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    render(<WorkspaceViewSwitcher {...buildProps({ mode: 'compare' })} />);
    expect(screen.getByTestId('option-compare-view-table')).toHaveAttribute(
      'data-layout',
      'expanded',
    );

    vi.unstubAllGlobals();
  });
});
