import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { AttributeDefinition, AttributeValue } from '@pax/contracts';
import { DynamicAttributeField, type DynamicAttributeFieldProps } from './DynamicAttributeField.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

/**
 * `DynamicAttributeField` is a stateless controlled component (by design --
 * see its own header comment). Simulating multi-keystroke typing against a
 * *frozen* `value` prop that never reflects the emitted `onChange` back is a
 * known jsdom/testing-library friction for `type="number"` and `<textarea>`
 * inputs specifically (each keystroke's DOM value gets reconciled back
 * toward the stale controlled prop, so only the latest keystroke survives).
 * This harness renders the field the way a real caller (`OptionEditor.tsx`)
 * actually uses it -- feeding each `onChange` back in as the next `value` --
 * so typing accumulates correctly, and also spies on every call for
 * intermediate-state assertions.
 */
function renderControlled(
  props: Omit<DynamicAttributeFieldProps, 'value' | 'onChange'> & {
    initialValue?: AttributeValue | undefined;
  },
) {
  const onChange = vi.fn<(value: AttributeValue | undefined) => void>();
  function Harness() {
    const [value, setValue] = useState<AttributeValue | undefined>(props.initialValue);
    return (
      <DynamicAttributeField
        {...props}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }
  const result = render(<Harness />);
  return { ...result, onChange };
}

function buildDefinition(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    id: 'price',
    label: 'Price',
    valueType: 'string',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'none',
    sensitive: false,
    ...overrides,
  };
}

