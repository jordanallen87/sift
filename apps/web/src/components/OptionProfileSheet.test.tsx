/**
 * What a person can see, read, and trust in the option profile sheet.
 *
 * Two things this file guards that no other web test could:
 *
 *  1. **The `status: null` / `status: 'unknown'` distinction.** `option-
 *     profile.ts` deliberately keeps them apart ("no record at all" versus
 *     "a record that says nobody knows"), and docs/engineering-principles.md's "never fabricate"
 *     makes conflating them a real defect, not a copy nit. Both exact
 *     sentences are asserted here, in both directions, so a future edit that
 *     collapses them into one string fails loudly.
 *  2. **Pack-agnosticism.** Every fixture below is deliberately domain-free:
 *     neutral `spec.*` ids, neutral labels, a neutral `optionLabel`. If this
 *     component ever grows a hardcoded domain noun, these fixtures will not
 *     cover it up -- the same sheet has to serve a pack about anything.
 *
 * Conventions follow `FilterSheet.test.tsx`: a `props()` base builder, the
 * real contract shapes rather than hand-shaped literals, and axe over both a
 * fully-populated and an empty render.
 *
 * The profile itself is always built by calling the real
 * `deriveOptionProfile`, never hand-assembled -- a hand-written
 * `OptionProfile` could encode a shape the module never actually produces
 * (a `display` set alongside a `null` status, say), and every assertion here
 * about honest absence depends on that shape being genuine.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import type {
  AttributeDefinition,
  AttributeOrigin,
  AttributeRecord,
  AttributeStatus,
  CaseNote,
  Claim,
  EntityRecord,
  EvidenceExpectation,
  PresentationDefinition,
  Recommendation,
  Source,
} from '@sift/contracts';
import { deriveOptionProfile } from './option-profile.js';
import { OptionProfileSheet, type OptionProfileSheetProps } from './OptionProfileSheet.js';

/** The exact `Pick<CaseState, ...>` slice `deriveOptionProfile` reads, taken from the function itself so a contract change surfaces here as a type error rather than as drifting fixtures. */
type ProfileCase = Parameters<typeof deriveOptionProfile>[0];

const OPTION_ID = 'candidate-alpha';
const OPTION_KIND = 'candidate';
const TIMESTAMP = '2026-08-28T00:00:00.000Z';

function buildDefinition(
  overrides: Partial<AttributeDefinition> & Pick<AttributeDefinition, 'id' | 'label' | 'valueType'>,
): AttributeDefinition {
  return {
    required: false,
    appliesTo: [OPTION_KIND],
    evidenceExpectation: 'assertion',
    comparison: 'none',
    sensitive: false,
    ...overrides,
  };
}

/** Named separately so the "only a strength, nothing else" fixture below can be built from exactly this one definition without indexing back into `DEFINITIONS`. */
const CUSTOM_DEFINITION = buildDefinition({
  id: 'custom.fits_our_space',
  label: 'Fits our space',
  valueType: 'string',
});

/**
 * Five definitions covering every case the provenance line has to describe,
 * with no domain vocabulary anywhere:
 *
 *  - `spec.reference`      -- a plain `string`/`comparison: 'none'` field, i.e. an
 *                             IDENTITY attribute (`isIdentityAttribute`): rendered by the
 *                             profile, excluded from the signal counts.
 *  - `spec.total_outlay`   -- present but under-evidenced (asserted against a
 *                             `source` expectation) -> a concern that must explain itself.
 *  - `spec.overall_rating` -- `status: 'unknown'`: a record that records not knowing.
 *  - `spec.available_now`  -- no record at all: `status: null`.
 *  - `custom.fits_our_space` -- a `custom.*` field, verified: a strength plus the Custom marker.
 */
const DEFINITIONS: AttributeDefinition[] = [
  buildDefinition({
    id: 'spec.reference',
    label: 'Reference',
    valueType: 'string',
    evidenceExpectation: 'source',
  }),
  buildDefinition({
    id: 'spec.total_outlay',
    label: 'Total outlay',
    valueType: 'money',
    evidenceExpectation: 'source',
    comparison: 'lower_better',
  }),
  buildDefinition({
    id: 'spec.overall_rating',
    label: 'Overall rating',
    valueType: 'number',
    evidenceExpectation: 'verification',
    comparison: 'higher_better',
  }),
  buildDefinition({
    id: 'spec.available_now',
    label: 'Available now',
    valueType: 'boolean',
  }),
  CUSTOM_DEFINITION,
];

