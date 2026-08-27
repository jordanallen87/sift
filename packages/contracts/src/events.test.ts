import { describe, expect, it } from 'vitest';
import { CaseEventSchema, JsonValueSchema, PublicActivityEventSchema } from './events.js';

describe('PublicActivityEventSchema', () => {
  function valid() {
    return {
      schemaVersion: '1.0' as const,
      eventId: 'evt-1',
      sequence: 4,
      timestamp: '2026-08-27T00:00:00.000Z',
      caseId: 'case-1',
      commandId: 'cmd-1',
      runId: 'run-1',
      obligationId: 'car.deal_normalization',
      agentId: 'deal-analyst',
      type: 'evidence.accepted' as const,
      phase: 'active' as const,
      summary: 'Deal analyst found a corroborating listing.',
      safeDetails: { sourceId: 'src-1', level: 'E2' },
      debugEventId: 'debug-1',
    };
  }

  it('parses a fully populated event and a minimal one', () => {
    expect(PublicActivityEventSchema.safeParse(valid()).success).toBe(true);
    expect(
      PublicActivityEventSchema.safeParse({
        schemaVersion: '1.0',
        eventId: 'evt-1',
        sequence: 0,
        timestamp: '2026-08-27T00:00:00.000Z',
        caseId: 'case-1',
        type: 'case.snapshot',
        phase: 'completed',
        summary: 'Case created.',
      }).success,
    ).toBe(true);
  });

  it('rejects an unlisted event type', () => {
    expect(
      PublicActivityEventSchema.safeParse({ ...valid(), type: 'evidence.discovered' }).success,
    ).toBe(false);
  });

  it('rejects an unlisted phase', () => {
    expect(PublicActivityEventSchema.safeParse({ ...valid(), phase: 'pending' }).success).toBe(
      false,
    );
  });

  it('exposes exactly the type vocabulary from architecture.md', () => {
    const shape = PublicActivityEventSchema.shape.type;
    const options = shape.options as readonly string[];
    expect(options).toEqual([
      'command.accepted',
      'run.queued',
      'run.started',
      'run.completed',
      'run.failed',
      'specialist.started',
      'specialist.completed',
      'skill.activated',
      'tool.started',
      'tool.completed',
      'tool.failed',
      'intervention.guided',
      'intervention.confirmation_required',
      'evidence.accepted',
      'evidence.conflicted',
      'obligation.updated',
      'recommendation.invalidated',
      'recommendation.ready',
      'draft.withheld',
      'case.snapshot',
    ]);
  });
});

describe('JsonValueSchema', () => {
  it('parses primitives, arrays, and nested objects within the depth bound', () => {
    expect(JsonValueSchema.safeParse('x').success).toBe(true);
    expect(JsonValueSchema.safeParse(5).success).toBe(true);
    expect(JsonValueSchema.safeParse(true).success).toBe(true);
    expect(JsonValueSchema.safeParse(null).success).toBe(true);
    expect(JsonValueSchema.safeParse({ a: { b: { c: 1 } } }).success).toBe(true);
  });

  it('rejects a function value and a class instance', () => {
    expect(JsonValueSchema.safeParse(() => 1).success).toBe(false);
    expect(JsonValueSchema.safeParse(new Date()).success).toBe(false);
  });

  it('rejects recursive/unbounded JSON nested deeper than the configured bound', () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 10; i += 1) {
      deep = { nested: deep };
    }
    expect(JsonValueSchema.safeParse(deep).success).toBe(false);
  });
});

function validCaseCreatedEvent() {
  return {
    type: 'case.created' as const,
    eventId: 'evt-1',
    caseId: 'case-1',
    sequence: 0,
    timestamp: '2026-08-27T00:00:00.000Z',
    payload: {
      title: 'Choose our next family car',
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: 'a'.repeat(64),
        selectedBy: 'user' as const,
        reasons: ['User selected this Decision Pack'],
      },
    },
  };
}

describe('CaseEventSchema', () => {
  it('parses a case.created event', () => {
    const result = CaseEventSchema.safeParse(validCaseCreatedEvent());
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses an evidence.accepted event carrying an EvidenceLink and optional Claim', () => {
    const result = CaseEventSchema.safeParse({
      type: 'evidence.accepted',
      eventId: 'evt-2',
      caseId: 'case-1',
      sequence: 5,
      timestamp: '2026-08-27T00:00:00.000Z',
      commandId: 'cmd-1',
      payload: {
        evidenceLink: {
          id: 'ev-1',
          obligationId: 'car.deal_normalization',
          sourceId: 'src-1',
          level: 'E2',
          verdict: 'pass',
          disposition: 'included',
          summary: 'Corroborated by two listings.',
          stale: false,
          createdAt: '2026-08-27T00:00:00.000Z',
          updatedAt: '2026-08-27T00:00:00.000Z',
        },
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses a proposal.proposed event carrying a pending DecisionProposal', () => {
    const result = CaseEventSchema.safeParse({
      type: 'proposal.proposed',
      eventId: 'evt-3a',
      caseId: 'case-1',
      sequence: 11,
      timestamp: '2026-08-27T00:00:00.000Z',
      payload: {
        proposal: {
          id: 'proposal-1',
          recommendationId: 'rec-1',
          status: 'pending',
          createdAt: '2026-08-27T00:00:00.000Z',
        },
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses a proposal.reviewed event', () => {
    const result = CaseEventSchema.safeParse({
      type: 'proposal.reviewed',
      eventId: 'evt-3',
      caseId: 'case-1',
      sequence: 12,
      timestamp: '2026-08-27T00:00:00.000Z',
      payload: {
        proposal: {
          id: 'proposal-1',
          recommendationId: 'rec-1',
          status: 'approved',
          createdAt: '2026-08-27T00:00:00.000Z',
          reviewedAt: '2026-08-27T00:05:00.000Z',
          reviewedByActor: 'human',
        },
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an unlisted event type', () => {
    expect(
      CaseEventSchema.safeParse({ ...validCaseCreatedEvent(), type: 'case.archived' }).success,
    ).toBe(false);
  });

  it('rejects a payload shape that does not match its discriminant', () => {
    expect(
      CaseEventSchema.safeParse({
        ...validCaseCreatedEvent(),
        type: 'criteria.updated',
      }).success,
    ).toBe(false);
  });

  it('rejects an event sequence below zero', () => {
    expect(CaseEventSchema.safeParse({ ...validCaseCreatedEvent(), sequence: -1 }).success).toBe(
      false,
    );
  });
});
