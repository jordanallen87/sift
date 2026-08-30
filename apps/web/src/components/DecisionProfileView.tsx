/**
 * Renders the projected Decision Profile (`decision-profile.ts`): "What are
 * we actually looking for?" (docs/change-sets/2026-08-30-generic-decision-
 * workspace.md §15, §42). Purely presentational -- takes the already-derived
 * `DecisionProfile` plus optional callbacks; calls no command and reads no
 * context, matching `OptionCompareView.tsx`'s "purely presentational"
 * contract in this same directory (this file has no fetching, no context,
 * no command dispatch). Wiring a real `CaseState` into `deriveDecisionProfile`
 * and a real `commands.reviewCaseExtension` call into the confirm/reject
 * callbacks below is a separate, later task.
 *
 * Consumer language throughout (§4): every section title is a plain English
 * phrase ("Must have," not "hard constraint"; "Personal concerns," not
 * "case extension"); every visible label comes from a `label`/`reason`
 * field, never a `Criterion.id`/`CaseExtension.id` (which may be a raw
 * `custom.*` token -- see `decision-profile.ts`'s own header on why those
 * ids are never rendered as text). Ids are used only in `data-testid`
 * attributes and React `key`s, neither of which is visible rendered text.
 *
 * Empty sections do not render at all (§5) -- a section with zero concerns
 * contributes no heading and no card. When every section is empty the
 * component renders one small, honest empty state instead of a stack of
 * "nothing here yet" cards.
 *
 * Exact weights stay behind a closed-by-default disclosure (§42: "Weights
 * should not necessarily be exposed as raw numeric percentages to ordinary
 * users by default... Advanced editing may expose exact weights"): the four
 * weighted sections show only each concern's band ("Very important" /
 * "Important" / "Somewhat important"); the numeric 0-100 weight is shown
 * only inside the "Exact priority weights" disclosure at the bottom, which
 * reuses this directory's existing `DisclosureSection` chrome rather than
 * inventing a second disclosure widget.
 *
 * "User-confirmed vs model-proposed" (§16): Personal concerns show an
 * honest origin/confirmation badge -- "Added by you" for a user-originated
 * concern, "Suggested by Sift" for a confirmed agent-proposed one, and
 * "Suggested by Sift -- needs your OK" plus Confirm/Reject controls for a
 * still-pending one. The same origin distinction (without a confirmation
 * state, since a plain `Criterion` carries no per-item confirmation field)
 * also appears as a small badge on any weighted concern that did not come
 * from the pack itself.
 */
import type {
  DecisionProfile,
  DecisionProfileConcern,
  DecisionProfileMissingItem,
  DecisionProfilePersonalConcern,
  PriorityBand,
} from './decision-profile.js';
import { DisclosureSection } from './DisclosureSection.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface DecisionProfileViewProps {
  profile: DecisionProfile;
  /** Fired with `DecisionProfilePersonalConcern.id` when the user confirms a pending personal concern. Omit (along with `onRejectConcern`) to render personal concerns read-only. */
  onConfirmConcern?: (concernId: string) => void;
  /** Fired with `DecisionProfilePersonalConcern.id` when the user rejects a pending personal concern. Omit (along with `onConfirmConcern`) to render personal concerns read-only. */
  onRejectConcern?: (concernId: string) => void;
}

const PRIORITY_BAND_LABEL: Record<PriorityBand, string> = {
  very_important: 'Very important',
  important: 'Important',
  somewhat_important: 'Somewhat important',
};

const CRITERION_ORIGIN_LABEL: Partial<Record<DecisionProfileConcern['origin'], string>> = {
  user: 'Added by you',
  agent_proposed: 'Suggested by Sift',
};

interface ConcernRowProps {
  concern: DecisionProfileConcern;
  /** Whether to show the coarse priority band badge -- only meaningful for the "Important"/"Nice to have" split, so "Must have"/"Nice to have"/"Context" pass `false` and let the section heading itself carry the priority meaning. */
  showBand: boolean;
}

