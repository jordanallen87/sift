import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { CaseNote, EntityRecord } from '@sift/contracts';
import { CaseNotes } from './CaseNotes.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function buildNote(overrides: Partial<CaseNote> = {}): CaseNote {
  return {
    id: 'note-1',
    body: 'The seat position felt wrong on the test drive.',
    kind: 'observation',
    origin: 'user',
    authoredBy: 'user',
    optionIds: [],
    sourceIds: [],
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildOption(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    id: 'opt-1',
    kind: 'candidate',
    label: 'Toyota RAV4',
    attributes: {},
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

describe('CaseNotes: renders nothing when there are no notes (global constraint 4)', () => {
  it('renders no root element at all for an empty notes array', () => {
    const { container } = render(<CaseNotes notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no testid present anywhere in the DOM when empty', () => {
    render(<CaseNotes notes={[]} />);
    expect(screen.queryByTestId('case-notes')).not.toBeInTheDocument();
  });
});

describe('CaseNotes: rendering a populated notes list', () => {
  it('shows the note body and its kind', () => {
    render(<CaseNotes notes={[buildNote({ body: 'Dealer said they may waive the package.' })]} />);
    expect(screen.getByTestId('case-notes')).toBeInTheDocument();
    expect(screen.getByTestId('case-note-body-note-1')).toHaveTextContent(
      'Dealer said they may waive the package.',
    );
    expect(screen.getByTestId('case-note-kind-note-1')).toHaveTextContent('Observation');
  });

  it('shows who wrote it: a human-authored note is attributed to the user, distinctly from an agent-authored one', () => {
    render(
      <CaseNotes
        notes={[
          buildNote({ id: 'note-human', origin: 'user' }),
          buildNote({ id: 'note-agent', origin: 'agent_proposed', authoredBy: 'model' }),
        ]}
      />,
    );
    const humanLabel = screen.getByTestId('case-note-author-note-human').textContent;
    const agentLabel = screen.getByTestId('case-note-author-note-agent').textContent;
    expect(humanLabel).toBeTruthy();
    expect(agentLabel).toBeTruthy();
    expect(humanLabel).not.toBe(agentLabel);
  });

  it('orders notes most-recently-added first', () => {
    render(
      <CaseNotes
        notes={[
          buildNote({ id: 'note-1', body: 'First.' }),
          buildNote({ id: 'note-2', body: 'Second.' }),
        ]}
      />,
    );
    const items = screen.getAllByTestId(/^case-note-body-/);
    expect(items.map((item) => item.textContent)).toEqual(['Second.', 'First.']);
  });

  it("resolves optionIds to the option's real label, not its raw id", () => {
    render(
      <CaseNotes
        notes={[buildNote({ optionIds: ['opt-1'] })]}
        options={[buildOption({ id: 'opt-1', label: 'Toyota RAV4' })]}
      />,
    );
    const optionsRow = screen.getByTestId('case-note-options-note-1');
    expect(optionsRow).toHaveTextContent('Toyota RAV4');
    expect(optionsRow).not.toHaveTextContent('opt-1');
  });

  it('omits the referenced-options row entirely when a referenced option cannot be resolved, rather than rendering its raw id', () => {
    render(<CaseNotes notes={[buildNote({ optionIds: ['opt-missing'] })]} options={[]} />);
    expect(screen.queryByTestId('case-note-options-note-1')).not.toBeInTheDocument();
    expect(screen.queryByText('opt-missing')).not.toBeInTheDocument();
  });

  it('never renders a raw internal id anywhere: no custom.* id, no commandId, no runId, no bare obligation/source id', () => {
    const note = buildNote({
      optionIds: ['opt-1'],
      obligationId: 'obl-price-confirmed',
      sourceIds: ['src-1'],
    });
    render(<CaseNotes notes={[note]} options={[buildOption()]} />);
    const rendered = screen.getByTestId('case-notes').textContent ?? '';
    expect(rendered).not.toContain('obl-price-confirmed');
    expect(rendered).not.toContain('src-1');
    expect(rendered).not.toContain('custom.');
    expect(rendered).not.toContain('commandId');
    expect(rendered).not.toContain('runId');
  });
});

describe('CaseNotes: accessibility and layout', () => {
  it('has no axe violations with notes rendered', async () => {
    const { container } = render(
      <CaseNotes
        notes={[buildNote({ id: 'note-1' }), buildNote({ id: 'note-2', origin: 'agent_proposed' })]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <CaseNotes notes={[buildNote({ body: 'x'.repeat(400) })]} />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
