/**
 * Persists a *pointer* to the active case id across a reload -- never any
 * case content itself. `App.tsx` uses this to satisfy product.md's
 * real-time contract on reload: the browser only remembers *which* case was
 * open; every field of that case is always re-fetched fresh from the server
 * (`GET /api/cases/:caseId` to confirm the id still resolves, then
 * `useCaseEvents`'s own initial poll for the full canonical snapshot and
 * activity backlog) rather than trusted from local state.
 *
 * Wrapped in `try`/`catch`: `localStorage` can throw in a locked-down
 * browsing context (private mode in some browsers, disabled site data, a
 * sandboxed iframe) -- a caller must be able to treat that exactly like "no
 * stored case" rather than crashing the app.
 */
const STORAGE_KEY = 'sift:activeCaseId';

export function readStoredCaseId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredCaseId(caseId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, caseId);
  } catch {
    // Best-effort only -- losing the reload-restore convenience is not a
    // correctness problem, the workspace still works fully from a fresh
    // launch.
  }
}

export function clearStoredCaseId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore, see readStoredCaseId
  }
}
