import { describe, expect, it } from 'vitest';
import {
  ExecutionLimitsSchema,
  ExecutionRequestSchema,
  ExecutionResultSchema,
  RunPlanSchema,
  RuntimeCorrelationSchema,
  RuntimeDebugEventSchema,
} from './runtime.js';

function validObligation() {
  return {
    id: 'car.hard_constraints',
    label: 'Hard constraints',
    question: 'Which candidates satisfy budget and non-negotiable needs?',
    category: 'constraints',
    required: true,
    priority: 100,
    requiredEvidenceLevel: 'E1' as const,
    maxAttempts: 2,
    acceptedUncertaintyAllowed: false,
    dependsOn: [],
    preferredSkills: ['listing-normalizer'],
    preferredSpecialists: ['deal-analyst'],
    completionRule: {
      minimumEvidenceLevel: 'E1' as const,
      minimumIndependentSources: 1,
      acceptedUncertaintyAllowed: false,
    },
    origin: 'pack' as const,
    status: 'active' as const,
    attemptsUsed: 1,
    updatedAt: '2026-08-27T00:00:00.000Z',
  };
}

describe('ExecutionLimitsSchema', () => {
  it('parses the default hackathon bounds from strands-runtime.md', () => {
    const result = ExecutionLimitsSchema.safeParse({
      maxAttemptsPerObligation: 3,
      maxToolCallsPerRun: 12,
      maxGraphNodeExecutionsPerRun: 6,
      modelRequestTimeoutMs: 120_000,
      totalRunTimeoutMs: 300_000,
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });
});

describe('ExecutionRequestSchema', () => {
  it('parses a valid execution request', () => {
    const result = ExecutionRequestSchema.safeParse({
      runId: 'run-1',
      caseId: 'case-1',
      pack: { id: 'car-purchase', version: '1.0.0', compiledHash: 'a'.repeat(64) },
      obligation: validObligation(),
      caseSummary: {
        caseId: 'case-1',
        title: 'Choose our next family car',
        status: 'investigating',
        criteria: [],
        optionSummaries: [{ id: 'car-1', label: '2022 Honda Civic', kind: 'car' }],
        evidenceCounts: { satisfied: 1, active: 2, blocked: 0, acceptedUncertainty: 0, open: 3 },
      },
      caseExtensions: [],
      availableSkills: ['deal-analysis'],
      availableSpecialists: ['deal-analyst'],
      allowedTools: ['listing-reader'],
      priorAttempts: [
        {
          attemptNumber: 1,
          toolId: 'listing-reader',
          resultStatus: 'success',
          sourceIds: ['src-1'],
          evidenceDelta: 1,
          timestamp: '2026-08-27T00:00:00.000Z',
        },
      ],
      limits: {
        maxAttemptsPerObligation: 3,
        maxToolCallsPerRun: 12,
        maxGraphNodeExecutionsPerRun: 6,
        modelRequestTimeoutMs: 120_000,
        totalRunTimeoutMs: 300_000,
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects a request whose compiledHash is not a 64-char hex SHA-256', () => {
    const result = ExecutionRequestSchema.safeParse({
      runId: 'run-1',
      caseId: 'case-1',
      pack: { id: 'car-purchase', version: '1.0.0', compiledHash: 'not-a-hash' },
      obligation: validObligation(),
      caseSummary: {
        caseId: 'case-1',
        title: 'x',
        status: 'investigating',
        criteria: [],
        optionSummaries: [],
        evidenceCounts: { satisfied: 0, active: 0, blocked: 0, acceptedUncertainty: 0, open: 0 },
      },
      caseExtensions: [],
      availableSkills: [],
      availableSpecialists: [],
      allowedTools: [],
      priorAttempts: [],
      limits: {
        maxAttemptsPerObligation: 3,
        maxToolCallsPerRun: 12,
        maxGraphNodeExecutionsPerRun: 6,
        modelRequestTimeoutMs: 120_000,
        totalRunTimeoutMs: 300_000,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('RunPlanSchema', () => {
  it('parses a valid run plan with every step kind', () => {
    const result = RunPlanSchema.safeParse({
      obligationId: 'car.deal_normalization',
      hypothesis: 'The teaser price omits mandatory add-ons.',
      specialistIds: ['deal-analyst'],
      skillIds: ['deal-analysis'],
      toolIds: ['listing-reader'],
      orderedSteps: [
        { kind: 'tool', ref: 'listing-reader', purpose: 'Read the seeded listing.' },
        { kind: 'specialist', ref: 'deal-analyst', purpose: 'Normalize the deal terms.' },
        { kind: 'validate', ref: 'deal-analyst', purpose: 'Validate structured output.' },
        {
          kind: 'request_human_evidence',
          ref: 'car.household_fit',
          purpose: 'Ask for a test-drive observation.',
        },
      ],
      stopConditions: ['evidence level E2 reached'],
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an unlisted step kind', () => {
    const result = RunPlanSchema.safeParse({
      obligationId: 'car.deal_normalization',
      specialistIds: [],
      skillIds: [],
      toolIds: [],
      orderedSteps: [{ kind: 'model_call', ref: 'x', purpose: 'x' }],
      stopConditions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ExecutionResultSchema', () => {
  it('parses a valid execution result', () => {
    const result = ExecutionResultSchema.safeParse({
      obligationId: 'car.deal_normalization',
      disposition: 'evidence_found',
      claims: [
        {
          statement: 'The out-the-door price is $500 higher than advertised.',
          stance: 'opposes',
          confidence: 0.8,
          sourceIds: ['src-1'],
        },
      ],
      evidenceResults: [
        { sourceId: 'src-1', level: 'E2', verdict: 'pass', summary: 'Corroborated.' },
      ],
      limitations: ['Financing terms not yet confirmed.'],
      suggestedStatus: 'satisfied',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an out-of-range confidence and an unlisted disposition', () => {
    expect(
      ExecutionResultSchema.safeParse({
        obligationId: 'x',
        disposition: 'evidence_found',
        claims: [{ statement: 'x', stance: 'supports', confidence: 1.2, sourceIds: [] }],
        evidenceResults: [],
        limitations: [],
        suggestedStatus: 'satisfied',
      }).success,
    ).toBe(false);

    expect(
      ExecutionResultSchema.safeParse({
        obligationId: 'x',
        disposition: 'fabricated',
        claims: [],
        evidenceResults: [],
        limitations: [],
        suggestedStatus: 'satisfied',
      }).success,
    ).toBe(false);
  });

  it('rejects "active" as a suggestedStatus (an engine-only transitional state the model cannot suggest)', () => {
    expect(
      ExecutionResultSchema.safeParse({
        obligationId: 'x',
        disposition: 'evidence_found',
        claims: [],
        evidenceResults: [],
        limitations: [],
        suggestedStatus: 'active',
      }).success,
    ).toBe(false);
  });
});

describe('RuntimeCorrelationSchema', () => {
  it('parses a minimal and a fully populated correlation record', () => {
    expect(
      RuntimeCorrelationSchema.safeParse({ traceId: 'trace-1', caseId: 'case-1', runId: 'run-1' })
        .success,
    ).toBe(true);
    expect(
      RuntimeCorrelationSchema.safeParse({
        traceId: 'trace-1',
        spanId: 'span-1',
        parentSpanId: 'span-0',
        requestId: 'req-1',
        caseId: 'case-1',
        runId: 'run-1',
        sessionId: 'session-1',
        obligationId: 'car.deal_normalization',
        agentId: 'deal-analyst',
      }).success,
    ).toBe(true);
  });
});

describe('RuntimeDebugEventSchema', () => {
  function valid() {
    return {
      traceId: 'trace-1',
      caseId: 'case-1',
      runId: 'run-1',
      schemaVersion: '1.0' as const,
      sequence: 3,
      timestamp: '2026-08-27T00:00:00.000Z',
      category: 'tool' as const,
      name: 'listing-reader.invoke',
      phase: 'finish' as const,
      level: 'info' as const,
      durationMs: 120,
      tokenUsage: { input: 100, output: 50, total: 150 },
      estimatedCostUsd: 0.002,
      summary: 'listing-reader returned one source.',
      attributes: { toolId: 'listing-reader' },
      payload: { sourceId: 'src-1' },
      stateDiff: [{ op: 'replace', path: '/obligations/0/status', value: 'satisfied' }],
      redactions: [{ path: 'payload.rawNotes', reason: 'user-entered free text' }],
    };
  }

  it('parses a fully populated debug event', () => {
    const result = RuntimeDebugEventSchema.safeParse(valid());
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an unlisted category and an unlisted phase', () => {
    expect(RuntimeDebugEventSchema.safeParse({ ...valid(), category: 'network' }).success).toBe(
      false,
    );
    expect(RuntimeDebugEventSchema.safeParse({ ...valid(), phase: 'pending' }).success).toBe(false);
  });

  it('rejects a stateDiff entry missing "value" for a replace operation', () => {
    const result = RuntimeDebugEventSchema.safeParse({
      ...valid(),
      stateDiff: [{ op: 'replace', path: '/x' }],
    });
    expect(result.success).toBe(false);
  });

  it('allows attributes/payload to carry arbitrary structured data (spec types both as `unknown`)', () => {
    const result = RuntimeDebugEventSchema.safeParse({
      ...valid(),
      attributes: { nested: { deeply: { arbitrary: { shape: 'ok' } } } },
      payload: [1, 2, { three: 3 }],
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });
});
