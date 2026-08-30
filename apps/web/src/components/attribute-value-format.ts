/**
 * Shared, pure `AttributeValue` -> display-string formatter used by both
 * `DynamicAttributeField.tsx` (a read-affordance alongside its editable
 * control) and `OptionCompareView.tsx` (rendering each option's attribute
 * cells). Kept in one place so the ten `AttributeValue` variants
 * (`packages/contracts/src/attributes.ts`) are described consistently
 * everywhere they are shown, rather than each renderer inventing its own
 * ad hoc formatting.
 *
 * Deliberately avoids locale-dependent formatting (`Number.
 * toLocaleString`, `Intl.*`) so output is identical across every test/CI
 * environment's locale -- plain, explicit string composition instead.
 */
import type { AttributeValue } from '@sift/contracts';

function formatDurationUnit(unit: string, amount: number): string {
  return amount === 1 ? unit : `${unit}s`;
}

/**
 * Deterministic, locale-independent digit grouping -- see this module's
 * header comment for why `Intl`/`toLocaleString` are deliberately avoided.
 * Groups a non-negative digit string in threes from the right, e.g.
 * `"1234567"` -> `"1,234,567"`; a string shorter than four digits (or `""`,
 * defensively) is returned with no separator at all (`"42"` -> `"42"`,
 * `"0"` -> `"0"`).
 */
function groupThousands(digits: string, minimumDigitsToGroup: number): string {
  if (digits.length === 0) return '0';
  if (digits.length < minimumDigitsToGroup) return digits;
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return groups.join(',');
}

/**
 * Bare numbers group only from five digits up; money groups from four.
 *
 * This is not a stylistic whim -- it is the one signal available here that
 * separates a *quantity* from an *identifier*. Found by looking at the
 * running product: `car.model_year` is declared `valueType: 'number'` with
 * no `unit` (packages/packs/src/car-purchase.ts), so a naive "group every
 * number" rule rendered a 2022 model year as **"2,022"**. Nothing in an
 * `AttributeValue` distinguishes a year from a count, and years never take
 * a thousands separator.
 *
 * Grouping bare numbers only at five digits fixes every year automatically
 * while still grouping real quantities (`28400` -> `28,400`, `1250000` ->
 * `1,250,000`), and it matches ordinary typographic practice, where
 * four-digit numbers commonly appear unseparated. Currency is the
 * exception readers do expect separated even at four digits (`$1,500`),
 * so money keeps the lower threshold.
 */
const BARE_NUMBER_MIN_DIGITS_TO_GROUP = 5;
const MONEY_MIN_DIGITS_TO_GROUP = 4;

/**
 * Formats a finite JS number as hand-composed, comma-grouped text, e.g.
 * `-1234567.5` -> `"-1,234,567.5"`. Only the integer part is grouped; a
 * fractional part -- read verbatim from `Math.abs(value)`'s own default
 * `String()` rendering, never padded or rounded to a fixed decimal count --
 * is appended untouched, so `37.6` stays `37.6` rather than becoming
 * `37.600` or (locale-style) `37,6`.
 */
function formatGroupedNumber(value: number, minimumDigitsToGroup: number): string {
  const negative = value < 0;
  const [integerDigits, fractionalDigits] = String(Math.abs(value)).split('.');
  const grouped = groupThousands(integerDigits ?? '0', minimumDigitsToGroup);
  const magnitude = fractionalDigits !== undefined ? `${grouped}.${fractionalDigits}` : grouped;
  return negative ? `-${magnitude}` : magnitude;
}

/**
 * Currency codes mapped to their display symbol, deliberately a short,
 * explicit allowlist rather than a lookup covering every ISO 4217 code:
 * guessing a symbol for an unmapped currency risks silently showing the
 * wrong one, so any code not listed here falls back to the existing,
 * unambiguous `amount CURRENCY` form instead (still comma-grouped).
 */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export function formatAttributeValue(value: AttributeValue): string {
  switch (value.type) {
    case 'string':
    case 'text':
      return value.value;
    case 'number': {
      const formatted = formatGroupedNumber(value.value, BARE_NUMBER_MIN_DIGITS_TO_GROUP);
      return value.unit !== undefined ? `${formatted} ${value.unit}` : formatted;
    }
    case 'money': {
      const negative = value.amount < 0;
      const magnitude = formatGroupedNumber(Math.abs(value.amount), MONEY_MIN_DIGITS_TO_GROUP);
      const symbol = CURRENCY_SYMBOLS[value.currency];
      const numeric =
        symbol !== undefined ? `${symbol}${magnitude}` : `${magnitude} ${value.currency}`;
      const base = negative ? `-${numeric}` : numeric;
      return value.cadence !== undefined ? `${base} ${value.cadence}` : base;
    }
    case 'boolean':
      return value.value ? 'Yes' : 'No';
    case 'date':
      return value.value;
    case 'duration':
      return `${value.amount} ${formatDurationUnit(value.unit, value.amount)}`;
    case 'enum':
      return value.value;
    case 'range': {
      const { minimum, maximum, unit } = value;
      const unitSuffix = unit !== undefined ? ` ${unit}` : '';
      if (minimum !== undefined && maximum !== undefined) {
        return `${minimum}–${maximum}${unitSuffix}`;
      }
      if (minimum !== undefined) {
        return `${minimum} or more${unitSuffix}`;
      }
      if (maximum !== undefined) {
        return `up to ${maximum}${unitSuffix}`;
      }
      return 'Not specified';
    }
    case 'string_list':
      return value.values.length === 0 ? 'None' : value.values.join(', ');
  }
}
