/**
 * Behavioral tests for `sift_explain_ranking` -- the one WebMCP read tool
 * that hands the model Sift's own deterministic analysis instead of the raw
 * facts it would otherwise have to re-derive one from.
 *
 * A new sibling file rather than an addition to `register-sift-tools.test.ts`
 * (~1100 lines) or `register-sift-tools-new-tools.test.ts` (~1000 lines), for
 * the same reason both of those files state in their own headers: keep
 * merge-conflict surface small while several lanes work on the same catalog.
 *
 * The proofs this file exists to carry, in priority order:
 *
 *  1. **The tool returns Sift's computation, not its own.** Every ranking
 *     assertion below is written against `scoreCaseState`/`deriveInsights`
 *     (`@sift/core`) evaluated independently in the test, never against a
 *     hard-coded expected total. A projection that quietly re-derived,
 *     re-sorted, or rounded differently would fail here rather than silently
 *     ship a second, divergent ranking -- which is the exact failure mode
 *     ADR 0012 exists to prevent ("two implementations that agree today are
 *     two implementations that can drift").
 *  2. **The honesty rules survive the projection.** An unknown arrives as
 *     `score: null` / `status: 'unknown'`, never `0`. A constraint violator
 *     is still ON the board, fully scored, ranked last -- never removed.
 *  3. **Truncation is visible and quantified.** A bounded payload that does
 *     not say what it dropped is a lying analysis. Every cap reports its own
 *     true total, and the criterion caps additionally report the SHARE OF
 *     WEIGHT they left out, so a caller can tell "this explains the whole
 *     decision" from "this explains 3% of it".
 *  4. **No authority.** `ui.changed: false`, no `SiftCommands` method reached
 *     at all, `eventSequence` untouched.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AttributeDefinition, CaseState, Criterion, EntityRecord } from '@sift/contracts';
import { deriveInsights, scoreCaseState } from '@sift/core';
import type { SiftCommands } from '../api/sift-client.js';
import { createFakeSiftCommands } from '../test/fake-sift-commands.js';
import { buildFixtureCaseState } from '../test/fixtures.js';
import { buildWorkspaceScoreboard } from '../components/case-scoreboard.js';
import { InMemoryModelContextAdapter } from './adapter.js';
import { registerSiftTools } from './register-sift-tools.js';
import type { RankingExplanation } from './ranking-context.js';

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

interface AnyToolResult<TData = unknown> {
  ok: boolean;
  message: string;
  data?: TData;
  caseId?: string;
  sequence?: number;
  ui: { changed: boolean; focusTarget?: string };
  error?: { code: string; retryable: boolean };
}

async function invokeTool<TData = unknown>(
  adapter: InMemoryModelContextAdapter,
  name: string,
  input: unknown,
): Promise<AnyToolResult<TData>> {
  return adapter.invoke<unknown, AnyToolResult<TData>>(name, input);
}

async function setUpWithActiveCase(
  caseId: string,
  getActiveCase: () => CaseState | null = () => null,
): Promise<{ adapter: InMemoryModelContextAdapter; commands: SiftCommands }> {
  const adapter = new InMemoryModelContextAdapter();
  const commands = createFakeSiftCommands();
  const handle = await registerSiftTools({
    adapter,
    commands,
    getActiveCase,
    listPacks: () => [],
  });
  await handle.setActiveCase(caseId);
  return { adapter, commands };
}

// --- Fixture builders -------------------------------------------------
//
// A real three-car shape rather than an abstract one: the point of this tool
// is that the sentences it returns are the ones a person would read beside
// the ranking, and an `a`/`b`/`c` fixture cannot show that.

function buildDefinition(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    id: 'car.out_the_door_price',
    label: 'Out-the-door price',
    valueType: 'money',
    required: false,
    appliesTo: ['candidate'],
    evidenceExpectation: 'source',
    comparison: 'lower_better',
    sensitive: false,
    ...overrides,
  };
}

function buildCriterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    id: 'pref.deal_value',
    label: 'Deal value',
    kind: 'preference',
    weight: 40,
    direction: 'higher_better',
    appliesToAttribute: 'car.out_the_door_price',
    origin: 'pack',
    status: 'active',
    ...overrides,
  };
}

function buildOption(
  id: string,
  label: string,
  attributes: EntityRecord['attributes'],
): EntityRecord {
  return {
    id,
    kind: 'candidate',
    label,
    attributes,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function money(
  definitionId: string,
  label: string,
  amount: number,
): EntityRecord['attributes'][string] {
  return {
    definitionId,
    label,
    value: { type: 'money', amount, currency: 'USD' },
    origin: 'user',
    sourceIds: [],
    status: 'asserted',
    updatedAt: FIXED_TIMESTAMP,
  };
}

function number(
  definitionId: string,
  label: string,
  value: number,
): EntityRecord['attributes'][string] {
  return {
    definitionId,
    label,
    value: { type: 'number', value },
    origin: 'user',
    sourceIds: [],
    status: 'supported',
    updatedAt: FIXED_TIMESTAMP,
  };
}

const SAFETY_GRADES = ['Not Rated', 'Recommended', 'Top Safety Pick', 'Top Safety Pick+'];

function grade(value: string): EntityRecord['attributes'][string] {
  return {
    definitionId: 'car.crash_safety_rating',
    label: 'Crash safety rating',
    value: { type: 'enum', value, allowedValues: SAFETY_GRADES },
    origin: 'pack',
    sourceIds: [],
    status: 'supported',
    updatedAt: FIXED_TIMESTAMP,
  };
}

const CAR_DEFINITIONS: AttributeDefinition[] = [
  buildDefinition(),
  buildDefinition({
    id: 'car.cargo_volume_cu_ft',
    label: 'Cargo volume',
    valueType: 'number',
    comparison: 'higher_better',
  }),
  buildDefinition({
    id: 'car.crash_safety_rating',
    label: 'Crash safety rating',
    valueType: 'enum',
    comparison: 'higher_better',
    allowedValues: SAFETY_GRADES,
    orderedValues: SAFETY_GRADES,
  }),
];

const CAR_CRITERIA: Criterion[] = [
  buildCriterion(),
  buildCriterion({
    id: 'pref.household_fit',
    label: 'Household fit',
    weight: 30,
    appliesToAttribute: 'car.cargo_volume_cu_ft',
  }),
  buildCriterion({
    id: 'pref.safety',
    label: 'Safety',
    weight: 30,
    appliesToAttribute: 'car.crash_safety_rating',
  }),
];

/**
 * Three cars where every honesty rule has something to say: the cheapest is
 * also the safest (so it leads), the roomiest is the most expensive, and the
 * third has no safety rating at all -- which must lower its COVERAGE and
 * never its SCORE.
 */
