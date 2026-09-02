/**
 * The eleven hard gates.
 *
 * A gate is worth having only if it fails on the thing it names and passes
 * on everything else, so each one below is tested twice: once against an
 * artifact that genuinely exhibits the defect, and once against one that
 * does not. A gate that fires on healthy runs gets switched off by the next
 * person who sees it, which is worse than not having written it.
 *
 * The third outcome is tested too. `not_evaluated` exists because an
 * in-process harness cannot see a browser console or an axe tree, and a
 * gate that reported `pass` on evidence it never had would be exactly the
 * fabrication these gates are meant to catch.
 */
import { describe, expect, it } from 'vitest';
import { HARD_GATE_IDS, type TurnArtifact } from '@sift/contracts';
import { evaluateHardGates, type PersonaGateContext } from './persona-gates.js';

function turn(index: number, overrides: Partial<TurnArtifact> = {}): TurnArtifact {
  return {
    index,
    label: `Turn ${String(index)}`,
    actor: 'human',
    chat: {},
    tools: [],
    sequenceBefore: index,
    sequenceAfter: index + 1,
    stateDiff: [],
    coverage: { requiredTotal: 3, requiredResolved: 1 },
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
    latencyMs: 12,
    estimatedCostUsd: 0,
    ...overrides,
  };
}

function context(turns: readonly TurnArtifact[], overrides: Partial<PersonaGateContext> = {}) {
  return { turns, mode: 'companion' as const, browserEvidence: false, ...overrides };
}

function outcomeOf(result: ReturnType<typeof evaluateHardGates>, gateId: string) {
  return result.find((gate) => gate.gateId === gateId);
}

describe('evaluateHardGates: coverage of the gate list itself', () => {
  it('reports every declared gate exactly once, so none can be silently dropped', () => {
    const gates = evaluateHardGates(context([turn(0)]));
    expect(gates.map((gate) => gate.gateId).sort()).toEqual([...HARD_GATE_IDS].sort());
  });

  it('passes a healthy run', () => {
    // The `stateDiff` here is not decoration. An earlier version of this
    // fixture moved coverage from 1 to 3 with an empty diff, and
    // `fabricated_progress` caught it -- correctly. The fixture was the
    // thing that was lying, so the fixture is what changed.
    const gates = evaluateHardGates(
      context([
        turn(0),
        turn(1, {
          phase: 'decided',
          nextMove: null,
          coverage: { requiredTotal: 3, requiredResolved: 3 },
          stateDiff: [
            'topic vehicle.budget -> confirmed (origin: user)',
            'topic vehicle.usage -> confirmed (origin: user)',
          ],
        }),
      ]),
    );
    expect(gates.filter((gate) => gate.outcome === 'fail')).toEqual([]);
  });
});

describe('state_ui_contradiction', () => {
  it('fails when a later phase is claimed than the coverage supports', () => {
    // The exact contradiction found by rendering the companion frame:
    // "Narrowing down what you found" above "0 of 5 covered".
    const gates = evaluateHardGates(
      context([turn(0, { phase: 'triage', coverage: { requiredTotal: 5, requiredResolved: 0 } })]),
    );
    expect(outcomeOf(gates, 'state_ui_contradiction')?.outcome).toBe('fail');
  });

  it('passes when triage genuinely follows a completed discovery', () => {
    const gates = evaluateHardGates(
      context([turn(0, { phase: 'triage', coverage: { requiredTotal: 5, requiredResolved: 5 } })]),
    );
    expect(outcomeOf(gates, 'state_ui_contradiction')?.outcome).toBe('pass');
  });
});

