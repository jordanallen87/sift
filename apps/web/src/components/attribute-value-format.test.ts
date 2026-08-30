import { describe, expect, it } from 'vitest';
import type { AttributeValue } from '@sift/contracts';
import { formatAttributeValue } from './attribute-value-format.js';

describe('formatAttributeValue', () => {
  it.each([
    [{ type: 'string', value: 'Toyota RAV4' } satisfies AttributeValue, 'Toyota RAV4'],
    [
      { type: 'text', value: 'A longer free-text note.' } satisfies AttributeValue,
      'A longer free-text note.',
    ],
    [{ type: 'number', value: 42 } satisfies AttributeValue, '42'],
    [{ type: 'number', value: 42, unit: 'mpg' } satisfies AttributeValue, '42 mpg'],
    [{ type: 'money', amount: 28500, currency: 'USD' } satisfies AttributeValue, '28500 USD'],
    [
      {
        type: 'money',
        amount: 450,
        currency: 'USD',
        cadence: 'per month',
      } satisfies AttributeValue,
      '450 USD per month',
    ],
    [{ type: 'boolean', value: true } satisfies AttributeValue, 'Yes'],
    [{ type: 'boolean', value: false } satisfies AttributeValue, 'No'],
    [{ type: 'date', value: '2026-08-27' } satisfies AttributeValue, '2026-08-27'],
    [{ type: 'duration', amount: 1, unit: 'day' } satisfies AttributeValue, '1 day'],
    [{ type: 'duration', amount: 3, unit: 'day' } satisfies AttributeValue, '3 days'],
    [{ type: 'enum', value: 'hybrid' } satisfies AttributeValue, 'hybrid'],
    [{ type: 'range', minimum: 10, maximum: 20, unit: 'mi' } satisfies AttributeValue, '10–20 mi'],
    [{ type: 'range', minimum: 10 } satisfies AttributeValue, '10 or more'],
    [{ type: 'range', maximum: 20 } satisfies AttributeValue, 'up to 20'],
    [{ type: 'range' } satisfies AttributeValue, 'Not specified'],
    [
      { type: 'string_list', values: ['leather seats', 'sunroof'] } satisfies AttributeValue,
      'leather seats, sunroof',
    ],
    [{ type: 'string_list', values: [] } satisfies AttributeValue, 'None'],
  ])('formats %o as %s', (value, expected) => {
    expect(formatAttributeValue(value)).toBe(expected);
  });
});
