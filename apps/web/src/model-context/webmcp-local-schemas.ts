/**
 * Zod input schemas for the eight WebMCP tools defined locally rather than in
 * `@sift/contracts` (`sift_get_option_details`, `sift_list_research`,
 * `sift_set_view`, `sift_configure_comparison`, `sift_search_catalog`,
 * `sift_get_decision_guide`, `sift_focus_question`, `sift_list_notes`;
 * docs/decisions/0006-webmcp-two-way-collaboration-contract.md,
 * docs/specs/webmcp.md "Tool catalog — specified, not yet implemented").
 * `sift_add_note`, the write counterpart, is NOT here: unlike every read
 * tool in this file, it has a real `@sift/contracts` command counterpart
 * (`AddNoteInputSchema`/`SiftAddNoteToolInputSchema`, `commands.ts`) to alias
 * with an IDENTICAL shape, so it is imported directly from there in
 * `register-sift-tools.ts` instead of being redefined here.
 *
 * Defined locally rather than in `@sift/contracts`, unlike every other tool
 * in this catalog: `packages/contracts` is out of scope for this task (see
 * this task's own file-ownership boundary), and none of these seven tools has
 * a `SiftCommands` counterpart there to alias with an IDENTICAL shape -- four
 * are pure reads over `CaseState`/the injected pack catalog with no existing
 * command shape at all, and the three view-shaped tools
 * (`sift_set_view`/`sift_configure_comparison`/`sift_focus_question`) are
 * each a deliberately narrower, more ergonomic PARTIAL patch than the real
 * `setView` wire command's own input (`SetViewInputSchema` in
 * `packages/contracts/src/commands.ts` takes a FULL `view:
 * WorkspaceViewStateSchema`, not a patch). `register-sift-tools.ts` merges
 * each of these three tools' patch onto the active case's current
 * `CaseState.view` before calling `commands.setView` (now a real
 * `SiftCommands` method -- see that module's header comment for the full
 * history of this gap and its resolution); this module still defines their
 * *own* narrower input shape, now WITH `expectedSequence`, since a genuine
 * durable write needs the same optimistic-concurrency field every other
 * mutating tool in this catalog carries (webmcp.md "Cancellation and
 * concurrency": "Mutations include `expectedSequence`... This applies to
 * WRITE and PRESENTATION tools alike"). The id character class/length bound
 * below is copied verbatim from the private `idString` helper every
 * `packages/contracts/src/*.ts` module already defines identically (not
 * exported, so it cannot be imported) -- kept in exact sync so a
 * caseId/optionId this module accepts is always one the rest of the system
 * would accept too. `expectedSequence` is copied the same way, from
 * `commands.ts`'s own private `expectedSequence` helper.
 */
import { z } from 'zod';
import {
  WORKSPACE_VIEW_MODES,
  WorkspaceFilterSchema,
  WorkspaceViewSortSchema,
} from '@sift/contracts';

// Matches every `packages/contracts/src/*.ts` module's own private
// `HTML_OR_EXECUTABLE_PATTERN`/`safeString` pair exactly (not exported, so
// redefined here identically) -- free text accepted by these tools gets the
// same "no HTML tags or executable expressions" guard as every other
// user/model-influenced string field in the system.
const HTML_OR_EXECUTABLE_PATTERN = /<\/?[a-zA-Z!]|javascript:|on[a-zA-Z]+\s*=\s*["']/;

// Every free-text field this module accepts (`query`, filter string values)
// is required-when-present (non-empty), so only this one variant is needed
// -- unlike `packages/contracts`' own `safeString`, which several of its
// call sites use with `.optional()` on a field that may be an empty string.
function safeNonEmptyString(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => !HTML_OR_EXECUTABLE_PATTERN.test(value), {
      message: 'value must not contain HTML tags or executable expressions',
    });
}

const idString = (maxLength = 200) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/^[A-Za-z0-9._-]+$/, 'id must contain only letters, digits, ".", "_", or "-"');

// Copied verbatim from `packages/contracts/src/commands.ts`'s own private
// `expectedSequence` helper -- same rationale as `idString` above.
const expectedSequence = z.number().int().min(0);

// --- sift_get_option_details ---

export const GetOptionDetailsInputSchema = z
  .object({
    caseId: idString(),
    optionId: idString(),
  })
  .strict();
export type GetOptionDetailsInput = z.infer<typeof GetOptionDetailsInputSchema>;

// --- sift_list_research ---

export const ListResearchInputSchema = z
  .object({
    caseId: idString(),
  })
  .strict();
export type ListResearchInput = z.infer<typeof ListResearchInputSchema>;

// --- sift_list_notes (change-set §28/§29, webmcp.md "Notes tools") ---
//
// Same bare `{ caseId }` shape as `sift_list_research` immediately above --
// notes have no further filter yet either.

export const ListNotesInputSchema = z
  .object({
    caseId: idString(),
  })
  .strict();
export type ListNotesInput = z.infer<typeof ListNotesInputSchema>;

