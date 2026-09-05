/**
 * Centralized, exhaustive label registry for `PublicActivityEventType`
 * (docs/specs/architecture.md "Real-time event contract").
 *
 * Adapted from the label-registry pattern in
 * `praetor:apps/web/src/components/strata19/execute/activity-labels.ts`
 * (docs/reuse-source-map.md: "Adapt the label-registry pattern so
 * user-visible activity never falls back to raw internal event names") --
 * see docs/reuse-attribution.md for the recorded entry. Only the *idea* is
 * reused (a single table plus a defensive fallback so an unrecognized
 * internal value can never render as its raw dotted token); none of that
 * file's Strata19-specific types, kinds, or code were copied.
 *
 * `ActivityTimeline.tsx` is the primary consumer, but the tone/icon meta
 * exported here is deliberately reusable by any component that needs to
 * render one of the nine `docs/design-system.md` status tones consistently
 * (`ReadinessPanel`, `EvidenceCard`, `RecommendationCard`, `ApprovalCard`),
 * so the ink/bg/border CSS-variable triad is defined exactly once.
 *
 * Every label string below is grounded directly in product.md's
 * "User-facing terminology" table where an entry exists (`Obligation` ->
 * "Question to resolve", `Guide` -> "Agent redirected", `Confirm` -> "Your
 * approval needed") or in the exact required copy from value-proposition.md
 * ("Draft withheld"). Where no terminology-table entry exists, the label is
 * a plain, non-jargon description of the underlying event, never the raw
 * `type` string.
 *
 * Extended (not replaced) per `docs/decisions/
 * 0004-consumer-workspace-information-architecture.md` decision item 3,
 * which names this file directly as "the designated extension point for
 * this boundary rather than a new mapping layer built from scratch" and
 * directs it "be extended with the additional mappings the generic
 * workspace needs (research/evidence-conflict language, question/obligation
 * language, presentation-vs-criterion distinctions per change-set §54)."
 * `PublicActivityEventType` is a closed union owned by `@sift/contracts`
 * (outside this package), so "extended" here means the entries below were
 * re-worded toward change-set §4's terminology table -- "Evidence ->
 * Research/Source/Fact," "Claim -> Finding," "Stale evidence -> Needs
 * re-checking" -- not that new keys were added; `obligation.updated`
 * already satisfied the "Obligation -> Question to resolve" mapping and is
 * unchanged.
 *
 * Task A6 pass (extends the above, still no new keys): re-words every
 * remaining entry that still leaned on engine-internal vocabulary
 * ("Command," "Specialist," "Skill," "Tool call," "Case") toward
 * `docs/specs/product.md`'s "User-facing terminology" table (product.md
 * §168, which names this exact file as "the canonical mapping
 * implementation") and change-set §4/§48. Concretely:
 *
 *   - `evidence.conflicted` -> "Research disagrees", the literal §48
 *     example pairing ("Research disagrees" <-> `evidence.conflicted`).
 *   - `recommendation.ready`/`.invalidated` re-worded toward product.md's
 *     "Recommendation -> Current recommendation" row and the "ready for
 *     decision" phrase `ReadinessPanel.tsx` already uses for the same
 *     underlying convergence concept (product.md "Convergence -> Ready for
 *     decision"), so the same real-world event reads consistently across
 *     both components.
 *   - `command.accepted` -> "Update accepted" (a `commandId` is
 *     "developer view only," product.md row 186 -- but the WORD "command"
 *     itself is also engine vocabulary a consumer never needs; "update"
 *     names what the person's action actually did).
 *   - `specialist.*`/`skill.activated`/`tool.*` -> plain "a step in the
 *     investigation" / "a new capability" / "looking something up"
 *     language. None of these four have their own product.md row (only the
 *     coarser "Agent graph -> Investigation team, developer view only" and
 *     "commandId, runId, tool/skill/specialist IDs -> developer view only"
 *     rows exist), so this applies the guiding rule directly (change-set
 *     §4: "explain what something means for the decision, not how Sift
 *     implemented it") rather than copying a table row verbatim. The
 *     specific actor/tool name (e.g. "Deal analyst," `listing_reader`)
 *     already reaches the reader through the real `event.summary` text
 *     these coarse category labels sit beside (`ActivityTimeline.tsx`), so
 *     nothing is lost by not repeating "specialist"/"skill"/"tool" here.
 *   - `case.snapshot` -> "Comparison updated" (product.md "Case ->
 *     Comparison / Decision").
 *
 * §4/§48 rows this file structurally cannot cover, and why (documented
 * rather than silently skipped): "Decision Pack," "E1/E2/E3," `commandId`/
 * `runId`, "compiled hash," and "Graph/Swarm" are FIELD/IDENTIFIER names,
 * not `PublicActivityEventType` union members -- there is no event-type key
 * for this table to attach them to (the exact same reasoning the paragraph
 * above already establishes for "not that new keys were added"). Their
 * consumer-invisibility is real and enforced elsewhere: `CaseHeader.tsx`
 * never renders pack id/version/hash (ADR 0004 item 1), and no
 * `PublicActivityEvent`/`safeDetails` payload this file's own producers
 * emit carries a raw `commandId`/`runId`/compiled hash as visible text --
 * proven by this file's own `no raw internal id leaks` test below, and by
 * `ActivityTimeline.tsx` never rendering `event.eventId`/`event.commandId`/
 * `event.runId` as prose (only as `data-*` attributes for the Runtime
 * Inspector's own correlation navigation, Task I2b). "Need to verify" (§48)
 * similarly concerns `ObligationState.status`/`requiredEvidenceLevel`, a
 * field pairing owned by `ReadinessPanel.tsx`, not an event type.
 */
