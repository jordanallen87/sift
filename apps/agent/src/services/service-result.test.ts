import { describe, expect, it } from 'vitest';
import { formatZodIssues } from './service-result.js';

describe('formatZodIssues', () => {
  it('joins a non-empty path with dots', () => {
    expect(
      formatZodIssues([{ path: ['option', 'attributes', 0, 'value'], message: 'bad' }]),
    ).toEqual(['option.attributes.0.value: bad']);
  });

  it('falls back to "(input)" for a root-level issue with an empty path', () => {
    expect(formatZodIssues([{ path: [], message: 'expected object, received string' }])).toEqual([
      '(input): expected object, received string',
    ]);
  });
});