function buildCarCase(overrides: Partial<CaseState> = {}): CaseState {
  return buildFixtureCaseState({
    attributeDefinitions: CAR_DEFINITIONS,
    criteria: CAR_CRITERIA,
    entities: [
      buildOption('opt-rav4', 'Toyota RAV4', {
        'car.out_the_door_price': money('car.out_the_door_price', 'Out-the-door price', 28_000),
        'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 37),
        'car.crash_safety_rating': grade('Top Safety Pick+'),
      }),
      buildOption('opt-crv', 'Honda CR-V', {
        'car.out_the_door_price': money('car.out_the_door_price', 'Out-the-door price', 31_000),
        'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 39),
        'car.crash_safety_rating': grade('Top Safety Pick'),
      }),
      buildOption('opt-forester', 'Subaru Forester', {
        'car.out_the_door_price': money('car.out_the_door_price', 'Out-the-door price', 30_000),
        'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 28),
      }),
    ],
    ...overrides,
  });
}

describe('sift_explain_ranking: it returns Sift’s analysis, not the model’s', () => {
  it('ranks every option exactly as @sift/core does, best first, with each option’s own rank/score/coverage', async () => {
    const caseState = buildCarCase();
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    // The independent computation this projection must agree with exactly.
    const board = scoreCaseState(caseState);

    expect(result.ok).toBe(true);
    expect(result.data?.options.items.map((option) => option.optionId)).toEqual(
      board.options.map((option) => option.optionId),
    );
    expect(result.data?.options.items.map((option) => option.score)).toEqual(
      board.options.map((option) => option.total),
    );
    expect(result.data?.options.items.map((option) => option.coverage)).toEqual(
      board.options.map((option) => option.coverage),
    );
    expect(result.data?.options.items.map((option) => option.rank)).toEqual([1, 2, 3]);
    expect(result.data?.options.total).toBe(3);
    expect(result.data?.isRankable).toBe(true);
  });

  it('formats every percentage through the same formatScore the workspace uses, so the two can never disagree about rounding', async () => {
    const caseState = buildCarCase();
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });
    const board = scoreCaseState(caseState);

    expect(result.data?.options.items.map((option) => option.scorePercent)).toEqual(
      board.options.map((option) =>
        option.total === null ? null : `${Math.round(option.total * 100)}%`,
      ),
    );
    expect(result.data?.options.items.map((option) => option.coveragePercent)).toEqual(
      board.options.map((option) => `${Math.round(option.coverage * 100)}%`),
    );
  });

  it('passes each criterion line’s plain-English reason through verbatim rather than paraphrasing it', async () => {
    const caseState = buildCarCase();
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });
    const board = scoreCaseState(caseState);

    const leader = result.data?.options.items[0];
    const boardLeader = board.options[0];
    expect(leader?.criteria?.items.map((line) => line.reason)).toEqual(
      [...(boardLeader?.criteria ?? [])]
        .sort((a, b) => b.weight - a.weight || (a.criterionId < b.criterionId ? -1 : 1))
        .map((line) => line.reason),
    );
    // Not a paraphrase: the engine's own sentence, including the direction it
    // actually scored by.
    expect(leader?.criteria?.items.some((line) => line.reason.includes('lower is better'))).toBe(
      true,
    );
  });

  it('returns the derived insights unchanged, including the decisive-criterion experiment', async () => {
    const caseState = buildCarCase();
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });
    // Derived the way the app derives it, so this stays a test of the
    // *projection* rather than of the insight copy. `deriveInsights` now
    // takes an `InsightContext` (whether the weights are the person's own
    // or the pack's untouched defaults), and calling it bare here compared
    // the tool's output against a differently-worded set.
    const expected = buildWorkspaceScoreboard(caseState).insights;

    expect(result.data?.insights.items.map((insight) => insight.id)).toEqual(
      expected.map((insight) => insight.id),
    );
    expect(result.data?.insights.items.map((insight) => insight.headline)).toEqual(
      expected.map((insight) => insight.headline),
    );
    expect(result.data?.insights.total).toBe(expected.length);
  });
});