function ConcernRow({ concern, showBand }: ConcernRowProps) {
  const originLabel = CRITERION_ORIGIN_LABEL[concern.origin] ?? null;

  return (
    <li
      data-testid={`decision-profile-view-concern-${concern.id}`}
      className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] bg-card p-[var(--space-3)]"
    >
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <span className="font-[var(--font-weight-semibold)] text-[var(--color-ink)]">
          {concern.label}
        </span>
        {showBand ? (
          <Badge
            variant="outline"
            data-testid={`decision-profile-view-band-${concern.id}`}
            className="label-caps px-[var(--space-1)] py-0 text-[var(--color-ink-secondary)]"
          >
            {PRIORITY_BAND_LABEL[concern.priorityBand]}
          </Badge>
        ) : null}
        {originLabel !== null ? (
          <Badge
            variant="secondary"
            data-testid={`decision-profile-view-origin-${concern.id}`}
            className="label-caps px-[var(--space-1)] py-0"
          >
            {originLabel}
          </Badge>
        ) : null}
      </div>
      {concern.target !== null ? (
        <p
          data-testid={`decision-profile-view-target-${concern.id}`}
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          Target: {concern.target}
        </p>
      ) : null}
      {concern.question !== null ? (
        <p
          data-testid={`decision-profile-view-question-${concern.id}`}
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          {concern.question}
        </p>
      ) : null}
    </li>
  );
}

interface ConcernGroupProps {
  testId: string;
  title: string;
  concerns: DecisionProfileConcern[];
  showBand: boolean;
}

/** Renders nothing at all for an empty section (§5) -- no card, no heading announcing its own emptiness. */
function ConcernGroup({ testId, title, concerns, showBand }: ConcernGroupProps) {
  if (concerns.length === 0) return null;

  return (
    <div
      data-testid={`decision-profile-view-section-${testId}`}
      className="flex flex-col gap-[var(--space-2)]"
    >
      <h3 className="label-caps text-[var(--color-ink-secondary)]">{title}</h3>
      <ul className="flex flex-col gap-[var(--space-2)]">
        {concerns.map((concern) => (
          <ConcernRow key={concern.id} concern={concern} showBand={showBand} />
        ))}
      </ul>
    </div>
  );
}

/** See the module header: an agent-proposed concern's status depends on confirmation; a user-added one is always simply "Added by you" -- there is no pending state for a user's own concern. */
function personalConcernStatusLabel(concern: DecisionProfilePersonalConcern): string {
  if (concern.origin === 'user') return 'Added by you';
  return concern.confirmation === 'pending'
    ? 'Suggested by Sift — needs your OK'
    : 'Suggested by Sift';
}

interface PersonalConcernRowProps {
  concern: DecisionProfilePersonalConcern;
  // `| undefined` is spelled out explicitly (not just `?:`) because this prop is populated by
  // forwarding `DecisionProfileViewProps.onConfirmConcern`/`onRejectConcern` -- which may
  // themselves be `undefined` -- straight through as a JSX prop value; under this project's
  // `exactOptionalPropertyTypes: true`, an optional prop written as bare `?:` rejects an
  // explicit `undefined` value, only a fully-omitted key.
  onConfirm?: ((concernId: string) => void) | undefined;
  onReject?: ((concernId: string) => void) | undefined;
}

