import { describe, expect, it } from 'vitest';
import type { ScenarioStep } from '@pax/contracts';
import { runScenarioSteps, type ScenarioCommandExecutor } from './runner.js';

function step(command: ScenarioStep['command']): ScenarioStep {
  return { command, input: {} };
}

describe('runScenarioSteps', () => {
  it('executes every step through the injected executor, strictly in order', async () => {
    const calls: { command: string; index: number }[] = [];
    const executor: ScenarioCommandExecutor = {
      execute: (s, index) => {
        calls.push({ command: s.command, index });
      },
    };

    await runScenarioSteps({
      steps: [step('startDemo'), step('focusOption'), step('reviewProposal')],
      executor,
    });

    expect(calls).toEqual([
      { command: 'startDemo', index: 0 },
      { command: 'focusOption', index: 1 },
      { command: 'reviewProposal', index: 2 },
    ]);
  });

  it('awaits an async executor before starting the next step (steps run sequentially, not concurrently)', async () => {
    const order: string[] = [];
    const executor: ScenarioCommandExecutor = {
      execute: async (s) => {
        order.push(`start:${s.command}`);
        await new Promise((resolve) => setTimeout(resolve, 0));
        order.push(`end:${s.command}`);
      },
    };

    await runScenarioSteps({ steps: [step('startDemo'), step('focusOption')], executor });

    expect(order).toEqual([
      'start:startDemo',
      'end:startDemo',
      'start:focusOption',
      'end:focusOption',
    ]);
  });

  it('is a no-op for an empty steps array', async () => {
    let called = false;
    const executor: ScenarioCommandExecutor = {
      execute: () => {
        called = true;
      },
    };
    await runScenarioSteps({ steps: [], executor });
    expect(called).toBe(false);
  });

  it('skips a hole/undefined entry in steps (defensive guard against a sparse array) without calling the executor or throwing, then continues to the next real step', async () => {
    const calls: { command: string; index: number }[] = [];
    const executor: ScenarioCommandExecutor = {
      execute: (s, index) => {
        calls.push({ command: s.command, index });
      },
    };
    const stepsWithAHole = [
      step('startDemo'),
      undefined,
      step('focusOption'),
    ] as unknown as readonly ScenarioStep[];

    await runScenarioSteps({ steps: stepsWithAHole, executor });

    expect(calls).toEqual([
      { command: 'startDemo', index: 0 },
      { command: 'focusOption', index: 2 },
    ]);
  });
});
