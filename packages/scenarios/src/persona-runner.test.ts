/**
 * The persona runner, and the three personas themselves.
 *
 * The runner is thin by design, so most of what is worth testing here is
 * about what it refuses to paper over: an executor that produces a
 * malformed artifact, a report that claims a pass it did not earn, and a
 * scores field that must stay absent rather than default.
 *
 * The persona assertions are about the *set*. Three personas that all
 * exercise the same path would prove nothing about adaptivity, so the tests
 * check that they genuinely diverge.
 */
import { describe, expect, it } from 'vitest';
import {
  PERSONA_IDS,
  PersonaSchema,
  type Persona,
  type PersonaTurn,
  type TurnArtifact,
} from '@sift/contracts';
import {
  runPersona,
  type PersonaTurnExecutor,
  type PersonaTurnObservation,
} from './persona-runner.js';
import { PERSONAS, personaById } from '../fixtures/personas/index.js';

function observation(overrides: Partial<PersonaTurnObservation> = {}): PersonaTurnObservation {
  return {
    chat: {},
    tools: [],
    sequenceBefore: 0,
    sequenceAfter: 1,
    stateDiff: ['topic vehicle.use_case -> confirmed (origin: user)'],
    coverage: { requiredTotal: 2, requiredResolved: 1 },
    phase: 'discovery',
    nextMove: { kind: 'answer_topic', label: 'Tell Sift your budget', humanOnly: false },
    runPlan: null,
    events: [],
    view: 'interaction',
    ownership: 'human',
    visibleControls: ['Answer'],
    accessibility: { seriousViolations: 0, checked: false },
    consoleErrors: [],
    networkFailures: [],
    latencyMs: 5,
    estimatedCostUsd: 0,
    ...overrides,
  };
}

function executorFor(
  perTurn: (turn: PersonaTurn, index: number) => PersonaTurnObservation,
  overrides: Partial<PersonaTurnExecutor> = {},
): PersonaTurnExecutor {
  return {
    execute: (turn, index) => Promise.resolve(perTurn(turn, index)),
    knownEntityLabels: () => [],
    caseId: () => 'case-persona',
    browserEvidence: false,
    ...overrides,
  };
}

const TINY_PERSONA: Persona = PersonaSchema.parse({
  id: 'family-novice',
  title: 'Tiny',
  goal: 'Exercise the runner.',
  packId: 'car-purchase',
  demoId: 'car-purchase',
  mode: 'companion',
  turns: [
    { label: 'First', actor: 'human' },
    { label: 'Last', actor: 'human' },
  ],
});

