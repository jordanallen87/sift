/**
 * Turning case state into the six answers the orientation shell renders.
 *
 * The shell's contract is that a novice can answer "what am I doing, where am
 * I, what changed, and what should I do next" from the pane alone. This
 * module is where those answers are computed, so the tests are mostly about
 * the two ways they could be wrong: saying something the state does not
 * support, or saying nothing when the person needs an answer.
 */
import { describe, expect, it } from 'vitest';
import type { CaseState, CompiledDecisionPack } from '@sift/contracts';
import {
  buildDecisionOrientation,
  PHASE_LABELS,
  PROVISIONAL_REASONS,
  ROUTE_TO_OUTCOME,
} from './decision-orientation.js';
import { buildFixtureCaseState, buildFixtureCompiledPack } from '../test/fixtures.js';

const AT = '2026-09-02T00:00:00.000Z';

const PACK: CompiledDecisionPack = buildFixtureCompiledPack({
  discovery: {
    topics: [
      {
        id: 'vehicle.use_case',
        label: 'What this vehicle is for',
        question: 'What is it for?',
        necessity: 'required',
        priority: 100,
        allowedInteractions: ['single_select'],
        optionSeeds: [
          { id: 's1', label: 'Family', valueSummary: 'family' },
          { id: 's2', label: 'Business', valueSummary: 'business' },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: false,
          allowDefer: false,
        },
        mapsToAttributeIds: [],
        mapsToCriterionIds: [],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.budget',
        label: 'Budget',
        question: 'What is your budget?',
        necessity: 'required',
        priority: 90,
        allowedInteractions: ['free_text'],
        optionSeeds: [],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: [],
        mapsToCriterionIds: [],
        confirmationRequired: true,
      },
    ],
    blindSpots: [{ id: 'bs.parking', label: 'Where it parks', detail: 'Garage size.' }],
  },
});

function caseWith(discovery?: CaseState['discovery']): CaseState {
  const base = buildFixtureCaseState();
  return discovery === undefined ? base : { ...base, discovery };
}

/** A case that has genuinely begun discovery, with the first topic confirmed. */
function startedDiscovery(): CaseState {
  return caseWith({
    mode: 'companion',
    topics: [
      {
        topicId: 'vehicle.use_case',
        label: 'What this vehicle is for',
        status: 'confirmed',
        necessity: 'required',
        valueSummary: 'family',
        origin: 'user',
        humanConfirmed: true,
        updatedAt: AT,
      },
    ],
    blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
    dispositions: [],
    pendingInteraction: null,
    updatedAt: AT,
  });
}

