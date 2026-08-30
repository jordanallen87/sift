import { describe, expect, it } from 'vitest';
import {
  COMMAND_ORIGINS,
  CommandOriginSchema,
  HttpConflictResponseSchema,
  HttpErrorBodySchema,
} from './http.js';

describe('HttpErrorBodySchema', () => {
  it('parses a valid error body for every WebMCP-consistent error code', () => {
    for (const code of [
      'VALIDATION',
      'NOT_FOUND',
      'CONFLICT',
      'POLICY',
      'UNAVAILABLE',
      'INTERNAL',
    ] as const) {
      const result = HttpErrorBodySchema.safeParse({
        error: { code, message: 'Something went wrong.', retryable: code === 'UNAVAILABLE' },
      });
      expect(
        result.success,
        `${code}: ${JSON.stringify('error' in result ? result.error : null)}`,
      ).toBe(true);
    }
  });

  it('rejects an unlisted error code', () => {
    expect(
      HttpErrorBodySchema.safeParse({
        error: { code: 'TEAPOT', message: 'x', retryable: false },
      }).success,
    ).toBe(false);
  });

  it('accepts optional requestId and bounded structured details', () => {
    const result = HttpErrorBodySchema.safeParse({
      error: {
        code: 'VALIDATION',
        message: 'caseId is required.',
        retryable: false,
        requestId: 'req-1',
        details: { field: 'caseId', reason: 'missing' },
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });
});

describe('HttpConflictResponseSchema', () => {
  function validSnapshot() {
    return {
      schemaVersion: '1.0' as const,
      id: 'case-1',
      title: 'Choose our next family car',
      status: 'draft' as const,
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: 'a'.repeat(64),
        selectedBy: 'user' as const,
        reasons: ['User selected this Decision Pack'],
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
      eventSequence: 7,
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:01:00.000Z',
    };
  }

  it('parses a valid 409 conflict body carrying the latest snapshot', () => {
    const result = HttpConflictResponseSchema.safeParse({
      error: {
        code: 'CONFLICT',
        message: 'expectedSequence is stale.',
        retryable: true,
        expectedSequence: 5,
        actualSequence: 7,
      },
      snapshot: validSnapshot(),
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects a conflict body whose error.code is not literally CONFLICT', () => {
    expect(
      HttpConflictResponseSchema.safeParse({
        error: {
          code: 'VALIDATION',
          message: 'x',
          retryable: true,
          expectedSequence: 5,
          actualSequence: 7,
        },
        snapshot: validSnapshot(),
      }).success,
    ).toBe(false);
  });

  it('requires the snapshot to be a valid CaseState', () => {
    expect(
      HttpConflictResponseSchema.safeParse({
        error: {
          code: 'CONFLICT',
          message: 'x',
          retryable: true,
          expectedSequence: 5,
          actualSequence: 7,
        },
        snapshot: { ...validSnapshot(), status: 'archived' },
      }).success,
    ).toBe(false);
  });
});

describe('CommandOriginSchema', () => {
  it('accepts every declared COMMAND_ORIGINS member', () => {
    for (const origin of COMMAND_ORIGINS) {
      expect(CommandOriginSchema.safeParse(origin).success).toBe(true);
    }
  });

  it('is a closed enum: rejects free text, casing variants, and unrelated values', () => {
    for (const value of ['WebMCP', 'webmcp ', 'ui', 'agentcore', 'human', '']) {
      expect(CommandOriginSchema.safeParse(value).success, value).toBe(false);
    }
  });

  it('rejects a non-string value', () => {
    expect(CommandOriginSchema.safeParse({ origin: 'webmcp' }).success).toBe(false);
    expect(CommandOriginSchema.safeParse(null).success).toBe(false);
  });
});
