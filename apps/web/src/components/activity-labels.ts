/**
 * Centralized, exhaustive label registry for `PublicActivityEventType`
 * (docs/specs/architecture.md "Real-time event contract").
 *
 * Adapted from the label-registry pattern in
 * `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/execute/activity-labels.ts`
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
 */
import type { PublicActivityEventType } from '@pax/contracts';
import { PUBLIC_ACTIVITY_EVENT_TYPES } from '@pax/contracts';

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
 * `pnpm --filter @pax/web typecheck`, not just a runtime fallback.
 */
const ACTIVITY_LABELS = {
  'command.accepted': { label: 'Command accepted', tone: 'neutral' },
  'run.queued': { label: 'Investigation queued', tone: 'open' },
  'run.started': { label: 'Investigation started', tone: 'active' },
  'run.completed': { label: 'Investigation completed', tone: 'satisfied' },
  'run.failed': { label: 'Investigation failed', tone: 'error' },
  'specialist.started': { label: 'Specialist started working', tone: 'active' },
  'specialist.completed': { label: 'Specialist finished', tone: 'satisfied' },
  'skill.activated': { label: 'Skill activated', tone: 'active' },
  'tool.started': { label: 'Tool call started', tone: 'active' },
  'tool.completed': { label: 'Tool call completed', tone: 'satisfied' },
  'tool.failed': { label: 'Tool call failed', tone: 'error' },
  // `Guide` -> "Agent redirected" (product.md terminology table, verbatim).
  'intervention.guided': { label: 'Agent redirected', tone: 'active' },
  // `Confirm` -> "Your approval needed" (product.md terminology table, verbatim).
  'intervention.confirmation_required': { label: 'Your approval needed', tone: 'ready' },
  'evidence.accepted': { label: 'Evidence accepted', tone: 'satisfied' },
  'evidence.conflicted': { label: 'Evidence conflict found', tone: 'blocked' },
  // `Obligation` -> "Question to resolve" (product.md terminology table, verbatim).
  'obligation.updated': { label: 'Question to resolve updated', tone: 'open' },
  'recommendation.invalidated': { label: 'Recommendation invalidated', tone: 'stale' },
  'recommendation.ready': { label: 'Recommendation ready for review', tone: 'ready' },
  // Exact required copy (docs/specs/value-proposition.md "Required visible copy").
  'draft.withheld': { label: 'Draft withheld', tone: 'blocked' },
  'case.snapshot': { label: 'Case snapshot updated', tone: 'neutral' },
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
