/**
 * Zod input schemas for the five WebMCP tools this task adds
 * (`sift_get_option_details`, `sift_list_research`, `sift_set_view`,
 * `sift_configure_comparison`, `sift_search_catalog`;
 * docs/decisions/0006-webmcp-two-way-collaboration-contract.md,
 * docs/specs/webmcp.md "Tool catalog — specified, not yet implemented").
 *
 * Defined locally rather than in `@sift/contracts`, unlike every other tool
 * in this catalog: `packages/contracts` is out of scope for this task (see
 * this task's own file-ownership boundary), and none of these five tools has
 * a `SiftCommands` counterpart there to alias -- three are pure reads over
 * `CaseState` with no existing command shape, and the two presentation tools
 * write only to in-memory session state (`register-sift-tools.ts`'s own
 * comment explains why: no backend command yet exists to persist
 * `WorkspaceViewState`, so nothing here should pretend otherwise by routing
 * through a contracts-owned schema that implies a real wire command). The id
 * character class/length bound below is copied verbatim from the private
 * `idString` helper every `packages/contracts/src/*.ts` module already
 * defines identically (not exported, so it cannot be imported) -- kept in
 * exact sync so a caseId/optionId this module accepts is always one the rest
 * of the system would accept too.
 */
import { z } from 'zod';
import { WORKSPACE_VIEW_MODES, WorkspaceViewSortSchema } from '@sift/contracts';

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

// --- sift_set_view (PRESENTATION) ---
//
// `mode` is required, not optional: this tool's entire job is switching the
// active view, so a call that changes nothing would be a no-op worth
// rejecting rather than silently accepting. `focusedOptionId`/
// `visibleOptionIds` mirror `WorkspaceViewStateSchema`'s own fields and
// bounds exactly (`packages/contracts/src/case.ts`).

export const SetViewInputSchema = z
  .object({
    caseId: idString(),
    mode: z.enum(WORKSPACE_VIEW_MODES),
    focusedOptionId: idString().optional(),
    visibleOptionIds: z.array(idString()).max(50).optional(),
  })
  .strict();
export type SetViewInput = z.infer<typeof SetViewInputSchema>;

// --- sift_configure_comparison (PRESENTATION) ---
//
// Every field besides `caseId` is optional, but at least one of them must be
// present -- a call with none of `optionIds`/`visibleAttributeIds`/
// `pinnedAttributeIds`/`sort` set would configure nothing and is rejected as
// a validation failure rather than silently accepted as a no-op.

const ConfigureComparisonInputShape = z
  .object({
    caseId: idString(),
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
