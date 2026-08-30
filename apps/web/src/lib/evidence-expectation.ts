/**
 * Shared judgments used by both `QuickPickView.tsx` and `OptionListView.tsx`
 * when deriving their "why it fits"/"watch out" (strengths/concerns/
 * unresolved) lists from `EntityRecord.attributes`, so the two views cannot
 * drift into telling the user two different things about the same attribute.
 *
 * `meetsEvidenceExpectation` is the single, shared judgment for whether an
 * `AttributeRecord.status` (`packages/contracts/src/attributes.ts`) clears
 * its `AttributeDefinition`'s declared `evidenceExpectation` -- i.e. whether
 * a value reads as "well supported" versus "needs checking" (Phase C, Task
 * C6, `docs/superpowers/plans/2026-08-30-generic-decision-workspace.md`).
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
 *
 * `isIdentityAttribute` is the second shared judgment, added when both
 * views' "watch out"/"concerns" lists were found to flag an option's own
 * identity fields (e.g. "Make still needs stronger evidence" for a listing
 * whose make is already shown, unqualified, elsewhere on the same card) --
 * see its own doc comment below.
 */
import type { AttributeDefinition, AttributeStatus, EvidenceExpectation } from '@sift/contracts';

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

const CUSTOM_ATTRIBUTE_ID_PREFIX = 'custom.';

/**
 * A generic, pack-agnostic signal for "this attribute is a catalog/identity
 * descriptor, not decision-insight material" -- shared by `QuickPickView.tsx`
 * and `OptionListView.tsx` so their "why it fits"/"watch out"
 * (strengths/concerns/unresolved) derivations do not flag an option's own
 * identity fields as if they were a decision risk (car-purchase pack
 * examples: `car.make`/`car.model`/`car.trim`/`car.body_style` -- plain
 * `valueType: 'string'` fields the pack marks `comparison: 'none'`, i.e. no
 * bearing on ranking one option over another).
 *
 * Deliberately narrower than "any `comparison: 'none'` attribute": that
 * field is also used for attributes that plainly DO matter to a decision but
 * simply have no automatic ranking direction -- an `enum`/`string_list`/
 * `boolean` concern like "ride comfort" or "standard features" is not an
 * identity label, it is a genuine, if unrankable, consideration. Restricting
 * this to `valueType === 'string'` targets the free-text "what IS this"
 * fields specifically, leaving every other `comparison: 'none'` value type
 * eligible for "why it fits"/"watch out" exactly as before.
 *
 * A `custom.*` attribute is never treated as identity, regardless of its
 * `valueType`/`comparison`: a user only ever adds a `custom.*` attribute
 * (`packages/contracts/src/attributes.ts`'s `CaseAttributeDefinition`)
 * because it matters to their own comparison, so it must remain eligible for
 * insight even when it happens to be a plain, unranked string field.
 */
export function isIdentityAttribute(definition: AttributeDefinition): boolean {
  if (definition.id.startsWith(CUSTOM_ATTRIBUTE_ID_PREFIX)) return false;
  return definition.valueType === 'string' && definition.comparison === 'none';
}
