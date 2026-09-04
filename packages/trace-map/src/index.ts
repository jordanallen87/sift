export type RunMapStageStatus = 'neutral' | 'active' | 'completed' | 'guarded' | 'failed';

export interface TraceSignal {
  id: string;
  sequence: number;
  type: string;
  name: string;
  status?: RunMapStageStatus;
  actor?: string;
  origin?: string;
  summary: string;
  attributes?: Record<string, unknown>;
}

export interface RunMapMatch {
  types?: readonly string[];
  names?: readonly string[];
  namePrefixes?: readonly string[];
  origins?: readonly string[];
}

export interface RunMapStageDefinition {
  id: string;
  label: string;
  match: RunMapMatch;
}

export interface RunMapDefinition {
  stages: readonly RunMapStageDefinition[];
}

export interface RunMapStage {
  id: string;
  label: string;
  status: RunMapStageStatus;
  signalIds: string[];
  milestones: string[];
}

export interface RunMapModel {
  stages: RunMapStage[];
}

const STATUS_PRIORITY: Record<RunMapStageStatus, number> = {
  neutral: 0,
  completed: 1,
  active: 2,
  guarded: 3,
  failed: 4,
};

function matches(rule: RunMapMatch, signal: TraceSignal): boolean {
  const constrained =
    rule.types !== undefined ||
    rule.names !== undefined ||
    rule.namePrefixes !== undefined ||
    rule.origins !== undefined;
  if (!constrained) return false;
  if (rule.types !== undefined && !rule.types.includes(signal.type)) return false;
  if (rule.names !== undefined && !rule.names.includes(signal.name)) return false;
  if (
    rule.namePrefixes !== undefined &&
    !rule.namePrefixes.some((prefix) => signal.name.startsWith(prefix))
  ) {
    return false;
  }
  if (
    rule.origins !== undefined &&
    (signal.origin === undefined || !rule.origins.includes(signal.origin))
  ) {
    return false;
  }
  return true;
}

function signalStatus(signal: TraceSignal): RunMapStageStatus {
  return signal.status ?? 'completed';
}

/**
 * Deterministically projects redacted runtime/activity signals into a small
 * navigable model. Unknown signals remain available in the timeline but never
 * invent a Run Map stage.
 */
export function projectRunMap(
  definition: RunMapDefinition,
  signals: readonly TraceSignal[],
): RunMapModel {
  return {
    stages: definition.stages.map((definitionStage) => {
      const matchesForStage = [...signals]
        .sort((left, right) => left.sequence - right.sequence)
        .filter((signal) => matches(definitionStage.match, signal));
      const status = matchesForStage.reduce<RunMapStageStatus>((current, signal) => {
        const next = signalStatus(signal);
        return STATUS_PRIORITY[next] > STATUS_PRIORITY[current] ? next : current;
      }, 'neutral');
      return {
        id: definitionStage.id,
        label: definitionStage.label,
        status,
        signalIds: matchesForStage.map((signal) => signal.id),
        milestones: [...new Set(matchesForStage.map((signal) => signal.summary))].slice(0, 2),
      };
    }),
  };
}