const OPTION: EntityRecord = {
  id: OPTION_ID,
  kind: OPTION_KIND,
  label: 'Alpha, the first candidate saved to this case',
  attributes: {
    'spec.reference': {
      definitionId: 'spec.reference',
      label: 'Reference',
      value: { type: 'string', value: 'REF-4821' },
      origin: 'pack',
      sourceIds: [],
      status: 'supported',
      updatedAt: TIMESTAMP,
    },
    'spec.total_outlay': {
      definitionId: 'spec.total_outlay',
      label: 'Total outlay',
      value: { type: 'money', amount: 33291.3, currency: 'USD' },
      origin: 'agent_proposed',
      sourceIds: ['source-directory'],
      confidence: 0.6,
      status: 'asserted',
      updatedAt: TIMESTAMP,
    },
    // `AttributeRecordSchema` forbids a value on an `unknown` record -- this
    // is exactly the "a record exists, and it says nobody knows" case.
    'spec.overall_rating': {
      definitionId: 'spec.overall_rating',
      label: 'Overall rating',
      origin: 'agent_proposed',
      sourceIds: [],
      status: 'unknown',
      updatedAt: TIMESTAMP,
    },
    // `spec.available_now` is deliberately absent: no record at all.
    'custom.fits_our_space': {
      definitionId: 'custom.fits_our_space',
      label: 'Fits our space',
      value: { type: 'string', value: 'Yes, with room to spare' },
      origin: 'user',
      sourceIds: [],
      confidence: 0.9,
      status: 'verified',
      updatedAt: TIMESTAMP,
    },
  },
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const PRESENTATION: PresentationDefinition = {
  optionLabel: 'Saved option',
  optionLabelPlural: 'Saved options',
  attributeGroups: [
    {
      id: 'essentials',
      label: 'The essentials',
      attributeIds: ['spec.reference', 'spec.total_outlay'],
    },
    { id: 'standing', label: 'How it stands', attributeIds: ['spec.overall_rating'] },
  ],
};

const SOURCE_WITH_PUBLISHER: Source = {
  id: 'source-directory',
  url: 'https://example.com/directory-entry',
  title: 'Directory entry for this candidate',
  publisher: 'Example Directory',
  retrievedAt: TIMESTAMP,
  origin: 'agent_discovered',
  verification: 'verified',
  createdAt: TIMESTAMP,
};

/** No `publisher` key at all -- the optional field is omitted rather than blanked, which is what a real submitted source often looks like. */
const SOURCE_WITHOUT_PUBLISHER: Source = {
  id: 'source-bulletin',
  url: 'https://example.com/bulletin',
  title: 'Regional bulletin, second quarter',
  retrievedAt: TIMESTAMP,
  origin: 'user_submitted',
  verification: 'unverified',
  createdAt: TIMESTAMP,
};

const SUPPORTING_CLAIM: Claim = {
  id: 'claim-supports',
  obligationId: 'obligation-1',
  entityId: OPTION_ID,
  statement: 'The published figure matches the directory entry.',
  stance: 'supports',
  confidence: 0.8,
  sourceIds: ['source-directory'],
  stale: false,
  createdAt: TIMESTAMP,
};

const OPPOSING_STALE_CLAIM: Claim = {
  id: 'claim-opposes',
  obligationId: 'obligation-2',
  entityId: OPTION_ID,
  statement: 'The bulletin was published before the figure was last revised.',
  stance: 'opposes',
  confidence: 0.4,
  sourceIds: ['source-bulletin'],
  stale: true,
  createdAt: TIMESTAMP,
};

const NOTE: CaseNote = {
  id: 'note-1',
  body: 'Walked the site on Saturday; the access road was clear.',
  kind: 'observation',
  origin: 'user',
  authoredBy: 'human',
  optionIds: [OPTION_ID],
  sourceIds: [],
  createdAt: TIMESTAMP,
};

const RECOMMENDATION: Recommendation = {
  id: 'recommendation-1',
  status: 'ready',
  favoredOptionId: OPTION_ID,
  rationale: 'The first candidate clears every resolved question.',
  facts: [],
  hypotheses: [],
  confidence: 0.7,
  limitations: [],
  sourceIds: [],
  resolvedObligationIds: [],
  acceptedUncertaintyObligationIds: [],
  generatedAt: TIMESTAMP,
};

function buildCase(overrides: Partial<ProfileCase> = {}): ProfileCase {
  return {
    entities: [OPTION],
    attributeDefinitions: DEFINITIONS,
    claims: [SUPPORTING_CLAIM, OPPOSING_STALE_CLAIM],
    sources: [SOURCE_WITH_PUBLISHER, SOURCE_WITHOUT_PUBLISHER],
    notes: [NOTE],
    recommendation: null,
    ...overrides,
  };
}

function buildProfile(
  caseOverrides: Partial<ProfileCase> = {},
  presentation: PresentationDefinition | null = PRESENTATION,
) {
  const profile = deriveOptionProfile(buildCase(caseOverrides), OPTION_ID, presentation);
  if (profile === null) {
    throw new Error('fixture is wrong: deriveOptionProfile found no option to profile');
  }
  return profile;
}

import { buildWorkspaceScoreboard, selectOptionRanking } from './case-scoreboard.js';
import {
  buildCarCaseState,
  buildEnergyCaseState,
  CAR_PRESENTATION,
  ENERGY_PRESENTATION,
} from '../test/scoreboard-fixtures.js';

function props(overrides: Partial<OptionProfileSheetProps> = {}): OptionProfileSheetProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    profile: buildProfile(),
    presentation: PRESENTATION,
    ...overrides,
  };
}

// The two sentences whose difference is the whole point of the provenance
// line. Written out in full here, deliberately not imported from the
// component: a test that imported the constant would still pass if both
// cases were pointed at the same string.
const NO_RECORD_SENTENCE = 'Not recorded — this case has no entry for this detail at all.';
const UNKNOWN_SENTENCE =
  'Entered as unknown — this case has an entry here, and it records that nobody knows the value yet.';

// --- Fixtures for the "state the exception, not the rule" behaviour -------

/**
 * One row's provenance, declared rather than derived, so a test can build a
 * profile with an exact repetition profile. `status: 'none'` means no
 * `AttributeRecord` at all -- the `status: null` case.
 */
interface RowSpec {
  id: string;
  status: AttributeStatus | 'none';
  origin?: AttributeOrigin;
  updatedAt?: string;
  expectation?: EvidenceExpectation;
}

/**
 * Builds a profile whose rows have exactly the declared provenance.
 *
 * Every definition is `valueType: 'number'` so none is classified as an
 * identity attribute -- that is a separate axis with its own tests, and
 * mixing it in here would make the repetition counts below depend on two
 * rules at once.
 */
