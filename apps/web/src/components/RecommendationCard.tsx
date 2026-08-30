/**
 * Region 6, "Recommendation and approval" (docs/specs/product.md "Workspace
 * layout") -- the recommendation half only; the approve/revise/reject
 * controls live in `ApprovalCard.tsx` (a `Recommendation` and a
 * `DecisionProposal` are distinct canonical objects, architecture.md
 * "Security and authority": "A recommendation and an approved decision are
 * distinct states").
 *
 * Renders a real `Recommendation` (packages/contracts/src/case.ts). Facts
 * and hypotheses are rendered as two visually distinct lists (never merged
 * into one undifferentiated bullet list) -- this is the UI half of
 * value-proposition.md's capability-boundary claim, "Typed claims linked to
 * durable sources" and "separation of fact and hypothesis" (GoalLoop
 * validator, strands-runtime.md).
 *
 * The `withheld` prop drives the exact required copy from
 * docs/specs/value-proposition.md's "Required visible copy":
 *
 *   Draft withheld
 *   This answer is plausible, but 3 required questions are still unresolved.
 *   Sift is continuing the investigation before asking you to decide.
 *
 * This is a distinct state from a plain "no recommendation yet" empty
 * state: `withheld` means a draft was actually produced and rejected by
 * GoalLoop/readiness validation (draft.withheld PublicActivityEvent),
 * whereas a bare empty state means no attempt has happened yet.
 */
import type { Recommendation, Source } from '@sift/contracts';
import { Badge } from '@/components/ui/badge';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export interface RecommendationWithheld {
  /** Count of required questions still unresolved -- substituted into the exact required copy. */
  unresolvedRequiredCount: number;
}

export interface RecommendationCardProps {
  /** `null` when no recommendation has been produced and accepted yet. */
  recommendation: Recommendation | null;
  /** Present exactly when the most recent draft was withheld by validation -- see the file header for the exact required copy this drives. */
  withheld?: RecommendationWithheld | null;
  loading?: boolean;
  /** Optional joined `Source` records for `recommendation.sourceIds`, keyed by id, for a richer citation link. Falls back to a plain reference chip when a source is not supplied. */
  sources?: Record<string, Source>;
}

const RECOMMENDATION_STATUS_META: Record<
  Recommendation['status'],
  { label: string; tone: StatusTone }
> = {
  ready: { label: 'Ready for review', tone: 'ready' },
  stale: { label: 'Stale — recomputing', tone: 'stale' },
};

function pluralQuestion(count: number): string {
  return count === 1 ? 'question' : 'questions';
}

function pluralIsAre(count: number): string {
  return count === 1 ? 'is' : 'are';
}

