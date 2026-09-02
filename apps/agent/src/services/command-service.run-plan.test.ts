/**
 * The seam that makes the RunPlan *continuous*: a command that changes what
 * Sift should be working on tells the plan so, and names the thing that
 * changed.
 *
 * This is tested separately from the main `command-service.test.ts` because
 * it is about one narrow question — which commands are plan-affecting, and
 * what cause each reports — and that question is easier to keep honest in a
 * file that asserts nothing else.
 *
 * The important negative: a command that changes nothing about the work
 * (setting a view, focusing an option) must not notify the plan at all.
 * Otherwise every click would mint a plan version and the one revision that
 * carries the product's argument would be lost in the noise.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { CaseEvent } from '@sift/contracts';
import type { Clock, IdGenerator } from '@sift/core';
import { InMemoryActivityStore } from '../store/activity-store.js';
import { MemoryCaseStore } from '../store/memory-case-store.js';
import { CommandService } from './command-service.js';
import { createRegistryWithSyntheticPack, FIXED_NOW } from '../fixtures/synthetic-pack.js';
import type { RunPlanRevisionCause } from '../runtime/run-plan.js';

const CASE_ID = 'case-1';

const clock: Clock = { now: () => FIXED_NOW };

function sequentialIds(): IdGenerator {
  let index = 0;
  return {
    next: (prefix?: string) => {
      index += 1;
      return `${prefix ?? 'id'}-${String(index)}`;
    },
  };
}

interface RecordedRevision {
  caseId: string;
  cause: RunPlanRevisionCause;
}

function harness() {
  const caseStore = new MemoryCaseStore();
  const activityStore = new InMemoryActivityStore();
  const revisions: RecordedRevision[] = [];
  const service = new CommandService({
    caseStore,
    activityStore,
    registry: createRegistryWithSyntheticPack(),
    clock,
    idGenerator: sequentialIds(),
    runPlanRevisor: {
      revisePlan: (caseId: string, cause: RunPlanRevisionCause) => {
        revisions.push({ caseId, cause });
        return undefined;
      },
    },
  });
  return { caseStore, service, revisions };
}

function caseCreated(): CaseEvent {
  return {
    eventId: 'ev-created',
    caseId: CASE_ID,
    sequence: 1,
    timestamp: FIXED_NOW,
    type: 'case.created',
    payload: {
      title: 'Vehicle Selection',
      mode: 'companion',
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: '0'.repeat(64),
        selectedBy: 'user',
        reasons: [],
      },
    },
  };
}

function optionUpserted(sequence: number, entityId: string): CaseEvent {
  return {
    eventId: `ev-${String(sequence)}`,
    caseId: CASE_ID,
    sequence,
    timestamp: FIXED_NOW,
    type: 'option.upserted',
    payload: {
      entity: {
        id: entityId,
        kind: 'candidate',
        label: entityId.toUpperCase(),
        attributes: {},
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      },
    },
  };
}

describe('CommandService notifies the RunPlan about plan-affecting changes', () => {
  let context: ReturnType<typeof harness>;

  beforeEach(() => {
    context = harness();
    context.caseStore.append(CASE_ID, [caseCreated(), optionUpserted(2, 'rav4')], 0);
  });

  it('reports a triage change, naming the candidate the person judged', () => {
    const snapshot = context.caseStore.load(CASE_ID);
    const result = context.service.setCandidateDisposition('cmd-1', {
      caseId: CASE_ID,
      expectedSequence: snapshot?.eventSequence ?? 0,
      actor: 'human',
      entityId: 'rav4',
      disposition: 'keep',
    });

    expect(result.status).toBe('ok');
    // The label travels alongside the id, so the person-facing summary can
    // name the candidate without leaking its id.
    expect(context.revisions).toEqual([
      {
        caseId: CASE_ID,
        cause: { reason: 'triage_changed', trigger: 'rav4', triggerLabel: 'RAV4' },
      },
    ]);
  });

  it('reports a discovery change, naming the topic that changed', () => {
    const snapshot = context.caseStore.load(CASE_ID);
    const result = context.service.updateDiscovery('cmd-2', {
      caseId: CASE_ID,
      expectedSequence: snapshot?.eventSequence ?? 0,
      actor: 'human',
      operations: [{ op: 'confirm', topicId: 'car.use_case', valueSummary: 'family' }],
    });

    expect(result.status).toBe('ok');
    expect(context.revisions).toEqual([
      {
        caseId: CASE_ID,
        cause: {
          reason: 'discovery_changed',
          trigger: 'car.use_case',
          triggerLabel: 'What it is for',
        },
      },
    ]);
  });

  it('does not notify the plan when a command only changes what is on screen', () => {
    const snapshot = context.caseStore.load(CASE_ID);
    const result = context.service.setView('cmd-3', {
      caseId: CASE_ID,
      expectedSequence: snapshot?.eventSequence ?? 0,
      view: { mode: 'quick_pick' },
    });

    expect(result.status).toBe('ok');
    expect(context.revisions).toEqual([]);
  });

  it('does not notify the plan when the command was rejected', () => {
    // A stale `expectedSequence` means nothing about the case changed, so
    // nothing about the plan can have changed either.
    const result = context.service.setCandidateDisposition('cmd-4', {
      caseId: CASE_ID,
      expectedSequence: 999,
      actor: 'human',
      entityId: 'rav4',
      disposition: 'keep',
    });

    expect(result.status).not.toBe('ok');
    expect(context.revisions).toEqual([]);
  });

  it('works with no revisor wired at all, so the plan stays optional', () => {
    const caseStore = new MemoryCaseStore();
    const service = new CommandService({
      caseStore,
      activityStore: new InMemoryActivityStore(),
      registry: createRegistryWithSyntheticPack(),
      clock,
      idGenerator: sequentialIds(),
    });
    caseStore.append(CASE_ID, [caseCreated(), optionUpserted(2, 'rav4')], 0);

    const snapshot = caseStore.load(CASE_ID);
    expect(
      service.setCandidateDisposition('cmd-5', {
        caseId: CASE_ID,
        expectedSequence: snapshot?.eventSequence ?? 0,
        actor: 'human',
        entityId: 'rav4',
        disposition: 'keep',
      }).status,
    ).toBe('ok');
  });
});
