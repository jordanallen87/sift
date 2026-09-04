/**
 * Behavioural coverage for `collapsible.tsx`.
 *
 * The assertions that matter here are the ones a hand-rolled show/hide
 * would get wrong, because those are the only reason to take a dependency
 * on Radix for this at all: the trigger reports `aria-expanded`, it points
 * `aria-controls` at the *actual* id of the content element (and drops the
 * attribute entirely while there is nothing to point at, rather than
 * dangling), the region is reachable and toggleable from the keyboard
 * alone, and the open state can be driven from outside the component --
 * which is precisely what `DisclosureSection.tsx`'s native
 * `<details>/<summary>` cannot do and why this primitive exists alongside
 * it.
 *
 * One Radix behaviour is load-bearing enough to be pinned by name: the
 * content element is *never* unmounted. Radix keeps the node, toggles the
 * `hidden` attribute on it, and drops its children while closed. Every
 * closed-state assertion below is written against that (hidden + empty),
 * not against absence, and `collapsible.tsx`'s motion rule keys off
 * `data-state` for the same reason.
 *
 * jsdom runs no layout engine and applies no stylesheet, so the motion
 * assertion is structural (the utility that binds `global.css`'s shared
 * `fade-slide-in` keyframe is present) rather than a measurement -- the
 * same split `tooltip.test.tsx` and `sheet.test.tsx` document for their own
 * visual behaviour.
 */
