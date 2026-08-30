/**
 * One item within region 4, "Evidence and comparison" (docs/specs/product.md
 * "Workspace layout") -- the evidence/claims/staleness slice of that region.
 *
 * Renders one `EvidenceItemData`: an `EvidenceLink` joined with its
 * optional `Claim` and `Source` (all three real `@sift/contracts` shapes --
 * see `packages/contracts/src/case.ts`). Purely presentational: it never
 * decides verdict, staleness, or conflict -- those are canonical, core-owned
 * facts (CLAUDE.md "The deterministic core ... owns ... evidence
 * validity"); this component only renders what it is given.
 *
 * `onSetDisposition` (added in the live-wiring pass, docs/build-log.md's
 * dated entry): the visible-control equivalent of the
 * `sift_set_evidence_disposition` WebMCP tool (webmcp.md), added as a purely
 * optional prop so every existing caller/test keeps working unchanged --
 * the controls render only when a caller supplies the callback, following
 * the exact same optional-callback pattern `ApprovalCard.tsx`'s `onReview`
 * already establishes. The caller (`App.tsx`) owns actually invoking
 * `commands.setEvidenceDisposition` on the shared `SiftCommands` instance;
 * this component only reports the human's choice and typed reason.
 */
import { useEffect, useState } from 'react';
import { EVIDENCE_DISPOSITIONS } from '@sift/contracts';
import type { Claim, EvidenceDisposition, EvidenceLink, Source } from '@sift/contracts';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export interface EvidenceItemData {
  evidenceLink: EvidenceLink;
  // `| undefined` (not just the `?` modifier) so a test builder can override
  // an already-present default back to "absent" under this repo's
  // `exactOptionalPropertyTypes: true` -- see EvidenceCard.test.tsx's
  // `buildItem({ claim: undefined })`/`buildItem({ source: undefined })`.
  claim?: Claim | undefined;
  source?: Source | undefined;
  /**
   * IDs of other evidence items this one conflicts with. Grounded in
   * `EvidenceConflictedEventSchema`'s payload shape
   * (`conflictingEvidenceIds: idString[]`, packages/contracts/src/events.ts)
   * -- computed upstream by the reducer/core, never derived in this
   * component.
   */
  conflictingEvidenceIds?: string[];
}

export interface EvidenceCardProps {
  item: EvidenceItemData;
  /** Reports the human's chosen disposition and typed reason. Omit to render this card read-only (no controls at all). */
  onSetDisposition?: (disposition: EvidenceDisposition, reason: string) => void;
  /** True while a disposition change for this item is in flight; disables the controls. */
  dispositionPending?: boolean;
  /**
   * Render only a dimmed one-line summary instead of full card content. A
   * sibling findings-review sheet (built in parallel) owns deciding *when*
   * an item counts as reviewed and passes this in; this component only
   * renders the collapsed/expanded presentation and the local override that
   * lets a person tap back into a collapsed item.
   */
  collapsed?: boolean;
}

const VERDICT_LABEL: Record<EvidenceLink['verdict'], { label: string; tone: StatusTone }> = {
  pass: { label: 'Verified', tone: 'satisfied' },
  fail: { label: 'Did not verify', tone: 'blocked' },
  error: { label: 'Could not be checked', tone: 'error' },
  degraded: { label: 'Partially verified', tone: 'accepted-uncertainty' },
  skipped: { label: 'Not checked', tone: 'open' },
};

const DISPOSITION_LABEL: Record<EvidenceLink['disposition'], string> = {
  included: 'Included in the case',
  excluded: 'Excluded from the case',
  questioned: 'Questioned',
};

/** Short verb-form labels for the segmented control's three options, distinct from `DISPOSITION_LABEL`'s longer badge/summary phrasing. */
const DISPOSITION_ACTION_LABEL: Record<EvidenceLink['disposition'], string> = {
  included: 'Include',
  excluded: 'Exclude',
  questioned: 'Question',
};

/** Segment color per disposition (mockup direction: "green-tinted for included, neutral/grey for excluded, amber for questioned"), reusing the app's one status-tone vocabulary rather than inventing new colors. */
const DISPOSITION_TONE: Record<EvidenceLink['disposition'], StatusTone> = {
  included: 'satisfied',
  excluded: 'neutral',
  questioned: 'accepted-uncertainty',
};

const STANCE_LABEL: Record<Claim['stance'], string> = {
  supports: 'Supports',
  opposes: 'Opposes',
  neutral: 'Neutral',
};