export function RecommendationCard({
  recommendation,
  withheld = null,
  loading = false,
  sources = {},
}: RecommendationCardProps) {
  return (
    <section
      data-testid="recommendation-card"
      aria-labelledby="recommendation-card-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] bg-card p-[var(--space-4)]"
    >
      <h2 id="recommendation-card-heading">Our pick</h2>

      {recommendation === null ? (
        loading ? (
          <div
            data-testid="recommendation-card-loading"
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col gap-[var(--space-2)]"
          >
            <div className="h-[var(--space-10)] animate-pulse rounded-[var(--radius-md)] bg-muted" />
            <span className="visually-hidden">Loading recommendation…</span>
          </div>
        ) : withheld ? (
          <div
            data-testid="recommendation-card-withheld"
            role="status"
            className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] p-[var(--space-3)]"
            style={{ backgroundColor: STATUS_TONE_META.blocked.bg }}
          >
            <p className="label-caps" style={{ color: STATUS_TONE_META.blocked.ink }}>
              Draft withheld
            </p>
            <p style={{ color: STATUS_TONE_META.blocked.ink }}>
              {`This answer is plausible, but ${withheld.unresolvedRequiredCount} required ${pluralQuestion(
                withheld.unresolvedRequiredCount,
              )} ${pluralIsAre(withheld.unresolvedRequiredCount)} still unresolved.`}
            </p>
            <p style={{ color: STATUS_TONE_META.blocked.ink }}>
              Sift is continuing the investigation before asking you to decide.
            </p>
          </div>
        ) : (
          <p
            data-testid="recommendation-card-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            No recommendation yet. Sift will propose one once enough evidence is gathered.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-[var(--space-3)]">
          {(() => {
            const statusMeta = RECOMMENDATION_STATUS_META[recommendation.status];
            return (
              <Badge
                // Remounts (replaying `.status-change-enter`) whenever the
                // recommendation's own status flips between `ready` and
                // `stale` -- a moment worth a beat of visible emphasis.
                key={recommendation.status}
                data-testid="recommendation-card-status"
                className="status-change-enter label-caps w-fit gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
                style={{
                  color: STATUS_TONE_META[statusMeta.tone].ink,
                  backgroundColor: STATUS_TONE_META[statusMeta.tone].bg,
                }}
              >
                <span aria-hidden="true">{STATUS_TONE_META[statusMeta.tone].icon}</span>
                {statusMeta.label}
              </Badge>
            );
          })()}

          {recommendation.status === 'stale' ? (
            <p
              data-testid="recommendation-card-stale-note"
              className="list-item-enter text-[length:var(--font-size-sm)]"
              style={{ color: STATUS_TONE_META.stale.ink }}
            >
              New evidence or a criteria change has invalidated this recommendation. Sift is
              recomputing it -- the content below may no longer reflect the current case.
            </p>
          ) : null}

          <p
            data-testid="recommendation-card-rationale"
            className="text-[length:var(--font-size-base)] text-[var(--color-ink)]"
          >
            {recommendation.rationale}
          </p>

          <div className="flex flex-col gap-[var(--space-2)]">
            <div
              data-testid="recommendation-card-facts"
              className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] p-[var(--space-2)]"
              style={{ backgroundColor: STATUS_TONE_META.satisfied.bg }}
            >
              <h3 className="label-caps" style={{ color: STATUS_TONE_META.satisfied.ink }}>
                Facts
              </h3>
              {recommendation.facts.length === 0 ? (
                <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]">
                  No supporting facts recorded.
                </p>
              ) : (
                <ul className="flex flex-col gap-[var(--space-0-5)]">
                  {recommendation.facts.map((fact) => (
                    <li
                      key={fact}
                      className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
                    >
                      {fact}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div
              data-testid="recommendation-card-hypotheses"
              className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] p-[var(--space-2)]"
              style={{ backgroundColor: STATUS_TONE_META['accepted-uncertainty'].bg }}
            >
              <h3
                className="label-caps"
                style={{ color: STATUS_TONE_META['accepted-uncertainty'].ink }}
              >
                Hypotheses
              </h3>
              {recommendation.hypotheses.length === 0 ? (
                <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]">
                  No open hypotheses.
                </p>
              ) : (
                <ul className="flex flex-col gap-[var(--space-0-5)]">
                  {recommendation.hypotheses.map((hypothesis) => (
                    <li
                      key={hypothesis}
                      className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
                    >
                      {hypothesis}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {recommendation.limitations.length > 0 ? (
            <div
              data-testid="recommendation-card-limitations"
              className="flex flex-col gap-[var(--space-1)]"
            >
              <h3 className="label-caps text-[var(--color-ink-secondary)]">Limitations</h3>
              <ul className="flex flex-col gap-[var(--space-0-5)]">
                {recommendation.limitations.map((limitation) => (
                  <li
                    key={limitation}
                    className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
                  >
                    {limitation}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {recommendation.sourceIds.length > 0 ? (
            <div
              data-testid="recommendation-card-sources"
              className="flex flex-col gap-[var(--space-1)]"
            >
              <h3 className="label-caps text-[var(--color-ink-secondary)]">Sources</h3>
              <ul className="flex flex-wrap gap-[var(--space-1-5)]">
                {recommendation.sourceIds.map((sourceId) => {
                  const source = sources[sourceId];
                  return (
                    <li key={sourceId}>
                      {source ? (
                        <a
                          data-testid={`recommendation-card-source-${sourceId}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[length:var(--font-size-sm)] text-[var(--color-brand)] underline underline-offset-2"
                        >
                          {source.title}
                        </a>
                      ) : (
                        <span
                          data-testid={`recommendation-card-source-${sourceId}`}
                          className="font-[family-name:var(--font-mono)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]"
                        >
                          [{sourceId}]
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