describe('runPersona', () => {
  it('produces one artifact per turn, in order, labelled from the persona', async () => {
    const report = await runPersona(
      TINY_PERSONA,
      executorFor((_turn, index) =>
        index === 1 ? observation({ phase: 'decided', nextMove: null }) : observation(),
      ),
    );

    expect(report.turns.map((turn) => turn.index)).toEqual([0, 1]);
    expect(report.turns.map((turn) => turn.label)).toEqual(['First', 'Last']);
  });

  it('takes the actor from the persona, not from the executor', async () => {
    // An executor claiming a human turn was an agent turn would defeat the
    // authority gate entirely.
    const report = await runPersona(
      TINY_PERSONA,
      executorFor((_turn, index) =>
        index === 1 ? observation({ phase: 'decided', nextMove: null }) : observation(),
      ),
    );
    expect(report.turns.every((turn) => turn.actor === 'human')).toBe(true);
  });

  it('rejects a malformed artifact instead of passing it to the gates', async () => {
    await expect(
      runPersona(
        TINY_PERSONA,
        executorFor(() => observation({ coverage: { requiredTotal: -1, requiredResolved: 0 } })),
      ),
    ).rejects.toThrow();
  });

  it('reports a run with a failing gate as not passed', async () => {
    const report = await runPersona(
      TINY_PERSONA,
      // A run that simply stops: no decision, nothing to do next.
      executorFor(() => observation({ nextMove: null })),
    );

    expect(report.passed).toBe(false);
    expect(report.gates.some((gate) => gate.outcome === 'fail')).toBe(true);
  });

  it('leaves scores absent when no diagnostic pass supplied any', async () => {
    const report = await runPersona(
      TINY_PERSONA,
      executorFor((_turn, index) =>
        index === 1 ? observation({ phase: 'decided', nextMove: null }) : observation(),
      ),
    );

    expect(report.scores).toBeUndefined();
  });

  it('carries supplied scores through untouched', async () => {
    const report = await runPersona(
      TINY_PERSONA,
      executorFor((_turn, index) =>
        index === 1 ? observation({ phase: 'decided', nextMove: null }) : observation(),
      ),
      {
        scores: [
          {
            dimension: 'orientation',
            turnIndex: 0,
            score: 5,
            evidence: { turnIndex: 0, quote: 'Next: Tell Sift your budget' },
          },
        ],
      },
    );

    expect(report.scores).toHaveLength(1);
    expect(report.scores?.[0]?.score).toBe(5);
  });

  it('records a not-evaluated browser gate rather than a pass', async () => {
    const report = await runPersona(
      TINY_PERSONA,
      executorFor((_turn, index) =>
        index === 1 ? observation({ phase: 'decided', nextMove: null }) : observation(),
      ),
    );

    const a11y = report.gates.find((gate) => gate.gateId === 'accessibility');
    expect(a11y?.outcome).toBe('not_evaluated');
    // And a not-evaluated gate does not block the run, because it is not a
    // failure -- it is a statement about what this harness can see.
    expect(report.passed).toBe(true);
  });
});

describe('the persona set', () => {
  it('covers every declared persona id exactly once', () => {
    expect(PERSONAS.map((persona) => persona.id).sort()).toEqual([...PERSONA_IDS].sort());
  });

  it('runs the family and landscaping journeys through the same pack', () => {
    // The contrast beat is only interesting if the pack is genuinely
    // shared. Two packs would make the divergence trivial.
    expect(personaById('family-novice').packId).toBe(personaById('landscaping-owner').packId);
  });

  it('gives the family and landscaping journeys genuinely different questions', () => {
    const family = personaById('family-novice')
      .turns.map((turn) => turn.utterance ?? '')
      .join(' ')
      .toLowerCase();
    const business = personaById('landscaping-owner')
      .turns.map((turn) => turn.utterance ?? '')
      .join(' ')
      .toLowerCase();

    // Each says something the other never could.
    expect(family).toMatch(/car seat|school/);
    expect(business).toMatch(/tow|trailer|crew/);
    expect(family).not.toMatch(/tow|trailer/);
    expect(business).not.toMatch(/car seat|school/);
  });

  it('gives the family hero enough turns to reach an outcome', () => {
    // A hero journey that stops after three turns proves nothing about the
    // parts of the product that come after triage.
    expect(personaById('family-novice').turns.length).toBeGreaterThanOrEqual(8);
  });

  it('raises an unanticipated concern in the family journey', () => {
    // The beat the whole architecture exists for: a concern the pack never
    // anticipated, arriving mid-run.
    const utterances = personaById('family-novice')
      .turns.map((turn) => turn.utterance ?? '')
      .join(' ');
    expect(utterances).toMatch(/dog crate/i);
  });

  it('has the known-listing shopper arrive with an option already in hand', () => {
    const first = personaById('known-listing-shopper').turns[0];
    expect(first?.command).toBe('upsertOption');
  });
});

describe('artifact shape', () => {
  it('has no field for a screenshot that was never taken', () => {
    // `screenshotPath` is optional rather than defaulted to a string. A
    // path pointing at a file that does not exist is worse than no path.
    const artifact: TurnArtifact = {
      ...observation(),
      index: 0,
      label: 'x',
      actor: 'human',
    };
    expect(artifact.screenshotPath).toBeUndefined();
  });
});
