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
    // Deterministic, hand-composed thousands grouping (no `Intl`/
    // `toLocaleString` -- see attribute-value-format.ts's header comment).
    [{ type: 'number', value: 0 } satisfies AttributeValue, '0'],
    [{ type: 'number', value: -42 } satisfies AttributeValue, '-42'],
    [{ type: 'number', value: 999 } satisfies AttributeValue, '999'],
    // A bare number groups only from five digits up. This is the rule that
    // keeps a model year readable: `car.model_year` is declared
    // `valueType: 'number'` with no unit, so an earlier "group every number"
    // rule rendered a 2022 model year as "2,022" -- caught by looking at the
    // running product, not by any test. Years never take a separator, and
    // four-digit numbers conventionally do not either.
    [{ type: 'number', value: 2022 } satisfies AttributeValue, '2022'],
    [{ type: 'number', value: 1000 } satisfies AttributeValue, '1000'],
    [{ type: 'number', value: 9999 } satisfies AttributeValue, '9999'],
    [{ type: 'number', value: 10_000 } satisfies AttributeValue, '10,000'],
    [{ type: 'number', value: 28_400, unit: 'mi' } satisfies AttributeValue, '28,400 mi'],
    [{ type: 'number', value: -12_345 } satisfies AttributeValue, '-12,345'],
    [{ type: 'number', value: 1_234_567 } satisfies AttributeValue, '1,234,567'],
    // A fractional part must survive exactly as-is -- never padded to a
    // fixed decimal count, never comma-separated itself.
    [{ type: 'number', value: 37.6 } satisfies AttributeValue, '37.6'],
    [{ type: 'number', value: 12_345.5 } satisfies AttributeValue, '12,345.5'],
    [{ type: 'number', value: -12_345.5 } satisfies AttributeValue, '-12,345.5'],
    // Money keeps the lower four-digit threshold: currency is the one place
    // readers expect a separator that early.
    [{ type: 'money', amount: 1500, currency: 'USD' } satisfies AttributeValue, '$1,500'],
    [{ type: 'money', amount: 28500, currency: 'USD' } satisfies AttributeValue, '$28,500'],
    [
      {
        type: 'money',
        amount: 450,
        currency: 'USD',
        cadence: 'per month',
      } satisfies AttributeValue,
      '$450 per month',
    ],
    [{ type: 'money', amount: 0, currency: 'USD' } satisfies AttributeValue, '$0'],
    // A money amount is quoted in whole units or in exactly two decimals --
    // never one. A derived out-the-door price of 33291.3 was rendering live
    // as "$33,291.3", which reads as a truncation or a typo.
    [{ type: 'money', amount: 33291.3, currency: 'USD' } satisfies AttributeValue, '$33,291.30'],
    [{ type: 'money', amount: 5296.3, currency: 'USD' } satisfies AttributeValue, '$5,296.30'],
    // Float-representation noise on a computed amount collapses too, rather
    // than rendering a thirteen-decimal string.
    [
      { type: 'money', amount: 5296.299999999999, currency: 'USD' } satisfies AttributeValue,
      '$5,296.30',
    ],
    [{ type: 'money', amount: -1234.5, currency: 'USD' } satisfies AttributeValue, '-$1,234.50'],
    // A bare number keeps its verbatim fraction -- 37.6 cu ft must NOT
    // become 37.60. Only money is normalised.
    [{ type: 'number', value: 37.6, unit: 'cu ft' } satisfies AttributeValue, '37.6 cu ft'],
    [{ type: 'money', amount: -500, currency: 'USD' } satisfies AttributeValue, '-$500'],
    [{ type: 'money', amount: 1000, currency: 'USD' } satisfies AttributeValue, '$1,000'],
    [{ type: 'money', amount: 999, currency: 'USD' } satisfies AttributeValue, '$999'],
    [{ type: 'money', amount: 27_995, currency: 'USD' } satisfies AttributeValue, '$27,995'],
    [{ type: 'money', amount: 32_400, currency: 'EUR' } satisfies AttributeValue, '€32,400'],
    [{ type: 'money', amount: 32_400, currency: 'GBP' } satisfies AttributeValue, '£32,400'],
    // An unmapped currency code must never guess a symbol -- it keeps the
    // existing, unambiguous "amount CURRENCY" form (still comma-grouped).
    [{ type: 'money', amount: 12_345, currency: 'CAD' } satisfies AttributeValue, '12,345 CAD'],
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

  /**
   * The split this formatter is on one side of.
   *
   * A `text` value may declare `format: 'markdown'`, and this function must
   * keep returning the plain source string for it. Everything that renders
   * through here -- comparison cells, card lines, chips, criterion targets --
   * needs ONE line that fits where it is put; the formatted body belongs to
   * `MarkdownText`, reached via `OptionProfileAttribute.markdown` in the one
   * surface that has room for it. If this ever starts interpreting the
   * syntax, every browse card in the product silently changes shape.
   */
  it('returns a markdown text value as its plain source, syntax and all, exactly as it returns an unformatted one', () => {
    const body = 'A **strong** lead.\n\n- one\n- two';
    expect(formatAttributeValue({ type: 'text', value: body, format: 'markdown' })).toBe(body);
    expect(formatAttributeValue({ type: 'text', value: body })).toBe(body);
  });

  it('returns a string, never a node, so a caller can put it straight into a cell', () => {
    expect(typeof formatAttributeValue({ type: 'text', value: '**x**', format: 'markdown' })).toBe(
      'string',
    );
  });
});
