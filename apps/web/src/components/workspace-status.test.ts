import { describe, expect, it } from 'vitest';
import type { DecisionProposal, PublicActivityEvent, Recommendation } from '@sift/contracts';
import {
  deriveActiveRunId,
  deriveWorkspaceStatus,
  type WorkspaceStatusInput,
} from './workspace-status.js';

function buildRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    status: 'ready',
    rationale: 'Test rationale.',
    facts: [],
    hypotheses: [],
    limitations: [],
    sourceIds: [],
    favoredOptionId: null,
    confidence: 0.8,
    resolvedObligationIds: [],
    acceptedUncertaintyObligationIds: [],
    generatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildProposal(overrides: Partial<DecisionProposal> = {}): DecisionProposal {
  return {
    id: 'proposal-1',
    recommendationId: 'rec-1',
    status: 'pending',
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildInput(overrides: Partial<WorkspaceStatusInput> = {}): WorkspaceStatusInput {
  return {
    isRunActive: false,
    recommendation: null,
    proposal: null,
    flaggedFindingsCount: 0,
    ...overrides,
  };
}

describe('deriveWorkspaceStatus', () => {
  it('a fresh case with nothing started reaches the not_started phase with a request-investigation action', () => {
    const status = deriveWorkspaceStatus(buildInput());
    expect(status).toEqual({
      phase: 'not_started',
      headline: "Nothing's been looked into yet.",
      action: { label: 'Request investigation', kind: 'request_investigation' },
    });
  });

  it('a genuinely active run reaches the investigating phase, not not_started', () => {
    const status = deriveWorkspaceStatus(buildInput({ isRunActive: true }));
    expect(status.phase).toBe('investigating');
    expect(status.headline).toBe('Sift is investigating.');
    expect(status.action).toBeUndefined();
  });

  it('singular vs plural finding count in the ready_blocked detail text', () => {
    const one = deriveWorkspaceStatus(buildInput({ flaggedFindingsCount: 1 }));
    expect(one.phase).toBe('ready_blocked');
    expect(one.detail).toBe('1 finding may need a closer look before Sift can finish.');
    const three = deriveWorkspaceStatus(buildInput({ flaggedFindingsCount: 3 }));
    expect(three.detail).toBe('3 findings may need a closer look before Sift can finish.');
    expect(three.action).toEqual({ label: 'Review findings', kind: 'review_findings' });
  });

  it('a withheld draft with no recommendation yet reaches ready_blocked with the "Not ready yet" headline', () => {
    const status = deriveWorkspaceStatus(buildInput({ withheld: true }));
    expect(status.phase).toBe('ready_blocked');
    expect(status.headline).toBe('Not ready yet');
    // No flagged findings were supplied, so no review-findings action --
    // the withheld recommendation's own concrete reasons render from
    // `RecommendationCard`'s `withheld` prop, not duplicated here.
    expect(status.action).toBeUndefined();
  });

  it('falls back to the generic "Current recommendation" headline when the favoured option cannot be named', () => {
    const status = deriveWorkspaceStatus(
      buildInput({ recommendation: buildRecommendation({ status: 'ready' }) }),
    );
    expect(status.phase).toBe('ready_blocked');
    expect(status.headline).toBe('Current recommendation');
  });

  it('names the leading option in the headline once the caller can resolve its label', () => {
    // The answer-first region (ADR 0004) must state the answer. A completed
    // investigation favouring the RAV4 used to render the words "Current
    // recommendation" with the car named nowhere above the fold -- the one
    // phase that actually had an answer was the only one whose headline did
    // not say it. Found by `pnpm test:journey` (ADR 0014).
    const status = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        favoredOptionLabel: '2022 Toyota RAV4 XLE Hybrid AWD',
      }),
    );
    expect(status.phase).toBe('ready_blocked');
    expect(status.headline).toBe('Leading so far: 2022 Toyota RAV4 XLE Hybrid AWD');
  });

  it('says "Leading so far", never "Our pick", while readiness is still blocked', () => {
    // change-set §38: readiness is by definition not earned in this phase,
    // so the headline names the answer without claiming it is settled.
    const status = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        favoredOptionLabel: '2022 Honda CR-V EX-L AWD',
        flaggedFindingsCount: 3,
      }),
    );
    expect(status.headline).not.toMatch(/our pick/i);
    expect(status.headline).toContain('2022 Honda CR-V EX-L AWD');
  });

  it('ignores a blank label rather than rendering a dangling "Leading so far:"', () => {
    const status = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        favoredOptionLabel: '   ',
      }),
    );
    expect(status.headline).toBe('Current recommendation');
  });

  it('a pending proposal reaches pending_approval and wins over flagged findings', () => {
    const status = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        proposal: buildProposal({ status: 'pending' }),
        flaggedFindingsCount: 2,
      }),
    );
    expect(status.phase).toBe('pending_approval');
    expect(status.headline).toBe('Sift has a recommendation ready for your decision.');
    // No redundant action -- see below.
    // No redundant action -- ApprovalCard's own Approve/Reject/Revise
    // controls are the real next action, rendered directly in the hero.
    expect(status.action).toBeUndefined();
  });

  it('names the option a person is being asked to decide about', () => {
    // Being asked to approve something the screen does not name is the
    // sharpest form of the same defect: the decision is the whole point of
    // this phase.
    const status = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        proposal: buildProposal({ status: 'pending' }),
        favoredOptionLabel: '2022 Honda CR-V EX-L AWD',
      }),
    );
    expect(status.headline).toBe('Sift recommends 2022 Honda CR-V EX-L AWD.');
    expect(status.detail).toBe('Your decision.');
  });

  it.each([
    ['approved', 'Decided.'],
    ['rejected', 'Rejected. Sift can keep looking if you want another recommendation.'],
    ['revision_requested', 'Revision requested. Sift will bring back an updated recommendation.'],
  ] as const)(
    'a settled proposal (%s) reaches the decided phase with its own headline',
    (settledStatus, expectedHeadline) => {
      const status = deriveWorkspaceStatus(
        buildInput({
          recommendation: buildRecommendation({ status: 'ready' }),
          proposal: buildProposal({ status: settledStatus }),
        }),
      );
      expect(status.phase).toBe('decided');
      expect(status.headline).toBe(expectedHeadline);
      expect(status.action).toBeUndefined();
      // The verdict travels with the phase so the region's own status chip
      // can state it rather than re-deriving "is this case still awaiting a
      // human" from `recommendation.status`, which stays `'ready'` forever
      // after the decision (the stale "READY FOR REVIEW" chip on a decided
      // case, `RecommendationHero.test.tsx`).
      expect(status.settledDecision).toBe(settledStatus);
    },
  );

  it.each(['not_started', 'investigating', 'ready_blocked', 'pending_approval'] as const)(
    'carries no verdict in the %s phase, where none has been rendered',
    (phase) => {
      const inputs: Record<typeof phase, WorkspaceStatusInput> = {
        not_started: buildInput(),
        investigating: buildInput({ isRunActive: true }),
        ready_blocked: buildInput({ recommendation: buildRecommendation({ status: 'ready' }) }),
        pending_approval: buildInput({
          recommendation: buildRecommendation({ status: 'ready' }),
          proposal: buildProposal({ status: 'pending' }),
        }),
      };
      const status = deriveWorkspaceStatus(inputs[phase]);
      expect(status.phase).toBe(phase);
      expect(status.settledDecision).toBeUndefined();
    },
  );

  it('a decided case takes priority even while flagged findings or an active run are also present', () => {
    const status = deriveWorkspaceStatus(
      buildInput({
        recommendation: buildRecommendation({ status: 'ready' }),
        proposal: buildProposal({ status: 'approved' }),
        flaggedFindingsCount: 5,
        isRunActive: true,
      }),
    );
    expect(status.phase).toBe('decided');
  });
});

