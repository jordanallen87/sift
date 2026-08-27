import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearFixtureCache,
  loadFixture,
  parseFixtureJson,
  FIXTURE_NAMES,
  type FixtureName,
} from './fixture-loader.js';

describe('FIXTURE_NAMES', () => {
  it('lists every car-purchase fixture file this loader knows how to validate', () => {
    expect([...FIXTURE_NAMES].sort()).toEqual(
      [
        'candidate-listings',
        'dealer-offers',
        'household-fit',
        'household-profile',
        'ownership-assumptions',
        'safety-reliability-sources',
      ].sort(),
    );
  });
});

describe('parseFixtureJson (pure validation, no disk I/O)', () => {
  it('parses and validates real candidate-listings content', () => {
    const raw = JSON.stringify({
      _provenance: 'fictional',
      caseId: 'case-demo-car-purchase',
      candidates: [
        {
          candidateId: 'candidate-rav4',
          make: 'Toyota',
          model: 'RAV4',
          modelYear: 2022,
          trim: 'XLE Hybrid AWD',
          bodyStyle: 'compact crossover SUV',
          drivetrain: 'AWD',
          powertrain: 'hybrid',
          advertisedPrice: { amount: 27995, currency: 'USD' },
          mileage: { value: 28400, unit: 'mi' },
          exteriorColor: 'Lunar Rock',
          vin: 'FICTIONAL-VIN-RAV4-0001',
          listingSourceUrl: 'https://motors.example.com/listings/x',
          listingId: 'listing-104822',
          dealerName: 'Example Motors of Northfield',
          listedAt: '2026-08-02',
          standardFeatures: ['all-wheel drive'],
        },
      ],
    });
    const result = parseFixtureJson('candidate-listings', raw);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.candidateId).toBe('candidate-rav4');
  });

  it('rejects malformed JSON', () => {
    expect(() => parseFixtureJson('candidate-listings', '{not json')).toThrow(/not valid JSON/);
  });

  it('rejects content that fails schema validation', () => {
    const raw = JSON.stringify({ _provenance: 'x', caseId: 'x', candidates: [{ missing: true }] });
    expect(() => parseFixtureJson('candidate-listings', raw)).toThrow(/schema validation/);
  });

  it('rejects content exceeding the defensive size bound', () => {
    const raw = JSON.stringify({
      _provenance: 'x'.repeat(3_000_000),
      caseId: 'x',
      candidates: [],
    });
    expect(() => parseFixtureJson('candidate-listings', raw)).toThrow(/exceeds/);
  });

  it('accepts content exactly at the defensive size bound', () => {
    // Pad the schema's unbounded `_provenance` field (rather than adding an
    // unrecognized key, which the strict schema would reject on its own
    // merits) so the payload lands just under 2,000,000 bytes -- proving the
    // size check's boundary is inclusive (<=), not exclusive.
    const base = { _provenance: '', caseId: 'x', candidates: [] as unknown[] };
    const overhead = JSON.stringify(base).length;
    const padded = { ...base, _provenance: 'x'.repeat(2_000_000 - overhead) };
    const raw = JSON.stringify(padded);
    expect(Buffer.byteLength(raw, 'utf8')).toBeLessThanOrEqual(2_000_000);
    expect(() => parseFixtureJson('candidate-listings', raw)).not.toThrow();
  });

  it('throws for a fixture name with no registered schema', () => {
    expect(() => parseFixtureJson('not-a-real-fixture' as unknown as FixtureName, '{}')).toThrow(
      /no registered schema/,
    );
  });

  it('parses and validates real dealer-offers content, including the RAV4 teaser-price conflict shape', () => {
    const raw = JSON.stringify({
      _provenance: 'fictional',
      caseId: 'case-demo-car-purchase',
      sharedTaxAndFeeAssumptions: {
        salesTaxRate: 0.07,
        salesTaxBasis: 'basis note',
        titleAndRegistrationFee: { amount: 275, currency: 'USD' },
      },
      offers: [
        {
          candidateId: 'candidate-rav4',
          dealerName: 'Example Motors of Northfield',
          quotedAt: '2026-08-19',
          hasTeaserPriceConflict: true,
          advertisedPrice: { amount: 27995, currency: 'USD' },
          advertisedFinancingExample: { description: 'x', apr: 0.049, termMonths: 60 },
          mandatoryAddOns: [
            {
              id: 'addon-value-protection-package',
              label: 'Value Protection Package',
              amount: 2395,
              currency: 'USD',
              mandatory: true,
              note: 'not removable',
            },
          ],
          actualFinancingOffer: {
            description: 'x',
            apr: 0.0749,
            termMonths: 75,
            note: 'longer term',
          },
          priceBreakdown: {
            advertisedPrice: 27995,
            mandatoryAddOnsTotal: 2894,
            subtotalBeforeTax: 30889,
            taxableBase: 30390,
            salesTax: 2127.3,
            titleAndRegistrationFee: 275,
            trueOutTheDoorPrice: 33291.3,
            arithmeticNote: 'x',
          },
          teaserGap: {
            advertisedPrice: 27995,
            trueOutTheDoorPrice: 33291.3,
            gapAmount: 5296.3,
            gapPercentOfAdvertised: 18.92,
            arithmeticNote: 'x',
            exceedsHouseholdMaxBudget: true,
            householdMaxBudget: 32000,
            amountOverBudget: 1291.3,
          },
          downPaymentAssumed: { amount: 3000, currency: 'USD' },
          amountFinanced: 30291.3,
          estimatedMonthlyPayment: {
            underAdvertisedTerms: { amount: 470.54, currency: 'USD', basis: 'x' },
            underActualOfferedTerms: { amount: 507.0, currency: 'USD', basis: 'x' },
            note: 'x',
          },
        },
      ],
    });
    const result = parseFixtureJson('dealer-offers', raw);
    expect(result.offers[0]?.teaserGap.exceedsHouseholdMaxBudget).toBe(true);
  });

  const validSafetyFixtureBase = {
    _provenance: 'fictional',
    caseId: 'case-demo-car-purchase',
    sources: [
      {
        sourceId: 'source-a',
        publisherName: 'Publisher A',
        reportTitle: 'Report A',
        url: 'https://example.com/a',
        retrievedAt: '2026-08-15',
        publishedAt: '2026-01-01',
      },
      {
        sourceId: 'source-b',
        publisherName: 'Publisher B',
        reportTitle: 'Report B',
        url: 'https://example.com/b',
        retrievedAt: '2026-08-15',
        publishedAt: '2026-01-01',
      },
    ],
  };

  it('rejects a safety-reliability-sources finding that cites an undeclared sourceId', () => {
    const raw = JSON.stringify({
      ...validSafetyFixtureBase,
      findings: [
        {
          candidateId: 'candidate-rav4',
          sourceId: 'source-does-not-exist',
          category: 'crash_safety',
          rating: 'Top',
          notes: 'x',
        },
      ],
      disagreements: [],
    });
    expect(() => parseFixtureJson('safety-reliability-sources', raw)).toThrow(
      /references unknown sourceId/,
    );
  });

  it('rejects a safety-reliability-sources disagreement that cites an undeclared sourceIdA/sourceIdB', () => {
    const raw = JSON.stringify({
      ...validSafetyFixtureBase,
      findings: [],
      disagreements: [
        {
          candidateId: 'candidate-outback',
          category: 'reliability',
          sourceIdA: 'source-a',
          ratingA: 'Above',
          sourceIdB: 'source-does-not-exist',
          ratingB: 'Below',
          natureOfConflict: 'x',
          requiresSourceChallengeReview: true,
        },
      ],
    });
    expect(() => parseFixtureJson('safety-reliability-sources', raw)).toThrow(
      /references unknown sourceIdB/,
    );
  });

  it('accepts a safety-reliability-sources fixture where every reference resolves', () => {
    const raw = JSON.stringify({
      ...validSafetyFixtureBase,
      findings: [
        {
          candidateId: 'candidate-rav4',
          sourceId: 'source-a',
          category: 'crash_safety',
          rating: 'Top',
          notes: 'x',
        },
      ],
      disagreements: [
        {
          candidateId: 'candidate-outback',
          category: 'reliability',
          sourceIdA: 'source-a',
          ratingA: 'Above',
          sourceIdB: 'source-b',
          ratingB: 'Below',
          natureOfConflict: 'x',
          requiresSourceChallengeReview: true,
        },
      ],
    });
    expect(() => parseFixtureJson('safety-reliability-sources', raw)).not.toThrow();
  });
});