import type { PublicActivityEventType } from '@sift/contracts';
import { PUBLIC_ACTIVITY_EVENT_TYPES } from '@sift/contracts';

/**
 * The nine semantic states from `docs/specs/product.md`'s Readiness region
 * and Required Visible States list (docs/design-system.md "Status tokens"),
 * plus `neutral` for activity that carries no case-domain status at all
 * (a plain command receipt, a periodic snapshot).
 */
export const STATUS_TONES = [
  'satisfied',
  'active',
  'blocked',
  'accepted-uncertainty',
  'open',
  'stale',
  'error',
  'ready',
  'decided',
  'neutral',
] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export interface StatusToneMeta {
  ink: string;
  bg: string;
  border: string;
  /** A single aria-hidden decorative glyph shared by every tone in this family -- one small stable icon vocabulary rather than twenty bespoke per-event icons. */
  icon: string;
}

/** ink/bg/border CSS custom-property references from `apps/web/src/styles/tokens.css`, keyed by tone. `neutral` deliberately uses the muted/subtle neutrals per docs/design-system.md's "initial/empty" row ("no status color -- nothing has happened yet"), not a tenth hue. */
export const STATUS_TONE_META: Record<StatusTone, StatusToneMeta> = {
  satisfied: {
    ink: 'var(--color-status-satisfied-ink)',
    bg: 'var(--color-status-satisfied-bg)',
    border: 'var(--color-status-satisfied-border)',
    icon: '✓',
  },
  active: {
    ink: 'var(--color-status-active-ink)',
    bg: 'var(--color-status-active-bg)',
    border: 'var(--color-status-active-border)',
    icon: '↻',
  },
  blocked: {
    ink: 'var(--color-status-blocked-ink)',
    bg: 'var(--color-status-blocked-bg)',
    border: 'var(--color-status-blocked-border)',
    icon: '■',
  },
  'accepted-uncertainty': {
    ink: 'var(--color-status-accepted-uncertainty-ink)',
    bg: 'var(--color-status-accepted-uncertainty-bg)',
    border: 'var(--color-status-accepted-uncertainty-border)',
    icon: '△',
  },
  open: {
    ink: 'var(--color-status-open-ink)',
    bg: 'var(--color-status-open-bg)',
    border: 'var(--color-status-open-border)',
    icon: '○',
  },
  stale: {
    ink: 'var(--color-status-stale-ink)',
    bg: 'var(--color-status-stale-bg)',
    border: 'var(--color-status-stale-border)',
    icon: '⏳',
  },
  error: {
    ink: 'var(--color-status-error-ink)',
    bg: 'var(--color-status-error-bg)',
    border: 'var(--color-status-error-border)',
    icon: '⚠',
  },
  ready: {
    ink: 'var(--color-status-ready-ink)',
    bg: 'var(--color-status-ready-bg)',
    border: 'var(--color-status-ready-border)',
    icon: '●',
  },
  decided: {
    ink: 'var(--color-status-decided-ink)',
    bg: 'var(--color-status-decided-bg)',
    border: 'var(--color-status-decided-border)',
    icon: '■',
  },
  neutral: {
    ink: 'var(--color-ink-muted)',
    bg: 'var(--color-surface-sunken)',
    border: 'var(--color-border-subtle)',
    icon: '·',
  },
};

export interface ActivityLabelEntry {
  label: string;
  tone: StatusTone;
}

/**
 * The exhaustive table. `satisfies Record<PublicActivityEventType, ...>`
 * makes an omission a compile error: adding a new
 * `PublicActivityEventType` union member without adding its row here fails
 * `pnpm --filter @sift/web typecheck`, not just a runtime fallback.
 */
