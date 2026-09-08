import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AddNoteForm } from './AddNoteForm.js';
import { AppProviders } from '../app/AppProviders.js';
import { createFakeSiftCommands, buildFakeCommandReceipt } from '../test/fake-sift-commands.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function renderForm(commandsOverrides: Parameters<typeof createFakeSiftCommands>[0] = {}) {
  const commands = createFakeSiftCommands(commandsOverrides);
  const utils = render(
    <AppProviders commandsClient={commands}>
      <AddNoteForm caseId="case-1" expectedSequence={7} />
    </AppProviders>,
  );
  return { ...utils, commands };
}

describe('AddNoteForm', () => {
  it('renders a labelled note body field and a submit control', () => {
    renderForm();
    expect(screen.getByLabelText('Note')).toBeInTheDocument();
    expect(screen.getByTestId('add-note-form-submit')).toBeInTheDocument();
  });

  it('calls commands.addNote with exactly {caseId, expectedSequence, note: {body}} on submit -- no origin field', async () => {
    const user = userEvent.setup();
    const { commands } = renderForm({
      addNote: vi.fn().mockResolvedValue(buildFakeCommandReceipt()),
    });

    await user.type(
      screen.getByLabelText('Note'),
      'The seat position felt wrong on the test drive.',
    );
    await user.click(screen.getByTestId('add-note-form-submit'));

    await waitFor(() => {
      expect(commands.addNote).toHaveBeenCalledTimes(1);
    });
    const calledWith = vi.mocked(commands.addNote).mock.calls[0]?.[0];
    // Exact-shape assertion (not a partial match): this is the literal
    // "omit origin" contract from the task brief -- the command handler
    // defaults `origin` to `'user'` server-side, and a human-entered note
    // must never carry `origin: 'webmcp'`, which is reserved for
    // model-issued calls. `toEqual` fails if an `origin` key is present at
    // all, not merely if it holds the wrong value.
    expect(calledWith).toEqual({
      caseId: 'case-1',
      expectedSequence: 7,
      note: { body: 'The seat position felt wrong on the test drive.' },
    });
  });

  it('shows a success confirmation and clears the field after a successful submission', async () => {
    const user = userEvent.setup();
    renderForm({ addNote: vi.fn().mockResolvedValue(buildFakeCommandReceipt()) });

    await user.type(screen.getByLabelText('Note'), 'Dealer said the timing belt was done.');
    await user.click(screen.getByTestId('add-note-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('add-note-form-success')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Note')).toHaveValue('');
  });

  it('shows a recoverable error and preserves the entered body when addNote fails', async () => {
    const user = userEvent.setup();
    renderForm({
      addNote: vi.fn().mockRejectedValue(new Error('Case has moved on. Refresh and try again.')),
    });

    await user.type(screen.getByLabelText('Note'), 'Still worth remembering this.');
    await user.click(screen.getByTestId('add-note-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('add-note-form-error')).toHaveTextContent(
        'Case has moved on. Refresh and try again.',
      );
    });
    expect(screen.getByLabelText('Note')).toHaveValue('Still worth remembering this.');
  });

  it('shows a generic fallback message when addNote rejects with a non-Error value', async () => {
    const user = userEvent.setup();
    renderForm({ addNote: vi.fn().mockRejectedValue('nope') });

    await user.type(screen.getByLabelText('Note'), 'Still worth remembering this.');
    await user.click(screen.getByTestId('add-note-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('add-note-form-error')).toHaveTextContent(
        'Could not add this note.',
      );
    });
  });

  it('disables submit until the body has non-whitespace content', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByTestId('add-note-form-submit')).toBeDisabled();

    await user.type(screen.getByLabelText('Note'), '   ');
    expect(screen.getByTestId('add-note-form-submit')).toBeDisabled();

    await user.type(screen.getByLabelText('Note'), 'x');
    expect(screen.getByTestId('add-note-form-submit')).toBeEnabled();
  });

  it('ignores a second submission while a submit is already in flight', async () => {
    const user = userEvent.setup();
    let resolveAdd: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      resolveAdd = resolve;
    });
    const { commands, container } = renderForm({
      addNote: vi.fn().mockReturnValue(pending),
    });

    await user.type(screen.getByLabelText('Note'), 'Worth remembering.');
    await user.click(screen.getByTestId('add-note-form-submit'));
    expect(commands.addNote).toHaveBeenCalledTimes(1);

    fireEvent.submit(container.querySelector('form')!);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(commands.addNote).toHaveBeenCalledTimes(1);

    resolveAdd(buildFakeCommandReceipt());
  });

  it('never implies a note verifies anything, satisfies a question, or advances readiness', () => {
    const { container } = renderForm();
    const text = container.textContent ?? '';
    for (const forbidden of ['verif', 'satisf', 'readiness', 'evidence']) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('has no axe violations', async () => {
    const { container } = renderForm();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const commands = createFakeSiftCommands();
    const { overflowRisks } = renderAtNarrowWidth(
      <AppProviders commandsClient={commands}>
        <AddNoteForm caseId="case-1" expectedSequence={1} />
      </AppProviders>,
    );
    expect(overflowRisks).toEqual([]);
  });
});
