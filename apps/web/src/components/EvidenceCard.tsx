/**
 * One item within region 4, "Evidence and comparison" (docs/specs/product.md
 * "Workspace layout") -- the evidence/claims/staleness slice of that region.
 *
 * Renders one `EvidenceItemData`: an `EvidenceLink` joined with its
 * optional `Claim` and `Source` (all three real `@pax/contracts` shapes --
 * see `packages/contracts/src/case.ts`). Purely presentational: it never
 * decides verdict, staleness, or conflict -- those are canonical, core-owned
 * facts (CLAUDE.md "The deterministic core ... owns ... evidence
 * validity"); this component only renders what it is given.
 *
 * `onSetDisposition` (added in the live-wiring pass, docs/build-log.md's
 * dated entry): the visible-control equivalent of the
 * `pax_set_evidence_disposition` WebMCP tool (webmcp.md), added as a purely
 * optional prop so every existing caller/test keeps working unchanged --
 * the controls render only when a caller supplies the callback, following
 * the exact same optional-callback pattern `ApprovalCard.tsx`'s `onReview`
 * already establishes. The caller (`App.tsx`) owns actually invoking
 * `commands.setEvidenceDisposition` on the shared `PaxCommands` instance;
 * this component only reports the human's choice and typed reason.
 */
import { useState } from 'react';
import type { Claim, EvidenceDisposition, EvidenceLink, Source } from '@pax/contracts';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

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
}: EvidenceCardProps) {
  const { evidenceLink, claim, source, conflictingEvidenceIds = [] } = item;
  const verdictMeta = VERDICT_LABEL[evidenceLink.verdict];
  const hasConflict = conflictingEvidenceIds.length > 0;
  const [reason, setReason] = useState('Reviewed by user');

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
          This evidence has aged past its validity window and may be out of date. Pax will reconfirm
          it before relying on it again.
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
          <Label
            htmlFor={`evidence-card-reason-${evidenceLink.id}`}
            className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]"
          >
            Reason
          </Label>
          <Input
            id={`evidence-card-reason-${evidenceLink.id}`}
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
              data-testid="evidence-card-set-included"
              variant="secondary"
              size="sm"
              disabled={dispositionPending}
              onClick={() => {
                onSetDisposition('included', reason.trim() || 'Reviewed by user');
              }}
            >
              Include
            </Button>
            <Button
              type="button"
              data-testid="evidence-card-set-excluded"
              variant="secondary"
              size="sm"
              disabled={dispositionPending}
              onClick={() => {
                onSetDisposition('excluded', reason.trim() || 'Reviewed by user');
              }}
            >
              Exclude
            </Button>
            <Button
              type="button"
              data-testid="evidence-card-set-questioned"
              variant="secondary"
              size="sm"
              disabled={dispositionPending}
              onClick={() => {
                onSetDisposition('questioned', reason.trim() || 'Reviewed by user');
              }}
            >
              Question
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