describe('loadFixture (disk I/O + caching)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pax-fixture-loader-'));
  });

  afterEach(() => {
    clearFixtureCache();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeValidCandidateListings(dir: string): void {
    writeFileSync(
      join(dir, 'candidate-listings.json'),
      JSON.stringify({
        _provenance: 'fictional',
        caseId: 'case-demo-car-purchase',
        candidates: [],
      }),
    );
  }

  it('loads and validates the real, checked-in car-purchase fixtures from disk', () => {
    const listings = loadFixture('candidate-listings');
    expect(listings.candidates.map((candidate) => candidate.candidateId).sort()).toEqual([
      'candidate-crv',
      'candidate-cx5',
      'candidate-outback',
      'candidate-rav4',
    ]);

    const offers = loadFixture('dealer-offers');
    expect(offers.offers).toHaveLength(4);
    // listing-reader.ts's list-all path relies on every listing having a
    // matching offer (and vice versa) without a defensive runtime check;
    // this is the assertion that backs that judgment call.
    expect(offers.offers.map((offer) => offer.candidateId).sort()).toEqual(
      listings.candidates.map((candidate) => candidate.candidateId).sort(),
    );

    const ownership = loadFixture('ownership-assumptions');
    expect(Object.keys(ownership.perCandidate).sort()).toEqual([
      'candidate-crv',
      'candidate-cx5',
      'candidate-outback',
      'candidate-rav4',
    ]);

    const safety = loadFixture('safety-reliability-sources');
    expect(safety.sources.length).toBeGreaterThan(0);
    expect(safety.disagreements).toHaveLength(1);

    const fit = loadFixture('household-fit');
    expect(Object.keys(fit.candidates).sort()).toEqual([
      'candidate-crv',
      'candidate-cx5',
      'candidate-outback',
      'candidate-rav4',
    ]);

    const profile = loadFixture('household-profile');
    expect(profile.householdId).toBe('household-demo-car-01');
  });

  it('caches by fixture name: repeated calls return the identical object reference', () => {
    const first = loadFixture('candidate-listings');
    const second = loadFixture('candidate-listings');
    expect(second).toBe(first);
  });

  it('caches independently per baseDir so tests using a temp directory never collide with the real fixtures', () => {
    writeValidCandidateListings(tempDir);
    const real = loadFixture('candidate-listings');
    const fromTemp = loadFixture('candidate-listings', { baseDir: tempDir });
    expect(fromTemp).not.toBe(real);
    expect(fromTemp.candidates).toEqual([]);
  });

  it('clearFixtureCache forces a fresh read/parse producing a new object reference', () => {
    writeValidCandidateListings(tempDir);
    const first = loadFixture('candidate-listings', { baseDir: tempDir });
    clearFixtureCache();
    const second = loadFixture('candidate-listings', { baseDir: tempDir });
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('throws a descriptive error when the fixture file does not exist on disk', () => {
    expect(() => loadFixture('candidate-listings', { baseDir: tempDir })).toThrow(/failed to read/);
  });

  it('propagates a schema validation failure for a malformed fixture file on disk', () => {
    writeFileSync(join(tempDir, 'candidate-listings.json'), JSON.stringify({ bogus: true }));
    expect(() => loadFixture('candidate-listings', { baseDir: tempDir })).toThrow(
      /schema validation/,
    );
  });

  it('propagates malformed JSON on disk as a descriptive error', () => {
    writeFileSync(join(tempDir, 'candidate-listings.json'), '{not json');
    expect(() => loadFixture('candidate-listings', { baseDir: tempDir })).toThrow(/not valid JSON/);
  });
});