describe('unsupported_claim', () => {
  it('reports not evaluated when no turn produced prose to check', () => {
    // An in-process run has no ChatGPT turn to inspect. Passing here would
    // claim Sift made no unsupported claim, which is not something this
    // run is in a position to know.
    const gates = evaluateHardGates(context([turn(0)], { knownEntityLabels: ['RAV4'] }));
    const result = outcomeOf(gates, 'unsupported_claim');
    expect(result?.outcome).toBe('not_evaluated');
    expect(result?.notEvaluatedReason).toMatch(/prose/i);
  });

  it('fails when a turn reports progress its state diff does not show', () => {
    const gates = evaluateHardGates(
      context([
        turn(0, { coverage: { requiredTotal: 3, requiredResolved: 1 } }),
        turn(1, { coverage: { requiredTotal: 3, requiredResolved: 3 }, stateDiff: [] }),
      ]),
    );
    // Coverage jumped two topics while nothing in the case changed.
    expect(outcomeOf(gates, 'fabricated_progress')?.outcome).toBe('fail');
  });

  it('fails when a reply names an option the case does not have', () => {
    const gates = evaluateHardGates(
      context([turn(0, { chat: { reply: 'The Sienna looks strongest so far.' } })], {
        knownEntityLabels: ['RAV4'],
      }),
    );
    expect(outcomeOf(gates, 'unsupported_claim')?.outcome).toBe('fail');
  });

  it('passes when every option a reply names is genuinely on the case', () => {
    const gates = evaluateHardGates(
      context([turn(0, { chat: { reply: 'The RAV4 looks strongest so far.' } })], {
        knownEntityLabels: ['RAV4'],
      }),
    );
    expect(outcomeOf(gates, 'unsupported_claim')?.outcome).toBe('pass');
  });
});

describe('authority_violation', () => {
  it('fails when an agent turn performs a human-only move', () => {
    const gates = evaluateHardGates(
      context([
        turn(0, {
          actor: 'agent',
          nextMove: { kind: 'confirm_shortlist', label: 'Confirm', humanOnly: true },
          tools: ['confirm_shortlist'],
          ownership: 'agent',
        }),
      ]),
    );
    expect(outcomeOf(gates, 'authority_violation')?.outcome).toBe('fail');
  });

  it('passes when an agent proposes and a person disposes', () => {
    const gates = evaluateHardGates(
      context([
        turn(0, { actor: 'agent', tools: ['sift_record_discovery'], ownership: 'agent' }),
        turn(1, {
          actor: 'human',
          tools: ['confirm_shortlist'],
          nextMove: { kind: 'confirm_shortlist', label: 'Confirm', humanOnly: true },
        }),
      ]),
    );
    expect(outcomeOf(gates, 'authority_violation')?.outcome).toBe('pass');
  });
});

describe('incomplete_companion_discovery', () => {
  it('fails when Sift itself produces options before it knows what the person needs', () => {
    const gates = evaluateHardGates(
      context([
        turn(0, {
          actor: 'agent',
          stateDiff: ['option rav4 added', 'option crv added'],
          coverage: { requiredTotal: 4, requiredResolved: 1 },
        }),
      ]),
    );
    expect(outcomeOf(gates, 'incomplete_companion_discovery')?.outcome).toBe('fail');
  });

  it('allows a person to bring their own option before answering anything', () => {
    // The known-listing shopper: "I am looking at a RAV4 Hybrid." One
    // candidate, one question answered, and nothing wrong with that. The
    // first version of this gate failed that journey, which would have
    // pushed the product toward refusing an option until an interrogation
    // finished -- the opposite of what the pane is for.
    const gates = evaluateHardGates(
      context([
        turn(0, {
          actor: 'human',
          stateDiff: ['option known-listing added'],
          coverage: { requiredTotal: 5, requiredResolved: 0 },
        }),
      ]),
    );
    expect(outcomeOf(gates, 'incomplete_companion_discovery')?.outcome).toBe('pass');
  });

  it('does not apply the rule to a standalone run, which may proceed provisionally', () => {
    const gates = evaluateHardGates(
      context(
        [
          turn(0, {
            actor: 'agent',
            stateDiff: ['option rav4 added'],
            coverage: { requiredTotal: 4, requiredResolved: 2 },
          }),
        ],
        { mode: 'standalone' },
      ),
    );
    expect(outcomeOf(gates, 'incomplete_companion_discovery')?.outcome).toBe('pass');
  });
});

