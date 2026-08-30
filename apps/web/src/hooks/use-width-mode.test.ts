import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NARROW_MAX_WIDTH_PX, useWidthMode } from './use-width-mode.js';

/**
 * A minimal, spec-accurate fake `MediaQueryList` -- jsdom does not
 * implement `window.matchMedia` at all (confirmed directly: no polyfill is
 * registered anywhere in this package's `src/test/setup.ts`, and calling
 * the real jsdom global throws `TypeError: window.matchMedia is not a
 * function`), so every test that needs a present-and-working `matchMedia`
 * must install one itself. Supports both the modern
 * `addEventListener`/`removeEventListener` pair and lets a test fire a
 * `change` event synchronously via `fireChange`.
 */
function installFakeMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const removeEventListener = vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
    listeners.delete(listener);
  });
  const addEventListener = vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
    listeners.add(listener);
  });
  const matchMedia = vi.fn((query: string) => {
    const mql = {
      get matches() {
        return matches;
      },
      media: query,
      addEventListener,
      removeEventListener,
      addListener: addEventListener,
      removeListener: removeEventListener,
    } as unknown as MediaQueryList;
    return mql;
  });

  vi.stubGlobal('matchMedia', matchMedia);

  return {
    matchMedia,
    addEventListener,
    removeEventListener,
    fireChange: (nextMatches: boolean) => {
      matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches: nextMatches } as MediaQueryListEvent);
      }
    },
  };
}

describe('useWidthMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw and defaults to "narrow" when window.matchMedia does not exist', () => {
    // No `installFakeMatchMedia` call here -- this is the real jsdom
    // environment, which has no `matchMedia` at all. This is the exact
    // SSR/JSDOM-safety requirement this task's brief names directly.
    expect(() => renderHook(() => useWidthMode())).not.toThrow();
    const { result } = renderHook(() => useWidthMode());
    expect(result.current).toBe('narrow');
  });

  it('reports "narrow" when the narrow media query matches', () => {
    installFakeMatchMedia(true);
    const { result } = renderHook(() => useWidthMode());
    expect(result.current).toBe('narrow');
  });

  it('reports "expanded" when the narrow media query does not match', () => {
    installFakeMatchMedia(false);
    const { result } = renderHook(() => useWidthMode());
    expect(result.current).toBe('expanded');
  });

  it('queries the canonical 480px narrow boundary by default', () => {
    const fake = installFakeMatchMedia(true);
    renderHook(() => useWidthMode());
    expect(fake.matchMedia).toHaveBeenCalledWith(`(max-width: ${NARROW_MAX_WIDTH_PX}px)`);
  });

  it('accepts a caller-supplied narrow boundary', () => {
    const fake = installFakeMatchMedia(true);
    renderHook(() => useWidthMode({ narrowMaxWidthPx: 600 }));
    expect(fake.matchMedia).toHaveBeenCalledWith('(max-width: 600px)');
  });

  it('updates live when the media query change fires', () => {
    const fake = installFakeMatchMedia(true);
    const { result } = renderHook(() => useWidthMode());
    expect(result.current).toBe('narrow');

    act(() => {
      fake.fireChange(false);
    });
    expect(result.current).toBe('expanded');

    act(() => {
      fake.fireChange(true);
    });
    expect(result.current).toBe('narrow');
  });

  it('removes its change listener on unmount', () => {
    const fake = installFakeMatchMedia(true);
    const { unmount } = renderHook(() => useWidthMode());
    expect(fake.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(fake.removeEventListener).not.toHaveBeenCalled();

    unmount();

    expect(fake.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