describe('sift_explain_ranking: the honesty rules survive the projection', () => {
  it('reports a missing value as status "unknown" with score null -- never as a zero', async () => {
    const caseState = buildCarCase();
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
      optionId: 'opt-forester',
    });

    const forester = result.data?.options.items.find(
      (option) => option.optionId === 'opt-forester',
    );
    const safetyLine = forester?.criteria?.items.find((line) => line.criterionId === 'pref.safety');
    expect(safetyLine?.status).toBe('unknown');
    expect(safetyLine?.score).toBeNull();
    // Coverage, not score, is what a missing value moves.
    expect(forester?.coverage).toBeLessThan(1);
    expect(forester?.score).not.toBeNull();
  });

  it('keeps a hard-constraint violator ON the board, fully scored and flagged, ranked below every compliant option', async () => {
    const caseState = buildCarCase({
      criteria: [
        ...CAR_CRITERIA,
        buildCriterion({
          id: 'req.budget',
          label: 'Stay under $30,000',
          kind: 'hard_constraint',
          weight: 0,
          direction: 'lower_better',
          appliesToAttribute: 'car.out_the_door_price',
          target: { type: 'money', amount: 30_000, currency: 'USD' },
        }),
      ],
    });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    const items = result.data?.options.items ?? [];
    // Nothing was removed on the person's behalf.
    expect(items).toHaveLength(3);
    const crv = items.find((option) => option.optionId === 'opt-crv');
    expect(crv?.violatedConstraintIds).toEqual(['req.budget']);
    expect(crv?.score).not.toBeNull();
    // Violators sort last, but they are still ranked, not deleted.
    expect(items[items.length - 1]?.optionId).toBe('opt-crv');
  });

  it('reports a contested measurement as status "disputed" with its own disputedCriterionIds entry, never collapsed into "scored"', async () => {
    // Scoring rule 6, and the shape of the real car scenario: the leader
    // leads on a rating whose sources contradict each other. `disputed` and
    // `scored` both carry a number, so a projection that collapsed the two
    // would report a contested measurement as an established one.
    const caseState = buildCarCase({
      entities: [
        buildOption('opt-outback', 'Subaru Outback', {
          'car.out_the_door_price': money('car.out_the_door_price', 'Out-the-door price', 28_000),
          'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 37),
          'car.crash_safety_rating': { ...grade('Top Safety Pick+'), status: 'conflicted' },
        }),
        buildOption('opt-crv', 'Honda CR-V', {
          'car.out_the_door_price': money('car.out_the_door_price', 'Out-the-door price', 31_000),
          'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 39),
          'car.crash_safety_rating': grade('Top Safety Pick'),
        }),
      ],
    });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });
    const board = scoreCaseState(caseState);

    const outback = result.data?.options.items.find((option) => option.optionId === 'opt-outback');
    expect(outback?.disputedCriterionIds).toEqual(
      board.options.find((option) => option.optionId === 'opt-outback')?.disputedCriterionIds,
    );
    expect(outback?.disputedCriterionIds).toEqual(['pref.safety']);

    const safetyLine = outback?.criteria?.items.find((line) => line.criterionId === 'pref.safety');
    expect(safetyLine?.status).toBe('disputed');
    // Still scored -- refusing to use a value that exists is its own
    // distortion -- but never presented as settled.
    expect(safetyLine?.score).not.toBeNull();
    expect(safetyLine?.reason).toContain('contradict each other');
    expect(safetyLine?.valueStatus).toBe('conflicted');

    // Coverage says nothing about this: it answers "how much did we
    // measure", not "how much of it is settled".
    expect(outback?.coverage).toBe(1);
  });

  it('round-trips every CriterionScoreStatus the engine produces, rather than collapsing them to scored/unscored', async () => {
    const caseState = buildCarCase({
      criteria: [
        ...CAR_CRITERIA,
        // Names no attribute at all: a pure human-judgment concern.
        buildCriterion({
          id: 'pref.gut_feel',
          label: 'How it feels to drive',
          weight: 5,
          direction: 'qualitative',
          appliesToAttribute: undefined,
          question: 'Does it feel right on a test drive?',
        }),
      ],
      entities: [
        buildOption('opt-a', 'Car A', {
          'car.out_the_door_price': money('car.out_the_door_price', 'Out-the-door price', 28_000),
          'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 37),
          'car.crash_safety_rating': { ...grade('Top Safety Pick+'), status: 'conflicted' },
        }),
        buildOption('opt-b', 'Car B', {
          'car.out_the_door_price': money('car.out_the_door_price', 'Out-the-door price', 31_000),
          // Same cargo volume on both: a tie separates nothing.
          'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 37),
        }),
      ],
    });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
      optionId: 'opt-a',
    });
    const board = scoreCaseState(caseState);

    for (const option of result.data?.options.items ?? []) {
      const boardOption = board.options.find((entry) => entry.optionId === option.optionId);
      for (const line of option.criteria.items) {
        const boardLine = boardOption?.criteria.find(
          (entry) => entry.criterionId === line.criterionId,
        );
        expect(line.status).toBe(boardLine?.status);
      }
    }

    const statuses = new Set(
      (result.data?.options.items ?? []).flatMap((option) =>
        option.criteria.items.map((line) => line.status),
      ),
    );
    // Not an exhaustive enum check -- a proof that genuinely different
    // statuses reach the caller as genuinely different values.
    expect(statuses).toContain('disputed');
    expect(statuses).toContain('tied');
    expect(statuses).toContain('unknown');
    expect(statuses).toContain('not_applicable');
  });

  it('surfaces a load-bearing disputed_evidence insight verbatim, so the model cannot report the lead as settled', async () => {
    // The lead rests ENTIRELY on the contested criterion: drop it and the
    // order flips.
    const caseState = buildCarCase({
      criteria: [
        buildCriterion({
          id: 'pref.safety',
          label: 'Safety',
          weight: 70,
          appliesToAttribute: 'car.crash_safety_rating',
        }),
        buildCriterion({
          id: 'pref.household_fit',
          label: 'Household fit',
          weight: 30,
          appliesToAttribute: 'car.cargo_volume_cu_ft',
        }),
      ],
      entities: [
        buildOption('opt-outback', 'Subaru Outback', {
          'car.crash_safety_rating': { ...grade('Top Safety Pick+'), status: 'conflicted' },
          'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 28),
        }),
        buildOption('opt-crv', 'Honda CR-V', {
          'car.crash_safety_rating': grade('Top Safety Pick'),
          'car.cargo_volume_cu_ft': number('car.cargo_volume_cu_ft', 'Cargo volume', 39),
        }),
      ],
    });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });
    const expected = deriveInsights(scoreCaseState(caseState)).find(
      (insight) => insight.kind === 'disputed_evidence',
    );

    expect(expected).toBeDefined();
    const projected = result.data?.insights.items.find(
      (insight) => insight.kind === 'disputed_evidence',
    );
    expect(projected?.headline).toBe(expected!.headline);
    expect(projected?.detail).toBe(expected!.detail);
    expect(projected?.severity).toBe('attention');
    expect(projected?.criterionIds).toEqual([...expected!.criterionIds]);
  });

  it('surfaces the engine’s own warnings and non-discriminating criteria rather than hiding a weaker number', async () => {
    // Two cars whose prices are recorded in different currencies: rule 5,
    // "refuse rather than invent".
    const caseState = buildCarCase({
      criteria: [buildCriterion()],
      entities: [
        buildOption('opt-a', 'Car A', {
          'car.out_the_door_price': money('car.out_the_door_price', 'Out-the-door price', 28_000),
        }),
        buildOption('opt-b', 'Car B', {
          'car.out_the_door_price': {
            definitionId: 'car.out_the_door_price',
            label: 'Out-the-door price',
            value: { type: 'money', amount: 3_000_000, currency: 'JPY' },
            origin: 'user',
            sourceIds: [],
            status: 'asserted',
            updatedAt: FIXED_TIMESTAMP,
          },
        }),
      ],
    });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    expect(result.data?.warnings.items).toEqual(scoreCaseState(caseState).warnings);
    expect(result.data?.warnings.items[0]).toContain('different currencies');
  });
});

