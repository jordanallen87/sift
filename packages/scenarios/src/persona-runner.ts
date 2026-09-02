/**
 * `runPersona`: walks a persona's turns through an injected executor and
 * assembles the report.
 *
 * The split matters. This module owns the parts that are the same for every
 * persona and every stack — ordering, artifact assembly, gate evaluation,
 * the pass rule — and knows nothing about how a turn is actually executed.
 * `packages/scenarios` sits below `apps/agent` in the workspace graph and
 * cannot import the real command service, so the executor is injected;
 * `scripts/test-persona.ts` supplies the real one.
 *
 * That is not only a dependency-graph accommodation. It means the same
 * report shape can be produced by an in-process run today and by a
 * browser-driven run later, with the gates unchanged, and the only
 * difference visible in the output is which gates could be evaluated.
 */
import {
  PersonaRunReportSchema,
  TurnArtifactSchema,
  type DiagnosticScore,
  type Persona,
  type PersonaRunReport,
  type PersonaTurn,
  type TurnArtifact,
} from '@sift/contracts';
import { evaluateHardGates, hardGatesPassed } from './persona-gates.js';

/**
 * Everything an executor must be able to say about one turn it just ran.
 * Deliberately the artifact minus the fields the runner can fill in itself
 * (index, label, actor), so an executor cannot disagree with the persona
 * about what turn it was executing.
 */
export type PersonaTurnObservation = Omit<TurnArtifact, 'index' | 'label' | 'actor'>;

export interface PersonaTurnExecutor {
  execute(turn: PersonaTurn, index: number): Promise<PersonaTurnObservation>;
  /** Option labels genuinely on the case when the run finished, for the unsupported-claim gate. */
  knownEntityLabels(): readonly string[];
  /** The case the persona actually ran against. */
  caseId(): string;
  /** True when this executor drove a real browser and can therefore report console/axe evidence. */
  readonly browserEvidence: boolean;
}

export interface RunPersonaOptions {
  /** Supplied by a diagnostic pass. Omitted means unscored, never "assumed fine". */
  readonly scores?: readonly DiagnosticScore[];
}

export async function runPersona(
  persona: Persona,
  executor: PersonaTurnExecutor,
  options: RunPersonaOptions = {},
): Promise<PersonaRunReport> {
  const turns: TurnArtifact[] = [];

  for (const [index, turn] of persona.turns.entries()) {
    const observation = await executor.execute(turn, index);
    // Parsed, not cast: an executor that produced a malformed artifact
    // would otherwise poison every gate downstream with a shape no gate
    // was written against.
    turns.push(
      TurnArtifactSchema.parse({
        ...observation,
        index,
        label: turn.label,
        actor: turn.actor,
      }),
    );
  }

  const gates = evaluateHardGates({
    turns,
    mode: persona.mode,
    browserEvidence: executor.browserEvidence,
    knownEntityLabels: executor.knownEntityLabels(),
  });

  return PersonaRunReportSchema.parse({
    schemaVersion: '1.0',
    personaId: persona.id,
    caseId: executor.caseId(),
    turns,
    gates,
    // Present only when a diagnostic pass genuinely supplied scores.
    ...(options.scores !== undefined ? { scores: options.scores } : {}),
    passed: hardGatesPassed(gates),
  });
}
