import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CaseStateSchema, DecisionProposalSchema } from '@sift/contracts';
import type {
  CaseState,
  DecisionProposal,
  ObligationState,
  ReviewProposalInput,
} from '@sift/contracts';
import {
  MODEL_PERMITTED_CHANGE_KINDS,
  MODEL_PROHIBITED_CHANGE_KINDS,
  isModelPermittedChange,
  reviewProposal,
} from './policy.js';
import type { Clock } from './policy.js';
import { PolicyViolationError, ValidationFailedError } from './errors.js';

function makeClock(iso: string): Clock {
  return { now: () => iso };
}

function makeProposal(overrides: Partial<DecisionProposal> = {}): DecisionProposal {
  return DecisionProposalSchema.parse({
    id: 'proposal-1',
    recommendationId: 'rec-1',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

function makeCaseState(overrides: Partial<CaseState> = {}): CaseState {
  return CaseStateSchema.parse({
    schemaVersion: '1.0',
    id: 'case-1',
    title: 'Test case',
    status: 'draft',
    pack: {
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: 'a'.repeat(64),
      selectedBy: 'user',
      reasons: [],
    },
    attributeDefinitions: [],
    entities: [],
    criteria: [],
    obligations: [],
    caseExtensions: [],
    claims: [],
    sources: [],
    evidenceLinks: [],
    recommendation: null,
    proposal: null,
    activeFocus: null,
    selectedOptionId: null,
    selectedEvidenceId: null,
    eventSequence: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

function makeReviewInput(overrides: Partial<ReviewProposalInput> = {}): ReviewProposalInput {
  return {
    caseId: 'case-1',
    proposalId: 'proposal-1',
    actor: 'human',
    decision: 'approve',
    expectedSequence: 0,
    ...overrides,
  };
}

const REQUIRED_OBLIGATION: ObligationState = {
  id: 'car.hard_constraints',
  label: 'Hard constraints',
  question: "Which candidates satisfy the household's budget and non-negotiable needs?",
  category: 'constraints',
  required: true,
  priority: 1,
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
  status: 'satisfied',
  attemptsUsed: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('reviewProposal: human-only policy enforcement', () => {
  it.each(['approve', 'reject', 'request_revision'] as const)(
    'rejects a non-human actor attempting decision "%s"',
    (decision) => {
      const caseState = makeCaseState({ proposal: makeProposal() });
      const input = makeReviewInput({ actor: 'agent', decision, instructions: 'fix it' });

      expect(() => reviewProposal(caseState, input, makeClock('2026-02-01T00:00:00.000Z'))).toThrow(
        PolicyViolationError,
      );
    },
  );

  it('rejects a non-human actor even when the case has no pending proposal (policy check runs first)', () => {
    const caseState = makeCaseState({ proposal: null });
    const input = makeReviewInput({ actor: 'agent' });

    expect(() => reviewProposal(caseState, input, makeClock('2026-02-01T00:00:00.000Z'))).toThrow(
      PolicyViolationError,
    );
  });

  it('does not mutate case or proposal state when rejecting a non-human actor', () => {
    const caseState = makeCaseState({ proposal: makeProposal() });
    const snapshotBefore = JSON.parse(JSON.stringify(caseState)) as unknown;

    expect(() =>
      reviewProposal(
        caseState,
        makeReviewInput({ actor: 'agent' }),
        makeClock('2026-02-01T00:00:00.000Z'),
      ),
    ).toThrow(PolicyViolationError);

    expect(caseState).toEqual(snapshotBefore);
  });

  it('property: an agent actor can never produce an approved decision, for any non-"human" actor string', () => {
    const humanLookalikes = [
      'Human',
      ' human ',
      'human-proxy',
      'HUMAN',
      'human\n',
      'huMan',
      'human ',
    ];

    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(...humanLookalikes),
          fc.string().filter((value) => value !== 'human'),
        ),
        fc.constantFrom('approve', 'reject', 'request_revision'),
        (actor, decision) => {
          const caseState = makeCaseState({ proposal: makeProposal() });
          const input = {
            ...makeReviewInput({ decision, instructions: 'fix it' }),
            actor,
          } as unknown as ReviewProposalInput;

          expect(() =>
            reviewProposal(caseState, input, makeClock('2026-02-01T00:00:00.000Z')),
          ).toThrow(PolicyViolationError);
          expect(caseState.proposal?.status).toBe('pending');
        },
      ),
    );
  });
});

describe('reviewProposal: human approval', () => {
  it('approves a pending proposal and transitions the case to decided', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ status: 'draft', proposal });
    const clock = makeClock('2026-03-01T12:00:00.000Z');

    const result = reviewProposal(caseState, makeReviewInput({ decision: 'approve' }), clock);

    expect(result.status).toBe('decided');
    expect(result.proposal).toEqual({
      ...proposal,
      status: 'approved',
      reviewedAt: '2026-03-01T12:00:00.000Z',
      reviewedByActor: 'human',
    });
    expect(result.updatedAt).toBe('2026-03-01T12:00:00.000Z');
  });

  it('persists a human reviewer-supplied reason on approval too (not reject-only)', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ status: 'draft', proposal });
    const clock = makeClock('2026-03-01T12:00:00.000Z');

    const result = reviewProposal(
      caseState,
      makeReviewInput({
        decision: 'approve',
        reason: 'We already confirmed the technician is available this week.',
      }),
      clock,
    );

    expect(result.proposal?.reviewReason).toBe(
      'We already confirmed the technician is available this week.',
    );
  });

  it('does not mutate the original case or proposal objects (pure function)', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ proposal });
    const snapshotBefore = JSON.parse(JSON.stringify(caseState)) as unknown;

    reviewProposal(
      caseState,
      makeReviewInput({ decision: 'approve' }),
      makeClock('2026-03-01T00:00:00.000Z'),
    );

    expect(caseState).toEqual(snapshotBefore);
  });

  it('leaves required obligations untouched on approval (no weakening)', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ proposal, obligations: [REQUIRED_OBLIGATION] });

    const result = reviewProposal(
      caseState,
      makeReviewInput({ decision: 'approve' }),
      makeClock('2026-03-01T00:00:00.000Z'),
    );

    expect(result.obligations).toEqual([REQUIRED_OBLIGATION]);
    expect(result.obligations[0]?.required).toBe(true);
  });
});

