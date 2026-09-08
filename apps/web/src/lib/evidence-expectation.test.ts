import { describe, expect, it } from 'vitest';
import type { AttributeDefinition, AttributeStatus, EvidenceExpectation } from '@sift/contracts';
import { isIdentityAttribute, meetsEvidenceExpectation } from './evidence-expectation.js';

function definition(overrides: Partial<AttributeDefinition>): AttributeDefinition {
  return {
    id: 'car.make',
    label: 'Make',
    valueType: 'string',
    required: true,
    appliesTo: ['car'],
    evidenceExpectation: 'source',
    comparison: 'none',
    sensitive: false,
    ...overrides,
  };
}

const STATUSES: AttributeStatus[] = ['asserted', 'supported', 'verified', 'conflicted', 'unknown'];

describe('meetsEvidenceExpectation', () => {
  // Task C6 (`docs/superpowers/plans/2026-08-30-generic-decision-workspace.md`
  // Phase C): this is the single judgment that decides whether a value reads
  // as "well supported" or "needs checking" across every option view. It was
  // written once in `QuickPickView.tsx` and copied verbatim into
  // `OptionListView.tsx` -- both copies were byte-for-byte identical
  // (confirmed directly, not assumed), so this extraction changes no
  // behavior; it only gives the judgment one tested home.

  it('never satisfies any expectation for "unknown" or "conflicted" status', () => {
    const expectations: EvidenceExpectation[] = [
      'assertion',
      'source',
      'corroborated',
      'verification',
    ];
    for (const expectation of expectations) {
      expect(meetsEvidenceExpectation('unknown', expectation)).toBe(false);
      expect(meetsEvidenceExpectation('conflicted', expectation)).toBe(false);
    }
  });

  it('"assertion" is satisfied by any resolved, non-conflicted status', () => {
    expect(meetsEvidenceExpectation('asserted', 'assertion')).toBe(true);
    expect(meetsEvidenceExpectation('supported', 'assertion')).toBe(true);
    expect(meetsEvidenceExpectation('verified', 'assertion')).toBe(true);
  });

  it('"source" and "corroborated" require at least "supported"', () => {
    expect(meetsEvidenceExpectation('asserted', 'source')).toBe(false);
    expect(meetsEvidenceExpectation('supported', 'source')).toBe(true);
    expect(meetsEvidenceExpectation('verified', 'source')).toBe(true);

    expect(meetsEvidenceExpectation('asserted', 'corroborated')).toBe(false);
    expect(meetsEvidenceExpectation('supported', 'corroborated')).toBe(true);
    expect(meetsEvidenceExpectation('verified', 'corroborated')).toBe(true);
  });

  it('"verification" requires exactly "verified"', () => {
    expect(meetsEvidenceExpectation('asserted', 'verification')).toBe(false);
    expect(meetsEvidenceExpectation('supported', 'verification')).toBe(false);
    expect(meetsEvidenceExpectation('verified', 'verification')).toBe(true);
  });

  // A full cross-product table, so a future edit to either axis (a new
  // `AttributeStatus` or `EvidenceExpectation` literal) cannot silently
  // change this judgment without a failing test naming exactly which cell
  // moved.
  it('matches the full status x expectation truth table', () => {
    const expected: Record<EvidenceExpectation, Record<AttributeStatus, boolean>> = {
      assertion: {
        asserted: true,
        supported: true,
        verified: true,
        conflicted: false,
        unknown: false,
      },
      source: {
        asserted: false,
        supported: true,
        verified: true,
        conflicted: false,
        unknown: false,
      },
      corroborated: {
        asserted: false,
        supported: true,
        verified: true,
        conflicted: false,
        unknown: false,
      },
      verification: {
        asserted: false,
        supported: false,
        verified: true,
        conflicted: false,
        unknown: false,
      },
    };

    for (const expectation of Object.keys(expected) as EvidenceExpectation[]) {
      for (const status of STATUSES) {
        expect(meetsEvidenceExpectation(status, expectation)).toBe(expected[expectation][status]);
      }
    }
  });
});

describe('isIdentityAttribute', () => {
  // Car-purchase pack examples (`packages/packs/src/car-purchase.ts`):
  // `car.make`/`car.model`/`car.trim`/`car.body_style` are plain
  // `valueType: 'string'` catalog descriptors the pack marks
  // `comparison: 'none'` -- they describe what an option IS, not how well it
  // performs, so they carry no decision-insight signal on their own.

  it('is true for a plain string field with no comparison direction', () => {
    expect(isIdentityAttribute(definition({ valueType: 'string', comparison: 'none' }))).toBe(true);
  });

  it('is false once a comparison direction is declared, even for a string field', () => {
    for (const comparison of ['lower_better', 'higher_better', 'target', 'constraint'] as const) {
      expect(isIdentityAttribute(definition({ valueType: 'string', comparison }))).toBe(false);
    }
  });

  it('is false for a non-string value type with no comparison direction -- e.g. a genuinely qualitative concern like ride comfort', () => {
    for (const valueType of [
      'number',
      'money',
      'boolean',
      'date',
      'duration',
      'enum',
      'range',
      'string_list',
      'text',
    ] as const) {
      expect(isIdentityAttribute(definition({ valueType, comparison: 'none' }))).toBe(false);
    }
  });

  it('is false for a custom.* attribute even when it is a comparison:none string -- a user only adds a custom field because it matters to their own decision', () => {
    expect(
      isIdentityAttribute(
        definition({ id: 'custom.dog_crate_fit', valueType: 'string', comparison: 'none' }),
      ),
    ).toBe(false);
  });
});
