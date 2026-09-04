import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { CustomConcernForm } from './CustomConcernForm.js';
import { AppProviders } from '../app/AppProviders.js';
import { createFakeSiftCommands, buildFakeCommandReceipt } from '../test/fake-sift-commands.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function renderForm(commandsOverrides: Parameters<typeof createFakeSiftCommands>[0] = {}) {
  const commands = createFakeSiftCommands(commandsOverrides);
  const utils = render(
    <AppProviders commandsClient={commands}>
      <CustomConcernForm
        caseId="case-1"
        resolveExpectedSequence={() => Promise.resolve(7)}
        applicableKinds={['car']}
      />
    </AppProviders>,
  );
  return { ...utils, commands };
}

describe('CustomConcernForm', () => {
  it('renders the form fields required by sift_define_case_attribute', () => {
    renderForm();
    expect(screen.getByLabelText(/concern id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/label/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/value type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/why this matters/i)).toBeInTheDocument();
  });

  it('calls commands.defineCaseAttribute with a well-formed custom.* definition on submit', async () => {
    const user = userEvent.setup();
    const { commands } = renderForm({
      defineCaseAttribute: vi.fn().mockResolvedValue(buildFakeCommandReceipt()),
    });

    await user.type(screen.getByLabelText(/concern id/i), 'pet_sensory_fit');
    await user.type(screen.getByLabelText(/label/i), 'Pet sensory fit');
    await user.type(
      screen.getByLabelText(/why this matters/i),
      'Our dog is sound-sensitive during long drives.',
    );
    await user.click(screen.getByTestId('custom-concern-form-submit'));

    await waitFor(() => {
      expect(commands.defineCaseAttribute).toHaveBeenCalledTimes(1);
    });
    // `toMatchObject` recursively partial-matches nested objects on its own,
    // so the nested `definition` need not (and, under this repo's strict
    // `no-unsafe-assignment` lint rule, must not) be wrapped in a second
    // `expect.objectContaining(...)` -- see this test file's sibling
    // assertion below for the same pattern.
    expect(commands.defineCaseAttribute).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'case-1',
        expectedSequence: 7,
      }),
    );
    const calledWith = vi.mocked(commands.defineCaseAttribute).mock.calls[0]?.[0];
    expect(calledWith).toMatchObject({
      definition: {
        id: 'custom.pet_sensory_fit',
        label: 'Pet sensory fit',
        appliesTo: ['car'],
        reason: 'Our dog is sound-sensitive during long drives.',
      },
    });
  });

  it('shows a success confirmation and resets the form after a successful submission', async () => {
    const user = userEvent.setup();
    renderForm({ defineCaseAttribute: vi.fn().mockResolvedValue(buildFakeCommandReceipt()) });

    await user.type(screen.getByLabelText(/concern id/i), 'pet_sensory_fit');
    await user.type(screen.getByLabelText(/label/i), 'Pet sensory fit');
    await user.type(screen.getByLabelText(/why this matters/i), 'Reason text here.');
    await user.click(screen.getByTestId('custom-concern-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('custom-concern-form-success')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/concern id/i)).toHaveValue('');
  });

  it('shows a recoverable error and preserves entered values when defineCaseAttribute fails', async () => {
    const user = userEvent.setup();
    renderForm({
      defineCaseAttribute: vi.fn().mockRejectedValue(new Error('Pack does not allow this.')),
    });

    await user.type(screen.getByLabelText(/concern id/i), 'pet_sensory_fit');
    await user.type(screen.getByLabelText(/label/i), 'Pet sensory fit');
    await user.type(screen.getByLabelText(/why this matters/i), 'Reason text here.');
    await user.click(screen.getByTestId('custom-concern-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('custom-concern-form-error')).toHaveTextContent(
        'Pack does not allow this.',
      );
    });
    expect(screen.getByLabelText(/concern id/i)).toHaveValue('pet_sensory_fit');
  });

  it('disables submit until the required fields (id, label, reason) are filled', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByTestId('custom-concern-form-submit')).toBeDisabled();

    await user.type(screen.getByLabelText(/concern id/i), 'pet_sensory_fit');
    await user.type(screen.getByLabelText(/label/i), 'Pet sensory fit');
    expect(screen.getByTestId('custom-concern-form-submit')).toBeDisabled();

    await user.type(screen.getByLabelText(/why this matters/i), 'Reason text here.');
    expect(screen.getByTestId('custom-concern-form-submit')).toBeEnabled();
  });

  it('submits every field -- value type, unit, allowed values, evidence expectation, and comparison', async () => {
    const user = userEvent.setup();
    const { commands } = renderForm({
      defineCaseAttribute: vi.fn().mockResolvedValue(buildFakeCommandReceipt()),
    });

    await user.type(screen.getByLabelText(/concern id/i), 'tow_capacity');
    await user.type(screen.getByLabelText(/^label/i), 'Tow capacity');
    await user.selectOptions(screen.getByLabelText(/value type/i), 'number');
    await user.type(screen.getByLabelText(/unit/i), 'lbs');
    await user.type(screen.getByLabelText(/allowed values/i), 'a, b ,c');
    await user.selectOptions(screen.getByLabelText(/evidence expectation/i), 'verification');
    await user.selectOptions(screen.getByLabelText(/comparison/i), 'higher_better');
    await user.type(screen.getByLabelText(/why this matters/i), 'We tow a small trailer.');
    await user.click(screen.getByTestId('custom-concern-form-submit'));

    await waitFor(() => {
      expect(commands.defineCaseAttribute).toHaveBeenCalledTimes(1);
    });
    const calledWith = vi.mocked(commands.defineCaseAttribute).mock.calls[0]?.[0];
    expect(calledWith).toMatchObject({
      definition: {
        id: 'custom.tow_capacity',
        valueType: 'number',
        unit: 'lbs',
        allowedValues: ['a', 'b', 'c'],
        evidenceExpectation: 'verification',
        comparison: 'higher_better',
      },
    });
  });

  it('ignores a second form submission while a submit is already in flight', async () => {
    const user = userEvent.setup();
    let resolveDefine: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      resolveDefine = resolve;
    });
    const { commands, container } = renderForm({
      defineCaseAttribute: vi.fn().mockReturnValue(pending),
    });

    await user.type(screen.getByLabelText(/concern id/i), 'pet_sensory_fit');
    await user.type(screen.getByLabelText(/label/i), 'Pet sensory fit');
    await user.type(screen.getByLabelText(/why this matters/i), 'Reason text here.');
    await user.click(screen.getByTestId('custom-concern-form-submit'));
    expect(commands.defineCaseAttribute).toHaveBeenCalledTimes(1);

    // The submit button itself is disabled while submitting, so this
    // directly submits the underlying `<form>` element -- the exact
    // defensive path the `submitting` half of `handleSubmit`'s guard exists
    // for (e.g. a real browser's implicit Enter-to-submit behavior racing an
    // in-flight submission).
    fireEvent.submit(container.querySelector('form')!);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(commands.defineCaseAttribute).toHaveBeenCalledTimes(1);

    resolveDefine(buildFakeCommandReceipt());
  });

  it('shows the generic "Could not define this concern." message when defineCaseAttribute rejects with a non-Error value', async () => {
    const user = userEvent.setup();
    renderForm({
      defineCaseAttribute: vi.fn().mockRejectedValue('pack rejected this'),
    });

    await user.type(screen.getByLabelText(/concern id/i), 'pet_sensory_fit');
    await user.type(screen.getByLabelText(/label/i), 'Pet sensory fit');
    await user.type(screen.getByLabelText(/why this matters/i), 'Reason text here.');
    await user.click(screen.getByTestId('custom-concern-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('custom-concern-form-error')).toHaveTextContent(
        'Could not define this concern.',
      );
    });
  });

  it('has no axe violations', async () => {
    const { container } = renderForm();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const commands = createFakeSiftCommands();
    const { overflowRisks } = renderAtNarrowWidth(
      <AppProviders commandsClient={commands}>
        <CustomConcernForm
          caseId="case-1"
          resolveExpectedSequence={() => Promise.resolve(1)}
          applicableKinds={['car']}
        />
      </AppProviders>,
    );
    expect(overflowRisks).toEqual([]);
  });
});
