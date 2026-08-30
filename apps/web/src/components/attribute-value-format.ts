/**
 * Shared, pure `AttributeValue` -> display-string formatter used by both
 * `DynamicAttributeField.tsx` (a read-affordance alongside its editable
 * control) and `OptionComparison.tsx` (rendering each option's attribute
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

export function formatAttributeValue(value: AttributeValue): string {
  switch (value.type) {
    case 'string':
    case 'text':
      return value.value;
    case 'number':
      return value.unit !== undefined ? `${value.value} ${value.unit}` : String(value.value);
    case 'money': {
      const base = `${value.amount} ${value.currency}`;
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