function buildProvenanceProfile(specs: RowSpec[]) {
  const definitions: AttributeDefinition[] = specs.map((spec) =>
    buildDefinition({
      id: spec.id,
      label: spec.id,
      valueType: 'number',
      comparison: 'lower_better',
      evidenceExpectation: spec.expectation ?? 'source',
    }),
  );

  const attributes: EntityRecord['attributes'] = {};
  for (const spec of specs) {
    if (spec.status === 'none') continue;
    const base = {
      definitionId: spec.id,
      label: spec.id,
      origin: spec.origin ?? 'pack',
      sourceIds: [],
      updatedAt: spec.updatedAt ?? TIMESTAMP,
    };
    attributes[spec.id] =
      spec.status === 'unknown'
        ? ({ ...base, status: 'unknown' } satisfies AttributeRecord)
        : ({
            ...base,
            status: spec.status,
            value: { type: 'number', value: 1 },
          } satisfies AttributeRecord);
  }

  const profile = deriveOptionProfile(
    buildCase({
      attributeDefinitions: definitions,
      entities: [{ ...OPTION, attributes }],
      claims: [],
      sources: [],
      notes: [],
    }),
    OPTION_ID,
    // No declared groups: every row lands in one "All details" section, which
    // keeps these tests about repetition rather than about grouping.
    { optionLabel: 'Saved option', optionLabelPlural: 'Saved options', attributeGroups: [] },
  );
  if (profile === null) throw new Error('fixture is wrong: no profile');
  return profile;
}

/** N rows that would each render the byte-identical provenance -- the shape that produced the 18-times-repeated sentence in the real seeded case. */
function repeatedRows(count: number, prefix = 'spec.same'): RowSpec[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `${prefix}_${index}`,
    status: 'asserted' as const,
  }));
}

/** How many times `needle` occurs in the whole rendered sheet. */
function occurrences(needle: string): number {
  const text = screen.getByTestId('option-profile-sheet').textContent ?? '';
  return text.split(needle).length - 1;
}

const DOMINANT_STATUS_CLAUSE = 'is stated but not independently checked';

