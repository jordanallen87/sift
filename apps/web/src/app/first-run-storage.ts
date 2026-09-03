/**
 * Remembers that this browser has already been shown the first-run guide
 * (`components/FirstRunGuide.tsx`). A single boolean flag -- never anything
 * about the case, the person, or what they did.
 *
 * Wrapped in `try`/`catch` for exactly the reason `active-case-storage.ts`
 * documents: `localStorage` throws outright in a locked-down browsing
 * context (private mode in some browsers, disabled site data, a sandboxed
 * iframe), and a judge opening the deployed URL in a private window must
 * get a working product, not a blank page. A failed read degrades to "not
 * seen yet" -- showing an explanation one extra time is the harmless
 * direction to fail in; a failed write is ignored entirely.
 *
 * ## Marked when SHOWN, not when dismissed
 *
 * `App.tsx` calls `markFirstRunGuideSeen()` at the moment the guide is
 * opened, not from its dismiss handler. The requirement is that a judge who
 * resets the demo five times sees this once, and dismissal is not the only
 * way out of a modal -- a reload, a reset, or a closed tab all leave it
 * un-dismissed, and every one of those would otherwise re-nag. Marking on
 * show makes "at most once per browser, ever" true by construction. Nothing
 * is lost by it: the identical content stays permanently reachable from the
 * Help control on every screen.
 */
export const FIRST_RUN_GUIDE_STORAGE_KEY = 'sift:firstRunGuideSeen';

/** The one stored value. Its content is irrelevant -- presence is the whole signal -- but a readable literal beats `'1'` when someone opens devtools. */
const SEEN_VALUE = 'seen';

export function hasSeenFirstRunGuide(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_GUIDE_STORAGE_KEY) !== null;
  } catch {
    // Storage unavailable: treat as "never shown". The guide appears, and
    // will appear again next time -- which is the correct behaviour for a
    // browsing context that has explicitly asked not to be remembered.
    return false;
  }
}

export function markFirstRunGuideSeen(): void {
  try {
    localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, SEEN_VALUE);
  } catch {
    // Best-effort only. Losing the flag costs one repeated explanation, not
    // correctness.
  }
}
