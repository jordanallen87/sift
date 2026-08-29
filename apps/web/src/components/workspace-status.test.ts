import { describe, expect, it } from 'vitest';
import type { DecisionProposal, Recommendation } from '@pax/contracts';
import { deriveWorkspaceStatus, type WorkspaceStatusInput } from './workspace-status.js';

function buildRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    status: 'ready',
    rationale: 'Test rationale.',
    facts: [],
    hypotheses: [],
    limitations: [],
    sourceIds: [],
    optionId: 'candidate-1',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  } as Recommendation;
}

function buildProposal(overrides: Partial<DecisionProposal> = {}): DecisionProposal {
  return {
    id: 'proposal-1',
    recommendationId: 'rec-1',
    status: 'pending',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  } as DecisionProposal;
}

function buildInput(overrides: Partial<WorkspaceStatusInput> = {}): WorkspaceStatusInput {
  return {
    hasEvents: false,
    isRunActive: false,
    recommendation: null,
    proposal: null,
    flaggedFindingsCount: 0,
    ...overrides,
  };
}

function stageState(status: ReturnType<typeof deriveWorkspaceStatus>, stage: string) {
  return status.stages.find((s) => s.stage === stage)?.state;
}

describe('deriveWorkspaceStatus', () => {
  it('a fresh case with nothing started shows the open next step and stage 1 as current', () => {
    const status = deriveWorkspaceStatus(buildInput());
    expect(status.nextStep).toEqual({
      tone: 'open',
      text: "Nothing's been looked into yet.",
      action: { label: 'Request investigation' },
    });
    expect(stageState(status, 'started')).toBe('current');
    expect(stageState(status, 'investigating')).toBe('upcoming');
    expect(stageState(status, 'pick-ready')).toBe('upcoming');
    expect(stageState(status, 'decided')).toBe('upcoming');
  });

  it('a genuinely active run shows the active next step, not the open one', () => {
    const status = deriveWorkspaceStatus(buildInput({ isRunActive: true, hasEvents: true }));
    expect(status.nextStep.tone).toBe('active');
    expect(status.nextStep.action).toBeUndefined();
    expect(stageState(status, 'investigating')).toBe('current');
  });

  it('singular vs plural finding count in the flagged-findings next step', () => {
    const one = deriveWorkspaceStatus(buildInput({ hasEvents: true, flaggedFindingsCount: 1 }));
    expect(one.nextStep.text).toBe('1 finding may need a closer look before Pax can finish.');
    const three = deriveWorkspaceStatus(buildInput({ hasEvents: true, flaggedFindingsCount: 3 }));
    expect(three.nextStep.text).toBe('3 findings may need a closer look before Pax can finish.');
    expect(three.nextStep.action).toEqual({ label: 'Review findings' });
  });

  it('a pending proposal wins over flagged findings and marks every earlier stage done', () => {
    const status = deriveWorkspaceStatus(
      buildInput({
        hasEvents: true,
        recommendation: buildRecommendation({ status: 'ready' }),
        proposal: buildProposal({ status: 'pending' }),
        flaggedFindingsCount: 2,
      }),
    );
    expect(status.nextStep.tone).toBe('ready');
    expect(status.nextStep.action).toEqual({ label: 'Go to Our pick' });
    expect(stageState(status, 'started')).toBe('done');
    expect(stageState(status, 'investigating')).toBe('done');
    expect(stageState(status, 'pick-ready')).toBe('done');
    expect(stageState(status, 'decided')).toBe('current');
  });

  it('a settled proposal marks every stage done and falls through to the calm state', () => {
    const status = deriveWorkspaceStatus(
      buildInput({
        hasEvents: true,
        recommendation: buildRecommendation({ status: 'ready' }),
        proposal: buildProposal({ status: 'approved' }),
      }),
    );
    expect(status.nextStep).toEqual({
      tone: 'calm',
      text: "You're all caught up. Pax will let you know if anything changes.",
    });
    expect(stageState(status, 'decided')).toBe('done');
  });

  it('a reopened case (stale recommendation after new evidence) reverts pick-ready to current', () => {
    const status = deriveWorkspaceStatus(
      buildInput({
        hasEvents: true,
        recommendation: buildRecommendation({ status: 'stale' }),
        proposal: null,
      }),
    );
    expect(stageState(status, 'investigating')).toBe('done');
    expect(stageState(status, 'pick-ready')).toBe('current');
    expect(stageState(status, 'decided')).toBe('upcoming');
  });

  it('all four stages have a state for every possible input', () => {
    const status = deriveWorkspaceStatus(buildInput());
    expect(status.stages).toHaveLength(4);
    expect(status.stages.map((s) => s.stage)).toEqual([
      'started',
      'investigating',
      'pick-ready',
      'decided',
    ]);
  });
});