describe('OptionProfileSheet', () => {
  describe('sheet shell', () => {
    it('renders nothing when closed', () => {
      render(<OptionProfileSheet {...props({ open: false })} />);
      expect(screen.queryByTestId('option-profile-sheet')).not.toBeInTheDocument();
      expect(screen.queryByTestId('option-profile-title')).not.toBeInTheDocument();
    });

    it('renders nothing at all when no option is selected, rather than an empty shell', () => {
      render(<OptionProfileSheet {...props({ profile: null })} />);
      expect(screen.queryByTestId('option-profile-sheet')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('titles the dialog with the option label and names the kind from the pack, never a hardcoded noun', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(screen.getByTestId('option-profile-sheet')).toBeInTheDocument();
      expect(screen.getByTestId('option-profile-title')).toHaveTextContent(OPTION.label);
      expect(screen.getByRole('dialog', { name: OPTION.label })).toBeInTheDocument();
      // `PresentationDefinition.optionLabel`, verbatim.
      expect(screen.getByText(PRESENTATION.optionLabel)).toBeInTheDocument();
    });

    it('still renders before a pack resolves, falling back to a generic noun', () => {
      render(
        <OptionProfileSheet {...props({ profile: buildProfile({}, null), presentation: null })} />,
      );
      expect(screen.getByTestId('option-profile-sheet')).toBeInTheDocument();
      expect(screen.getByTestId('option-profile-title')).toHaveTextContent(OPTION.label);
      expect(screen.queryByText(PRESENTATION.optionLabel)).not.toBeInTheDocument();
    });

    it('takes no layout prop and never consults matchMedia -- the sheet primitive owns narrow-vs-wide presentation', () => {
      const matchMedia = vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      vi.stubGlobal('matchMedia', matchMedia);
      try {
        render(<OptionProfileSheet {...props()} />);
        expect(matchMedia).not.toHaveBeenCalled();
        expect(screen.getByTestId('option-profile-sheet')).toBeInTheDocument();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('favored marker', () => {
    it('says this is Sift’s current pick only when the recommendation favors it', () => {
      render(
        <OptionProfileSheet
          {...props({ profile: buildProfile({ recommendation: RECOMMENDATION }) })}
        />,
      );
      expect(screen.getByTestId('option-profile-favored')).toBeInTheDocument();
    });

    it('shows no pick marker when no recommendation favors this option', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(screen.queryByTestId('option-profile-favored')).not.toBeInTheDocument();
    });

    it('shows no pick marker when the recommendation favors a different option', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProfile({
              recommendation: { ...RECOMMENDATION, favoredOptionId: 'candidate-beta' },
            }),
          })}
        />,
      );
      expect(screen.queryByTestId('option-profile-favored')).not.toBeInTheDocument();
    });
  });

  describe('signals summary', () => {
    it('reads as sentences, not three bare numbers', () => {
      render(<OptionProfileSheet {...props()} />);
      const signals = screen.getByTestId('option-profile-signals');
      // Real counts over the fixture: `custom.fits_our_space` is verified
      // (strength); `spec.total_outlay` is asserted against a `source`
      // expectation (concern); `spec.overall_rating` and `spec.available_now`
      // have no usable value (unresolved). `spec.reference` is an identity
      // attribute and is counted in none of them.
      expect(signals).toHaveTextContent('1 detail is backed by evidence');
      expect(signals).toHaveTextContent('1 detail needs a closer look');
      expect(signals).toHaveTextContent('2 details are still unknown');
    });

    it('never renders a zero count -- an absence of concerns is not an achievement', () => {
      const onlyStrength = buildProfile({ attributeDefinitions: [CUSTOM_DEFINITION] });
      expect(onlyStrength.signals).toEqual({ strengths: 1, concerns: 0, unresolved: 0 });

      render(<OptionProfileSheet {...props({ profile: onlyStrength })} />);
      const signals = screen.getByTestId('option-profile-signals');
      expect(signals).toHaveTextContent('1 detail is backed by evidence');
      expect(signals).not.toHaveTextContent('0');
      expect(signals).not.toHaveTextContent('closer look');
      expect(signals).not.toHaveTextContent('still unknown');
    });

    it('says plainly that nothing has been recorded when every count is zero', () => {
      render(
        <OptionProfileSheet
          {...props({ profile: buildProfile({ entities: [{ ...OPTION, kind: 'unmapped' }] }) })}
        />,
      );
      expect(screen.getByTestId('option-profile-empty-signals')).toHaveTextContent(
        'Nothing has been recorded about this saved option yet.',
      );
    });
  });

  describe('attribute groups', () => {
    it('renders one section per group, in the order the profile produced them', () => {
      render(<OptionProfileSheet {...props()} />);
      const groupIds = screen
        .getAllByTestId(/^option-profile-group-/)
        .map((element) => element.dataset['testid']);
      // The pack's own two groups first, then the module's collected
      // remainder -- `spec.available_now` and `custom.fits_our_space` belong
      // to no declared group.
      expect(groupIds).toEqual([
        'option-profile-group-essentials',
        'option-profile-group-standing',
        'option-profile-group-other',
      ]);
      expect(screen.getByTestId('option-profile-group-essentials')).toHaveTextContent(
        'The essentials',
      );
    });

    it('renders one row per applicable attribute, keeping identity fields a card would drop', () => {
      render(<OptionProfileSheet {...props()} />);
      for (const definition of DEFINITIONS) {
        expect(screen.getByTestId(`option-profile-attribute-${definition.id}`)).toBeInTheDocument();
      }
      // Identity fields are excluded from the signal counts but are exactly
      // what a detail view should answer first.
      expect(screen.getByTestId('option-profile-attribute-spec.reference')).toHaveTextContent(
        'REF-4821',
      );
    });

    it('shows each value through the shared formatter', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(screen.getByTestId('option-profile-attribute-spec.total_outlay')).toHaveTextContent(
        '$33,291.30',
      );
    });

    it('reads an attribute with no value as an honest absence, never a fabricated one', () => {
      render(<OptionProfileSheet {...props()} />);
      const row = screen.getByTestId('option-profile-attribute-spec.available_now');
      expect(row).toHaveTextContent('No value recorded');
      // Nothing invented in the gap: no zero, no "N/A", no fabricated "No".
      expect(row).not.toHaveTextContent('N/A');
      expect(within(row).queryByText('No')).not.toBeInTheDocument();
    });

    it('marks a custom attribute and leaves a pack-declared one unmarked', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(
        screen.getByTestId('option-profile-attribute-custom.fits_our_space'),
      ).toHaveTextContent('Custom');
      expect(screen.getByTestId('option-profile-attribute-spec.reference')).not.toHaveTextContent(
        'Custom',
      );
      // The raw `custom.` id is never visible text.
      expect(screen.queryByText(/custom\./)).not.toBeInTheDocument();
    });

    it('says plainly when the case has no detail fields for this option at all', () => {
      render(
        <OptionProfileSheet
          {...props({ profile: buildProfile({ entities: [{ ...OPTION, kind: 'unmapped' }] }) })}
        />,
      );
      expect(screen.getByTestId('option-profile-empty-attributes')).toHaveTextContent(
        'This case has no detail fields for this saved option.',
      );
      expect(screen.queryByTestId(/^option-profile-group-/)).not.toBeInTheDocument();
    });
  });

  describe('provenance', () => {
    it('gives no record and a recorded unknown genuinely different sentences', () => {
      render(<OptionProfileSheet {...props()} />);
      const noRecord = screen.getByTestId('option-profile-attribute-status-spec.available_now');
      const recordedUnknown = screen.getByTestId(
        'option-profile-attribute-status-spec.overall_rating',
      );

      expect(noRecord).toHaveTextContent(NO_RECORD_SENTENCE);
      expect(recordedUnknown).toHaveTextContent(UNKNOWN_SENTENCE);

      // ...and neither is allowed to drift into the other's wording.
      expect(NO_RECORD_SENTENCE).not.toEqual(UNKNOWN_SENTENCE);
      expect(noRecord).not.toHaveTextContent(UNKNOWN_SENTENCE);
      expect(recordedUnknown).not.toHaveTextContent(NO_RECORD_SENTENCE);
    });

    it('describes status in plain language, never as a raw enum name', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(
        screen.getByTestId('option-profile-attribute-status-custom.fits_our_space'),
      ).toHaveTextContent('Independently verified.');
      expect(
        screen.getByTestId('option-profile-attribute-status-spec.total_outlay'),
      ).toHaveTextContent('Stated, not independently checked.');
      expect(
        screen.getByTestId('option-profile-attribute-status-spec.reference'),
      ).toHaveTextContent('Supported by evidence on file.');

      for (const rawEnum of ['asserted', 'supported', 'verified', 'agent_proposed']) {
        expect(screen.queryByText(rawEnum)).not.toBeInTheDocument();
      }
    });

    it('says who put each value in the case', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(
        screen.getByTestId('option-profile-attribute-status-spec.total_outlay'),
      ).toHaveTextContent('Recorded by Sift.');
      expect(
        screen.getByTestId('option-profile-attribute-status-custom.fits_our_space'),
      ).toHaveTextContent('Added by you.');
      expect(
        screen.getByTestId('option-profile-attribute-status-spec.reference'),
      ).toHaveTextContent('Came with this pack.');
    });

    it('shows confidence only where a record actually carries one', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(
        screen.getByTestId('option-profile-attribute-status-spec.total_outlay'),
      ).toHaveTextContent('Confidence 60%');
      expect(
        screen.getByTestId('option-profile-attribute-status-custom.fits_our_space'),
      ).toHaveTextContent('Confidence 90%');
      // `spec.reference`'s record has no `confidence` key -- nothing may be invented for it.
      expect(
        screen.getByTestId('option-profile-attribute-status-spec.reference'),
      ).not.toHaveTextContent('Confidence');
    });

    it('shows when each record was last updated, deterministically and locale-independently', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(
        screen.getByTestId('option-profile-attribute-status-spec.reference'),
      ).toHaveTextContent('Last updated Aug 28, 2026');
    });

    it('explains what the case expects when a present value has not cleared its bar', () => {
      render(<OptionProfileSheet {...props()} />);
      // `spec.total_outlay` is `asserted` against an evidence expectation of
      // `source`, which is exactly why the summary counts it as a concern.
      expect(
        screen.getByTestId('option-profile-attribute-status-spec.total_outlay'),
      ).toHaveTextContent('This case expects a cited source before relying on it.');
      // A value that already clears its bar is not lectured about it.
      expect(
        screen.getByTestId('option-profile-attribute-status-custom.fits_our_space'),
      ).not.toHaveTextContent('This case expects');
    });

    it('links the sources an individual attribute cites', () => {
      render(<OptionProfileSheet {...props()} />);
      const status = screen.getByTestId('option-profile-attribute-status-spec.total_outlay');
      const link = within(status).getByRole('link', { name: SOURCE_WITH_PUBLISHER.title });
      expect(link).toHaveAttribute('href', SOURCE_WITH_PUBLISHER.url);
      // An attribute citing nothing does not grow an empty citation line.
      expect(
        within(screen.getByTestId('option-profile-attribute-status-spec.reference')).queryByRole(
          'link',
        ),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * The defect these guard: the first version of this sheet printed the full
   * provenance under every row, which against the real seeded case meant one
   * option rendering the same sentence 18 times and the same date 29 times --
   * the browse card's wall of near-identical lines, moved one level down.
   */
  describe('stating the provenance once instead of on every row', () => {
    it('states a shared provenance one time, not once per row', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(6),
              { id: 'spec.better', status: 'supported' },
            ]),
          })}
        />,
      );

      // Six rows would have said this; the summary says it once.
      expect(occurrences(DOMINANT_STATUS_CLAUSE)).toBe(1);
      expect(screen.getByTestId('option-profile-provenance-summary')).toHaveTextContent(
        DOMINANT_STATUS_CLAUSE,
      );
      // ...and no row repeats it underneath.
      for (const index of [0, 1, 2, 3, 4, 5]) {
        expect(
          screen.getByTestId(`option-profile-attribute-status-spec.same_${index}`),
        ).not.toHaveTextContent('Stated, not independently checked.');
      }
    });

    it('still shows the full sentence on the row that differs', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(6),
              { id: 'spec.better', status: 'supported' },
            ]),
          })}
        />,
      );
      expect(screen.getByTestId('option-profile-attribute-status-spec.better')).toHaveTextContent(
        'Supported by evidence on file.',
      );
    });

    it('states the shared date once and repeats it on no row', () => {
      render(
        <OptionProfileSheet {...props({ profile: buildProvenanceProfile(repeatedRows(6)) })} />,
      );
      expect(occurrences('Last updated')).toBe(0);
      expect(screen.getByTestId('option-profile-provenance-summary')).toHaveTextContent(
        'was last updated Aug 28, 2026',
      );
    });

    it('still shows a row its own date when that date genuinely differs', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(6),
              { id: 'spec.rechecked', status: 'asserted', updatedAt: '2026-09-14T00:00:00.000Z' },
            ]),
          })}
        />,
      );
      const rechecked = screen.getByTestId('option-profile-attribute-status-spec.rechecked');
      expect(rechecked).toHaveTextContent('Last updated Sep 14, 2026');
      // Its status matches the summary, so only the date is restated.
      expect(rechecked).not.toHaveTextContent('Stated, not independently checked.');
      expect(occurrences('Last updated')).toBe(1);
    });

    it('still shows a row its own origin when that origin genuinely differs', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(6),
              { id: 'spec.mine', status: 'asserted', origin: 'user' },
            ]),
          })}
        />,
      );
      expect(screen.getByTestId('option-profile-attribute-status-spec.mine')).toHaveTextContent(
        'Added by you.',
      );
      expect(occurrences('Came with this pack.')).toBe(0);
    });

    it('still shows a row its own evidence bar when that bar genuinely differs', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(6),
              { id: 'spec.strict', status: 'asserted', expectation: 'verification' },
            ]),
          })}
        />,
      );
      expect(screen.getByTestId('option-profile-attribute-status-spec.strict')).toHaveTextContent(
        'This case expects an independent check before relying on it.',
      );
    });

    it('keeps no record and a recorded unknown fully spelled out even when a dominant case exists', () => {
      // The extension of the guard test above: a summary line must never be
      // able to swallow either absence. Both stay, in full, and stay
      // different from each other.
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(6),
              { id: 'spec.nothing', status: 'none' },
              { id: 'spec.unknown', status: 'unknown' },
            ]),
          })}
        />,
      );
      expect(screen.getByTestId('option-profile-provenance-summary')).toBeInTheDocument();

      const noRecord = screen.getByTestId('option-profile-attribute-status-spec.nothing');
      const recordedUnknown = screen.getByTestId('option-profile-attribute-status-spec.unknown');
      expect(noRecord).toHaveTextContent(NO_RECORD_SENTENCE);
      expect(recordedUnknown).toHaveTextContent(UNKNOWN_SENTENCE);
      expect(NO_RECORD_SENTENCE).not.toEqual(UNKNOWN_SENTENCE);
      expect(noRecord).not.toHaveTextContent(UNKNOWN_SENTENCE);
      expect(recordedUnknown).not.toHaveTextContent(NO_RECORD_SENTENCE);
    });

    it('never lets an absence form the dominant case, however many there are', () => {
      // Eight unknowns and two ordinary rows: the largest group by raw count
      // is the unknowns, and it still must not become the summary.
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...Array.from({ length: 8 }, (_unused, index) => ({
                id: `spec.blank_${index}`,
                status: 'unknown' as const,
              })),
              ...repeatedRows(2),
            ]),
          })}
        />,
      );
      expect(screen.queryByTestId('option-profile-provenance-summary')).not.toBeInTheDocument();
      expect(occurrences(UNKNOWN_SENTENCE)).toBe(8);
    });

    it('prints no summary at all when the provenance is a near-even split', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(3),
              { id: 'spec.other_0', status: 'verified', origin: 'user' },
              { id: 'spec.other_1', status: 'verified', origin: 'user' },
              { id: 'spec.other_2', status: 'verified', origin: 'user' },
            ]),
          })}
        />,
      );
      // 3 of 6 is not a majority, so a legend would be true of only half the
      // rows. Every row is annotated in full instead -- verbose and correct.
      expect(screen.queryByTestId('option-profile-provenance-summary')).not.toBeInTheDocument();
      expect(occurrences('Stated, not independently checked.')).toBe(3);
      expect(occurrences('Independently verified.')).toBe(3);
    });

    it('prints no summary when it would save nothing', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(2),
              { id: 'spec.other', status: 'verified' },
            ]),
          })}
        />,
      );
      // A majority (2 of 3), but only two repetitions -- a legend a reader
      // has to hold in mind is not worth replacing two lines.
      expect(screen.queryByTestId('option-profile-provenance-summary')).not.toBeInTheDocument();
      expect(occurrences('Stated, not independently checked.')).toBe(2);
    });

    it('says what every row is in words, never by colour alone', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(6),
              { id: 'spec.better', status: 'supported' },
              { id: 'spec.sure', status: 'verified' },
              { id: 'spec.fight', status: 'conflicted' },
              { id: 'spec.unknown', status: 'unknown' },
              { id: 'spec.nothing', status: 'none' },
            ]),
          })}
        />,
      );
      const marker = (id: string) =>
        screen.getByTestId(`option-profile-attribute-status-${id}`).textContent ?? '';
      expect(marker('spec.same_0')).toContain('Stated');
      expect(marker('spec.better')).toContain('Supported');
      expect(marker('spec.sure')).toContain('Verified');
      expect(marker('spec.fight')).toContain('Disputed');
      expect(marker('spec.unknown')).toContain('Unknown');
      expect(marker('spec.nothing')).toContain('No entry');
    });

    it('is literally true of every row it covers', () => {
      // The honesty check the summary lives or dies by: read it back against
      // the real records of the rows that print nothing of their own.
      const profile = buildProvenanceProfile([
        ...repeatedRows(6),
        { id: 'spec.better', status: 'supported' },
      ]);
      render(<OptionProfileSheet {...props({ profile })} />);
      const summary = screen.getByTestId('option-profile-provenance-summary');
      expect(summary).toHaveTextContent('came with this pack');
      expect(summary).toHaveTextContent(DOMINANT_STATUS_CLAUSE);
      expect(summary).toHaveTextContent('was last updated Aug 28, 2026');

      // A covered row is one that says nothing of its own: its provenance
      // block holds the marker and not one sentence, so it is relying
      // entirely on the summary line. Identified by the absence of a full
      // stop, since every sentence and every meta line carries one and a
      // one-word marker never does.
      const covered = profile.groups
        .flatMap((group) => group.attributes)
        .filter(
          (attribute) =>
            !(
              screen.getByTestId(`option-profile-attribute-status-${attribute.definitionId}`)
                .textContent ?? ''
            ).includes('.'),
        );
      expect(covered).toHaveLength(6);
      for (const attribute of covered) {
        expect(attribute.status).toBe('asserted');
        expect(attribute.origin).toBe('pack');
        expect(attribute.updatedAt).toBe(TIMESTAMP);
      }
    });

    it('has no axe violations once a dominant case is stated', async () => {
      const { container } = render(
        <OptionProfileSheet
          {...props({
            profile: buildProvenanceProfile([
              ...repeatedRows(6),
              { id: 'spec.better', status: 'supported' },
              { id: 'spec.nothing', status: 'none' },
            ]),
          })}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  /**
   * The two halves of the optional `format` field, checked against each
   * other. A value that declares `format: 'markdown'` gets a formatted body;
   * an identical value that declares nothing gets the syntax shown verbatim.
   * The second case is the backward-compatibility guarantee the field exists
   * to give, and it is asserted here rather than assumed, because the whole
   * argument for making the field optional was that every value written
   * before it existed keeps its exact meaning.
   */
  describe('a text value that declares format: markdown', () => {
    const MARKDOWN_BODY = [
      'The rear opening is **wider than the listing suggests**.',
      '',
      '- Opening: 44 in',
      '- Load floor: 30 in',
      '',
      'Measured against [the manufacturer sheet](https://example.com/sheet).',
    ].join('\n');

    /** One profile whose single `custom.*` row carries the given text value. */
    function markdownProfile(value: { value: string; format?: 'markdown' }) {
      const definition = buildDefinition({
        id: 'custom.load_area',
        label: 'Load area',
        valueType: 'text',
      });
      return buildProfile(
        {
          attributeDefinitions: [definition],
          entities: [
            {
              ...OPTION,
              attributes: {
                'custom.load_area': {
                  definitionId: 'custom.load_area',
                  label: 'Load area',
                  value: { type: 'text', ...value },
                  origin: 'agent_proposed',
                  sourceIds: [],
                  status: 'asserted',
                  updatedAt: TIMESTAMP,
                },
              },
            },
          ],
        },
        null,
      );
    }

    it('renders the structure the model actually wrote, rather than one unbroken paragraph', () => {
      render(
        <OptionProfileSheet
          {...props({ profile: markdownProfile({ value: MARKDOWN_BODY, format: 'markdown' }) })}
        />,
      );
      const row = screen.getByTestId('option-profile-attribute-custom.load_area');
      expect(within(row).getByText('wider than the listing suggests').tagName).toBe('STRONG');
      expect(within(row).getAllByRole('listitem')).toHaveLength(2);
      const link = within(row).getByRole('link', { name: 'the manufacturer sheet' });
      expect(link).toHaveAttribute('href', 'https://example.com/sheet');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      // The syntax itself is gone from the reading surface.
      expect(row.textContent).not.toContain('**');
    });

    it('shows the same value as plain text, syntax visible and un-interpreted, when no format is declared', () => {
      const { container } = render(
        <OptionProfileSheet {...props({ profile: markdownProfile({ value: MARKDOWN_BODY }) })} />,
      );
      const row = screen.getByTestId('option-profile-attribute-custom.load_area');
      expect(row.textContent).toContain('**wider than the listing suggests**');
      expect(row.textContent).toContain('- Opening: 44 in');
      expect(within(row).queryByRole('listitem')).not.toBeInTheDocument();
      expect(within(row).queryByRole('link')).not.toBeInTheDocument();
      expect(container.querySelector('strong')).toBeNull();
    });

    it('still refuses an unsafe link and raw HTML when the markdown reaches it through a real case', () => {
      // The renderer's own suite proves this in isolation; this proves the
      // wiring did not hand the string to something else on the way in.
      const { container } = render(
        <OptionProfileSheet
          {...props({
            profile: markdownProfile({
              value: '[tap](javascript:alert) <script>alert(1)</script> ![p](https://e/x.png)',
              format: 'markdown',
            }),
          })}
        />,
      );
      const row = screen.getByTestId('option-profile-attribute-custom.load_area');
      expect(within(row).queryByRole('link')).not.toBeInTheDocument();
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
    });

    it('has no axe violations with a formatted body on a row', async () => {
      const { container } = render(
        <OptionProfileSheet
          {...props({
            profile: markdownProfile({
              value: `# Heading\n\n${MARKDOWN_BODY}`,
              format: 'markdown',
            }),
          })}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  /**
   * `Source.summary` is the submitter's OWN account of why a reference
   * matters, and is deliberately not `Source.excerpt` (a quotation FROM the
   * source). It follows the same optional-format rule as a text attribute.
   */
  describe('a source summary', () => {
    const SUMMARY = 'Why this matters: it **contradicts** the listing.';

    function withSummary(overrides: Partial<Source>) {
      return buildProfile({
        sources: [{ ...SOURCE_WITH_PUBLISHER, ...overrides }, SOURCE_WITHOUT_PUBLISHER],
      });
    }

    it('renders as markdown when the source declares summaryFormat: markdown', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: withSummary({ summary: SUMMARY, summaryFormat: 'markdown' }),
          })}
        />,
      );
      const summary = screen.getByTestId(
        `option-profile-source-summary-${SOURCE_WITH_PUBLISHER.id}`,
      );
      expect(within(summary).getByText('contradicts').tagName).toBe('STRONG');
      expect(summary.textContent).not.toContain('**');
    });

    it('renders verbatim, syntax and all, when no summaryFormat is declared', () => {
      render(<OptionProfileSheet {...props({ profile: withSummary({ summary: SUMMARY }) })} />);
      const summary = screen.getByTestId(
        `option-profile-source-summary-${SOURCE_WITH_PUBLISHER.id}`,
      );
      expect(summary).toHaveTextContent('**contradicts**');
      expect(within(summary).queryByText('contradicts')).not.toBeInTheDocument();
    });

    it('renders no summary element at all for a source that carries none', () => {
      render(<OptionProfileSheet {...props()} />);
      expect(screen.queryByTestId(/^option-profile-source-summary-/)).not.toBeInTheDocument();
    });

    it('never presents a summary as a quotation from the source', () => {
      render(
        <OptionProfileSheet
          {...props({ profile: withSummary({ summary: SUMMARY, summaryFormat: 'markdown' }) })}
        />,
      );
      const sources = screen.getByTestId('option-profile-sources');
      expect(sources.querySelector('blockquote')).toBeNull();
      expect(sources.querySelector('q')).toBeNull();
    });
  });

  describe('related findings', () => {
    it('renders each claim with its statement and stance', () => {
      render(<OptionProfileSheet {...props()} />);
      const claims = screen.getByTestId('option-profile-claims');
      expect(claims).toHaveTextContent(SUPPORTING_CLAIM.statement);
      expect(claims).toHaveTextContent('Supports');
      expect(claims).toHaveTextContent(OPPOSING_STALE_CLAIM.statement);
      expect(claims).toHaveTextContent('Opposes');
    });

    it('marks a stale claim as stale and leaves a current one unmarked', () => {
      render(<OptionProfileSheet {...props()} />);
      const claims = screen.getByTestId('option-profile-claims');
      expect(claims).toHaveTextContent('Stale');
      expect(within(claims).getAllByText('Stale')).toHaveLength(1);
    });

    it('renders every related source with its publisher, link and verification', () => {
      render(<OptionProfileSheet {...props()} />);
      const sources = screen.getByTestId('option-profile-sources');
      const link = within(sources).getByRole('link', { name: SOURCE_WITH_PUBLISHER.title });
      expect(link).toHaveAttribute('href', SOURCE_WITH_PUBLISHER.url);
      expect(sources).toHaveTextContent('Example Directory');
      expect(sources).toHaveTextContent('Verified');
    });

    it('still renders a source that has no publisher', () => {
      render(<OptionProfileSheet {...props()} />);
      const sources = screen.getByTestId('option-profile-sources');
      const link = within(sources).getByRole('link', { name: SOURCE_WITHOUT_PUBLISHER.title });
      expect(link).toHaveAttribute('href', SOURCE_WITHOUT_PUBLISHER.url);
      expect(sources).toHaveTextContent('Not verified yet');
    });

    it('renders every note attached to this option', () => {
      render(<OptionProfileSheet {...props()} />);
      const notes = screen.getByTestId('option-profile-notes');
      expect(notes).toHaveTextContent(NOTE.body);
      expect(notes).toHaveTextContent('Observation');
      expect(notes).toHaveTextContent('You');
    });
  });

  describe('empty states', () => {
    it('says nothing has been researched about this option yet', () => {
      render(<OptionProfileSheet {...props({ profile: buildProfile({ claims: [] }) })} />);
      expect(screen.getByTestId('option-profile-empty-claims')).toHaveTextContent(
        'No research has been recorded about this saved option yet.',
      );
    });

    it('says nothing here cites a source yet', () => {
      render(
        <OptionProfileSheet {...props({ profile: buildProfile({ claims: [], sources: [] }) })} />,
      );
      expect(screen.getByTestId('option-profile-empty-sources')).toHaveTextContent(
        'Nothing recorded here cites a source yet.',
      );
    });

    it('says no note mentions this option yet', () => {
      render(<OptionProfileSheet {...props({ profile: buildProfile({ notes: [] }) })} />);
      expect(screen.getByTestId('option-profile-empty-notes')).toHaveTextContent(
        'No notes mention this saved option yet.',
      );
    });

    it('gives every empty section its own wording, never one sentence reused', () => {
      render(
        <OptionProfileSheet
          {...props({
            profile: buildProfile({
              entities: [{ ...OPTION, kind: 'unmapped' }],
              claims: [],
              sources: [],
              notes: [],
            }),
          })}
        />,
      );
      const messages = screen
        .getAllByTestId(/^option-profile-empty-/)
        .map((element) => element.textContent);
      expect(messages).toHaveLength(5);
      expect(new Set(messages).size).toBe(5);
    });
  });

  describe('accessibility', () => {
    it('has no axe violations with real data in every section', async () => {
      const { container } = render(
        <OptionProfileSheet
          {...props({ profile: buildProfile({ recommendation: RECOMMENDATION }) })}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations with every section empty', async () => {
      const { container } = render(
        <OptionProfileSheet
          {...props({
            profile: buildProfile({
              entities: [{ ...OPTION, kind: 'unmapped' }],
              claims: [],
              sources: [],
              notes: [],
            }),
          })}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});

/**
 * "Why this rank" -- the deterministic scoreboard's per-criterion argument,
 * inside the sheet a person opened to find out why.
 *
 * Built from the pack-shaped scoreboard fixtures rather than this file's own
 * domain-free ones, because a breakdown is only meaningful against a real
 * criteria set -- and because the two shipped packs produce genuinely
 * different rows (a composite, a hard constraint, a criterion measuring
 * something that is not an option at all).
 */
describe('OptionProfileSheet ranking', () => {
  const CAR_SCOREBOARD = buildWorkspaceScoreboard(buildCarCaseState());
  const ENERGY_SCOREBOARD = buildWorkspaceScoreboard(buildEnergyCaseState());

  function sheetFor(
    caseState: ReturnType<typeof buildCarCaseState>,
    scoreboard: typeof CAR_SCOREBOARD,
    optionId: string,
    presentation: PresentationDefinition,
    overrides: Partial<OptionProfileSheetProps> = {},
  ) {
    const profile = deriveOptionProfile(caseState, optionId, presentation);
    if (profile === null) throw new Error(`fixture has no option ${optionId}`);
    return (
      <OptionProfileSheet
        open
        onOpenChange={vi.fn()}
        profile={profile}
        presentation={presentation}
        ranking={selectOptionRanking(scoreboard, optionId)}
        {...overrides}
      />
    );
  }

  it('explains the rank criterion by criterion', () => {
    render(sheetFor(buildCarCaseState(), CAR_SCOREBOARD, 'candidate-rav4', CAR_PRESENTATION));

    expect(screen.getByTestId('option-rank-breakdown-candidate-rav4')).toBeInTheDocument();
    expect(
      screen.getByTestId('option-rank-criterion-candidate-rav4-pref.deal_value'),
    ).toHaveTextContent('Deal value (normalized out-the-door price vs. market)');
    expect(screen.getByTestId('option-rank-position-candidate-rav4')).toHaveTextContent('#2 of 3');
  });

  it('renders no ranking section when the caller passes none', () => {
    render(
      sheetFor(buildCarCaseState(), CAR_SCOREBOARD, 'candidate-rav4', CAR_PRESENTATION, {
        ranking: null,
      }),
    );

    expect(screen.queryByTestId('option-rank-breakdown-candidate-rav4')).toBeNull();
    // ...and the rest of the sheet is untouched.
    expect(screen.getByTestId('option-profile-title')).toBeInTheDocument();
  });

  it('explains an unranked option instead of leaving the section blank', () => {
    render(sheetFor(buildCarCaseState(), CAR_SCOREBOARD, 'candidate-outback', CAR_PRESENTATION));

    expect(screen.getByTestId('option-rank-unranked-candidate-outback')).toHaveTextContent(
      /not last/i,
    );
    expect(
      screen.getByTestId('option-rank-criterion-candidate-outback-pref.ownership_cost'),
    ).toHaveTextContent(/left out of the score rather than counted against it/i);
  });

  it('renders the second pack`s rows, long labels and all', () => {
    render(
      sheetFor(buildEnergyCaseState(), ENERGY_SCOREBOARD, 'option-audit', ENERGY_PRESENTATION),
    );

    expect(
      screen.getByTestId('option-rank-criterion-label-option-audit-energy.no_emergency_risk'),
    ).toHaveTextContent('No electrical, gas, fire, or medical-equipment emergency risk');
    expect(
      screen.getByTestId('option-rank-criterion-option-audit-custom.no_consequential_action'),
    ).toHaveTextContent('Requirement');
  });

  it('has no accessibility violations with the breakdown rendered, in either pack', async () => {
    const car = render(
      sheetFor(buildCarCaseState(), CAR_SCOREBOARD, 'candidate-crv', CAR_PRESENTATION),
    );
    expect(await axe(car.container)).toHaveNoViolations();
    car.unmount();

    const energy = render(
      sheetFor(buildEnergyCaseState(), ENERGY_SCOREBOARD, 'option-audit', ENERGY_PRESENTATION),
    );
    expect(await axe(energy.container)).toHaveNoViolations();
  });
});
