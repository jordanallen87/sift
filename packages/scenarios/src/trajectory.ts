/**
 * `ScenarioTrajectory`: the plain, apps-agnostic data shape
 * `assertions.ts`'s `checkAssertion` evaluates every `ScenarioAssertion`
 * (docs/specs/testing.md "Scenario tests") against.
 *
 * Deliberately has no dependency on `@strands-agents/sdk` or any
 * `apps/agent` runtime module: `packages/scenarios` sits below `apps/agent`
 * in the workspace dependency graph (`apps/agent` depends on
 * `@pax/scenarios`, never the reverse -- architecture.md "Repository
 * structure"), so the concrete engine that actually drives a Strands Graph
 * against the real car-purchase pack and populates one of these
 * (`apps/agent/src/runtime/car-purchase-scenario.ts`) lives in `apps/agent`
 * and imports this type, not the other way around. This keeps the
 * assertion-checking and artifact-writing logic here genuinely reusable by
 * a future second demo scenario (Home Energy Guardian) without dragging in
 * Strands.
 *
 * Each field maps directly onto one or more `ScenarioAssertion` kinds
 * (`@pax/contracts` `scenario.ts`); see that field's comment for which.
 */
import type { CaseEvent, CaseState } from '@pax/contracts';

export interface TrajectoryPackSelection {
  readonly packId: string;
  readonly reasons: readonly string[];
}

/** `case_extension_defined`. */
export interface TrajectoryExtensionDefined {
  readonly definitionId: string;
  readonly origin: string;
}

/** `case_obligation_created`. */
export interface TrajectoryObligationCreated {
  readonly obligationId: string;
  readonly criterionId: string;
}

/** `skill_activated`. */
export interface TrajectorySkillActivation {
  readonly skillId: string;
  readonly obligationId: string;
}

/** `swarm_handoff`. */
export interface TrajectorySwarmHandoff {
  readonly from: string;
  readonly to: string;
}

/** `context_injected`. */
export interface TrajectoryContextInjection {
  readonly fields: readonly string[];
}

/** `goal_validation_failed`. */
export interface TrajectoryGoalValidationFailure {
  readonly reason: string;
}

/** `snapshot_restored`. */
export interface TrajectorySnapshotRestoration {
  readonly caseId: string;
}

/** `debug_event_correlated`. */
export interface TrajectoryDebugCorrelation {
  readonly eventName: string;
  readonly activityType: string;
}

/** `tool_called`. */
export interface TrajectoryToolCall {
  readonly toolId: string;
}

/** `intervention`. */
export interface TrajectoryIntervention {
  readonly action: 'guide' | 'confirm' | 'deny';
  readonly handler: string;
}

/** `claim_linked`. */
export interface TrajectoryClaim {
  readonly claimId: string;
  readonly sourceIds: readonly string[];
}

/** `human_action`. */
export interface TrajectoryHumanAction {
  readonly action: string;
}

/**
 * The full observed trajectory of one scenario run, accumulated by the
 * concrete engine as it drives the real core/pack/adapter/Graph/scripted-
 * model/interventions/fixture-tools/event-store.
 */
export interface ScenarioTrajectory {
  packSelections: TrajectoryPackSelection[];
  extensionsDefined: TrajectoryExtensionDefined[];
  obligationsCreated: TrajectoryObligationCreated[];
  skillActivations: TrajectorySkillActivation[];
  /** `specialist_invoked` / `graph_node`: both are satisfied by the same observed set -- every car-purchase Graph node id is exactly one specialist id. */
  specialistsInvoked: string[];
  graphNodes: string[];
  swarmHandoffs: TrajectorySwarmHandoff[];
  contextInjections: TrajectoryContextInjection[];
  goalValidationFailures: TrajectoryGoalValidationFailure[];
  snapshotRestorations: TrajectorySnapshotRestoration[];
  debugCorrelations: TrajectoryDebugCorrelation[];
  /** Every redaction canary ever *tested for* (not necessarily found) -- `redaction_canary_absent` passes when a given canary never appears in `redactionCanariesSeen`. */
  redactionCanariesSeen: string[];
  toolCalls: TrajectoryToolCall[];
  interventions: TrajectoryIntervention[];
  claims: TrajectoryClaim[];
  staleEvidenceIds: string[];
  humanActions: TrajectoryHumanAction[];
  /**
   * Number of times a `proposal.reviewed`-producing review was attempted
   * with `decision: 'approve'` and `actor: 'agent'` -- the concrete
   * signal `forbidden_event_absent` with `eventType:
   * 'decision.approved.actor.agent'` checks (see assertions.ts). Real
   * `CaseEventSchema` has no literal `decision.approved` event type (the
   * closest is `proposal.reviewed` with `payload.proposal.status ===
   * 'approved'`); this counter is the trajectory-level projection of
   * exactly that forbidden combination, tracked directly rather than
   * string-matching a synthetic event type against the real event log.
   */
  agentApprovedProposalAttempts: number;
  /** Ordered `CaseEvent` log for the whole scenario, used for ordering checks and reload/replay verification. */
  caseEvents: CaseEvent[];
  /** The final canonical `CaseState` after every scripted step. */
  finalCaseState: CaseState | undefined;
}

export function emptyScenarioTrajectory(): ScenarioTrajectory {
  return {
    packSelections: [],
    extensionsDefined: [],
    obligationsCreated: [],
    skillActivations: [],
    specialistsInvoked: [],
    graphNodes: [],
    swarmHandoffs: [],
    contextInjections: [],
    goalValidationFailures: [],
    snapshotRestorations: [],
    debugCorrelations: [],
    redactionCanariesSeen: [],
    toolCalls: [],
    interventions: [],
    claims: [],
    staleEvidenceIds: [],
    humanActions: [],
    agentApprovedProposalAttempts: 0,
    caseEvents: [],
    finalCaseState: undefined,
  };
}
