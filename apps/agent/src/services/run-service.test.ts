import { beforeEach, describe, expect, it } from 'vitest';
import type { CaseEvent } from '@pax/contracts';
import type { Clock, IdGenerator } from '@pax/core';
import { InMemoryActivityStore } from '../store/activity-store.js';
import { MemoryCaseStore } from '../store/memory-case-store.js';
import { MemoryRunStore, RunService } from './run-service.js';

const now = '2026-08-27T00:00:00.000Z';

const fixedClock: Clock = { now: () => now };

function idGeneratorFrom(values: readonly string[]): IdGenerator {
  let index = 0;
  return {
    next: (prefix?: string) => {
      const value = values[index];
      index += 1;
      if (value === undefined) {
        throw new Error('idGenerator exhausted');
      }
      return prefix !== undefined ? `${prefix}-${value}` : value;
    },
  };
}

function caseCreatedEvent(caseId: string): CaseEvent {
  return {
    eventId: `${caseId}-ev-1`,
    caseId,
    sequence: 1,
    timestamp: now,
    type: 'case.created',
    payload: {
      title: 'Choose Our Next Car',
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: '0'.repeat(64),
        selectedBy: 'user',
        reasons: ['Selected from the launcher'],
      },
    },
  };
}

function obligationUpdatedEvent(
  caseId: string,
  sequence: number,
  obligationId: string,
  overrides: Partial<{ status: 'open' | 'satisfied'; dependsOn: string[] }> = {},
): CaseEvent {
  return {
    eventId: `${caseId}-ev-${sequence}`,
    caseId,
    sequence,
    timestamp: now,
    type: 'obligation.updated',
    payload: {
      obligation: {
        id: obligationId,
        label: 'Hard constraints',
        question: 'Which cars satisfy hard constraints?',
        category: 'constraints',
        required: true,
        priority: 10,
        requiredEvidenceLevel: 'E1',
        maxAttempts: 2,
        acceptedUncertaintyAllowed: false,
        dependsOn: overrides.dependsOn ?? [],
        preferredSkills: [],
        preferredSpecialists: [],
        completionRule: {
          minimumEvidenceLevel: 'E1',
          minimumIndependentSources: 1,
          acceptedUncertaintyAllowed: false,
        },
        origin: 'pack',
        status: overrides.status ?? 'open',
        attemptsUsed: 0,
        updatedAt: now,
      },
    },
  };
}

describe('RunService.requestInvestigation', () => {
  let caseStore: MemoryCaseStore;
  let activityStore: InMemoryActivityStore;
  let runStore: MemoryRunStore;
  let service: RunService;

  beforeEach(() => {
    caseStore = new MemoryCaseStore();
    activityStore = new InMemoryActivityStore();
    runStore = new MemoryRunStore();
    service = new RunService({
      caseStore,
      activityStore,
      runStore,
      clock: fixedClock,
      idGenerator: idGeneratorFrom(['run-1', 'run-2']),
    });
    caseStore.append(
      'case-1',
      [caseCreatedEvent('case-1'), obligationUpdatedEvent('case-1', 2, 'obligation-1')],
      0,
    );
  });

  it('creates a queued run, records it durably, and returns a RunReceipt (success)', () => {
    const result = service.requestInvestigation('cmd-1', {
      caseId: 'case-1',
      expectedSequence: 2,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.value.runId).toBe('run-run-1');
    expect(result.value.caseId).toBe('case-1');
    expect(result.value.acceptedSequence).toBe(2);
    expect(result.value.snapshot?.id).toBe('case-1');
  });

  it('selects the highest-priority open obligation when obligationId is omitted', () => {
    const result = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');

    const activity = activityStore.replayFrom('case-1', 0);
    expect(activity).toHaveLength(1);
    expect(activity[0]?.type).toBe('run.queued');
    expect(activity[0]?.obligationId).toBe('obligation-1');
  });

  it('accepts an explicit obligationId that exists on the case', () => {
    const result = service.requestInvestigation('cmd-1', {
      caseId: 'case-1',
      obligationId: 'obligation-1',
      expectedSequence: 2,
    });
    expect(result.status).toBe('ok');
  });

  it('rejects invalid input (validation)', () => {
    const result = service.requestInvestigation('cmd-1', { caseId: '', expectedSequence: -1 });
    expect(result.status).toBe('validation');
  });

  it('rejects an obligationId that does not exist on the case (validation)', () => {
    const result = service.requestInvestigation('cmd-1', {
      caseId: 'case-1',
      obligationId: 'does-not-exist',
      expectedSequence: 2,
    });
    expect(result.status).toBe('validation');
  });

  it('rejects when no obligation is selectable (validation)', () => {
    caseStore.append(
      'case-1',
      [obligationUpdatedEvent('case-1', 3, 'obligation-1', { status: 'satisfied' })],
      2,
    );
    const result = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 3 });
    expect(result.status).toBe('validation');
  });

  it('returns not_found for a case that does not exist', () => {
    const result = service.requestInvestigation('cmd-1', {
      caseId: 'missing',
      expectedSequence: 0,
    });
    expect(result.status).toBe('not_found');
  });

  it('returns conflict (with the latest snapshot) for a stale expectedSequence', () => {
    const result = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 1 });
    expect(result.status).toBe('conflict');
    if (result.status !== 'conflict') throw new Error('expected conflict');
    expect(result.actualSequence).toBe(2);
    expect(result.snapshot.eventSequence).toBe(2);
  });

  it('is idempotent: retrying the same commandId returns the original RunReceipt without creating a second run', () => {
    const first = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') throw new Error('expected ok');

    const second = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 });
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') throw new Error('expected ok');
    expect(second.value.runId).toBe(first.value.runId);

    // Only one run.queued activity event exists -- the retry did not create a second run.
    expect(activityStore.replayFrom('case-1', 0)).toHaveLength(1);
  });

  it('throws (real integrity violation, not a ServiceFailure) if an idempotency record references a case that no longer exists', () => {
    const first = service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 });
    expect(first.status).toBe('ok');

    caseStore.resetDemo('case-1');

    expect(() =>
      service.requestInvestigation('cmd-1', { caseId: 'case-1', expectedSequence: 2 }),
    ).toThrow(
      /idempotency record for commandId "cmd-1" references case "case-1", which no longer exists/,
    );
  });
});
