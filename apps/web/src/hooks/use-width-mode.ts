/**
 * Width-mode detection (Phase B3, `docs/decisions/
 * 0005-workspace-view-state-and-option-views.md` Decision 4): "No existing
 * component or hook in `apps/web/src` provides a starting point for the
 * width-detection mechanism itself; introducing it (a `useMediaQuery`-style
 * hook keyed to the same 390/430/480/expanded set of viewports
 * `testing.md` already treats as canonical) is new surface area this ADR
 * authorizes." This is that hook.
 *
 * The narrow/expanded split is CLAUDE.md's own canonical boundary: "the
 * canonical viewport is a 390-480 px ChatGPT right pane." `narrow` covers
 * that whole range (and anything smaller); `expanded` is everything wider.
 *
 * SSR/JSDOM safety (this task's own requirement): `window.matchMedia` does
 * not exist in the jsdom environment this repo's component tests run in
 * (`apps/web/vitest.config.ts` -- no polyfill is registered in
 * `src/test/setup.ts`), and would not exist during any future server-side
 * render either. Calling it unconditionally would throw
 * `TypeError: window.matchMedia is not a function` on every render of any
 * consumer, in every existing test file, which is unacceptable for a hook
 * this task requires other components to actually adopt. Both the initial
 * render and the effect below check for its existence first and fall back
 * to a fixed default (`narrow`, CLAUDE.md's own canonical width) rather
 * than throwing -- consumers always get a real, renderable `WidthMode`.
 */
import { useEffect, useState } from 'react';

export type WidthMode = 'narrow' | 'expanded';

/** CLAUDE.md's canonical narrow-pane ceiling -- 390-480px is "the" viewport; anything wider is `expanded`. */
export const NARROW_MAX_WIDTH_PX = 480;

function buildMediaQuery(narrowMaxWidthPx: number): string {
  return `(max-width: ${narrowMaxWidthPx}px)`;
}

/** `true`/`false`/`undefined` (matchMedia missing, e.g. jsdom or a pre-hydration SSR pass) -- `undefined` always resolves to the `narrow` default, never a thrown error. */
function readWidthMode(narrowMaxWidthPx: number): WidthMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'narrow';
  }
  return window.matchMedia(buildMediaQuery(narrowMaxWidthPx)).matches ? 'narrow' : 'expanded';
}

export interface UseWidthModeOptions {
  /** Overridable narrow/expanded boundary, in px. Defaults to `NARROW_MAX_WIDTH_PX` (480). */
  narrowMaxWidthPx?: number;
}

/**
 * The live `WidthMode` for the current viewport, kept in sync with a real
 * `matchMedia` change listener. Falls back to (and stays pinned at)
 * `'narrow'` wherever `matchMedia` is unavailable, rather than throwing.
 */
export function useWidthMode(options: UseWidthModeOptions = {}): WidthMode {
  const narrowMaxWidthPx = options.narrowMaxWidthPx ?? NARROW_MAX_WIDTH_PX;
  const [mode, setMode] = useState<WidthMode>(() => readWidthMode(narrowMaxWidthPx));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(buildMediaQuery(narrowMaxWidthPx));
    // Reconcile in case the viewport changed between this render's initial
    // `useState` computation and this effect committing.
    setMode(mediaQueryList.matches ? 'narrow' : 'expanded');

    const handleChange = (event: MediaQueryListEvent) => {
      setMode(event.matches ? 'narrow' : 'expanded');
    };

    // `addEventListener`/`removeEventListener` on a `MediaQueryList` is the
    // modern API; `addListener`/`removeListener` is the deprecated fallback
    // still required by older Safari. Both are cleaned up on unmount.
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange);
      return () => mediaQueryList.removeEventListener('change', handleChange);
    }
    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, [narrowMaxWidthPx]);

  return mode;
}
