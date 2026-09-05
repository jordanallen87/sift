/**
 * The reweight control had no UI at all.
 *
 * `sift_update_criteria` existed as a WebMCP tool and `updateCriteria` as a
 * client method, but nothing on the page could change what the decision
 * weighs -- so the one moment both shipped packs are built around ("changing
 * the criterion from lowest immediate cost to long-term waste reduction
 * changes option ranking") was reachable only by asking an assistant or by
 * calling the REST endpoint from a browser console. Both demo scripts said
 * so in writing and routed around it.
 *
 * The rules these tests pin are the ones that make the control honest rather
 * than merely present: a protected criterion cannot be moved, nothing is
 * written until the person commits, and the weights the person sees are the
 * weights that get sent.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Criterion } from '@sift/contracts';
import { CriteriaEditor } from './CriteriaEditor.js';
import { AppProviders } from '../app/AppProviders.js';
import { createFakeSiftCommands } from '../test/fake-sift-commands.js';

function criterion(overrides: Partial<Criterion> & { id: string }): Criterion {
  return {
    label: overrides.id,
    kind: 'preference',
    weight: 50,
    direction: 'higher_better',
    origin: 'pack',
    status: 'active',
    ...overrides,
  };
}

const COST = criterion({ id: 'energy.cost', label: 'Lowest immediate cost', weight: 80 });
const CONSERVATION = criterion({
  id: 'energy.conservation',
  label: 'Long-term waste reduction',
  weight: 20,
});
const PROTECTED = criterion({
  id: 'energy.no_emergency_risk',
  label: 'No emergency risk',
  kind: 'hard_constraint',
  weight: 0,
});

function renderEditor(
  options: {
    criteria?: Criterion[];
    protectedCriterionIds?: string[];
    onDone?: () => void;
    commandsOverrides?: Parameters<typeof createFakeSiftCommands>[0];
  } = {},
) {
  const commands = createFakeSiftCommands(options.commandsOverrides ?? {});
  render(
    <AppProviders commandsClient={commands}>
      <CriteriaEditor
        caseId="case-1"
        criteria={options.criteria ?? [COST, CONSERVATION, PROTECTED]}
        protectedCriterionIds={options.protectedCriterionIds ?? ['energy.no_emergency_risk']}
        resolveExpectedSequence={() => Promise.resolve(11)}
        {...(options.onDone !== undefined ? { onDone: options.onDone } : {})}
      />
    </AppProviders>,
  );
  return commands;
}

describe('CriteriaEditor', () => {
  it('sends the reweight the person actually made, for every criterion they moved', async () => {
    const user = userEvent.setup();
    const commands = renderEditor();

    const conservation = screen.getByTestId('criteria-editor-weight-energy.conservation');
    await user.clear(conservation);
    await user.type(conservation, '80');
    const cost = screen.getByTestId('criteria-editor-weight-energy.cost');
    await user.clear(cost);
    await user.type(cost, '20');

    await user.click(screen.getByTestId('criteria-editor-save'));

    await waitFor(() => {
      expect(commands.updateCriteria).toHaveBeenCalledTimes(1);
    });
    const input = vi.mocked(commands.updateCriteria).mock.calls[0]?.[0];
    expect(input?.caseId).toBe('case-1');
    expect(input?.expectedSequence).toBe(11);
    expect(input?.operations).toEqual(
      expect.arrayContaining([
        { op: 'reweight', criterionId: 'energy.conservation', weight: 80 },
        { op: 'reweight', criterionId: 'energy.cost', weight: 20 },
      ]),
    );
  });

  it('writes nothing until the person commits, so dragging a weight is not a command', async () => {
    const user = userEvent.setup();
    const commands = renderEditor();

    const cost = screen.getByTestId('criteria-editor-weight-energy.cost');
    await user.clear(cost);
    await user.type(cost, '35');

    expect(commands.updateCriteria).not.toHaveBeenCalled();
  });

  it('sends only what changed, never a no-op rewrite of untouched criteria', async () => {
    const user = userEvent.setup();
    const commands = renderEditor();

    const cost = screen.getByTestId('criteria-editor-weight-energy.cost');
    await user.clear(cost);
    await user.type(cost, '60');
    await user.click(screen.getByTestId('criteria-editor-save'));

    await waitFor(() => {
      expect(commands.updateCriteria).toHaveBeenCalledTimes(1);
    });
    const input = vi.mocked(commands.updateCriteria).mock.calls[0]?.[0];
    expect(input?.operations).toEqual([{ op: 'reweight', criterionId: 'energy.cost', weight: 60 }]);
  });

  it('refuses to offer a protected criterion as editable, and says why rather than showing a dead control', () => {
    renderEditor();
    expect(screen.queryByTestId('criteria-editor-weight-energy.no_emergency_risk')).toBeNull();
    expect(screen.getByTestId('criteria-editor-protected-energy.no_emergency_risk')).toBeVisible();
  });

  it('keeps Save unavailable while nothing has changed', () => {
    renderEditor();
    expect(screen.getByTestId('criteria-editor-save')).toBeDisabled();
  });

  it('surfaces a rejected write instead of silently discarding the change', async () => {
    const user = userEvent.setup();
    renderEditor({
      criteria: [COST, CONSERVATION],
      protectedCriterionIds: [],
      commandsOverrides: {
        updateCriteria: vi
          .fn()
          .mockRejectedValue(
            new Error('Criterion "energy.cost" is protected by the pack and cannot be reweighted.'),
          ),
      },
    });

    const cost = screen.getByTestId('criteria-editor-weight-energy.cost');
    await user.clear(cost);
    await user.type(cost, '10');
    await user.click(screen.getByTestId('criteria-editor-save'));

    expect(await screen.findByTestId('criteria-editor-error')).toHaveTextContent(/protected/i);
  });

  it('shows what the weights currently add up to, because a person reweighting one has to know what it is relative to', async () => {
    const user = userEvent.setup();
    renderEditor();
    // 80 + 20; the protected 0-weight constraint is not part of the pool.
    expect(screen.getByTestId('criteria-editor-total')).toHaveTextContent('100');

    const cost = screen.getByTestId('criteria-editor-weight-energy.cost');
    await user.clear(cost);
    await user.type(cost, '40');
    await waitFor(() => {
      expect(screen.getByTestId('criteria-editor-total')).toHaveTextContent('60');
    });
  });
});
