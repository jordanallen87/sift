import { describe, expect, it } from 'vitest';
import type {
  CaseEvent,
  CaseState,
  Criterion,
  EvidenceLink,
  ObligationState,
} from '@sift/contracts';
import { applyCaseEvent } from './reducer.js';
import { ValidationFailedError } from './errors.js';

const PIN = {
  id: 'car-purchase',
  version: '1.0.0',
  compiledHash: 'a'.repeat(64),
  selectedBy: 'user' as const,
  reasons: ['User selected this Decision Pack'],
};

function baseEvent<T extends string>(type: T, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    eventId: `evt-${type}`,
    caseId: 'case-1',
    sequence: 1,
    timestamp: '2026-08-27T00:00:00.000Z',
    type,
    ...overrides,
  };
}

function createdEvent(): CaseEvent {
  return baseEvent('case.created', {
    sequence: 0,
    payload: { title: 'Choose our next family car', pack: PIN },
  }) as CaseEvent;
}

function freshCase(): CaseState {
  return applyCaseEvent(null, createdEvent());
}

function criterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    id: 'crit1',
    label: 'Household budget',
    kind: 'hard_constraint',
    weight: 50,
    direction: 'lower_better',
    origin: 'pack',
    status: 'active',
    ...overrides,
  };
}