function Chip({ tone, children }: { tone: StatusTone; children: string }) {
  const meta = STATUS_TONE_META[tone];
  return (
    <Badge
      className="label-caps gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
      style={{ color: meta.ink, backgroundColor: meta.bg }}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {children}
    </Badge>
  );
}

export function EvidenceCard({
  item,
  onSetDisposition,
  dispositionPending = false,
  collapsed = false,
}: EvidenceCardProps) {
  const { evidenceLink, claim, source, conflictingEvidenceIds = [] } = item;
  const verdictMeta = VERDICT_LABEL[evidenceLink.verdict];
  const hasConflict = conflictingEvidenceIds.length > 0;
  // A change is only "pending confirmation" once the human taps a segment
  // that differs from the current disposition -- `null` means the reason
  // panel stays hidden and the segmented control just reflects the real
  // (core-owned) state.
  const [pendingDisposition, setPendingDisposition] = useState<EvidenceDisposition | null>(null);
  const [reason, setReason] = useState('');
  // "I've been asked to expand despite being told collapsed" -- session-local
  // only, never reported upward. Re-derived from `collapsed` below so a
  // fresh collapse instruction always starts collapsed again.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!collapsed) {
      setExpanded(false);
    }
  }, [collapsed]);

  function selectDisposition(value: string) {
    // Radix reports "" when the already-active radio is re-clicked
    // (deactivation); both that and re-selecting the current value are a
    // no-op here, matching the mockup's "tap another option to override".
    if (!value || value === evidenceLink.disposition) {
      return;
    }
    setPendingDisposition(value as EvidenceDisposition);
    setReason('');
  }

  function confirmPendingDisposition() {
    const trimmed = reason.trim();
    if (!onSetDisposition || !pendingDisposition || trimmed.length === 0) {
      return;
    }
    onSetDisposition(pendingDisposition, trimmed);
    setPendingDisposition(null);
    setReason('');
  }

  function cancelPendingDisposition() {
    setPendingDisposition(null);
    setReason('');
  }

  if (collapsed && !expanded) {
    return (
      <article
        data-testid={`evidence-card-${evidenceLink.id}`}
        // `status-change-enter`: this element only ever mounts the moment
        // a disposition is confirmed and the card settles into "done" --
        // the pop-in reads as the item visibly settling, matching the
        // round-2 design review's "dimming ... to make it look like
        // they're done" ask.
        className="status-change-enter rounded-[var(--radius-md)] bg-card p-[var(--space-3)] opacity-60"
      >
        <button
          type="button"
          data-testid={`evidence-card-expand-${evidenceLink.id}`}
          onClick={() => {
            setExpanded(true);
          }}
          className="flex min-h-[var(--size-touch-target-min)] w-full items-center gap-[var(--space-2)] text-left text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          <span aria-hidden="true">{STATUS_TONE_META.satisfied.icon}</span>
          {`Reviewed — kept as ${DISPOSITION_LABEL[evidenceLink.disposition]}`}
        </button>
      </article>
    );
  }

  return (
    <article
      data-testid={`evidence-card-${evidenceLink.id}`}
      // `EvidenceList`'s own outer wrapper (a list container, not a leaf
      // region) deliberately carries no fill of its own -- exactly
      // DemoLauncher's list-of-cards pattern, where each *item* is the
      // bg-card, not the list around them. That keeps every element nested
      // inside this card (the disposition badge, the reason input, the
      // Include/Exclude/Question buttons below) able to use its shadcn
      // primitive's own default bg-muted/bg-secondary contrast unmodified,
      // rather than needing a second manual override one level down.
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-card p-[var(--space-3)]"
    >
      <div className="flex flex-wrap items-center gap-[var(--space-1-5)]">
        <Chip tone={verdictMeta.tone}>{verdictMeta.label}</Chip>
        <Badge
          data-testid="evidence-card-disposition"
          variant="outline"
          className="label-caps rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)] text-[var(--color-ink-secondary)]"
        >
          {DISPOSITION_LABEL[evidenceLink.disposition]}
        </Badge>
        {evidenceLink.stale ? (
          <span
            data-testid="evidence-card-stale"
            className="inline-flex items-center gap-[var(--space-1)]"
          >
            <Chip tone="stale">Stale</Chip>
          </span>
        ) : null}
        {hasConflict ? (
          <span
            data-testid="evidence-card-conflict"
            className="inline-flex items-center gap-[var(--space-1)]"
          >
            <Chip tone="blocked">
              {`Conflicts with ${conflictingEvidenceIds.length} other item${
                conflictingEvidenceIds.length === 1 ? '' : 's'
              }`}
            </Chip>
          </span>
        ) : null}
      </div>

      {evidenceLink.stale ? (
        <p
          className="text-[length:var(--font-size-sm)]"
          style={{ color: STATUS_TONE_META.stale.ink }}
        >
          This evidence has aged past its validity window and may be out of date. Sift will
          reconfirm it before relying on it again.
        </p>
      ) : null}

      <p
        data-testid="evidence-card-claim"
        className="text-[length:var(--font-size-base)] text-[var(--color-ink)]"
      >
        {claim ? claim.statement : evidenceLink.summary}
      </p>

      {claim ? (
        <div className="flex flex-wrap items-center gap-[var(--space-2)] text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]">
          <span>{STANCE_LABEL[claim.stance]}</span>
          <span className="tabular-nums">Confidence {Math.round(claim.confidence * 100)}%</span>
        </div>
      ) : null}

      {source ? (
        <a
          data-testid="evidence-card-source"
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex flex-col gap-[var(--space-0-5)] text-[length:var(--font-size-sm)] text-[var(--color-brand)] underline underline-offset-2"
        >
          <span>{source.title}</span>
          {source.publisher ? (
            <span className="text-[var(--color-ink-muted)] no-underline">{source.publisher}</span>
          ) : null}
        </a>
      ) : (
        <p
          data-testid="evidence-card-no-source"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]"
        >
          No source is linked to this item yet.
        </p>
      )}

      {onSetDisposition ? (
        <div className="flex flex-col gap-[var(--space-1-5)] pt-[var(--space-2)]">
          <Separator />
          <ToggleGroup
            type="single"
            value={evidenceLink.disposition}
            onValueChange={selectDisposition}
            disabled={dispositionPending}
            data-testid="evidence-card-disposition-control"
            aria-label="Set this item's disposition"
            className="w-full"
          >
            {EVIDENCE_DISPOSITIONS.map((option) => {
              const isCurrent = option === evidenceLink.disposition;
              const meta = STATUS_TONE_META[DISPOSITION_TONE[option]];
              return (
                <ToggleGroupItem
                  key={option}
                  value={option}
                  data-testid={`evidence-card-disposition-option-${option}`}
                  // Flat by design (button.tsx's own convention): the
                  // non-current segments get a plain secondary fill, not a
                  // border, so they still read as clearly-distinct
                  // alternatives next to the current segment's tinted fill.
                  className={
                    isCurrent
                      ? 'min-h-[var(--size-touch-target-min)] flex-1'
                      : 'min-h-[var(--size-touch-target-min)] flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }
                  style={isCurrent ? { color: meta.ink, backgroundColor: meta.bg } : undefined}
                >
                  {DISPOSITION_ACTION_LABEL[option]}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>

          {pendingDisposition ? (
            <div className="flex flex-col gap-[var(--space-1-5)]">
              <Label
                htmlFor={`evidence-card-reason-${evidenceLink.id}`}
                className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]"
              >
                {`Reason for changing to "${DISPOSITION_LABEL[pendingDisposition]}"`}
              </Label>
              <Input
                id={`evidence-card-reason-${evidenceLink.id}`}
                data-testid={`evidence-card-reason-${evidenceLink.id}`}
                type="text"
                value={reason}
                disabled={dispositionPending}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                // border-0: `ui/input.tsx`'s own class list has no border-width
                // reset, so a real, visible native <input> user-agent border
                // (Chromium's default `2px inset` text-field chrome) otherwise
                // shows through unsuppressed -- global.css's reset only zeroes
                // `border` on `button`, not `input`. Overridden locally rather
                // than editing the shared primitive (out of this task's scope).
                className="border-0"
              />
              <div className="flex flex-wrap gap-[var(--space-1-5)]">
                <Button
                  type="button"
                  data-testid={`evidence-card-reason-confirm-${evidenceLink.id}`}
                  variant="default"
                  size="sm"
                  className="min-h-[var(--size-touch-target-min)]"
                  disabled={dispositionPending || reason.trim().length === 0}
                  onClick={confirmPendingDisposition}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  data-testid={`evidence-card-reason-cancel-${evidenceLink.id}`}
                  variant="secondary"
                  size="sm"
                  className="min-h-[var(--size-touch-target-min)]"
                  disabled={dispositionPending}
                  onClick={cancelPendingDisposition}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