import type { ComponentProps, ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible.js';
import { renderAtNarrowWidth } from '../../test/narrow-viewport.js';

function EvidenceDisclosure(props: ComponentProps<typeof Collapsible> = {}) {
  return (
    <Collapsible {...props}>
      <CollapsibleTrigger data-testid="trigger">Show the 3 sources</CollapsibleTrigger>
      <CollapsibleContent data-testid="content">
        <p>Manufacturer spec sheet, 2026-08-14</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Class tokens rather than a substring scan: `not.toContain('p-4')` is satisfied by `gap-4`, which makes a negative substring assertion quietly meaningless. */
function classesOf(element: HTMLElement): string[] {
  return element.className.split(/\s+/).filter(Boolean);
}

/**
 * A landmark wrapper for axe runs. axe's `region` rule ("all page content
 * should be contained by landmarks") is a property of the *page*, not of a
 * primitive -- a bare `render()` into `document.body` fails it for any
 * component that renders visible text, which says nothing about this file.
 * Wrapping in `<main>` keeps the entire ruleset enabled (unlike
 * `tooltip.test.tsx`, which had to disable `region` because a portaled
 * layer cannot be inside one) while still exercising the real markup.
 */
function renderInLandmark(ui: ReactElement) {
  return render(<main>{ui}</main>);
}

describe('Collapsible', () => {
  describe('the trigger describes the region it controls', () => {
    it('starts collapsed, with the content hidden, empty, and nothing dangling in aria-controls', () => {
      render(<EvidenceDisclosure />);
      const trigger = screen.getByRole('button', { name: 'Show the 3 sources' });
      const content = screen.getByTestId('content');

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(content).toHaveAttribute('data-state', 'closed');
      expect(content).not.toBeVisible();
      // Radix drops the children rather than merely hiding them, so nothing
      // inside a closed region is in the tab order or readable by a screen
      // reader even if a caller's own CSS ever defeated `hidden`.
      expect(content).toBeEmptyDOMElement();
      expect(screen.queryByText('Manufacturer spec sheet, 2026-08-14')).toBeNull();
      // And the trigger points at nothing while there is nothing to point
      // at: a dangling `aria-controls` is announced as a broken relationship.
      expect(trigger).not.toHaveAttribute('aria-controls');
    });

    it('points aria-controls at the real id of the content once open', async () => {
      const user = userEvent.setup();
      render(<EvidenceDisclosure />);
      const trigger = screen.getByTestId('trigger');

      await user.click(trigger);
      const content = screen.getByTestId('content');

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(content.id).not.toBe('');
      expect(trigger.getAttribute('aria-controls')).toBe(content.id);
      expect(content).toBeVisible();
      expect(content).toHaveTextContent('Manufacturer spec sheet, 2026-08-14');
    });

    it('collapses again on a second activation, emptying and re-hiding the region', async () => {
      const user = userEvent.setup();
      render(<EvidenceDisclosure />);
      const trigger = screen.getByTestId('trigger');

      await user.click(trigger);
      expect(screen.getByTestId('content')).toBeVisible();

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).not.toHaveAttribute('aria-controls');
      const content = screen.getByTestId('content');
      expect(content).toHaveAttribute('data-state', 'closed');
      expect(content).not.toBeVisible();
      expect(content).toBeEmptyDOMElement();
    });

    it('honours defaultOpen for a region that should already be expanded on first paint', () => {
      render(<EvidenceDisclosure defaultOpen />);

      expect(screen.getByTestId('trigger')).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('content')).toBeVisible();
      expect(screen.getByText('Manufacturer spec sheet, 2026-08-14')).toBeInTheDocument();
    });
  });

  describe('keyboard operation', () => {
    it('toggles with Enter and with Space, keeping focus on the trigger', async () => {
      const user = userEvent.setup();
      render(<EvidenceDisclosure />);
      const trigger = screen.getByTestId('trigger');

      await user.tab();
      expect(trigger).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('content')).toBeVisible();
      // Losing focus to the newly revealed region would strand a keyboard
      // user, who has to be able to close what they just opened.
      expect(trigger).toHaveFocus();

      await user.keyboard(' ');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByTestId('content')).not.toBeVisible();
      expect(trigger).toHaveFocus();
    });

    it('is a real button element, so it needs no synthetic key handling at all', () => {
      render(<EvidenceDisclosure />);
      const trigger = screen.getByTestId('trigger');

      expect(trigger.tagName).toBe('BUTTON');
      expect(trigger).toHaveAttribute('type', 'button');
    });
  });

  describe('external control (the reason this exists next to DisclosureSection)', () => {
    it('opens from a prop change alone, with no interaction', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(<EvidenceDisclosure open={false} onOpenChange={onOpenChange} />);
      expect(screen.getByTestId('content')).not.toBeVisible();

      // A WebMCP call or an inbound SSE event opening the region the human
      // is being told about: no click, no focus, state pushed from outside.
      rerender(<EvidenceDisclosure open onOpenChange={onOpenChange} />);

      expect(screen.getByTestId('content')).toBeVisible();
      expect(screen.getByText('Manufacturer spec sheet, 2026-08-14')).toBeInTheDocument();
      expect(screen.getByTestId('trigger')).toHaveAttribute('aria-expanded', 'true');
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('reports the intent but does not self-open while controlled', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<EvidenceDisclosure open={false} onOpenChange={onOpenChange} />);

      await user.click(screen.getByTestId('trigger'));

      expect(onOpenChange).toHaveBeenCalledWith(true);
      // The owner of the state decides; the primitive must not diverge from
      // the `open` prop it was given.
      expect(screen.getByTestId('content')).not.toBeVisible();
      expect(screen.getByTestId('trigger')).toHaveAttribute('aria-expanded', 'false');
    });

    it('refuses to toggle while disabled', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<EvidenceDisclosure disabled onOpenChange={onOpenChange} />);
      const trigger = screen.getByTestId('trigger');

      expect(trigger).toBeDisabled();
      await user.click(trigger);

      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('content')).not.toBeVisible();
      expect(screen.getByTestId('content')).toHaveAttribute('data-disabled', '');
    });
  });

  describe('styling contract', () => {
    it('tags every part with the data-slot hook the rest of ui/ styles against', () => {
      const { container } = render(<EvidenceDisclosure />);

      expect(container.querySelector('[data-slot="collapsible"]')).not.toBeNull();
      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'collapsible-trigger');
      expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'collapsible-content');
    });

    it("opens on global.css's shared fade-slide-in keyframe, keyed to data-state and opting out under prefers-reduced-motion", async () => {
      const user = userEvent.setup();
      render(<EvidenceDisclosure />);

      await user.click(screen.getByTestId('trigger'));
      const content = screen.getByTestId('content');

      expect(content).toHaveAttribute('data-state', 'open');
      // Keyed to the attribute rather than applied unconditionally, because
      // Radix keeps this node mounted across both states -- an unconditional
      // class would re-run the entrance on every unrelated re-render. The
      // keyframe and the duration/easing pair are the same ones
      // `.disclosure-content-enter` binds in global.css, so a Radix
      // disclosure and a `<details>` one move identically.
      expect(classesOf(content)).toContain(
        'data-[state=open]:animate-[fade-slide-in_var(--duration-normal)_var(--ease-standard)]',
      );
      expect(classesOf(content)).toContain('motion-reduce:animate-none');
    });

    it('keeps a caller-supplied className alongside its own', () => {
      render(
        <Collapsible defaultOpen>
          <CollapsibleTrigger data-testid="trigger">Toggle</CollapsibleTrigger>
          <CollapsibleContent data-testid="content" className="px-[var(--space-4)]">
            Body
          </CollapsibleContent>
        </Collapsible>,
      );

      const classes = classesOf(screen.getByTestId('content'));
      expect(classes).toContain('px-[var(--space-4)]');
      expect(classes).toContain('motion-reduce:animate-none');
    });

    it('introduces no width wider than a 390px narrow pane in its own rendered markup', () => {
      const { overflowRisks } = renderAtNarrowWidth(<EvidenceDisclosure defaultOpen />);
      expect(overflowRisks).toEqual([]);
    });
  });

  describe('accessibility', () => {
    it('has no axe violations while collapsed', async () => {
      renderInLandmark(<EvidenceDisclosure />);
      const results = await axe(document.body);
      expect(results).toHaveNoViolations();
    });

    it('has no axe violations while expanded', async () => {
      const user = userEvent.setup();
      renderInLandmark(<EvidenceDisclosure />);
      await user.click(screen.getByTestId('trigger'));

      const results = await axe(document.body);
      expect(results).toHaveNoViolations();
    });
  });
});
