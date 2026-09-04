/**
 * Sift's Collapsible primitive -- a single trigger that shows and hides one
 * region of the pane, with the ARIA wiring (`aria-expanded`,
 * `aria-controls`, matching `id`) supplied by Radix rather than hand-rolled
 * per caller.
 *
 * `DisclosureSection.tsx` already ships a disclosure built on native
 * `<details>/<summary>`, and this file does not replace it. The two answer
 * different needs: `<details>` cannot have its open state driven from
 * outside itself, which is the whole requirement here -- a WebMCP tool call
 * or an incoming SSE event has to be able to open the region the human is
 * being told about (`open`/`onOpenChange`), and the trigger has to be
 * placeable anywhere in the layout rather than only as the region's own
 * first child. Radix also emits a real `aria-controls` pointing at the
 * content, which `<summary>` does not.
 *
 * The unified `radix-ui` package supplies the primitive (this repo depends
 * on `radix-ui@^1.6.7`, which re-exports `@radix-ui/react-collapsible`);
 * there is no separate per-primitive dependency to add.
 */
import * as React from 'react';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return <CollapsiblePrimitive.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />;
}

function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      className={cn(
        /*
         * Keyed to `data-state`, not to the mount, because Radix never
         * unmounts this element: it keeps the node in place and toggles the
         * `hidden` attribute while dropping its children, so "is it open" is
         * only ever readable from the attribute.
         *
         * Opening reuses `global.css`'s existing `fade-slide-in` keyframe on
         * the same duration/easing pair its own `.disclosure-content-enter`
         * class binds ("disclosure content opening", in that file's words),
         * so a Radix-driven disclosure and a `<details>`-driven one move
         * identically rather than each inventing a curve.
         *
         * Closing is deliberately instantaneous, and that is a real
         * constraint rather than an oversight. A closing element is `hidden`,
         * which the UA stylesheet resolves to `display: none` -- an exit
         * animation on it would never paint. Animating the collapse instead
         * requires the height-measuring pair shadcn ships upstream
         * (`collapsible-down`/`collapsible-up`, sized by
         * `--radix-collapsible-content-height`, which Radix already publishes
         * on this element), and those are `@keyframes` -- global CSS, which
         * this component does not own. Add them to `global.css` first if a
         * collapse animation is ever wanted; nothing here changes but this
         * one line.
         */
        'data-[state=open]:animate-[fade-slide-in_var(--duration-normal)_var(--ease-standard)] motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