function obligation(overrides: Partial<ObligationState> = {}): ObligationState {
  return {
    id: 'car.hard_constraints',
    label: 'Hard constraints',
    question: 'Which candidates satisfy the household budget and non-negotiable needs?',
    category: 'deal',
    required: true,
    priority: 10,
    requiredEvidenceLevel: 'E1',
    maxAttempts: 2,
    acceptedUncertaintyAllowed: false,
    dependsOn: [],
    preferredSkills: [],
    preferredSpecialists: [],
    completionRule: {
      minimumEvidenceLevel: 'E1',
      minimumIndependentSources: 1,
      acceptedUncertaintyAllowed: false,
    },
    origin: 'pack',
    status: 'open',
    attemptsUsed: 0,
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function evidenceLink(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id: 'ev1',
    obligationId: 'car.hard_constraints',
    level: 'E1',
    verdict: 'pass',
    disposition: 'included',
    summary: 'One source confirms the listing price.',
    stale: false,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('applyCaseEvent: case.created', () => {
  it('builds a minimal fresh CaseState from the event payload alone', () => {
    const result = applyCaseEvent(null, createdEvent());
    expect(result.id).toBe('case-1');
    expect(result.title).toBe('Choose our next family car');
    expect(result.status).toBe('draft');
    expect(result.pack).toEqual(PIN);
    expect(result.obligations).toEqual([]);
    expect(result.criteria).toEqual([]);
    expect(result.eventSequence).toBe(0);
    expect(result.createdAt).toBe('2026-08-27T00:00:00.000Z');
    expect(result.updatedAt).toBe('2026-08-27T00:00:00.000Z');
  });

  it('rejects a non-"case.created" event applied to a null caseState', () => {
    const event = baseEvent('criteria.updated', { payload: { criteria: [] } }) as CaseEvent;
    expect(() => applyCaseEvent(null, event)).toThrow(ValidationFailedError);
  });
});

describe('applyCaseEvent: existing-case dispatch', () => {
  it('rejects an event whose caseId does not match the target CaseState', () => {
    const event = baseEvent('criteria.updated', {
      caseId: 'some-other-case',
      payload: { criteria: [] },
    }) as CaseEvent;
    expect(() => applyCaseEvent(freshCase(), event)).toThrow(ValidationFailedError);
  });

  it('case.pack_selected replaces the pin and advances sequence/updatedAt', () => {
    const next = applyCaseEvent(
      freshCase(),
      baseEvent('case.pack_selected', {
        sequence: 1,
        timestamp: '2026-08-27T00:01:00.000Z',
        payload: { pack: { ...PIN, reasons: ['Routed automatically'] } },
      }) as CaseEvent,
    );
    expect(next.pack.reasons).toEqual(['Routed automatically']);
    expect(next.eventSequence).toBe(1);
    expect(next.updatedAt).toBe('2026-08-27T00:01:00.000Z');
  });

  it('option.upserted adds a new entity and updates an existing one by id', () => {
    const entity = {
      id: 'candidate-rav4',
      kind: 'candidate',
      label: 'RAV4',
      attributes: {},
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
    const withOne = applyCaseEvent(
      freshCase(),
      baseEvent('option.upserted', { sequence: 1, payload: { entity } }) as CaseEvent,
    );
    expect(withOne.entities).toHaveLength(1);

    const updated = { ...entity, label: 'RAV4 XLE' };
    const withUpdate = applyCaseEvent(
      withOne,
      baseEvent('option.upserted', {
        sequence: 2,
        payload: { entity: updated },
      }) as CaseEvent,
    );
    expect(withUpdate.entities).toHaveLength(1);
    expect(withUpdate.entities[0]?.label).toBe('RAV4 XLE');
  });

  it('option.upserted replaces the matching entity and leaves sibling entities untouched', () => {
    const rav4 = {
      id: 'candidate-rav4',
      kind: 'candidate',
      label: 'RAV4',
      attributes: {},
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
    const crv = { ...rav4, id: 'candidate-crv', label: 'CR-V' };
    const withBoth = applyCaseEvent(
      applyCaseEvent(
        freshCase(),
        baseEvent('option.upserted', { sequence: 1, payload: { entity: rav4 } }) as CaseEvent,
      ),
      baseEvent('option.upserted', { sequence: 2, payload: { entity: crv } }) as CaseEvent,
    );

    const updated = applyCaseEvent(
      withBoth,
      baseEvent('option.upserted', {
        sequence: 3,
        payload: { entity: { ...crv, label: 'CR-V EX-L' } },
      }) as CaseEvent,
    );
    expect(updated.entities).toHaveLength(2);
    expect(updated.entities.find((e) => e.id === 'candidate-rav4')?.label).toBe('RAV4');
    expect(updated.entities.find((e) => e.id === 'candidate-crv')?.label).toBe('CR-V EX-L');
  });

  it('criteria.updated replaces the whole criteria array', () => {
    const next = applyCaseEvent(
      freshCase(),
      baseEvent('criteria.updated', {
        sequence: 1,
        payload: { criteria: [criterion()] },
      }) as CaseEvent,
    );
    expect(next.criteria).toEqual([criterion()]);
  });

  it('evidence.accepted upserts the evidence link and an optional claim', () => {
    const next = applyCaseEvent(
      freshCase(),
      baseEvent('evidence.accepted', {
        sequence: 1,
        payload: { evidenceLink: evidenceLink() },
      }) as CaseEvent,
    );
    expect(next.evidenceLinks).toHaveLength(1);
    expect(next.claims).toHaveLength(0);

    const withClaim = applyCaseEvent(
      next,
      baseEvent('evidence.accepted', {
        sequence: 2,
        payload: {
          evidenceLink: evidenceLink({ id: 'ev2' }),
          claim: {
            id: 'claim1',
            obligationId: 'car.hard_constraints',
            statement: 'Listing price is $27,995.',
            stance: 'supports' as const,
            confidence: 0.9,
            sourceIds: [],
            stale: false,
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        },
      }) as CaseEvent,
    );
    expect(withClaim.evidenceLinks).toHaveLength(2);
    expect(withClaim.claims).toHaveLength(1);
  });

  it('evidence.conflicted upserts the (already re-verdicted) evidence link', () => {
    const withEvidence = applyCaseEvent(
      freshCase(),
      baseEvent('evidence.accepted', {
        sequence: 1,
        payload: { evidenceLink: evidenceLink() },
      }) as CaseEvent,
    );
    const next = applyCaseEvent(
      withEvidence,
      baseEvent('evidence.conflicted', {
        sequence: 2,
        payload: {
          evidenceLink: evidenceLink({ stale: true, verdict: 'degraded' }),
          conflictingEvidenceIds: ['ev-other'],
        },
      }) as CaseEvent,
    );
    expect(next.evidenceLinks).toHaveLength(1);
    expect(next.evidenceLinks[0]?.stale).toBe(true);
    expect(next.evidenceLinks[0]?.verdict).toBe('degraded');
  });

  it('obligation.updated upserts an obligation by id', () => {
    const withObligation = applyCaseEvent(
      freshCase(),
      baseEvent('obligation.updated', {
        sequence: 1,
        payload: { obligation: obligation() },
      }) as CaseEvent,
    );
    expect(withObligation.obligations).toHaveLength(1);
    expect(withObligation.obligations[0]?.status).toBe('open');

    const advanced = applyCaseEvent(
      withObligation,
      baseEvent('obligation.updated', {
        sequence: 2,
        payload: { obligation: obligation({ status: 'satisfied' }) },
      }) as CaseEvent,
    );
    expect(advanced.obligations).toHaveLength(1);
    expect(advanced.obligations[0]?.status).toBe('satisfied');
  });

  it('extension.defined then extension.confirmed transitions a pending extension to confirmed', () => {
    const extension = {
      id: 'ext1',
      caseId: 'case-1',
      definition: {
        id: 'custom.dog_crate_fit' as const,
        label: 'Two dog crates must fit',
        valueType: 'boolean' as const,
        required: false,
        appliesTo: ['candidate'],
        evidenceExpectation: 'verification' as const,
        comparison: 'constraint' as const,
        sensitive: false,
        origin: 'agent_proposed' as const,
        reason: 'Household requires cargo space.',
        confirmation: 'pending' as const,
        proposedBy: 'household-fit-analyst',
        createdAt: '2026-08-27T00:00:00.000Z',
      },
      createdAt: '2026-08-27T00:00:00.000Z',
    };
    const withExtension = applyCaseEvent(
      freshCase(),
      baseEvent('extension.defined', { sequence: 1, payload: { extension } }) as CaseEvent,
    );
    expect(withExtension.caseExtensions).toHaveLength(1);
    expect(withExtension.caseExtensions[0]?.definition.confirmation).toBe('pending');

    const confirmed = applyCaseEvent(
      withExtension,
      baseEvent('extension.confirmed', {
        sequence: 2,
        payload: { extensionId: 'ext1', decision: 'confirm' },
      }) as CaseEvent,
    );
    expect(confirmed.caseExtensions[0]?.definition.confirmation).toBe('confirmed');
  });

  it('extension.confirmed throws when the extension was already REJECTED (terminal), and replays cleanly over an already-confirmed one', () => {
    // ADR 0011 old->new: this used to assert that ANY already-decided
    // extension threw, using a `confirmed` one. `confirmed` is no longer
    // terminal -- a pre-authorized, model-defined extension lands confirmed,
    // so a human may still re-affirm it (idempotent) or reject it (the
    // undo), and this reducer must be able to fold both. Rejection IS still
    // terminal, so the "already decided throws" assertion moves onto the
    // state where it remains true, rather than being dropped.
    const buildExtension = (confirmation: 'confirmed' | 'rejected') => ({
      id: 'ext1',
      caseId: 'case-1',
      definition: {
        id: 'custom.dog_crate_fit' as const,
        label: 'Two dog crates must fit',
        valueType: 'boolean' as const,
        required: false,
        appliesTo: ['candidate'],
        evidenceExpectation: 'verification' as const,
        comparison: 'constraint' as const,
        sensitive: false,
        origin: 'agent_proposed' as const,
        reason: 'Household requires cargo space.',
        confirmation,
        proposedBy: 'household-fit-analyst',
        createdAt: '2026-08-27T00:00:00.000Z',
      },
      createdAt: '2026-08-27T00:00:00.000Z',
    });

    const withRejected = applyCaseEvent(
      freshCase(),
      baseEvent('extension.defined', {
        sequence: 1,
        payload: { extension: buildExtension('rejected') },
      }) as CaseEvent,
    );
    expect(() =>
      applyCaseEvent(
        withRejected,
        baseEvent('extension.confirmed', {
          sequence: 2,
          payload: { extensionId: 'ext1', decision: 'confirm' },
        }) as CaseEvent,
      ),
    ).toThrow(ValidationFailedError);

    const withConfirmed = applyCaseEvent(
      freshCase(),
      baseEvent('extension.defined', {
        sequence: 1,
        payload: { extension: buildExtension('confirmed') },
      }) as CaseEvent,
    );
    const reaffirmed = applyCaseEvent(
      withConfirmed,
      baseEvent('extension.confirmed', {
        sequence: 2,
        payload: { extensionId: 'ext1', decision: 'confirm' },
      }) as CaseEvent,
    );
    expect(reaffirmed.caseExtensions[0]?.definition.confirmation).toBe('confirmed');

    const undone = applyCaseEvent(
      withConfirmed,
      baseEvent('extension.confirmed', {
        sequence: 2,
        payload: { extensionId: 'ext1', decision: 'reject' },
      }) as CaseEvent,
    );
    expect(undone.caseExtensions[0]?.definition.confirmation).toBe('rejected');
  });

  it('extension.confirmed throws when the referenced extension does not exist', () => {
    expect(() =>
      applyCaseEvent(
        freshCase(),
        baseEvent('extension.confirmed', {
          sequence: 1,
          payload: { extensionId: 'missing', decision: 'confirm' },
        }) as CaseEvent,
      ),
    ).toThrow(ValidationFailedError);
  });

  it('recommendation.ready sets the recommendation and recommendation.invalidated marks it stale', () => {
    const recommendation = {
      id: 'rec1',
      status: 'ready' as const,
      favoredOptionId: 'candidate-rav4',
      rationale: 'Best fit given current evidence.',
      facts: [],
      hypotheses: [],
      confidence: 0.8,
      limitations: [],
      sourceIds: [],
      resolvedObligationIds: [],
      acceptedUncertaintyObligationIds: [],
      generatedAt: '2026-08-27T00:00:00.000Z',
    };
    const withRec = applyCaseEvent(
      freshCase(),
      baseEvent('recommendation.ready', { sequence: 1, payload: { recommendation } }) as CaseEvent,
    );
    expect(withRec.recommendation?.status).toBe('ready');

    const invalidated = applyCaseEvent(
      withRec,
      baseEvent('recommendation.invalidated', {
        sequence: 2,
        payload: { recommendationId: 'rec1', reason: 'Dealer offer conflicts with teaser price.' },
      }) as CaseEvent,
    );
    expect(invalidated.recommendation?.status).toBe('stale');
  });

  it('recommendation.invalidated is a no-op (idempotent) when the case has no matching recommendation', () => {
    const next = applyCaseEvent(
      freshCase(),
      baseEvent('recommendation.invalidated', {
        sequence: 1,
        payload: { recommendationId: 'rec-does-not-exist', reason: 'Replay/duplicate delivery.' },
      }) as CaseEvent,
    );
    expect(next.recommendation).toBeNull();
    expect(next.eventSequence).toBe(1);
  });

  it('proposal.proposed sets the case proposal to a pending DecisionProposal', () => {
    const next = applyCaseEvent(
      freshCase(),
      baseEvent('proposal.proposed', {
        sequence: 1,
        payload: {
          proposal: {
            id: 'prop1',
            recommendationId: 'rec1',
            status: 'pending' as const,
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        },
      }) as CaseEvent,
    );
    expect(next.proposal).toEqual({
      id: 'prop1',
      recommendationId: 'rec1',
      status: 'pending',
      createdAt: '2026-08-27T00:00:00.000Z',
    });
    expect(next.status).toBe('draft'); // proposal.proposed never advances case status by itself.
  });

  it('note.added appends a CaseNote onto an initially-absent notes array and preserves prior notes on a second append', () => {
    const note1 = {
      id: 'note-1',
      body: 'The seat position felt wrong on the test drive.',
      kind: 'observation' as const,
      origin: 'user' as const,
      authoredBy: 'user',
      optionIds: ['candidate-rav4'],
      sourceIds: [],
      createdAt: '2026-08-27T00:00:00.000Z',
    };
    const withFirstNote = applyCaseEvent(
      freshCase(),
      baseEvent('note.added', { sequence: 1, payload: { note: note1 } }) as CaseEvent,
    );
    expect(withFirstNote.notes).toEqual([note1]);

    const note2 = { ...note1, id: 'note-2', body: 'Dealer said timing belt done at 90k.' };
    const withBothNotes = applyCaseEvent(
      withFirstNote,
      baseEvent('note.added', { sequence: 2, payload: { note: note2 } }) as CaseEvent,
    );
    expect(withBothNotes.notes).toEqual([note1, note2]);
  });

  it('note.added never touches obligations, criteria, or recommendation (notes never auto-promote to evidence)', () => {
    const withReadyState = applyCaseEvent(
      applyCaseEvent(
        applyCaseEvent(
          freshCase(),
          baseEvent('criteria.updated', {
            sequence: 1,
            payload: { criteria: [criterion()] },
          }) as CaseEvent,
        ),
        baseEvent('obligation.updated', {
          sequence: 2,
          payload: { obligation: obligation() },
        }) as CaseEvent,
      ),
      baseEvent('recommendation.ready', {
        sequence: 3,
        payload: {
          recommendation: {
            id: 'rec1',
            status: 'ready' as const,
            favoredOptionId: 'candidate-rav4',
            rationale: 'Best fit given current evidence.',
            facts: [],
            hypotheses: [],
            confidence: 0.8,
            limitations: [],
            sourceIds: [],
            resolvedObligationIds: [],
            acceptedUncertaintyObligationIds: [],
            generatedAt: '2026-08-27T00:00:00.000Z',
          },
        },
      }) as CaseEvent,
    );

    const withNote = applyCaseEvent(
      withReadyState,
      baseEvent('note.added', {
        sequence: 4,
        payload: {
          note: {
            id: 'note-1',
            body: 'Just a thought.',
            kind: 'observation' as const,
            origin: 'user' as const,
            authoredBy: 'user',
            optionIds: [],
            sourceIds: [],
            createdAt: '2026-08-27T00:00:00.000Z',
          },
        },
      }) as CaseEvent,
    );

    expect(withNote.obligations).toEqual(withReadyState.obligations);
    expect(withNote.criteria).toEqual(withReadyState.criteria);
    expect(withNote.recommendation).toEqual(withReadyState.recommendation);
  });

  it('proposal.reviewed sets status to decided only on an approved proposal', () => {
    const approved = applyCaseEvent(
      freshCase(),
      baseEvent('proposal.reviewed', {
        sequence: 1,
        payload: {
          proposal: {
            id: 'prop1',
            recommendationId: 'rec1',
            status: 'approved' as const,
            createdAt: '2026-08-27T00:00:00.000Z',
            reviewedAt: '2026-08-27T00:01:00.000Z',
            reviewedByActor: 'human' as const,
          },
        },
      }) as CaseEvent,
    );
    expect(approved.status).toBe('decided');

    const rejected = applyCaseEvent(
      freshCase(),
      baseEvent('proposal.reviewed', {
        sequence: 1,
        payload: {
          proposal: {
            id: 'prop1',
            recommendationId: 'rec1',
            status: 'rejected' as const,
            createdAt: '2026-08-27T00:00:00.000Z',
            reviewedAt: '2026-08-27T00:01:00.000Z',
            reviewedByActor: 'human' as const,
          },
        },
      }) as CaseEvent,
    );
    expect(rejected.status).toBe('draft');
  });
});

describe('applyCaseEvent: adaptive discovery folds', () => {
  const AT = '2026-09-02T00:00:00.000Z';

  function topicEvent(overrides: Record<string, unknown> = {}): CaseEvent {
    return baseEvent('discovery.topic_updated', {
      sequence: 1,
      payload: {
        cause: 'response',
        topic: {
          topicId: 'vehicle.occupants',
          label: 'Who and what has to fit',
          status: 'confirmed',
          necessity: 'required',
          valueSummary: 'Two adults and two children in car seats',
          origin: 'user',
          humanConfirmed: true,
          updatedAt: AT,
        },
        ...overrides,
      },
    }) as CaseEvent;
  }

  it('creates discovery state on the first discovery event of a case that had none', () => {
    // A case with no `discovery` key is a case that has not started
    // discovery, so the first topic answered is what brings it into being.
    const next = applyCaseEvent(freshCase(), topicEvent());
    expect(next.discovery?.mode).toBe('companion');
    expect(next.discovery?.topics).toHaveLength(1);
    expect(next.discovery?.topics[0]?.topicId).toBe('vehicle.occupants');
  });

  it('replaces a topic rather than appending a second state for it', () => {
    const once = applyCaseEvent(freshCase(), topicEvent());
    const corrected = applyCaseEvent(
      once,
      baseEvent('discovery.topic_updated', {
        sequence: 2,
        payload: {
          cause: 'correction',
          topic: {
            topicId: 'vehicle.occupants',
            label: 'Who and what has to fit',
            status: 'confirmed',
            necessity: 'required',
            valueSummary: 'Two adults, two children in car seats, and a large dog',
            origin: 'user',
            humanConfirmed: true,
            updatedAt: AT,
          },
        },
      }) as CaseEvent,
    );

    expect(corrected.discovery?.topics).toHaveLength(1);
    expect(corrected.discovery?.topics[0]?.valueSummary).toMatch(/large dog/);
  });

  it('holds the interaction currently on screen and clears it when answered', () => {
    const interaction = {
      id: 'interaction-1',
      topicIds: ['vehicle.usage'],
      kind: 'free_text' as const,
      prompt: 'Anything else it has to do?',
      options: [],
      escapeHatches: {
        allowCustom: true,
        allowNone: true,
        allowUnsure: true,
        allowDefer: false,
      },
      requestedBy: 'model' as const,
      createdAt: AT,
    };

    const requested = applyCaseEvent(
      freshCase(),
      baseEvent('discovery.interaction_requested', {
        sequence: 1,
        payload: { interaction },
      }) as CaseEvent,
    );
    expect(requested.discovery?.pendingInteraction?.id).toBe('interaction-1');

    const answered = applyCaseEvent(
      requested,
      baseEvent('discovery.interaction_answered', {
        sequence: 2,
        payload: {
          response: {
            interactionId: 'interaction-1',
            respondedBy: 'human',
            selectedOptionIds: [],
            customText: 'It has to tow a small utility trailer',
            mappings: [],
            respondedAt: AT,
          },
        },
      }) as CaseEvent,
    );
    expect(answered.discovery?.pendingInteraction).toBeNull();
  });

  it('records the blind-spot review', () => {
    const next = applyCaseEvent(
      freshCase(),
      baseEvent('discovery.blind_spot_reviewed', {
        sequence: 1,
        payload: {
          review: {
            status: 'complete',
            offeredPromptIds: ['blindspot.child_seats', 'blindspot.garage_clearance'],
            selectedPromptIds: ['blindspot.child_seats'],
            acknowledgedAt: AT,
          },
        },
      }) as CaseEvent,
    );
    expect(next.discovery?.blindSpotReview.status).toBe('complete');
  });

  it('keeps only the latest disposition per candidate, so undo moves forward', () => {
    const kept = applyCaseEvent(
      freshCase(),
      baseEvent('candidate.disposition_set', {
        sequence: 1,
        payload: {
          disposition: {
            entityId: 'candidate-rav4',
            disposition: 'keep',
            previousDisposition: 'unreviewed',
            decidedAt: AT,
          },
        },
      }) as CaseEvent,
    );
    const undone = applyCaseEvent(
      kept,
      baseEvent('candidate.disposition_set', {
        sequence: 2,
        payload: {
          disposition: {
            entityId: 'candidate-rav4',
            disposition: 'unreviewed',
            previousDisposition: 'keep',
            decidedAt: AT,
          },
        },
      }) as CaseEvent,
    );

    expect(undone.discovery?.dispositions).toHaveLength(1);
    expect(undone.discovery?.dispositions[0]?.disposition).toBe('unreviewed');
    // The history is not erased -- the record still says what it replaced.
    expect(undone.discovery?.dispositions[0]?.previousDisposition).toBe('keep');
  });

  it('seeds standalone mode when the case was created in it', () => {
    const standaloneCase = applyCaseEvent(
      null,
      baseEvent('case.created', {
        sequence: 0,
        payload: { title: 'Compare two listings', pack: PIN, mode: 'standalone' },
      }) as CaseEvent,
    );
    expect(standaloneCase.discovery?.mode).toBe('standalone');
  });

  it('leaves a case with no discovery activity carrying no discovery key at all', () => {
    expect(freshCase().discovery).toBeUndefined();
  });
});
