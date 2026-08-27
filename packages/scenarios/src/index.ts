// @pax/scenarios — Pax fixture data, scripted tools/model, scenario runner,
// and assertions. See docs/superpowers/plans/2026-08-26-pax-hackathon-build.md
// for the task map: the deterministic car-purchase fixture tools ship in
// Task 3; the scripted model ships in `apps/agent/src/runtime/model-provider.ts`.
export * from './tools/index.js';

// Car-purchase fixture seed data -> initial CaseState/entities (seeds.ts).
export {
  CAR_PURCHASE_CANDIDATE_IDS,
  HOUSEHOLD_FIT_DEFINITION_ID_TRANSLATION,
  buildCarPurchaseCandidateEntities,
  buildCarPurchaseSeedEvents,
} from './seeds.js';
export type {
  BuildCarPurchaseSeedEventsParams,
  CarPurchaseCandidateId,
  CarPurchaseSeedResult,
} from './seeds.js';

// Scenario trajectory/assertions/artifact-writer/runner (testing.md "Scenario
// tests").
export type { ScenarioTrajectory } from './trajectory.js';
export { emptyScenarioTrajectory } from './trajectory.js';
export { checkAssertion, checkAssertions } from './assertions.js';
export type { AssertionCheckResult, AssertionReport } from './assertions.js';
export { writeScenarioArtifacts } from './artifact-writer.js';
export type { ScenarioArtifactPaths, WriteScenarioArtifactsInput } from './artifact-writer.js';
export { runScenarioSteps } from './runner.js';
export type { ScenarioCommandExecutor, ScenarioRunnerDeps } from './runner.js';