// --- sift_set_view (PRESENTATION) ---
//
// `mode` is required, not optional: this tool's entire job is switching the
// active view, so a call that changes nothing would be a no-op worth
// rejecting rather than silently accepting. `focusedOptionId`/
// `visibleOptionIds`/`filters` mirror `WorkspaceViewStateSchema`'s own fields
// and bounds exactly (`packages/contracts/src/case.ts`). `expectedSequence`
// is required: this is a real durable write via `commands.setView` now (see
// this module's header comment), so the same optimistic-concurrency field
// every other mutating tool carries applies here too.
//
// `filters` is the one field here that reuses a contract schema outright
// (`WorkspaceFilterSchema`) rather than restating a shape. That is
// deliberate and load-bearing rather than merely tidy: a filter written by
// this tool lands in the exact same durable `WorkspaceViewState.filters`
// array the human FilterSheet writes, and is read back by the exact same
// `applyWorkspaceFilters`. If this module re-declared the operator list or
// the value guard, the model and the person could end up with two different
// ideas of what a filter is -- the model would be able to persist a filter
// the human UI cannot render or clear. Importing the one schema makes that
// divergence impossible by construction.
//
// Until this field existed the model had no tool call at all behind the most
// ordinary thing a person says in chat ("only show me the ones under $30k"),
// even though the human-facing sheet beside it did. That was the broken half
// of the two-way loop, not a missing nicety.

export const SetViewInputSchema = z
  .object({
    caseId: idString(),
    expectedSequence,
    mode: z.enum(WORKSPACE_VIEW_MODES),
    focusedOptionId: idString().optional(),
    visibleOptionIds: z.array(idString()).max(50).optional(),
    filters: z.array(WorkspaceFilterSchema).max(50).optional(),
  })
  .strict();
export type SetViewInput = z.infer<typeof SetViewInputSchema>;

// --- sift_configure_comparison (PRESENTATION) ---
//
// Every field besides `caseId`/`expectedSequence` is optional, but at least
// one of the four configurable fields must be present -- a call with none of
// `optionIds`/`visibleAttributeIds`/`pinnedAttributeIds`/`sort` set would
// configure nothing and is rejected as a validation failure rather than
// silently accepted as a no-op.

const ConfigureComparisonInputShape = z
  .object({
    caseId: idString(),
    expectedSequence,
    /** The compare view's visible option set (`WorkspaceCompareState.optionIds`) -- e.g. a head-to-head pair or a multi-column shortlist. */
    optionIds: z.array(idString()).max(50).optional(),
    visibleAttributeIds: z.array(idString()).max(500).optional(),
    pinnedAttributeIds: z.array(idString()).max(500).optional(),
    sort: WorkspaceViewSortSchema.optional(),
  })
  .strict();

export const ConfigureComparisonInputSchema = ConfigureComparisonInputShape.superRefine(
  (input, ctx) => {
    if (
      input.optionIds === undefined &&
      input.visibleAttributeIds === undefined &&
      input.pinnedAttributeIds === undefined &&
      input.sort === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'At least one of optionIds, visibleAttributeIds, pinnedAttributeIds, or sort must be provided.',
      });
    }
  },
);
export type ConfigureComparisonInput = z.infer<typeof ConfigureComparisonInputSchema>;

// --- sift_search_catalog ---
//
// Deliberately generic (ADR 0006 decision 5, change-set §20): the wire shape
// is not vehicle-specific. `filters` is an open string-keyed bag because
// which keys are meaningful depends on the active Decision Pack's catalog
// adapter (car-purchase recognizes `year`/`make`/`model`/`bodyStyle` today;
// a future pack's adapter would recognize a different set without this
// schema changing). Bounded to a conservative maximum key count so a caller
// cannot smuggle an unbounded payload through an technically-open record.

const MAX_CATALOG_FILTER_KEYS = 20;

// Record keys are plain, short identifier-shaped strings (filter names like
// "year"/"bodyStyle"), not user-authored free text, so the HTML/executable
// guard applies only to the values, matching every value-vs-key distinction
// `@sift/contracts` itself draws elsewhere (e.g. `EntityRecord.attributes`,
// keyed by plain `z.string()`, `packages/contracts/src/case.ts`).
const filterKeySchema = z.string().min(1).max(100);

export const SearchCatalogInputSchema = z
  .object({
    caseId: idString(),
    query: safeNonEmptyString(500).optional(),
    filters: z
      .record(filterKeySchema, z.union([safeNonEmptyString(200), z.number().finite()]))
      .refine((filters) => Object.keys(filters).length <= MAX_CATALOG_FILTER_KEYS, {
        message: `filters may not carry more than ${MAX_CATALOG_FILTER_KEYS} keys`,
      })
      .optional(),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();
export type SearchCatalogInput = z.infer<typeof SearchCatalogInputSchema>;

// --- sift_get_decision_guide (READ) ---
//
// Case-scoped (like `sift_get_option_details`/`sift_list_research`/
// `sift_search_catalog` above) rather than a global tool keyed directly by
// `packId`: the active case's own `CaseState.pack.id` already names the
// exact pack to describe, matching every sibling read tool's own "derive the
// pack from the active case" convention (see `sift_search_catalog`'s
// `catalogAdapters[caseState.pack.id]` lookup in `register-sift-tools.ts`).

export const GetDecisionGuideInputSchema = z
  .object({
    caseId: idString(),
  })
  .strict();
export type GetDecisionGuideInput = z.infer<typeof GetDecisionGuideInputSchema>;

// --- sift_focus_question (PRESENTATION) ---
//
// Change-set §52's remaining PRESENTATION-group tool (docs/specs/webmcp.md
// "Tool catalog — specified, not yet implemented"). `WorkspaceViewStateSchema
// .focusedQuestionId` (`packages/contracts/src/case.ts`) now exists, so this
// tool follows the identical merge-then-`commands.setView` pattern
// `sift_set_view`/`sift_configure_comparison` use above -- see this module's
// header comment. `expectedSequence` required, matching those two sibling
// tools now that all three reach a real durable write.

export const FocusQuestionInputSchema = z
  .object({
    caseId: idString(),
    expectedSequence,
    questionId: idString(),
  })
  .strict();
export type FocusQuestionInput = z.infer<typeof FocusQuestionInputSchema>;
