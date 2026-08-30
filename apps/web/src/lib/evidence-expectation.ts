/**
 * The single, shared judgment for whether an `AttributeRecord.status`
 * (`packages/contracts/src/attributes.ts`) clears its `AttributeDefinition`'s
 * declared `evidenceExpectation` -- i.e. whether a value reads as "well
 * supported" versus "needs checking" (Phase C, Task C6,
 * `docs/superpowers/plans/2026-08-30-generic-decision-workspace.md`).
 *
 * This used to be written once, in `QuickPickView.tsx`, and then copied
 * verbatim into `OptionListView.tsx`. Two copies of the single judgment
 * that decides whether a value reads as trustworthy could drift into
 * telling the user two different things about the same attribute in two
 * different views -- extracted here so there is exactly one tested
 * definition both views import. The two prior copies were confirmed
 * byte-for-byte identical before this extraction, so this is a pure
 * refactor: behavior is unchanged, and both views' existing tests pass
 * unmodified against this shared implementation.
 *
 * `conflicted` and `unknown` never satisfy any expectation -- both mean the
 * caller cannot honestly stand behind the value. There is no
 * `AttributeStatus` literally named "corroborated"
 * (`ATTRIBUTE_STATUSES` is `asserted | supported | verified | conflicted |
 * unknown`), so an `evidenceExpectation: 'corroborated'` definition is
 * treated the same as `'source'`: satisfied by `supported` or `verified`.
 */
import type { AttributeStatus, EvidenceExpectation } from '@sift/contracts';

export function meetsEvidenceExpectation(
  status: AttributeStatus,
  expectation: EvidenceExpectation,
): boolean {
  if (status === 'unknown' || status === 'conflicted') return false;
  if (expectation === 'verification') return status === 'verified';
  if (expectation === 'source' || expectation === 'corroborated') {
    return status === 'supported' || status === 'verified';
  }
  return true; // 'assertion' -- any resolved, non-conflicted value clears a mere-assertion bar.
}