describe('buildDecisionOrientation', () => {
  it('names the decision and the pack', () => {
    const orientation = buildDecisionOrientation(caseWith(), PACK);

    expect(orientation.decisionTitle).toBe(buildFixtureCaseState().title);
    expect(orientation.packName).toBe(PACK.identity.name);
  });

  it('always produces a next step, even for a case that has done nothing', () => {
    // The pane is never a dead end. This is the one field that must never
    // be empty.
    expect(buildDecisionOrientation(caseWith(), PACK).nextStepLabel.length).toBeGreaterThan(0);
  });

  it('describes the phase in a person`s words, never the state machine`s', () => {
    const orientation = buildDecisionOrientation(caseWith(), PACK);

    expect(orientation.phaseLabel).toMatch(/^[A-Z]/);
    expect(orientation.phaseLabel).not.toBe(orientation.phase);
    expect(orientation.phaseLabel.split(' ').length).toBeGreaterThan(1);
  });

  it('never states a phase or a route in one pack`s vocabulary', () => {
    // This shell renders for every pack. Home Energy Guardian — a case
    // about an HVAC inspection — was told "then you confirm which models
    // are worth going to see" (ADR 0014).
    //
    // "catalog" belongs in this list too, and was missed when ADR 0014 was
    // applied: the catalog is the *vehicle* catalog (`/api/catalog/vehicles`),
    // and Home Energy Guardian's freshly-opened case sat in the `discovery`
    // route reading "Sift searches the catalog" for a decision about a
    // thermostat, with its four response options already on screen.
    for (const phase of Object.keys(PHASE_LABELS)) {
      expect(`${PHASE_LABELS[phase] ?? ''} ${ROUTE_TO_OUTCOME[phase] ?? ''}`).not.toMatch(
        /test-drive|models are worth|vehicles?\b|cars?\b|catalog/i,
      );
    }
  });

  it('never states a provisionality reason in one pack`s vocabulary either', () => {
    // The two tables above are not the only pack-specific copy this file
    // produces. `provisionalityOf` told every pack that an under-informed
    // ranking "is based on the catalog", and Home Energy Guardian has no
    // catalog -- its four response options ship with it. The sentences now
    // live in a table for the same reason the labels do: so one assertion
    // covers every sentence this shell can put on screen.
    for (const reason of Object.values(PROVISIONAL_REASONS)) {
      expect(reason).not.toMatch(/test-drive|models are worth|vehicles?\b|cars?\b|catalog/i);
    }
  });

  it('does not call a decision ready while the hero may still be reporting open findings', () => {
    // `deriveDecisionPhase` reaches `deciding` as soon as a recommendation
    // is `ready`, which is not the same as nothing being outstanding. The
    // pane read "Ready for your decision" at 8 of 8 covered, directly above
    // "4 findings need your attention" (ADR 0014). The phase label names
    // whose turn it is; readiness is the hero's claim to make.
    expect(PHASE_LABELS['deciding']).not.toMatch(/ready/i);
  });

  it('moves through the phases as the case progresses', () => {
    const discovering = buildDecisionOrientation(caseWith(), PACK);
    expect(discovering.phase).toBe('discovery');

    const ready = buildDecisionOrientation(
      caseWith({
        mode: 'companion',
        topics: [
          {
            topicId: 'vehicle.use_case',
            label: 'What this vehicle is for',
            status: 'confirmed',
            necessity: 'required',
            valueSummary: 'family',
            origin: 'user',
            humanConfirmed: true,
            updatedAt: AT,
          },
          {
            topicId: 'vehicle.budget',
            label: 'Budget',
            status: 'confirmed',
            necessity: 'required',
            valueSummary: 'Under 40,000',
            origin: 'user',
            humanConfirmed: true,
            updatedAt: AT,
          },
        ],
        blindSpotReview: {
          status: 'complete',
          offeredPromptIds: ['bs.parking'],
          selectedPromptIds: [],
          acknowledgedAt: AT,
        },
        dispositions: [],
        pendingInteraction: null,
        updatedAt: AT,
      }),
      PACK,
    );
    expect(ready.phase).toBe('discovering_candidates');
  });

  it('reports the coverage the core derived, not a second count of its own', () => {
    // Uses a case that has genuinely started discovery: a case that has not
    // makes no coverage claim at all, which the contradiction tests below
    // cover directly.
    const orientation = buildDecisionOrientation(startedDiscovery(), PACK);

    expect(orientation.coverage.requiredTotal).toBe(2);
    expect(orientation.coverage.requiredResolved).toBe(1);
  });

  it('puts the outstanding question in focus once one is being asked', () => {
    // `vehicle.use_case` is answered in this fixture, so budget is next --
    // and focus is only shown when it says something the next step does not.
    const orientation = buildDecisionOrientation(startedDiscovery(), PACK);
    expect(orientation.currentFocus === null || orientation.currentFocus === 'Budget').toBe(true);
  });

  it('reports the most recent thing a person actually said as the latest change', () => {
    const orientation = buildDecisionOrientation(
      caseWith({
        mode: 'companion',
        topics: [
          {
            topicId: 'vehicle.use_case',
            label: 'What this vehicle is for',
            status: 'confirmed',
            necessity: 'required',
            valueSummary: 'family',
            origin: 'user',
            humanConfirmed: true,
            updatedAt: AT,
          },
        ],
        blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
        dispositions: [],
        pendingInteraction: null,
        updatedAt: AT,
      }),
      PACK,
    );

    expect(orientation.latestChange).toMatch(/family/);
  });

  it('says nothing about a latest change before anything has changed', () => {
    // A placeholder here would be the shell's first lie.
    expect(buildDecisionOrientation(caseWith(), PACK).latestChange).toBeNull();
  });

  it('marks a provisional case as provisional', () => {
    const orientation = buildDecisionOrientation(
      caseWith({
        mode: 'standalone',
        topics: [
          {
            topicId: 'vehicle.budget',
            label: 'Budget',
            status: 'deferred',
            necessity: 'required',
            origin: 'user',
            humanConfirmed: false,
            updatedAt: AT,
          },
        ],
        blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
        dispositions: [],
        pendingInteraction: null,
        updatedAt: AT,
      }),
      PACK,
    );

    expect(orientation.provisional).toBe(true);
  });

  it('degrades honestly when the pinned pack is not loaded yet', () => {
    // The packs request can still be in flight while a case renders. The
    // shell must say what it knows rather than invent coverage.
    const orientation = buildDecisionOrientation(caseWith(), null);

    expect(orientation.decisionTitle).toBe(buildFixtureCaseState().title);
    expect(orientation.coverage.requiredTotal).toBe(0);
    expect(orientation.currentFocus).toBeNull();
    expect(orientation.nextStepLabel.length).toBeGreaterThan(0);
  });

  it('reports a decided case as decided', () => {
    const decided: CaseState = { ...caseWith(), status: 'decided' };
    const orientation = buildDecisionOrientation(decided, PACK);

    expect(orientation.phase).toBe('decided');
    expect(orientation.routeToOutcome).toMatch(/decided|complete/i);
  });

  it('is a pure function of its inputs', () => {
    const state = caseWith();
    expect(buildDecisionOrientation(state, PACK)).toEqual(buildDecisionOrientation(state, PACK));
  });
});

