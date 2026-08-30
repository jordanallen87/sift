import { describe, expect, it } from 'vitest';
import type { AttributeStatus, EvidenceExpectation } from '@sift/contracts';
import { meetsEvidenceExpectation } from './evidence-expectation.js';

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
