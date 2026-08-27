import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { AttributeDefinition, EntityRecord } from '@pax/contracts';
import { OptionEditor } from './OptionEditor.js';
import { AppProviders } from '../app/AppProviders.js';
import { createFakePaxCommands, buildFakeCommandReceipt } from '../test/fake-pax-commands.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  {
    id: 'price',
    label: 'Price',
    valueType: 'money',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'mileage',
    label: 'Mileage',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    unit: 'mi',
    evidenceExpectation: 'assertion',
    comparison: 'lower_better',
    sensitive: false,
  },
];

function buildEntity(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    id: 'candidate-rav4',
    kind: 'car',
    label: 'Toyota RAV4',
    attributes: {
      price: {
        definitionId: 'price',
        label: 'Price',
        value: { type: 'money', amount: 28500, currency: 'USD' },
        origin: 'user',
        sourceIds: [],
        status: 'asserted',
        updatedAt: '2026-08-27T00:00:00.000Z',
      },
    },
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof OptionEditor>> = {},
  commandsOverrides: Parameters<typeof createFakePaxCommands>[0] = {},
) {
  const commands = createFakePaxCommands(commandsOverrides);
  const utils = render(
    <AppProviders commandsClient={commands}>
      <OptionEditor
        caseId="case-1"
        expectedSequence={4}
        optionKind="car"
        optionLabel="car"
        attributeDefinitions={ATTRIBUTE_DEFINITIONS}
        options={[]}
        {...overrides}
      />
    </AppProviders>,
  );
  return { ...utils, commands };
}

describe('OptionEditor', () => {
  it('renders the initial/empty state with no options yet', () => {
    renderEditor();
    expect(screen.getByTestId('option-editor-empty')).toBeInTheDocument();
  });

  it('lists existing options with an edit control for each', () => {
    renderEditor({ options: [buildEntity()] });
    expect(screen.getByTestId('option-editor-option-candidate-rav4')).toHaveTextContent(
      'Toyota RAV4',
    );
    expect(screen.getByTestId('option-editor-edit-candidate-rav4')).toBeInTheDocument();
  });

  it('renders a DynamicAttributeField for every pack-declared attribute applicable to this option kind', () => {
    renderEditor();
    expect(screen.getByTestId('dynamic-attribute-field-price')).toBeInTheDocument();
    expect(screen.getByTestId('dynamic-attribute-field-mileage')).toBeInTheDocument();
  });

  it('saves a new option by calling upsertOption on the shared PaxCommands client', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-1' });
    const user = userEvent.setup();
    const { commands } = renderEditor({}, { upsertOption: vi.fn().mockResolvedValue(receipt) });

    await user.type(screen.getByLabelText('Option label'), 'Honda CR-V');
    await user.click(screen.getByTestId('option-editor-save'));

    await waitFor(() => {
      expect(commands.upsertOption).toHaveBeenCalledTimes(1);
    });
    // `toMatchObject` recursively partial-matches nested objects on its own,
    // so the nested `option` need not be wrapped in a second
    // `expect.objectContaining(...)` -- avoids this repo's strict
    // `no-unsafe-assignment` lint rule tripping on the resulting `any`-typed
    // nested property.
    expect(commands.upsertOption).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-1', expectedSequence: 4 }),
    );
    const calledWith = vi.mocked(commands.upsertOption).mock.calls[0]?.[0];
    expect(calledWith).toMatchObject({ option: { label: 'Honda CR-V', kind: 'car' } });
  });

  it('prefills the form from an existing option when Edit is clicked, and saves with its optionId', async () => {
    const user = userEvent.setup();
    const { commands } = renderEditor({ options: [buildEntity()] });

    await user.click(screen.getByTestId('option-editor-edit-candidate-rav4'));
    expect(screen.getByLabelText('Option label')).toHaveValue('Toyota RAV4');

    await user.click(screen.getByTestId('option-editor-save'));

    await waitFor(() => {
      expect(commands.upsertOption).toHaveBeenCalledWith(
        expect.objectContaining({ optionId: 'candidate-rav4' }),
      );
    });
  });

  it('cancel returns the form to a blank new-option state after editing', async () => {
    const user = userEvent.setup();
    renderEditor({ options: [buildEntity()] });

    await user.click(screen.getByTestId('option-editor-edit-candidate-rav4'));
    expect(screen.getByLabelText('Option label')).toHaveValue('Toyota RAV4');

    await user.click(screen.getByTestId('option-editor-cancel'));

    expect(screen.getByLabelText('Option label')).toHaveValue('');
    expect(screen.queryByTestId('option-editor-cancel')).not.toBeInTheDocument();
  });

  it('includes an entered attribute value in the saved option payload', async () => {
    const user = userEvent.setup();
    const { commands } = renderEditor(
      {},
      { upsertOption: vi.fn().mockResolvedValue(buildFakeCommandReceipt()) },
    );

    await user.type(screen.getByLabelText('Option label'), 'Honda CR-V');
    await user.type(screen.getByLabelText('Mileage'), '12000');
    await user.click(screen.getByTestId('option-editor-save'));

    await waitFor(() => {
      expect(commands.upsertOption).toHaveBeenCalledTimes(1);
    });
    const calledWith = vi.mocked(commands.upsertOption).mock.calls[0]?.[0];
    expect(calledWith).toMatchObject({
      option: {
        attributes: [
          { definitionId: 'mileage', value: { type: 'number', value: 12000, unit: 'mi' } },
        ],
      },
    });
  });

  it('disables adding a new option once the 5-option demo limit is reached', () => {
    const options = Array.from({ length: 5 }, (_, index) =>
      buildEntity({ id: `candidate-${index}`, label: `Candidate ${index}` }),
    );
    renderEditor({ options });
    expect(screen.getByTestId('option-editor-max-reached')).toBeInTheDocument();
    expect(screen.getByTestId('option-editor-new')).toBeDisabled();
  });

  it('shows a recoverable error and preserves the entered label when upsertOption fails', async () => {
    const user = userEvent.setup();
    renderEditor({}, { upsertOption: vi.fn().mockRejectedValue(new Error('Network is down')) });

    await user.type(screen.getByLabelText('Option label'), 'Honda CR-V');
    await user.click(screen.getByTestId('option-editor-save'));

    await waitFor(() => {
      expect(screen.getByTestId('option-editor-error')).toHaveTextContent('Network is down');
    });
    expect(screen.getByLabelText('Option label')).toHaveValue('Honda CR-V');
  });

  it('disables the save control while a save is pending', async () => {
    const user = userEvent.setup();
    let resolveUpsert: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      resolveUpsert = resolve;
    });
    renderEditor({}, { upsertOption: vi.fn().mockReturnValue(pending) });

    await user.type(screen.getByLabelText('Option label'), 'Honda CR-V');
    await user.click(screen.getByTestId('option-editor-save'));

    expect(screen.getByTestId('option-editor-save')).toBeDisabled();
    resolveUpsert(buildFakeCommandReceipt());
  });

  it('has no axe violations', async () => {
    const { container } = renderEditor({ options: [buildEntity()] });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const commands = createFakePaxCommands();
    const { overflowRisks } = renderAtNarrowWidth(
      <AppProviders commandsClient={commands}>
        <OptionEditor
          caseId="case-1"
          expectedSequence={1}
          optionKind="car"
          optionLabel="car"
          attributeDefinitions={ATTRIBUTE_DEFINITIONS}
          options={[buildEntity()]}
        />
      </AppProviders>,
    );
    expect(overflowRisks).toEqual([]);
  });
});
