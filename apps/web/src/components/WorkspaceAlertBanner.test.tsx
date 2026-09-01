import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  WorkspaceAlertBanner,
  type WorkspaceAlertBannerItem,
  type WorkspaceAlertBannerProps,
} from './WorkspaceAlertBanner.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildItem(overrides: Partial<WorkspaceAlertBannerItem> = {}): WorkspaceAlertBannerItem {
  return {
    id: 'item-1',
    tone: 'attention',
    message: 'Sift found 3 things worth a look.',
    ...overrides,
  };
}

function buildProps(overrides: Partial<WorkspaceAlertBannerProps> = {}): WorkspaceAlertBannerProps {
  return {
    items: [buildItem()],
    layout: 'expanded',
    ...overrides,
  };
}

describe('WorkspaceAlertBanner', () => {
  // The core contract this component exists to prove (see header comment's
  // quote from docs/specs/product.md "Empty regions"): no empty wrapper, no
  // announcement of its own emptiness -- nothing renders at all.
  it('renders nothing when items is empty', () => {
    const { container } = render(<WorkspaceAlertBanner items={[]} layout="expanded" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('workspace-alert-banner')).not.toBeInTheDocument();
  });

  it('renders a container when items is non-empty', () => {
    render(<WorkspaceAlertBanner {...buildProps()} />);
    expect(screen.getByTestId('workspace-alert-banner')).toBeInTheDocument();
  });

  it('renders one alert per item, each carrying its own message and tone', () => {
    render(
      <WorkspaceAlertBanner
        {...buildProps({
          items: [
            buildItem({ id: 'a', tone: 'attention', message: 'Attention message' }),
            buildItem({ id: 'b', tone: 'ready', message: 'Ready message' }),
            buildItem({ id: 'c', tone: 'info', message: 'Info message' }),
          ],
        })}
      />,
    );

    const attentionItem = screen.getByTestId('workspace-alert-banner-item-a');
    const readyItem = screen.getByTestId('workspace-alert-banner-item-b');
    const infoItem = screen.getByTestId('workspace-alert-banner-item-c');

    expect(attentionItem).toHaveTextContent('Attention message');
    expect(attentionItem).toHaveAttribute('data-tone', 'attention');
    expect(readyItem).toHaveTextContent('Ready message');
    expect(readyItem).toHaveAttribute('data-tone', 'ready');
    expect(infoItem).toHaveTextContent('Info message');
    expect(infoItem).toHaveAttribute('data-tone', 'info');
  });

  it('gives each tone a distinct background tint (never color-only, but never identical either)', () => {
    render(
      <WorkspaceAlertBanner
        {...buildProps({
          items: [
            buildItem({ id: 'a', tone: 'attention' }),
            buildItem({ id: 'b', tone: 'ready' }),
            buildItem({ id: 'c', tone: 'info' }),
          ],
        })}
      />,
    );

    const colors = ['a', 'b', 'c'].map(
      (id) => screen.getByTestId(`workspace-alert-banner-item-${id}`).style.backgroundColor,
    );

    expect(new Set(colors).size).toBe(3);
    for (const color of colors) {
      expect(color).not.toBe('');
    }
  });

  it('renders an alert role for each item so it reads as a real alert, not passive text', () => {
    render(<WorkspaceAlertBanner {...buildProps()} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  describe('actions', () => {
    it('renders an action button and calls onAction when both actionLabel and onAction are supplied', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      render(
        <WorkspaceAlertBanner
          {...buildProps({
            items: [buildItem({ id: 'a', actionLabel: 'Review findings', onAction })],
          })}
        />,
      );

      const action = screen.getByTestId('workspace-alert-banner-action-a');
      expect(action).toHaveTextContent('Review findings');

      await user.click(action);
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('renders no action control when actionLabel/onAction are omitted', () => {
      render(<WorkspaceAlertBanner {...buildProps({ items: [buildItem({ id: 'a' })] })} />);
      expect(screen.queryByTestId('workspace-alert-banner-action-a')).not.toBeInTheDocument();
    });

    it('renders no action control when only one of actionLabel/onAction is supplied', () => {
      // `buildItem()`'s base object never sets `onAction` (see its
      // definition above); `exactOptionalPropertyTypes` forbids explicitly
      // passing `onAction: undefined` to force the same "omitted" state.
      render(
        <WorkspaceAlertBanner
          {...buildProps({
            items: [buildItem({ id: 'a', actionLabel: 'Review findings' })],
          })}
        />,
      );
      expect(screen.queryByTestId('workspace-alert-banner-action-a')).not.toBeInTheDocument();
    });
  });

  describe('layout', () => {
    it('stacks items in a single column at narrow layout', () => {
      render(<WorkspaceAlertBanner {...buildProps({ layout: 'narrow' })} />);
      expect(screen.getByTestId('workspace-alert-banner')).toHaveAttribute('data-layout', 'narrow');
    });

    it('lays out items as a wrapping row at expanded layout', () => {
      render(<WorkspaceAlertBanner {...buildProps({ layout: 'expanded' })} />);
      expect(screen.getByTestId('workspace-alert-banner')).toHaveAttribute(
        'data-layout',
        'expanded',
      );
    });
  });

  it('has no axe violations with multiple tones and an action present', async () => {
    const { container } = render(
      <WorkspaceAlertBanner
        {...buildProps({
          items: [
            buildItem({ id: 'a', tone: 'attention', actionLabel: 'Review', onAction: vi.fn() }),
            buildItem({ id: 'b', tone: 'ready' }),
            buildItem({ id: 'c', tone: 'info' }),
          ],
        })}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <WorkspaceAlertBanner
        {...buildProps({
          layout: 'narrow',
          items: [buildItem({ actionLabel: 'Review findings', onAction: vi.fn() })],
        })}
      />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