function PersonalConcernRow({ concern, onConfirm, onReject }: PersonalConcernRowProps) {
  const isPending = concern.confirmation === 'pending';
  const showActions = isPending && (onConfirm !== undefined || onReject !== undefined);

  return (
    <li
      data-testid={`decision-profile-view-personal-concern-${concern.id}`}
      className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] p-[var(--space-3)]"
      style={{ backgroundColor: isPending ? 'var(--color-status-ready-bg)' : 'var(--color-card)' }}
    >
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <span className="font-[var(--font-weight-semibold)] text-[var(--color-ink)]">
          {concern.label}
        </span>
        <Badge
          variant={isPending ? 'default' : 'secondary'}
          data-testid={`decision-profile-view-personal-concern-status-${concern.id}`}
          className="label-caps px-[var(--space-1)] py-0"
        >
          {personalConcernStatusLabel(concern)}
        </Badge>
      </div>
      <p
        data-testid={`decision-profile-view-personal-concern-reason-${concern.id}`}
        className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
      >
        {concern.reason}
      </p>
      {showActions ? (
        <div className="flex flex-wrap gap-[var(--space-2)]">
          {onConfirm !== undefined ? (
            <Button
              type="button"
              data-testid={`decision-profile-view-personal-concern-confirm-${concern.id}`}
              onClick={() => {
                onConfirm(concern.id);
              }}
              variant="default"
              size="sm"
              className="min-h-[var(--size-touch-target-min)]"
            >
              Confirm
            </Button>
          ) : null}
          {onReject !== undefined ? (
            <Button
              type="button"
              data-testid={`decision-profile-view-personal-concern-reject-${concern.id}`}
              onClick={() => {
                onReject(concern.id);
              }}
              variant="destructive"
              size="sm"
              className="min-h-[var(--size-touch-target-min)]"
            >
              Reject
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function MissingSection({ items }: { items: DecisionProfileMissingItem[] }) {
  if (items.length === 0) return null;

  return (
    <div
      data-testid="decision-profile-view-section-missing"
      className="flex flex-col gap-[var(--space-2)]"
    >
      <h3 className="label-caps text-[var(--color-ink-secondary)]">Not settled yet</h3>
      <ul className="flex flex-col gap-[var(--space-1)]">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid={`decision-profile-view-missing-${item.id}`}
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DecisionProfileView({
  profile,
  onConfirmConcern,
  onRejectConcern,
}: DecisionProfileViewProps) {
  const weightedConcerns = [
    ...profile.mustHave,
    ...profile.important,
    ...profile.niceToHave,
    ...profile.context,
  ];
  const isEmpty =
    weightedConcerns.length === 0 &&
    profile.personalConcerns.length === 0 &&
    profile.missing.length === 0;

  return (
    <section
      data-testid="decision-profile-view"
      aria-labelledby="decision-profile-view-heading"
      className="flex flex-col gap-[var(--space-4)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <h2 id="decision-profile-view-heading">What you&rsquo;re looking for</h2>

      {isEmpty ? (
        <p
          data-testid="decision-profile-view-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          Nothing&rsquo;s been defined yet. Add a priority or a personal concern to build your
          profile.
        </p>
      ) : (
        <>
          <ConcernGroup
            testId="must-have"
            title="Must have"
            concerns={profile.mustHave}
            showBand={false}
          />
          <ConcernGroup
            testId="important"
            title="Important"
            concerns={profile.important}
            showBand
          />
          <ConcernGroup
            testId="nice-to-have"
            title="Nice to have"
            concerns={profile.niceToHave}
            showBand={false}
          />
          <ConcernGroup
            testId="context"
            title="Context"
            concerns={profile.context}
            showBand={false}
          />

          {profile.personalConcerns.length > 0 ? (
            <div
              data-testid="decision-profile-view-section-personal-concerns"
              className="flex flex-col gap-[var(--space-2)]"
            >
              <h3 className="label-caps text-[var(--color-ink-secondary)]">Personal concerns</h3>
              <ul className="flex flex-col gap-[var(--space-2)]">
                {profile.personalConcerns.map((concern) => (
                  <PersonalConcernRow
                    key={concern.id}
                    concern={concern}
                    onConfirm={onConfirmConcern}
                    onReject={onRejectConcern}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          <MissingSection items={profile.missing} />

          {weightedConcerns.length > 0 ? (
            <DisclosureSection testId="decision-profile-weights" title="Exact priority weights">
              <ul className="flex flex-col gap-[var(--space-1)]">
                {weightedConcerns.map((concern) => (
                  <li
                    key={concern.id}
                    data-testid={`decision-profile-view-weight-${concern.id}`}
                    className="flex items-center justify-between gap-[var(--space-2)] text-[length:var(--font-size-sm)]"
                  >
                    <span>{concern.label}</span>
                    <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink-secondary)]">
                      {concern.weight}%
                    </span>
                  </li>
                ))}
              </ul>
            </DisclosureSection>
          ) : null}
        </>
      )}
    </section>
  );
}
