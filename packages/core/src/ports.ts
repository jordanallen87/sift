/**
 * Canonical `Clock`/`IdGenerator` ports for `packages/core`, added during the
 * Task 2 integration pass.
 *
 * All three parallel Task 2 workstreams independently declared their own
 * minimal `Clock`/`IdGenerator` (`attributes.ts`, `evidence.ts`, `policy.ts`)
 * since none existed yet when they started. `Clock` (`{ now(): string }`) is
 * genuinely identical across all three -- harmless duplication, left as-is
 * per docs/build-log.md's dated integration entry. `IdGenerator` is NOT: two
 * copies (`attributes.ts`, `evidence.ts`) declare `next(prefix?: string):
 * string`, matching the one real call site (`extensions.ts`'s
 * `createCaseExtension` calling `idGenerator.next('ext')`), while
 * `policy.ts`'s copy declares `nextId(): string` -- a different, incompatible
 * shape that happens to be unused by any current call site (`reviewProposal`
 * does not consume an `IdGenerator` at all). `packages/core/src/index.ts`
 * previously re-exported `policy.ts`'s copy under an inaccurate comment
 * claiming all three were "structurally interchangeable" -- they are not,
 * for `IdGenerator`. This file is the actually-canonical port pair going
 * forward: this integration layer (`create-case.ts`, `reducer.ts`) and any
 * later `packages/core`/`apps/agent` code should import `Clock`/`IdGenerator`
 * from here, matching the `next(prefix?)` shape every real call site uses.
 */

/** Injected time source. Every `packages/core` timestamp comes from here -- never `Date.now()` or `new Date()`. */
export interface Clock {
  now(): string;
}

/** Injected ID source. Every `packages/core`-generated identifier comes from here -- never `crypto.randomUUID()` or a local counter. `prefix` is optional so a caller can omit it when an ID's shape is already fully determined by other context. */
export interface IdGenerator {
  next(prefix?: string): string;
}
