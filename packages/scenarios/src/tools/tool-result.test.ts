import { describe, expect, it } from 'vitest';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolResult,
} from './tool-result.js';

describe('isAborted', () => {
  it('is false when no signal is provided', () => {
    expect(isAborted(undefined)).toBe(false);
  });

  it('is false for a signal that has not been aborted', () => {
    const controller = new AbortController();
    expect(isAborted(controller.signal)).toBe(false);
  });

  it('is true for a signal that has been aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAborted(controller.signal)).toBe(true);
  });
});

describe('okResult', () => {
  it('wraps data in a status: ok envelope tagged with the tool id', () => {
    const result = okResult('listing-reader', { candidateId: 'candidate-rav4' });
    expect(result).toEqual({
      status: 'ok',
      toolId: 'listing-reader',
      data: { candidateId: 'candidate-rav4' },
    });
  });
});

describe('notFoundResult', () => {
  it('carries the tool id, the query that missed, and a message', () => {
    const result = notFoundResult('listing-reader', 'candidate-unknown', 'no such candidate');
    expect(result).toEqual({
      status: 'not_found',
      toolId: 'listing-reader',
      query: 'candidate-unknown',
      message: 'no such candidate',
    });
  });
});

describe('cancelledResult', () => {
  it('defaults to a generic cancellation message', () => {
    const result = cancelledResult('listing-reader');
    expect(result).toEqual({
      status: 'cancelled',
      toolId: 'listing-reader',
      message: 'listing-reader: cancelled before completion',
    });
  });

  it('accepts a custom message', () => {
    const result = cancelledResult('listing-reader', 'aborted mid-lookup');
    expect(result.message).toBe('aborted mid-lookup');
  });
});

describe('ToolResult discriminated union narrowing (compile-time + runtime check)', () => {
  it('narrows on status at runtime the same way a caller would at compile time', () => {
    const results: ToolResult<number>[] = [
      okResult('t', 1),
      notFoundResult('t', 'q', 'missing'),
      cancelledResult('t'),
    ];

    const summarized = results.map((result) => {
      if (result.status === 'ok') {
        return `ok:${result.data}`;
      }
      if (result.status === 'not_found') {
        return `not_found:${result.query}`;
      }
      return `cancelled:${result.message}`;
    });

    expect(summarized).toEqual(['ok:1', 'not_found:q', 'cancelled:t: cancelled before completion']);
  });
});