describe('reviewProposal: human rejection', () => {
  it('rejects a pending proposal without moving the case to decided', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ status: 'draft', proposal });

    const result = reviewProposal(
      caseState,
      makeReviewInput({ decision: 'reject', reason: 'Not enough evidence yet' }),
      makeClock('2026-03-01T00:00:00.000Z'),
    );

    expect(result.status).toBe('draft');
    expect(result.proposal?.status).toBe('rejected');
    expect(result.proposal?.reviewedByActor).toBe('human');
    expect(result.proposal?.reviewedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  // Real defect found by driving the product: `ReviewProposalInput.reason`
  // (the free-text explanation `ApprovalCard` collects and
  // `apps/web/src/app/App.tsx`'s `handleReviewProposal` genuinely sends over
  // the wire -- see that file) was validated, accepted, and then silently
  // discarded. Nothing in `@sift/contracts` had a field to hold it, this
  // function never wrote it anywhere, and no downstream layer picked it up
  // either -- despite this module's own (now-corrected) header comment
  // claiming it "remains available to whichever layer emits the narrative
  // case event later". A person who explains *why* they are declining a
  // consequential action (e.g. "we already booked our own HVAC tech") had
  // that explanation vanish the instant they submitted it: never on the
  // case, never in the activity stream, never in the Runtime Inspector.
  // `DecisionProposalSchema.reviewReason` (mirroring `EvidenceLink
  // .dispositionReason`'s identical precedent) is the fix -- this asserts
  // the human-rejection case actually keeps it.
  it('persists a human reviewer-supplied reason onto the reviewed proposal (was silently dropped)', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ status: 'draft', proposal });

    const result = reviewProposal(
      caseState,
      makeReviewInput({ decision: 'reject', reason: 'Already booked our own HVAC technician.' }),
      makeClock('2026-03-01T00:00:00.000Z'),
    );

    expect(result.proposal?.reviewReason).toBe('Already booked our own HVAC technician.');
  });

  it('leaves reviewReason unset when the reviewer supplies no reason (never fabricates one)', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ status: 'draft', proposal });

    const result = reviewProposal(
      caseState,
      makeReviewInput({ decision: 'reject' }),
      makeClock('2026-03-01T00:00:00.000Z'),
    );

    expect(result.proposal?.reviewReason).toBeUndefined();
  });
});

describe('reviewProposal: human revision request', () => {
  it('records revision instructions and sets status revision_requested', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ proposal });

    const result = reviewProposal(
      caseState,
      makeReviewInput({
        decision: 'request_revision',
        instructions: 'Add a second independent source.',
      }),
      makeClock('2026-03-01T00:00:00.000Z'),
    );

    expect(result.proposal?.status).toBe('revision_requested');
    expect(result.proposal?.revisionInstructions).toBe('Add a second independent source.');
    expect(result.status).toBe(caseState.status);
  });

  it('throws ValidationFailedError when request_revision is missing instructions', () => {
    const proposal = makeProposal();
    const caseState = makeCaseState({ proposal });
    const input = makeReviewInput({ decision: 'request_revision' });

    expect(() => reviewProposal(caseState, input, makeClock('2026-03-01T00:00:00.000Z'))).toThrow(
      ValidationFailedError,
    );
  });
});

describe('reviewProposal: validation failures', () => {
  it('throws ValidationFailedError when the case has no pending proposal', () => {
    const caseState = makeCaseState({ proposal: null });

    expect(() =>
      reviewProposal(caseState, makeReviewInput(), makeClock('2026-03-01T00:00:00.000Z')),
    ).toThrow(ValidationFailedError);
  });

  it('throws ValidationFailedError when proposalId does not match the pending proposal', () => {
    const caseState = makeCaseState({ proposal: makeProposal({ id: 'proposal-1' }) });
    const input = makeReviewInput({ proposalId: 'proposal-999' });

    expect(() => reviewProposal(caseState, input, makeClock('2026-03-01T00:00:00.000Z'))).toThrow(
      ValidationFailedError,
    );
  });

  it('throws ValidationFailedError when the proposal has already been reviewed', () => {
    const caseState = makeCaseState({
      proposal: makeProposal({
        status: 'approved',
        reviewedAt: '2026-01-02T00:00:00.000Z',
        reviewedByActor: 'human',
      }),
    });

    expect(() =>
      reviewProposal(caseState, makeReviewInput(), makeClock('2026-03-01T00:00:00.000Z')),
    ).toThrow(ValidationFailedError);
  });
});

describe('isModelPermittedChange', () => {
  it.each(MODEL_PERMITTED_CHANGE_KINDS)('permits "%s" (case/run-plan layer)', (kind) => {
    expect(isModelPermittedChange(kind)).toBe(true);
  });

  it.each(MODEL_PROHIBITED_CHANGE_KINDS)('prohibits "%s" (engine/compiled-pack layer)', (kind) => {
    expect(isModelPermittedChange(kind)).toBe(false);
  });
});