describe('DynamicAttributeField', () => {
  it('renders a text input for the "string" value type and emits a string AttributeValue on change', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'label', label: 'Label', valueType: 'string' }),
    });

    const input = screen.getByLabelText('Label');
    await user.type(input, 'RAV4');

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'string',
      value: 'RAV4',
    } satisfies AttributeValue);
  });

  it('renders a checkbox for the "boolean" value type', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DynamicAttributeField
        definition={buildDefinition({ id: 'awd', label: 'All-wheel drive', valueType: 'boolean' })}
        value={{ type: 'boolean', value: false }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText('All-wheel drive'));
    expect(onChange).toHaveBeenLastCalledWith({ type: 'boolean', value: true });
  });

  it('renders a number input carrying the definition unit for the "number" value type', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({
        id: 'mileage',
        label: 'Mileage',
        valueType: 'number',
        unit: 'mi',
      }),
    });

    await user.type(screen.getByLabelText('Mileage'), '35000');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'number', value: 35000, unit: 'mi' });

    fireEvent.change(screen.getByLabelText('Mileage'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders a plain number input with no unit for a "number" field without a declared unit', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'seats', label: 'Seats', valueType: 'number' }),
    });

    await user.type(screen.getByLabelText('Seats'), '5');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'number', value: 5 });
  });

  it('renders a textarea for the "text" value type and clears to undefined when emptied', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'notes', label: 'Notes', valueType: 'text' }),
      initialValue: { type: 'text', value: 'Some notes' },
    });

    await user.type(screen.getByLabelText('Notes'), ' more');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'text', value: 'Some notes more' });

    await user.clear(screen.getByLabelText('Notes'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders amount and currency inputs for the "money" value type', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'price', label: 'Price', valueType: 'money' }),
    });

    await user.type(screen.getByLabelText('Price amount'), '28500');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'money', amount: 28500, currency: 'USD' });
  });

  it('renders a select populated from allowedValues for the "enum" value type', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({
        id: 'drivetrain',
        label: 'Drivetrain',
        valueType: 'enum',
        allowedValues: ['fwd', 'awd', '4wd'],
      }),
    });

    await user.selectOptions(screen.getByLabelText('Drivetrain'), 'awd');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'enum', value: 'awd' });
  });

  it('renders minimum/maximum inputs for the "range" value type', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({
        id: 'budget',
        label: 'Budget',
        valueType: 'range',
        unit: 'USD',
      }),
    });

    await user.type(screen.getByLabelText('Budget minimum'), '20000');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', minimum: 20000, unit: 'USD' });
  });

  it('renders a textarea for "string_list", splitting lines into list values', () => {
    // jsdom does not implement the browser-native "Enter inserts a newline"
    // default action for `<textarea>` keyboard events, so `userEvent.type`
    // cannot produce a real multi-line value here -- `fireEvent.change` sets
    // the full value directly, exactly as a real browser's own default
    // action (or a paste) would leave it for this component's `onChange` to
    // read.
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'features', label: 'Features', valueType: 'string_list' }),
    });

    fireEvent.change(screen.getByLabelText('Features'), { target: { value: 'leather\nsunroof' } });
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'string_list',
      values: ['leather', 'sunroof'],
    });
  });

  it('clears to undefined when a string field is emptied', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'label', label: 'Label', valueType: 'string' }),
      initialValue: { type: 'string', value: 'x' },
    });

    await user.clear(screen.getByLabelText('Label'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('disables its control when disabled is true', () => {
    render(
      <DynamicAttributeField
        definition={buildDefinition({ id: 'label', label: 'Label', valueType: 'string' })}
        value={undefined}
        onChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText('Label')).toBeDisabled();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <DynamicAttributeField
        definition={buildDefinition()}
        value={{ type: 'string', value: 'x' }}
        onChange={vi.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <DynamicAttributeField definition={buildDefinition()} value={undefined} onChange={vi.fn()} />,
    );
    expect(overflowRisks).toEqual([]);
  });

  it('renders a date input for the "date" value type', () => {
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'available', label: 'Available from', valueType: 'date' }),
    });

    fireEvent.change(screen.getByLabelText('Available from'), { target: { value: '2026-09-01' } });
    expect(onChange).toHaveBeenLastCalledWith({ type: 'date', value: '2026-09-01' });

    fireEvent.change(screen.getByLabelText('Available from'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders amount + unit controls for the "duration" value type and updates both independently', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({
        id: 'response-time',
        label: 'Response time',
        valueType: 'duration',
      }),
    });

    await user.type(screen.getByLabelText('Response time amount'), '3');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'duration', amount: 3, unit: 'day' });

    await user.selectOptions(screen.getByLabelText('Response time unit'), 'hour');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'duration', amount: 3, unit: 'hour' });

    fireEvent.change(screen.getByLabelText('Response time amount'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('updates the currency on an existing "money" value without touching the amount', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'price', label: 'Price', valueType: 'money' }),
      initialValue: { type: 'money', amount: 500, currency: 'USD' },
    });

    await user.clear(screen.getByLabelText('Price currency'));
    await user.type(screen.getByLabelText('Price currency'), 'eur');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'money', amount: 500, currency: 'EUR' });
  });

  it('renders a maximum input for "range" and clears to undefined only when both bounds are empty', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'budget', label: 'Budget', valueType: 'range' }),
    });

    await user.type(screen.getByLabelText('Budget maximum'), '30000');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', maximum: 30000 });

    fireEvent.change(screen.getByLabelText('Budget maximum'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('clears a "range" minimum to undefined when both bounds end up empty', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'budget', label: 'Budget', valueType: 'range' }),
    });

    await user.type(screen.getByLabelText('Budget minimum'), '5');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', minimum: 5 });

    fireEvent.change(screen.getByLabelText('Budget minimum'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('clears a "money" amount to undefined, dropping the whole value', () => {
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'price', label: 'Price', valueType: 'money' }),
      initialValue: { type: 'money', amount: 500, currency: 'USD' },
    });

    fireEvent.change(screen.getByLabelText('Price amount'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders a text input with no options for "enum" when allowedValues is not declared', () => {
    render(
      <DynamicAttributeField
        definition={buildDefinition({ id: 'drivetrain', label: 'Drivetrain', valueType: 'enum' })}
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByLabelText('Drivetrain');
    // Only the placeholder "Select…" option -- no allowedValues declared.
    expect(select.querySelectorAll('option')).toHaveLength(1);
  });

  it('treats a non-numeric raw value as undefined (Number.isFinite guard) rather than emitting NaN', () => {
    // A real HTML `<input type="number">` sanitizes its own `.value` to
    // either a syntactically valid finite-number string or `''` (confirmed
    // directly against this project's installed jsdom), so a normal keypress
    // can never itself deliver a non-numeric raw string to this handler.
    // `toNumberOrUndefined`'s `Number.isFinite` guard still exists as a real
    // safety net against a raw string that bypasses that sanitization (e.g.
    // a programmatic `dispatchEvent`, browser extension, or assistive-tech
    // input) -- exercised here by overriding the native `value` accessor the
    // same low-level way such a bypass would.
    const onChange = vi.fn();
    render(
      <DynamicAttributeField
        definition={buildDefinition({ id: 'seats', label: 'Seats', valueType: 'number' })}
        value={undefined}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Seats');
    Object.defineProperty(input, 'value', {
      value: 'not-a-number',
      configurable: true,
      writable: true,
    });
    fireEvent.change(input);

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('falls back the money currency to "USD" when computing a new amount while the currency field has been cleared to empty', () => {
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'price', label: 'Price', valueType: 'money' }),
      initialValue: { type: 'money', amount: 500, currency: 'USD' },
    });

    fireEvent.change(screen.getByLabelText('Price currency'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ type: 'money', amount: 500, currency: '' });

    fireEvent.change(screen.getByLabelText('Price amount'), { target: { value: '600' } });
    expect(onChange).toHaveBeenLastCalledWith({ type: 'money', amount: 600, currency: 'USD' });
  });

  it('does not emit a change when only the money currency is edited before any amount has ever been entered', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'price', label: 'Price', valueType: 'money' }),
    });

    await user.clear(screen.getByLabelText('Price currency'));
    await user.type(screen.getByLabelText('Price currency'), 'eur');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the boolean checkbox unchecked by default when no value has been set yet', () => {
    render(
      <DynamicAttributeField
        definition={buildDefinition({ id: 'awd', label: 'All-wheel drive', valueType: 'boolean' })}
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('All-wheel drive')).not.toBeChecked();
  });

  it('does not emit a change when only the duration unit is edited before any amount has ever been entered', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({
        id: 'response-time',
        label: 'Response time',
        valueType: 'duration',
      }),
    });

    await user.selectOptions(screen.getByLabelText('Response time unit'), 'hour');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears an enum value to undefined when the placeholder "Select…" option is chosen again', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({
        id: 'drivetrain',
        label: 'Drivetrain',
        valueType: 'enum',
        allowedValues: ['fwd', 'awd'],
      }),
      initialValue: { type: 'enum', value: 'awd' },
    });

    await user.selectOptions(screen.getByLabelText('Drivetrain'), '');

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps the existing maximum when clearing an already-set range minimum (does not blank the whole range)', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'budget', label: 'Budget', valueType: 'range' }),
    });

    await user.type(screen.getByLabelText('Budget maximum'), '30000');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', maximum: 30000 });

    await user.type(screen.getByLabelText('Budget minimum'), '5');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', minimum: 5, maximum: 30000 });

    fireEvent.change(screen.getByLabelText('Budget minimum'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', maximum: 30000 });
  });

  it('preserves an existing minimum and carries the unit when setting, then clearing, the range maximum after the minimum is already set', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControlled({
      definition: buildDefinition({
        id: 'budget',
        label: 'Budget',
        valueType: 'range',
        unit: 'USD',
      }),
    });

    await user.type(screen.getByLabelText('Budget minimum'), '20000');
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', minimum: 20000, unit: 'USD' });

    await user.type(screen.getByLabelText('Budget maximum'), '35000');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'range',
      minimum: 20000,
      maximum: 35000,
      unit: 'USD',
    });

    fireEvent.change(screen.getByLabelText('Budget maximum'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ type: 'range', minimum: 20000, unit: 'USD' });
  });

  it('clears a string_list value to undefined when the textarea is emptied down to only blank lines', () => {
    const { onChange } = renderControlled({
      definition: buildDefinition({ id: 'features', label: 'Features', valueType: 'string_list' }),
      initialValue: { type: 'string_list', values: ['leather'] },
    });

    fireEvent.change(screen.getByLabelText('Features'), { target: { value: '   \n  ' } });

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
