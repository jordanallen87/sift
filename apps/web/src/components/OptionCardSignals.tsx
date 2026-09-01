/**
 * The one compact row that replaced three stacked insight sections on every
 * browse card.
 *
 * ## Why this exists
 *
 * `OptionListView` used to end each card with three tinted blocks -- "What we
 * like", "What to watch for", "Still researching" -- each holding up to six
 * sentences. Four cards in a grid meant twelve blocks and roughly a hundred
 * lines of prose, and in the seeded case every single "watch for" line ended
 * with the identical phrase "still needs stronger evidence", so the wall of
 * text carried almost no information per line. The project owner's framing:
 * "the way you have these grids setup - it's cramming a lot of information in
 * them when we should keep that focused and keep the extra detail in the
 * profiles."
 *
 * A count says the same thing in one line. The sentences themselves did not
 * disappear -- they moved to the per-option profile, which is the surface with
 * room to explain WHY a value is a concern (status, origin, sources, the
 * evidence bar it missed). This row is the pointer to that: "there are three
 * things here worth opening the profile for."
 *
 * ## Why it is shared rather than written twice
 *
 * Both browse grids (`OptionListView`, `OptionBoardView`) show the same row,
 * and `summarizeOptionSignals` (`./option-profile.ts`) is the single rule that
 * decides what a strength, a concern, and an unknown are -- the same rule the
 * profile groups by. Two hand-written copies of the row could drift into
 * counting or wording the same option differently in two tabs, which is the
 * exact defect `../lib/evidence-expectation.ts` was extracted to prevent one
 * layer down.
 *
 * ## Honesty rules encoded here
 *
 * - **A zero count is omitted, never printed.** "0 concerns" reads as an
 *   achievement badge; absence of the chip is the honest rendering, and an
 *   option with nothing to count renders no row at all rather than an empty
 *   frame.
 * - **Never color-only** (docs/design-system.md: "Every status token is paired
 *   with the state's text label ... and, at the component level, an icon").
 *   Each chip carries a real noun, so the row survives greyscale, colour
 *   blindness, and a screen reader; the tone's glyph is `aria-hidden`
 *   decoration on top of that, not the signal itself.
 * - **No domain vocabulary.** "supported"/"concern"/"unknown" describe
 *   evidence state, not any pack's subject matter, so this row reads
 *   identically for a car, a heat pump, or anything else shopping-shaped.
 */
import type { AttributeDefinition, EntityRecord } from '@sift/contracts';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';
import { summarizeOptionSignals, type OptionSignalCounts } from './option-profile.js';

interface SignalChipSpec {
  key: keyof OptionSignalCounts;
  tone: StatusTone;
  /** Used when the count is exactly 1 -- "1 concerns" is a fabrication of grammar, and this component invents nothing, not even a plural. */
  singular: string;
  plural: string;
}

/**
 * Each bucket keeps the tone `OptionListView`'s deleted `INSIGHT_SECTION_TONE`
 * already assigned it, so the colour a reader learned from the old three
 * sections still means the same thing in the row that replaced them -- and all
 * three come from `activity-labels.ts`'s shared registry rather than a fourth
 * component-local colour language:
 *   - strengths -> `satisfied`: literally the "required evidence is in and
 *     sufficient" state `summarizeOptionSignals` tested for before counting it.
 *   - concerns -> `blocked`: the tone `activity-labels.ts` already gives
 *     `evidence.conflicted` ("Research disagrees") -- "needs your attention
 *     before it can be trusted", not a technical `error`.
 *   - unresolved -> `open`: nothing has happened here yet, and deliberately the
 *     quietest of the three (design-system.md: "`open` ... intentionally the
 *     quietest token").
 */
const SIGNAL_CHIPS: readonly SignalChipSpec[] = [
  { key: 'strengths', tone: 'satisfied', singular: 'supported', plural: 'supported' },
  { key: 'concerns', tone: 'blocked', singular: 'concern', plural: 'concerns' },
  { key: 'unresolved', tone: 'open', singular: 'unknown', plural: 'unknowns' },
];

export interface OptionCardSignalsProps {
  option: EntityRecord;
  /** Every definition on the case -- `summarizeOptionSignals` applies its own `appliesTo`/identity filtering, so a card must not pre-narrow this to its own prominent set or the counts would silently under-report. */
  attributeDefinitions: AttributeDefinition[];
}

export function OptionCardSignals({ option, attributeDefinitions }: OptionCardSignalsProps) {
  const counts = summarizeOptionSignals(option, attributeDefinitions);
  const chips = SIGNAL_CHIPS.map((chip) => ({ chip, count: counts[chip.key] })).filter(
    (entry) => entry.count > 0,
  );

  // Nothing countable at all (a pack whose applicable attributes are entirely
  // identity descriptors). An empty frame would imply a measurement was taken
  // and came back clean; rendering nothing says only what is true.
  if (chips.length === 0) return null;

  return (
    <ul
      data-testid={`option-card-signals-${option.id}`}
      className="m-0 flex list-none flex-wrap gap-[var(--space-1)] p-0"
    >
      {chips.map(({ chip, count }) => {
        const tone = STATUS_TONE_META[chip.tone];
        return (
          <li
            key={chip.key}
            data-testid={`option-card-signal-${chip.key}-${option.id}`}
            className="label-caps inline-flex items-center gap-[var(--space-0-5)] rounded-[var(--radius-sm)] px-[var(--space-1)] py-[var(--space-0-5)]"
            style={{ color: tone.ink, backgroundColor: tone.bg }}
          >
            <span aria-hidden="true">{tone.icon}</span>
            {`${count} ${count === 1 ? chip.singular : chip.plural}`}
          </li>
        );
      })}
    </ul>
  );
}