describe('sift_explain_ranking: bounded, with the truncation visible in the payload', () => {
  function buildWideCase(criterionCount: number, optionCount: number): CaseState {
    const definitions = Array.from({ length: criterionCount }, (_, index) =>
      buildDefinition({
        id: `car.measure_${index}`,
        label: `Measure ${index}`,
        valueType: 'number',
        comparison: 'higher_better',
      }),
    );
    const criteria = Array.from({ length: criterionCount }, (_, index) =>
      buildCriterion({
        id: `pref.measure_${index}`,
        label: `Measure ${index}`,
        // Descending weight, so "heaviest first" has something to order by.
        weight: Math.max(1, criterionCount - index),
        appliesToAttribute: `car.measure_${index}`,
      }),
    );
    const entities = Array.from({ length: optionCount }, (_, optionIndex) =>
      buildOption(
        `opt-${String(optionIndex).padStart(2, '0')}`,
        `Option ${optionIndex}`,
        Object.fromEntries(
          Array.from({ length: criterionCount }, (_, index) => [
            `car.measure_${index}`,
            number(`car.measure_${index}`, `Measure ${index}`, optionIndex + index),
          ]),
        ),
      ),
    );
    return buildFixtureCaseState({
      attributeDefinitions: definitions,
      criteria,
      entities,
    });
  }

  it('caps the ranked option list and reports the true total plus the number omitted', async () => {
    const caseState = buildWideCase(3, 20);
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    const items = result.data?.options.items ?? [];
    expect(items.length).toBeLessThan(20);
    expect(result.data?.options.total).toBe(20);
    expect(result.data?.omitted.options).toBe(20 - items.length);
  });

  it('caps each option’s criterion breakdown, keeps the HEAVIEST criteria, and reports the share of weight it left out', async () => {
    const caseState = buildWideCase(40, 2);
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    const leader = result.data?.options.items[0];
    const breakdown = leader?.criteria;
    expect(breakdown).toBeDefined();
    expect(breakdown!.items.length).toBeLessThan(40);
    expect(breakdown!.total).toBe(40);

    // Heaviest first, and monotonically non-increasing.
    const weights = breakdown!.items.map((line) => line.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);

    // The load-bearing part: a caller can tell how much of the decision this
    // payload actually explains.
    expect(breakdown!.omittedWeight).toBeGreaterThan(0);
    expect(breakdown!.shownWeight + breakdown!.omittedWeight).toBeCloseTo(1, 6);
    expect(result.data?.omitted.criterionLines).toBeGreaterThan(0);
  });

  it('reports omittedWeight as exactly 0 when nothing was dropped, so a complete analysis is distinguishable from a truncated one', async () => {
    const caseState = buildCarCase();
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    for (const option of result.data?.options.items ?? []) {
      expect(option.criteria?.omittedWeight).toBe(0);
      expect(option.criteria?.items.length).toBe(option.criteria?.total);
    }
    expect(result.data?.omitted).toEqual({ options: 0, criterionLines: 0 });
  });

  it('gives the option a caller ASKED about a deeper breakdown than the rest, and still returns it when truncation would have dropped its row', async () => {
    const caseState = buildWideCase(40, 20);
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    // `buildWideCase` scores option 19 highest and option 0 lowest, so
    // `opt-00` is last and falls outside the ranked-option cap.
    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
      optionId: 'opt-00',
    });

    expect(result.ok).toBe(true);
    expect(result.data?.requested).toEqual({ optionId: 'opt-00', ranked: true });

    const requested = result.data?.options.items.find((option) => option.optionId === 'opt-00');
    expect(requested).toBeDefined();
    expect(requested?.rank).toBe(20);

    const others = (result.data?.options.items ?? []).filter(
      (option) => option.optionId !== 'opt-00',
    );
    expect(requested?.criteria.items.length).toBeGreaterThan(others[0]?.criteria.items.length ?? 0);
  });

  it('never emits a raw 20 000-character text value or an enum’s whole allowedValues membership set', async () => {
    const caseState = buildCarCase({
      attributeDefinitions: [
        buildDefinition({
          id: 'car.dealer_notes',
          label: 'Dealer notes',
          valueType: 'text',
          comparison: 'none',
        }),
        ...CAR_DEFINITIONS,
      ],
      criteria: [
        buildCriterion({
          id: 'pref.notes',
          label: 'Dealer notes',
          weight: 10,
          appliesToAttribute: 'car.dealer_notes',
        }),
        ...CAR_CRITERIA,
      ],
      entities: [
        buildOption('opt-rav4', 'Toyota RAV4', {
          'car.dealer_notes': {
            definitionId: 'car.dealer_notes',
            label: 'Dealer notes',
            value: { type: 'text', value: 'x'.repeat(20_000) },
            origin: 'user',
            sourceIds: [],
            status: 'asserted',
            updatedAt: FIXED_TIMESTAMP,
          },
          'car.crash_safety_rating': grade('Top Safety Pick+'),
        }),
        buildOption('opt-crv', 'Honda CR-V', {
          'car.crash_safety_rating': grade('Top Safety Pick'),
        }),
      ],
    });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    const serialized = JSON.stringify(result.data);
    expect(serialized.length).toBeLessThan(20_000);

    const notesLine = result.data?.options.items
      .flatMap((option) => option.criteria?.items ?? [])
      .find((line) => line.criterionId === 'pref.notes');
    expect(notesLine?.value?.type).toBe('text');
    expect(
      (notesLine?.value as { type: 'text'; value: string } | undefined)?.value.length,
    ).toBeLessThan(1000);

    const gradeLine = result.data?.options.items
      .flatMap((option) => option.criteria?.items ?? [])
      .find((line) => line.criterionId === 'pref.safety');
    expect(gradeLine?.value).toEqual({ type: 'enum', value: 'Top Safety Pick+' });
  });
});