describe('buildDecisionOrientation: it must never contradict itself on screen', () => {
  it('does not claim a later phase than the coverage it is showing', () => {
    // A seeded demo case arrives with candidates already present and no
    // discovery at all. Reporting "Narrowing down what you found" beside
    // "0 of 5 covered" is exactly the state/UI contradiction the persona
    // hard gates exist to fail, so a case that has candidates but has not
    // started discovery is reported as triage with no coverage claim.
    const seeded: CaseState = {
      ...caseWith(),
      entities: [
        {
          id: 'candidate-1',
          kind: 'candidate',
          label: 'A car',
          attributes: {},
          createdAt: AT,
          updatedAt: AT,
        },
      ],
    };

    const orientation = buildDecisionOrientation(seeded, PACK);

    expect(orientation.phase).toBe('triage');
    // The claim it must not make: that five topics are outstanding in a
    // journey that never asked any.
    expect(orientation.coverage.requiredTotal).toBe(0);
  });

  it('still reports coverage once discovery has genuinely started', () => {
    const started: CaseState = {
      ...caseWith({
        mode: 'companion',
        topics: [
          {
            topicId: 'vehicle.use_case',
            label: 'What this vehicle is for',
            status: 'confirmed',
            necessity: 'required',
            valueSummary: 'family',
            origin: 'user',
            humanConfirmed: true,
            updatedAt: AT,
          },
        ],
        blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
        dispositions: [],
        pendingInteraction: null,
        updatedAt: AT,
      }),
    };

    const orientation = buildDecisionOrientation(started, PACK);
    expect(orientation.coverage.requiredTotal).toBe(2);
    expect(orientation.coverage.requiredResolved).toBe(1);
  });

  it('does not repeat the pack name when it is already the decision title', () => {
    // The demo case's title IS the pack name, so rendering both put
    // "Vehicle Selection" on screen three times counting the app bar.
    const sameName: CaseState = { ...caseWith(), title: PACK.identity.name };
    expect(buildDecisionOrientation(sameName, PACK).packName).toBe('');
  });

  it('qualifies a ready recommendation reached without asking anything', () => {
    // The contradiction found by looking at a release screenshot: a seeded
    // demo case reaches a ready recommendation without anyone answering a
    // question, so the shell rendered "Ready for your decision" directly
    // above "0 of 5 covered". Both statements are true; the pairing is not.
    const seeded: CaseState = {
      ...caseWith({
        mode: 'companion',
        topics: [],
        blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
        dispositions: [],
        pendingInteraction: null,
        updatedAt: AT,
      }),
      entities: [
        {
          id: 'candidate-1',
          kind: 'candidate',
          label: 'A car',
          attributes: {},
          createdAt: AT,
          updatedAt: AT,
        },
      ],
      // The recommendation is what forces a post-discovery phase here, and
      // is exactly the state the release screenshot showed.
      recommendation: {
        id: 'rec-1',
        status: 'ready',
        favoredOptionId: 'candidate-1',
        rationale: 'The catalog favours this one.',
        facts: [],
        hypotheses: [],
        confidence: 0.6,
        limitations: [],
        sourceIds: [],
        resolvedObligationIds: [],
        acceptedUncertaintyObligationIds: [],
        generatedAt: AT,
      },
    };

    const orientation = buildDecisionOrientation(seeded, PACK);

    expect(orientation.phase).toBe('deciding');
    expect(orientation.provisional).toBe(true);
    expect(orientation.provisionalReason).toMatch(/has not asked you everything/i);
    // And it names what would change it, rather than only flagging doubt.
    expect(orientation.provisionalReason).toMatch(/answering the questions/i);
  });

  it('uses the deferral wording when that is the actual reason', () => {
    const orientation = buildDecisionOrientation(
      caseWith({
        mode: 'standalone',
        topics: [
          {
            topicId: 'vehicle.use_case',
            label: 'What this vehicle is for',
            status: 'confirmed',
            necessity: 'required',
            valueSummary: 'family',
            origin: 'user',
            humanConfirmed: true,
            updatedAt: AT,
          },
          {
            topicId: 'vehicle.budget',
            label: 'Budget',
            status: 'deferred',
            necessity: 'required',
            origin: 'user',
            humanConfirmed: false,
            updatedAt: AT,
          },
        ],
        blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
        dispositions: [],
        pendingInteraction: null,
        updatedAt: AT,
      }),
      PACK,
    );

    expect(orientation.provisional).toBe(true);
    expect(orientation.provisionalReason).toMatch(/deferred/i);
  });

  it('says nothing about provisionality when there is nothing to qualify', () => {
    expect(buildDecisionOrientation(startedDiscovery(), PACK).provisionalReason).toBeNull();
  });

  it('makes no live progress claim once the decision is closed', () => {
    // The `decided` release baseline read "Decided · 0 of 5 covered · Next:
    // Review what was decided" -- a discovery progress counter one interpunct
    // from the word "Decided". The count was arithmetically true (the case was
    // decided from catalog data and evidence, and the topics were never
    // asked), but it describes an activity that can no longer progress, and
    // beside "Decided" it reads as "decided having covered nothing".
    //
    // This is the same rule as the seeded-case suppression above, one phase
    // later: no progress to make, no progress claim.
    const decided: CaseState = { ...startedDiscovery(), status: 'decided' };
    const orientation = buildDecisionOrientation(decided, PACK);

    expect(orientation.phase).toBe('decided');
    expect(orientation.coverage.requiredTotal).toBe(0);
    expect(orientation.coverage.requiredResolved).toBe(0);
    // The answers a closed case still owes a person are untouched.
    expect(orientation.nextStepLabel.length).toBeGreaterThan(0);
    expect(orientation.routeToOutcome).toMatch(/complete/i);
  });

  it('puts nothing in focus on a closed decision', () => {
    // The same stale-progress defect as the counter, one line down and
    // behind the disclosure. `deriveDiscoveryReadiness` names the
    // highest-priority unanswered topic from the topics alone -- it never
    // reads `status` -- so the expander on the decided baseline case would
    // read "In focus: Budget" beneath the word "Decided".
    const decided: CaseState = { ...startedDiscovery(), status: 'decided' };

    expect(buildDecisionOrientation(decided, PACK).currentFocus).toBeNull();
  });

  it('does not qualify a closed decision as provisional for questions it never asked', () => {
    // The counterpart to suppressing the counter: the qualification that
    // names unanswered required topics belongs to a case someone can still
    // answer them on. On a decided case it would be the same in-progress
    // reading in sentence form.
    const decided: CaseState = { ...startedDiscovery(), status: 'decided' };
    const orientation = buildDecisionOrientation(decided, PACK);

    // `?? ''` because "no qualification at all" is the passing case here,
    // and `toMatch` throws rather than passing on a null.
    expect(orientation.provisionalReason ?? '').not.toMatch(/has not asked you everything/i);
  });

  it('does not put the same thing in focus and in the next step', () => {
    const orientation = buildDecisionOrientation(caseWith(), PACK);
    expect(orientation.currentFocus).not.toBe(orientation.nextStepLabel);
  });
});