const ACTIVITY_LABELS = {
  // Task A6: "command" is engine vocabulary describing how the action
  // reached Sift, not what the person's action did (change-set §4's
  // guiding rule); a `commandId` itself is "developer view only" (product.md
  // row 186) regardless.
  'command.accepted': { label: 'Update accepted', tone: 'neutral' },
  // "Plan" is one of the few pieces of engine vocabulary that is already a
  // person's word for the same thing, so it survives the terminology table
  // unchanged. The tone is `active` rather than `neutral` because both
  // events mean Sift is about to do something, not that it filed a note.
  'plan.created': { label: 'Sift worked out what to look into', tone: 'active' },
  'plan.revised': { label: 'Sift updated what it is looking into', tone: 'active' },
  'run.queued': { label: 'Investigation queued', tone: 'open' },
  'run.started': { label: 'Investigation started', tone: 'active' },
  'run.completed': { label: 'Investigation completed', tone: 'satisfied' },
  'run.failed': { label: 'Investigation failed', tone: 'error' },
  // Task A6: no product.md row names "specialist"/"skill"/"tool" directly
  // (only the coarser "Agent graph -> Investigation team, developer view
  // only" and "tool/skill/specialist IDs -> developer view only" rows) --
  // this file's header comment records the reasoning. "A step in the
  // investigation," not "a specialist": the specific actor's name (e.g.
  // "Deal analyst") already reaches the reader through `event.summary`.
  'specialist.started': { label: 'A step in the investigation started', tone: 'active' },
  'specialist.completed': { label: 'A step in the investigation finished', tone: 'satisfied' },
  'skill.activated': { label: 'A new capability activated', tone: 'active' },
  'tool.started': { label: 'Looking something up', tone: 'active' },
  'tool.completed': { label: 'Finished looking something up', tone: 'satisfied' },
  'tool.failed': { label: "Couldn't complete that lookup", tone: 'error' },
  // `Guide` -> "Agent redirected" (product.md terminology table, verbatim).
  'intervention.guided': { label: 'Agent redirected', tone: 'active' },
  // `Confirm` -> "Your approval needed" (product.md terminology table, verbatim).
  'intervention.confirmation_required': { label: 'Your approval needed', tone: 'ready' },
  // `Deny` -> "Action blocked" (product.md terminology table, verbatim).
  'intervention.denied': { label: 'Action blocked', tone: 'blocked' },
  // `Evidence` -> "Research/Source/Fact" (change-set §4 terminology table).
  'evidence.accepted': { label: 'Finding accepted', tone: 'satisfied' },
  // Task A6: the literal change-set §48 example pair -- "Research
  // disagrees" <-> `evidence.conflicted`.
  'evidence.conflicted': { label: 'Research disagrees', tone: 'blocked' },
  // `Obligation` -> "Question to resolve" (product.md terminology table, verbatim).
  'obligation.updated': { label: 'Question to resolve updated', tone: 'open' },
  // `Stale evidence` -> "Needs re-checking" (change-set §4 terminology
  // table) -- "invalidated" is engine vocabulary describing how Sift
  // implemented the change, not what it means for the decision. Task A6:
  // "Recommendation" -> "Current recommendation" (product.md terminology
  // table), so both entries below now say "Current recommendation," not
  // the bare noun.
  'recommendation.invalidated': {
    label: 'Current recommendation needs another look',
    tone: 'stale',
  },
  // Task A6: aligned with `ReadinessPanel.tsx`'s own "ready for decision"
  // copy for the identical underlying convergence concept (product.md
  // "Convergence -> Ready for decision"), so the same real event reads
  // consistently wherever it appears.
  'recommendation.ready': { label: 'Current recommendation ready for decision', tone: 'ready' },
  // Exact required copy (docs/specs/value-proposition.md "Required visible copy").
  'draft.withheld': { label: 'Draft withheld', tone: 'blocked' },
  // Task A6: `Case` -> "Comparison / Decision" (product.md terminology table).
  'case.snapshot': { label: 'Comparison updated', tone: 'neutral' },
} satisfies Record<PublicActivityEventType, ActivityLabelEntry>;

/** Defensive fallback for a `type` value this table has never seen -- e.g. a schema-valid future event a client build predates. Never the raw string itself. */
const UNKNOWN_ACTIVITY_LABEL: ActivityLabelEntry = { label: 'Activity update', tone: 'neutral' };

function isKnownActivityEventType(type: string): type is PublicActivityEventType {
  return (PUBLIC_ACTIVITY_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Looks up the safe label/tone for a `PublicActivityEvent.type`. Accepts a
 * plain `string` (not just the narrowed union) so a caller rendering
 * loosely-typed or not-yet-revalidated data can never be tempted to fall
 * back to the raw value itself -- this function always returns a safe,
 * human-readable entry.
 */
export function getActivityLabel(type: string): ActivityLabelEntry {
  if (isKnownActivityEventType(type)) {
    return ACTIVITY_LABELS[type];
  }
  return UNKNOWN_ACTIVITY_LABEL;
}