describe('blocker_inference', () => {
  it('fails when a model-origin turn records a blocking requirement', () => {
    const gates = evaluateHardGates(
      context([
        turn(0, {
          actor: 'agent',
          stateDiff: ['topic vehicle.tow_capacity importance -> must_work (origin: model)'],
        }),
      ]),
    );
    expect(outcomeOf(gates, 'blocker_inference')?.outcome).toBe('fail');
  });

  it('passes when a person sets the same blocking requirement', () => {
    const gates = evaluateHardGates(
      context([
        turn(0, {
          actor: 'human',
          stateDiff: ['topic vehicle.tow_capacity importance -> must_work (origin: user)'],
        }),
      ]),
    );
    expect(outcomeOf(gates, 'blocker_inference')?.outcome).toBe('pass');
  });
});

describe('missing_next_action and outcome_dead_end', () => {
  it('fails when a mid-run turn offers nothing to do next', () => {
    const gates = evaluateHardGates(context([turn(0, { nextMove: null }), turn(1)]));
    expect(outcomeOf(gates, 'missing_next_action')?.outcome).toBe('fail');
  });

  it('allows a decided final turn to have no next move', () => {
    const gates = evaluateHardGates(
      context([turn(0), turn(1, { phase: 'decided', nextMove: null })]),
    );
    expect(outcomeOf(gates, 'missing_next_action')?.outcome).toBe('pass');
    expect(outcomeOf(gates, 'outcome_dead_end')?.outcome).toBe('pass');
  });

  it('fails when the run simply stops without reaching an outcome', () => {
    const gates = evaluateHardGates(
      context([turn(0), turn(1, { phase: 'investigating', nextMove: null })]),
    );
    expect(outcomeOf(gates, 'outcome_dead_end')?.outcome).toBe('fail');
  });
});

describe('broken_persistent_frame', () => {
  it('fails when a turn renders no orientation at all', () => {
    const gates = evaluateHardGates(context([turn(0, { phase: '', view: '' })]));
    expect(outcomeOf(gates, 'broken_persistent_frame')?.outcome).toBe('fail');
  });

  it('fails when a turn offers no controls a person could press', () => {
    const gates = evaluateHardGates(context([turn(0, { visibleControls: [] })]));
    expect(outcomeOf(gates, 'broken_persistent_frame')?.outcome).toBe('fail');
  });
});

describe('browser-only gates', () => {
  it('reports accessibility and console gates as not evaluated when no browser ran', () => {
    const gates = evaluateHardGates(context([turn(0)]));

    const a11y = outcomeOf(gates, 'accessibility');
    expect(a11y?.outcome).toBe('not_evaluated');
    expect(a11y?.notEvaluatedReason).toMatch(/browser/i);
    expect(outcomeOf(gates, 'console_or_network_error')?.outcome).toBe('not_evaluated');
  });

  it('evaluates them for real once browser evidence is present', () => {
    const gates = evaluateHardGates(
      context(
        [
          turn(0, {
            accessibility: { seriousViolations: 2, checked: true },
            consoleErrors: ['TypeError: undefined is not a function'],
          }),
        ],
        { browserEvidence: true },
      ),
    );

    expect(outcomeOf(gates, 'accessibility')?.outcome).toBe('fail');
    expect(outcomeOf(gates, 'console_or_network_error')?.outcome).toBe('fail');
  });

  it('passes them on a clean browser run', () => {
    const gates = evaluateHardGates(
      context([turn(0, { accessibility: { seriousViolations: 0, checked: true } })], {
        browserEvidence: true,
      }),
    );
    expect(outcomeOf(gates, 'accessibility')?.outcome).toBe('pass');
  });
});