describe('sift_explain_ranking: a READ tool with no authority', () => {
  it('reports ui.changed false and never reaches any SiftCommands method', async () => {
    const caseState = buildCarCase();
    const { adapter, commands } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    expect(result.ui).toEqual({ changed: false });
    for (const [name, method] of Object.entries(commands)) {
      if (typeof method === 'function' && 'mock' in method) {
        expect(method, `${name} must never be called by a read tool`).not.toHaveBeenCalled();
      }
    }
  });

  it('reports the case’s current eventSequence without advancing it', async () => {
    const caseState = buildCarCase({ eventSequence: 17 });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    expect(result.sequence).toBe(17);
    expect(caseState.eventSequence).toBe(17);
  });

  it('takes no expectedSequence, so it structurally cannot be used as a mutation', async () => {
    const caseState = buildCarCase();
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);
    const tool = adapter.getRegisteredTool('sift_explain_ranking');

    const properties = (tool!.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(properties).sort()).toEqual(['caseId', 'optionId']);
  });
});

describe('sift_explain_ranking: honest failure modes', () => {
  it('returns NOT_FOUND, never a fabricated ranking, for an option id that is not on the case', async () => {
    const caseState = buildCarCase();
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
      optionId: 'opt-nope',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
  });

  it('says an existing-but-unrankable option is unranked rather than ranking it last', async () => {
    // A bill is a real entity on an energy case, but every attribute the
    // active criteria measure is declared `appliesTo: ['candidate']`, so
    // nothing on the board can speak to a `bill` -- and "#4 of 4" would be a
    // claim about how it compares when nothing was compared.
    const caseState = buildCarCase({
      entities: [
        ...buildCarCase().entities,
        { ...buildOption('bill-1', 'August electricity bill', {}), kind: 'bill' },
      ],
    });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
      optionId: 'bill-1',
    });

    expect(result.ok).toBe(true);
    expect(result.data?.requested).toEqual({ optionId: 'bill-1', ranked: false });
    expect(result.data?.options.items.some((option) => option.optionId === 'bill-1')).toBe(false);
  });

  it('reports an unrankable case honestly rather than returning an empty ranking that reads as "we found no difference"', async () => {
    const caseState = buildFixtureCaseState({ criteria: [], entities: [] });
    const { adapter } = await setUpWithActiveCase('case-1', () => caseState);

    const result = await invokeTool<RankingExplanation>(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
    });

    expect(result.ok).toBe(true);
    expect(result.data?.isRankable).toBe(false);
    expect(result.data?.options.items).toEqual([]);
  });

  it('reports "No case is currently active" rather than fabricating a ranking', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', () => null);
    const result = await invokeTool(adapter, 'sift_explain_ranking', { caseId: 'case-1' });

    expect(result.ok).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.message).toContain('No case is currently active');
  });

  it('rejects a caseId that is not the active case, without reading case state', async () => {
    const getActiveCase = vi.fn().mockReturnValue(buildCarCase());
    const { adapter } = await setUpWithActiveCase('case-1', getActiveCase);

    const result = await invokeTool(adapter, 'sift_explain_ranking', { caseId: 'case-other' });

    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
    expect(getActiveCase).not.toHaveBeenCalled();
  });

  it('returns VALIDATION for malformed input', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', () => buildCarCase());
    const result = await invokeTool(adapter, 'sift_explain_ranking', {
      caseId: 'case-1',
      unexpectedField: true,
    });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
  });
});
