/**
 * `runScenarioSteps`: the minimal, apps-agnostic `DemoScenario.steps`
 * iterator (docs/specs/testing.md "Scenario tests").
 *
 * Deliberately minimal, per this task's brief: a full generic runner would
 * also resolve each `ScenarioStep.command` against a real `SiftCommands`
 * implementation, thread `expectedSequence` between steps, and manage
 * fixture-tool/model lifecycle per pack -- none of that is generic across
 * Decision Packs yet (only `car-purchase` has a real Strands adapter/Graph
 * today), and `packages/scenarios` sits below `apps/agent` in the workspace
 * dependency graph, so it cannot import the Strands runtime that would
 * actually execute a step. This function only owns the one genuinely
 * generic behavior: call an injected `ScenarioCommandExecutor` once per
 * `ScenarioStep`, in order, awaiting each one before starting the next
 * (steps are causally sequential -- a later step's `expectedSequence` and
 * case-context depend on the prior step's committed effect).
 *
 * The concrete car-purchase engine
 * (`apps/agent/src/runtime/car-purchase-scenario.ts`) supplies the real
 * `ScenarioCommandExecutor`, driving the real `CommandService`/`RunService`/
 * `car-purchase-graph.ts` Strands Graph per step. A fuller generic runner
 * (one non-car-purchase-specific engine driving arbitrary packs) is
 * documented, explicit follow-up work, not built here.
 */
import type { ScenarioStep } from '@sift/contracts';

export interface ScenarioCommandExecutor {
  /** Executes one `ScenarioStep`, in order. */
  execute(step: ScenarioStep, stepIndex: number): Promise<void> | void;
}

export interface ScenarioRunnerDeps {
  readonly steps: readonly ScenarioStep[];
  readonly executor: ScenarioCommandExecutor;
}

/** Runs every step of `deps.steps` through `deps.executor`, strictly in order. */
export async function runScenarioSteps(deps: ScenarioRunnerDeps): Promise<void> {
  for (let index = 0; index < deps.steps.length; index++) {
    const step = deps.steps[index];
    if (step === undefined) continue;
    await deps.executor.execute(step, index);
  }
}