describe('deriveActiveRunId', () => {
  function buildActivityEvent(
    overrides: Partial<PublicActivityEvent> = {},
  ): PublicActivityEvent {
    return {
      schemaVersion: '1.0',
      eventId: 'evt-1',
      sequence: 1,
      timestamp: '2026-08-27T00:00:00.000Z',
      caseId: 'case-1',
      type: 'run.queued',
      phase: 'queued',
      summary: 'Investigation queued.',
      ...overrides,
    };
  }

  /**
   * The real shape `run-service.ts` + `car-purchase-engine.ts` emit: a
   * `run.queued` carrying both ids, then run-correlated events carrying only
   * the `runId`, then one terminal run-lifecycle event.
   */
  function buildRun(runId: string, startSequence: number): PublicActivityEvent[] {
    const steps: Pick<PublicActivityEvent, 'type' | 'phase'>[] = [
      { type: 'run.queued', phase: 'queued' },
      { type: 'run.started', phase: 'active' },
      { type: 'specialist.started', phase: 'active' },
      { type: 'skill.activated', phase: 'completed' },
      { type: 'tool.started', phase: 'active' },
      { type: 'tool.completed', phase: 'completed' },
      { type: 'specialist.completed', phase: 'completed' },
    ];
    return steps.map((step, index) =>
      buildActivityEvent({
        eventId: `${runId}-evt-${String(index)}`,
        sequence: startSequence + index,
        runId,
        ...step,
      }),
    );
  }

  it('reports no active run for a case with no events at all', () => {
    expect(deriveActiveRunId([])).toBeNull();
  });

  it('reports no active run when no event carries a runId (seeding and presentation-only commands are not runs)', () => {
    const events = [
      buildActivityEvent({
        eventId: 'evt-created',
        sequence: 1,
        commandId: 'cmd-start',
        type: 'command.accepted',
        phase: 'completed',
      }),
    ];
    expect(deriveActiveRunId(events)).toBeNull();
  });

  it('stays active on every event of a run, including the ones that report phase "completed" while the run continues', () => {
    // The defect this function replaced: `tool.completed`,
    // `skill.activated` and `specialist.completed` all carry
    // `phase: 'completed'` mid-run, so a "latest event's phase" test flipped
    // the whole workspace back to "nothing has happened" on every one of
    // them. Asserted at EVERY prefix, not only the final one -- checking the
    // end state alone passes on the broken derivation.
    const run = buildRun('run-1', 1);
    for (let length = 1; length <= run.length; length += 1) {
      expect(deriveActiveRunId(run.slice(0, length))).toBe('run-1');
    }
  });

  it('ends the run at a terminal run.completed event', () => {
    const run = [
      ...buildRun('run-1', 1),
      buildActivityEvent({
        eventId: 'run-1-done',
        sequence: 99,
        runId: 'run-1',
        type: 'run.completed',
        phase: 'completed',
      }),
    ];
    expect(deriveActiveRunId(run)).toBeNull();
  });

  it('ends the run at a terminal run.failed event that follows run.queued directly (a refused investigation never reaches run.started)', () => {
    const events = [
      buildActivityEvent({ eventId: 'evt-q', sequence: 1, runId: 'run-1', commandId: 'cmd-1' }),
      buildActivityEvent({
        eventId: 'evt-f',
        sequence: 2,
        runId: 'run-1',
        type: 'run.failed',
        phase: 'failed',
      }),
    ];
    expect(deriveActiveRunId(events)).toBeNull();
  });

  it('is unaffected by arrival order: a terminal event delivered out of sequence order still ends its run', () => {
    const run = buildRun('run-1', 1);
    const terminal = buildActivityEvent({
      eventId: 'run-1-done',
      sequence: 99,
      runId: 'run-1',
      type: 'run.completed',
      phase: 'completed',
    });
    expect(deriveActiveRunId([terminal, ...run])).toBeNull();
  });

  it('follows the newest run: a second run queued after the first completed is active again', () => {
    const events = [
      ...buildRun('run-1', 1),
      buildActivityEvent({
        eventId: 'run-1-done',
        sequence: 8,
        runId: 'run-1',
        type: 'run.completed',
        phase: 'completed',
      }),
      ...buildRun('run-2', 9),
    ];
    expect(deriveActiveRunId(events)).toBe('run-2');
  });

  it('does not let a run that died without a terminal event pin the workspace once a newer run has finished', () => {
    const events = [
      ...buildRun('run-abandoned', 1),
      ...buildRun('run-2', 20),
      buildActivityEvent({
        eventId: 'run-2-done',
        sequence: 30,
        runId: 'run-2',
        type: 'run.completed',
        phase: 'completed',
      }),
    ];
    expect(deriveActiveRunId(events)).toBeNull();
  });
});
