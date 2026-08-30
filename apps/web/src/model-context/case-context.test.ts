/**
 * Unit tests for `case-context.ts`'s projection logic in isolation from the
 * WebMCP registration/dispatch layer (`register-sift-tools.test.ts` covers
 * the tool-call boundary; this file covers the pure `CaseState -> summary`
 * functions those tools call). Focused on docs/decisions/0006-webmcp-two-
 * way-collaboration-contract.md decision 2's widened projection: custom-
 * field definitions, bounded research, unresolved questions, stale/
 * conflicted signals, and the workspace view.
 */
import { describe, expect, it } from 'vitest';
import type { CaseExtension, CaseNote, Claim, EntityRecord, Source } from '@sift/contracts';
import { buildFixtureCaseState, buildFixtureObligation } from '../test/fixtures.js';
import {
  buildCaseContextSummary,
  buildNoteSummary,
  buildNotesSummary,
  buildOptionDetails,
  buildResearchSummary,
} from './case-context.js';

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function buildExtension(overrides: Partial<CaseExtension> = {}): CaseExtension {
  return {
    id: 'ext-1',
    caseId: 'case-1',
    definition: {
      id: 'custom.trunk_space',
      label: 'Trunk space',
      valueType: 'number',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'assertion',
      comparison: 'higher_better',
      sensitive: false,
      origin: 'user',
      reason: 'The user explicitly cares about cargo room.',
      confirmation: 'confirmed',
      proposedBy: 'user',
      createdAt: FIXED_TIMESTAMP,
    },
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-1',
    url: 'https://example.com/review',
    title: 'Independent review',
    retrievedAt: FIXED_TIMESTAMP,
    origin: 'user_submitted',
    verification: 'unverified',
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    obligationId: 'obl-1',
    statement: 'Good fuel economy.',
    stance: 'supports',
    confidence: 0.6,
    sourceIds: ['src-1'],
    stale: false,
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildNote(overrides: Partial<CaseNote> = {}): CaseNote {
  return {
    id: 'note-1',
    body: 'The seat position felt wrong on the test drive.',
    kind: 'observation',
    origin: 'user',
    authoredBy: 'user',
    optionIds: [],
    sourceIds: [],
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildEntity(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    id: 'opt-1',
    kind: 'candidate',
    label: 'Toyota RAV4',
    attributes: {},
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

describe('buildCaseContextSummary: customFields (ADR 0006 decision 2)', () => {
  it("projects a case extension's DEFINITION -- label, reason, origin, confirmation -- closing the gap where only the VALUE leaked through options[].attributes", () => {
    const caseState = buildFixtureCaseState({ caseExtensions: [buildExtension()] });
    const summary = buildCaseContextSummary(caseState);

    expect(summary.customFields.items).toEqual([
      {
        id: 'custom.trunk_space',
        label: 'Trunk space',
        valueType: 'number',
        reason: 'The user explicitly cares about cargo room.',
        origin: 'user',
        confirmation: 'confirmed',
      },
    ]);
    expect(summary.customFields.total).toBe(1);
  });

  it('bounds customFields and reports the true total when there are more than the cap', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      buildExtension({
        id: `ext-${i}`,
        definition: {
          ...buildExtension().definition,
          id: `custom.field_${i}` as `custom.${string}`,
        },
      }),
    );
    const caseState = buildFixtureCaseState({ caseExtensions: many });
    const summary = buildCaseContextSummary(caseState);

    expect(summary.customFields.total).toBe(60);
    expect(summary.customFields.items.length).toBeLessThan(60);
  });
});

describe('buildCaseContextSummary: research (bounded, no oversized excerpt bodies)', () => {
  it('projects source titles/publishers, never a raw excerpt body', () => {
    const caseState = buildFixtureCaseState({
      sources: [buildSource({ publisher: 'Car and Driver', excerpt: 'x'.repeat(4999) })],
      claims: [buildClaim()],
    });
    const summary = buildCaseContextSummary(caseState);

    expect(summary.research.sources.items).toEqual([
      {
        id: 'src-1',
        title: 'Independent review',
        publisher: 'Car and Driver',
        url: 'https://example.com/review',
        origin: 'user_submitted',
        verification: 'unverified',
        retrievedAt: FIXED_TIMESTAMP,
      },
    ]);
    expect(summary.research.sources.items[0]).not.toHaveProperty('excerpt');
    expect(summary.research.totalClaims).toBe(1);
  });

  it('orders sources most-recently-submitted first within the bound', () => {
    const caseState = buildFixtureCaseState({
      sources: [
        buildSource({ id: 'src-1', title: 'First' }),
        buildSource({ id: 'src-2', title: 'Second' }),
      ],
    });
    const summary = buildCaseContextSummary(caseState);

    expect(summary.research.sources.items.map((s) => s.id)).toEqual(['src-2', 'src-1']);
  });
});

describe('buildCaseContextSummary: unresolvedQuestions', () => {
  it('includes real obligation question text for open/active/blocked obligations, ordered by priority descending, and excludes satisfied/accepted_uncertainty', () => {
    const caseState = buildFixtureCaseState({
      obligations: [
        buildFixtureObligation({
          id: 'obl-low',
          status: 'open',
          priority: 1,
          question: 'Low priority?',
        }),
        buildFixtureObligation({
          id: 'obl-high',
          status: 'active',
          priority: 10,
          question: 'High priority?',
        }),
        buildFixtureObligation({ id: 'obl-satisfied', status: 'satisfied', priority: 5 }),
        buildFixtureObligation({
          id: 'obl-uncertain',
          status: 'accepted_uncertainty',
          priority: 5,
        }),
      ],
    });
    const summary = buildCaseContextSummary(caseState);

    expect(summary.unresolvedQuestions.items.map((q) => q.obligationId)).toEqual([
      'obl-high',
      'obl-low',
    ]);
    expect(summary.unresolvedQuestions.items[0]?.question).toBe('High priority?');
    expect(summary.unresolvedQuestions.total).toBe(2);
  });
});

describe('buildCaseContextSummary: staleOrConflicted', () => {
  it('surfaces a conflicted attribute, a stale claim, and a stale evidence link', () => {
    const entity = buildEntity({
      attributes: {
        price: {
          definitionId: 'price',
          label: 'Price',
          value: { type: 'money', amount: 28_000, currency: 'USD' },
          origin: 'user',
          sourceIds: [],
          status: 'conflicted',
          updatedAt: FIXED_TIMESTAMP,
        },
      },
    });
    const caseState = buildFixtureCaseState({
      entities: [entity],
      claims: [buildClaim({ id: 'claim-stale', stale: true })],
      evidenceLinks: [
        {
          id: 'ev-1',
          obligationId: 'obl-1',
          level: 'E1',
          verdict: 'pass',
          disposition: 'included',
          summary: 'Stale evidence summary.',
          stale: true,
          createdAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
        },
      ],
    });
    const summary = buildCaseContextSummary(caseState);

    expect(summary.staleOrConflicted.items).toEqual([
      {
        kind: 'attribute',
        id: 'opt-1:price',
        label: 'Toyota RAV4 — Price',
        entityId: 'opt-1',
        reason: 'conflicted',
      },
      {
        kind: 'claim',
        id: 'claim-stale',
        label: 'Good fuel economy.',
        entityId: undefined,
        reason: 'stale',
      },
      { kind: 'evidence', id: 'ev-1', label: 'Stale evidence summary.', reason: 'stale' },
    ]);
  });

  it('is empty when nothing is conflicted or stale', () => {
    const caseState = buildFixtureCaseState();
    const summary = buildCaseContextSummary(caseState);
    expect(summary.staleOrConflicted.items).toEqual([]);
    expect(summary.staleOrConflicted.total).toBe(0);
  });
});

describe('buildCaseContextSummary: view', () => {
  it('falls back to CaseState.view (null) when no session override is given', () => {
    const caseState = buildFixtureCaseState();
    const summary = buildCaseContextSummary(caseState);
    expect(summary.view).toBeNull();
  });

  it('prefers the sessionView override over CaseState.view', () => {
    const caseState = buildFixtureCaseState();
    const summary = buildCaseContextSummary(caseState, { mode: 'board' });
    expect(summary.view).toEqual({ mode: 'board' });
  });
});

describe('buildOptionDetails', () => {
  it('returns null for an option id that does not exist', () => {
    const caseState = buildFixtureCaseState({ entities: [] });
    expect(buildOptionDetails(caseState, 'missing')).toBeNull();
  });

  it('links claims by entityId and sources by both claim.sourceIds and the option attributes own sourceIds', () => {
    const entity = buildEntity({
      attributes: {
        price: {
          definitionId: 'price',
          label: 'Price',
          value: { type: 'money', amount: 28_000, currency: 'USD' },
          origin: 'user',
          sourceIds: ['src-2'],
          status: 'asserted',
          updatedAt: FIXED_TIMESTAMP,
        },
      },
    });
    const caseState = buildFixtureCaseState({
      entities: [entity],
      claims: [
        buildClaim({ id: 'claim-linked', entityId: 'opt-1', sourceIds: ['src-1'] }),
        buildClaim({ id: 'claim-unlinked' }),
      ],
      sources: [buildSource({ id: 'src-1' }), buildSource({ id: 'src-2', title: 'Price listing' })],
    });

    const details = buildOptionDetails(caseState, 'opt-1');

    expect(details?.option).toEqual(entity);
    expect(details?.relatedClaims.items.map((c) => c.id)).toEqual(['claim-linked']);
    expect(details?.relatedSources.items.map((s) => s.id).sort()).toEqual(['src-1', 'src-2']);
  });
});

describe('buildResearchSummary', () => {
  it('projects all sources and claims (bounded larger than the embedded case-context summary)', () => {
    const caseState = buildFixtureCaseState({
      sources: [buildSource({ id: 'src-1' })],
      claims: [buildClaim({ id: 'claim-1' })],
    });
    const research = buildResearchSummary(caseState);
    expect(research.sources.items).toHaveLength(1);
    expect(research.claims.items).toHaveLength(1);
  });
});

// --- sift_list_notes projection (change-set §28/§29): a note is a real,
// first-class record, deliberately NOT evidence -- these tests only prove
// the read-side projection is honest and bounded; `apps/agent`'s own
// command-service.test.ts already proves adding a note never touches
// obligations/readiness/recommendation at the reducer layer.

describe('buildNoteSummary', () => {
  it('projects every CaseNote field, including who wrote it and what it references', () => {
    const note = buildNote({
      id: 'note-1',
      body: 'Dealer said the timing belt was done at 90k.',
      kind: 'research',
      origin: 'agent_proposed',
      authoredBy: 'model',
      optionIds: ['opt-1'],
      obligationId: 'obl-1',
      sourceIds: ['src-1'],
    });
    expect(buildNoteSummary(note)).toEqual({
      id: 'note-1',
      body: 'Dealer said the timing belt was done at 90k.',
      kind: 'research',
      origin: 'agent_proposed',
      authoredBy: 'model',
      optionIds: ['opt-1'],
      obligationId: 'obl-1',
      sourceIds: ['src-1'],
      createdAt: FIXED_TIMESTAMP,
    });
  });

  it('omits obligationId entirely (not undefined) when the note names none, matching every other optional-linkage summary in this module', () => {
    const summary = buildNoteSummary(buildNote({ obligationId: undefined }));
    expect(summary).not.toHaveProperty('obligationId');
  });

  it('truncates a long body to a bounded preview, matching how buildClaimSummary bounds long free text', () => {
    const summary = buildNoteSummary(buildNote({ body: 'x'.repeat(1000) }));
    expect(summary.body.length).toBeLessThan(1000);
    expect(summary.body.endsWith('…')).toBe(true);
  });
});

describe('buildNotesSummary', () => {
  it('is empty when the case has no notes field at all (a snapshot persisted before CaseNote existed)', () => {
    const caseState = buildFixtureCaseState();
    expect(caseState.notes).toBeUndefined();
    const summary = buildNotesSummary(caseState);
    expect(summary.notes.items).toEqual([]);
    expect(summary.notes.total).toBe(0);
  });

  it('orders notes most-recently-added first within the bound', () => {
    const caseState = buildFixtureCaseState({
      notes: [
        buildNote({ id: 'note-1', body: 'First.' }),
        buildNote({ id: 'note-2', body: 'Second.' }),
      ],
    });
    const summary = buildNotesSummary(caseState);
    expect(summary.notes.items.map((n) => n.id)).toEqual(['note-2', 'note-1']);
    expect(summary.notes.total).toBe(2);
  });

  it('bounds notes and reports the true total when there are more than the cap', () => {
    const many = Array.from({ length: 60 }, (_, i) => buildNote({ id: `note-${i}` }));
    const caseState = buildFixtureCaseState({ notes: many });
    const summary = buildNotesSummary(caseState);
    expect(summary.notes.total).toBe(60);
    expect(summary.notes.items.length).toBeLessThan(60);
  });
});
