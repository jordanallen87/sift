/**
 * End-to-end proof for the claim the custom-attribute work exists to make:
 * a decision dimension the installed pack never anticipated can be created
 * by an assistant, populated for every option, pointed at by a criterion,
 * and then actually *change the ranking*.
 *
 * The chain under test is the real one, driven through `CommandService`
 * rather than a hand-built snapshot, because every link has already been
 * verified in isolation and the interesting failures live between them:
 *
 *  1. `sift_define_case_attribute` with `valueType: 'enum'`,
 *     `allowedValues`, `orderedValues`, and a `values` entry per option
 *     (`defineCaseAttribute`);
 *  2. a stored `caseExtensions` definition plus per-option
 *     `AttributeRecord`s;
 *  3. a criterion whose `appliesToAttribute` names that brand-new id
 *     (`updateCriteria`);
 *  4. `packages/core/src/scoring.ts` ranking the board on it
 *     (`scoreCaseState`, the same function the workspace and the
 *     recommendation validator both call).
 *
 * Three of scoring.ts's six honesty rules are load-bearing here and are
 * asserted rather than assumed, because each fails SILENTLY:
 *
 *  - **Rule 3 (enums are not ordinal until a pack says so).** Drop
 *    `orderedValues` anywhere between the WebMCP call and the stored
 *    definition and the column still renders, the criterion still carries
 *    weight, and nothing ever scores. Nobody sees an error. So the same
 *    case is built twice below -- once without the ordering, once with it
 *    -- and the contrast is the point of this file.
 *  - **Rule 1 (an unknown is never a zero).** The Outback's crate fit is
 *    an explicit, reasoned unknown. If the engine ever scored that as 0 it
 *    would drop below a car that genuinely scored worst on the dimension,
 *    turning "we did not look" into "it is bad".
 *  - **Provenance.** A value the MODEL supplied may never claim
 *    `status: 'verified'` -- that status is a human attestation. Enforced
 *    at `attributeStatusOriginError` (`packages/core/src/attributes.ts`),
 *    reached here through the enum seam specifically, since a rule that
 *    holds for `text` and not for the value type a custom rating actually
 *    uses would be no rule at all.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { CaseState, CommandReceipt } from '@sift/contracts';
import { scoreCaseState, type CaseScoreboard, type CriterionScore } from '@sift/core';
import {
  createRegistryWithSyntheticPack,
  createSequentialIdGenerator,
  fixedClock,
} from '../fixtures/synthetic-pack.js';
import { InMemoryActivityStore } from '../store/activity-store.js';
import { MemoryCaseStore } from '../store/memory-case-store.js';
import { CommandService } from './command-service.js';

// Same two narrowing helpers `command-service.test.ts` uses. Duplicated
// rather than exported from there on purpose: they are three lines of test
// scaffolding, and a shared helper module would couple two suites that
// should be free to fail independently.
function requireOk(result: {
  status: string;
}): asserts result is { status: 'ok'; value: CommandReceipt } {
  if (result.status !== 'ok') {
    throw new Error(`expected ok, got ${result.status}: ${JSON.stringify(result)}`);
  }
}

function requireSnapshot(receipt: CommandReceipt): CaseState {
  if (receipt.snapshot === undefined) throw new Error('receipt has no snapshot');
  return receipt.snapshot;
}

/**
 * The unanticipated dimension. Nothing in the synthetic pack knows this
 * exists -- its only attribute is `car.price` -- which is exactly what
 * makes it the right thing to test with.
 */
const CRATE_ATTRIBUTE_ID = 'custom.dog_crate_fit';
const CRATE_ATTRIBUTE_LABEL = 'Dog crate fit';
/** Worst to best. Deliberately NOT alphabetical, so an accidental sort cannot pass for the declared scale. */
const CRATE_GRADES = ['no crate fits', 'one crate fits', 'two crates fit'] as const;
const CRATE_UNKNOWN_REASON =
  'No owner report or manufacturer specification gives cargo dimensions behind the second row for this trim.';

/**
 * Four cars, chosen so the arithmetic below has exactly one interesting
 * property: on price alone the CR-V wins outright, and once dog crate fit
 * is weighted equally the RAV4 takes the lead. Prices span 30,000-36,000
 * so every price score is an exact fraction of 6,000 and the expected
 * numbers can be written down rather than copied out of a failure message.
 *
 * `crate: null` is the explicit unknown, and it sits on the SECOND-placed
 * car on purpose: if an unknown were quietly scored as zero, the Outback
 * would fall from 2nd to 3rd, which is a visible, assertable consequence
 * rather than a rounding difference.
 */
const CARS = [
  { label: 'Honda CR-V', price: 30_000, crate: 'no crate fits' },
  { label: 'Subaru Outback', price: 32_000, crate: null },
  { label: 'Toyota RAV4', price: 33_000, crate: 'two crates fit' },
  { label: 'Kia Telluride', price: 36_000, crate: 'one crate fits' },
] as const;

describe('a decision dimension the pack never anticipated', () => {
  let caseStore: MemoryCaseStore;
  let service: CommandService;

  beforeEach(() => {
    caseStore = new MemoryCaseStore();
    service = new CommandService({
      caseStore,
      activityStore: new InMemoryActivityStore(),
      registry: createRegistryWithSyntheticPack(),
      clock: fixedClock,
      idGenerator: createSequentialIdGenerator(),
    });
  });

  /**
   * Starts a case and adds all four cars through the real `upsertOption`
   * command -- never by writing entities into the store behind its back --
   * so the ids under test are the ids the product would actually mint.
   *
   * `prefix` keeps command ids unique across the two cases a single test
   * may build (`CommandService` is idempotent on `commandId`, so reusing
   * one would silently return the first case's receipt).
   */
  function seedCase(prefix: string): { snapshot: CaseState; optionIds: Map<string, string> } {
    const started = service.startDemo(`${prefix}-start`, { demoId: 'car-purchase' });
    requireOk(started);
    let current = requireSnapshot(started.value);

    const optionIds = new Map<string, string>();
    CARS.forEach((car, index) => {
      const result = service.upsertOption(`${prefix}-option-${String(index)}`, {
        caseId: current.id,
        expectedSequence: current.eventSequence,
        option: {
          label: car.label,
          kind: 'car',
          attributes: [
            {
              definitionId: 'car.price',
              value: { type: 'money', amount: car.price, currency: 'USD' },
              sourceIds: ['source-listing'],
            },
          ],
        },
      });
      requireOk(result);
      current = requireSnapshot(result.value);
      const added = current.entities.find((entity) => entity.label === car.label);
      if (added === undefined) throw new Error(`test setup: option "${car.label}" was not added`);
      optionIds.set(car.label, added.id);
    });

    return { snapshot: current, optionIds };
  }

  /**
   * The WebMCP call under test, minus the one field the contrast turns on.
   * `withOrdering: false` is the "assistant forgot to declare a scale"
   * shape -- still a perfectly valid enum column, still fully populated,
   * still unrankable.
   */
  function defineCrateFit(
    prefix: string,
    snapshot: CaseState,
    optionIds: Map<string, string>,
    withOrdering: boolean,
  ): CaseState {
    const result = service.defineCaseAttribute(`${prefix}-define`, {
      caseId: snapshot.id,
      expectedSequence: snapshot.eventSequence,
      origin: 'agent_proposed',
      definition: {
        id: CRATE_ATTRIBUTE_ID,
        label: CRATE_ATTRIBUTE_LABEL,
        valueType: 'enum',
        appliesTo: ['car'],
        allowedValues: [...CRATE_GRADES],
        ...(withOrdering ? { orderedValues: [...CRATE_GRADES] } : {}),
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        reason: 'Two dog crates have to fit behind the second row on long trips.',
      },
      values: CARS.map((car) => {
        const optionId = optionIds.get(car.label);
        if (optionId === undefined) throw new Error(`test setup: no id for "${car.label}"`);
        return car.crate === null
          ? { optionId, status: 'unknown', reason: CRATE_UNKNOWN_REASON }
          : { optionId, status: 'supported', value: { type: 'enum', value: car.crate } };
      }),
    });
    requireOk(result);
    return requireSnapshot(result.value);
  }

  /** Points a real, weighted criterion at the brand-new attribute id. */
  function addCrateCriterion(prefix: string, snapshot: CaseState): CaseState {
    const result = service.updateCriteria(`${prefix}-criterion`, {
      caseId: snapshot.id,
      expectedSequence: snapshot.eventSequence,
      operations: [
        {
          op: 'add',
          criterion: {
            id: CRATE_ATTRIBUTE_ID,
            label: CRATE_ATTRIBUTE_LABEL,
            // Equal to the pack's protected `price` criterion (weight 100,
            // the schema maximum), so the two normalize to 0.5 each and the
            // expected totals below are exact halves rather than an
            // arbitrary ratio.
            kind: 'preference',
            weight: 100,
            direction: 'higher_better',
            appliesToAttribute: CRATE_ATTRIBUTE_ID,
          },
        },
      ],
    });
    requireOk(result);
    return requireSnapshot(result.value);
  }

  function rankedLabels(board: CaseScoreboard): string[] {
    return board.options.map((option) => option.optionLabel);
  }

  function optionScore(board: CaseScoreboard, label: string) {
    const found = board.options.find((option) => option.optionLabel === label);
    if (found === undefined) throw new Error(`option "${label}" is not on the board`);
    return found;
  }

  function crateLine(board: CaseScoreboard, label: string): CriterionScore {
    const line = optionScore(board, label).criteria.find(
      (entry) => entry.criterionId === CRATE_ATTRIBUTE_ID,
    );
    if (line === undefined) throw new Error(`no "${CRATE_ATTRIBUTE_ID}" line for "${label}"`);
    return line;
  }

  it('is created, populated, and scored, and the ranking actually moves', () => {
    const { snapshot, optionIds } = seedCase('ordered');

    // --- Before: price is the only thing anyone has weighted -----------
    const before = scoreCaseState(snapshot);
    expect(rankedLabels(before)).toEqual([
      'Honda CR-V', // 30,000 -> 1.0
      'Subaru Outback', // 32,000 -> 0.667
      'Toyota RAV4', // 33,000 -> 0.5
      'Kia Telluride', // 36,000 -> 0.0
    ]);
    expect(optionScore(before, 'Honda CR-V').total).toBe(1);

    // --- The assistant adds the dimension and fills every cell ---------
    const defined = defineCrateFit('ordered', snapshot, optionIds, true);

    // The definition round-tripped as a case extension, ordering intact --
    // this is the field scoring.ts rule 3 refuses to infer.
    const extension = defined.caseExtensions.find(
      (entry) => entry.definition.id === CRATE_ATTRIBUTE_ID,
    );
    expect(extension?.definition.orderedValues).toEqual([...CRATE_GRADES]);
    expect(extension?.definition.confirmation).toBe('confirmed');
    expect(extension?.definition.origin).toBe('agent_proposed');

    // ...and every applicable option carries a real record for it, so the
    // column is not a half-existing one.
    for (const car of CARS) {
      const record = defined.entities.find((entity) => entity.label === car.label)?.attributes[
        CRATE_ATTRIBUTE_ID
      ];
      expect(record?.origin).toBe('agent_proposed');
      expect(record?.status).toBe(car.crate === null ? 'unknown' : 'supported');
    }

    // Defining a column changes no ranking on its own: nothing weights it
    // yet. Asserted so the flip below is unambiguously caused by the
    // criterion, not by the attribute records landing.
    expect(rankedLabels(scoreCaseState(defined))).toEqual(rankedLabels(before));

    // --- A criterion points at the brand-new id ------------------------
    const after = scoreCaseState(addCrateCriterion('ordered', defined));

    // The new dimension genuinely scored, on the declared scale.
    expect(crateLine(after, 'Toyota RAV4').status).toBe('scored');
    expect(crateLine(after, 'Toyota RAV4').score).toBe(1); // 'two crates fit', best grade present
    expect(crateLine(after, 'Honda CR-V').score).toBe(0); // 'no crate fits', worst grade present
    expect(crateLine(after, 'Kia Telluride').score).toBe(0.5); // 'one crate fits', midpoint
    expect(after.warnings).toEqual([]);

    // The leader FLIPPED. Price 0.5 + crate 0.5 for each scored option:
    //   RAV4      0.5*0.5   + 0.5*1.0 = 0.75
    //   Outback   0.667 (price only, crate unknown)
    //   CR-V      0.5*1.0   + 0.5*0.0 = 0.5
    //   Telluride 0.5*0.0   + 0.5*0.5 = 0.25
    expect(rankedLabels(after)).toEqual([
      'Toyota RAV4',
      'Subaru Outback',
      'Honda CR-V',
      'Kia Telluride',
    ]);
    expect(optionScore(after, 'Toyota RAV4').total).toBeCloseTo(0.75, 10);
    expect(optionScore(after, 'Honda CR-V').total).toBeCloseTo(0.5, 10);
    expect(optionScore(after, 'Kia Telluride').total).toBeCloseTo(0.25, 10);

    // Stated as the claim rather than as two coincidental orderings: the
    // car that led on the pack's own dimension no longer leads, and the
    // car that took the lead did so on a dimension the pack never shipped.
    expect(rankedLabels(before)[0]).toBe('Honda CR-V');
    expect(rankedLabels(after)[0]).toBe('Toyota RAV4');
    expect(rankedLabels(after)).not.toEqual(rankedLabels(before));
  });

  it('refuses to rank the same enum when no worst-to-best ordering was declared', () => {
    // The whole contrast: identical case, identical grades, identical
    // criterion -- only `orderedValues` is missing. `allowedValues` is a
    // membership set whose order carries no meaning, and scoring.ts rule 3
    // will not read a scale out of it. Without this assertion the failure
    // is invisible: the column renders, the criterion carries 50% of the
    // weight, and the ranking never changes.
    const { snapshot, optionIds } = seedCase('unordered');
    const before = scoreCaseState(snapshot);

    const defined = defineCrateFit('unordered', snapshot, optionIds, false);
    expect(
      defined.caseExtensions.find((entry) => entry.definition.id === CRATE_ATTRIBUTE_ID)?.definition
        .orderedValues,
    ).toBeUndefined();

    const after = scoreCaseState(addCrateCriterion('unordered', defined));

    const line = crateLine(after, 'Toyota RAV4');
    expect(line.status).toBe('not_comparable');
    expect(line.score).toBeNull();
    expect(line.reason).toContain('no declared worst-to-best ordering');
    // The value itself is still shown -- the engine is refusing to RANK
    // it, not pretending it is absent.
    expect(line.value).toEqual({ type: 'enum', value: 'two crates fit' });

    // The board says so out loud rather than quietly dropping the column,
    // naming the attribute by its human label.
    expect(after.warnings).toHaveLength(1);
    expect(after.warnings[0]).toContain(CRATE_ATTRIBUTE_LABEL);
    expect(after.warnings[0]).toContain('no declared worst-to-best ordering');

    // And the consequence that makes the ordering load-bearing: with the
    // scale missing, a criterion carrying half the board's weight moves
    // nothing at all.
    expect(rankedLabels(after)).toEqual(rankedLabels(before));
    expect(optionScore(after, 'Honda CR-V').total).toBe(1);
  });

  it('treats an explicit unknown on the new dimension as missing coverage, never as a zero', () => {
    // scoring.ts rule 1. The Outback has no crate measurement, so the
    // honest report is "we measured half of what is weighted here", not
    // "it fits no crates". The difference is observable in the ranking:
    // scored as a zero, the Outback's total would be 0.5*0.667 = 0.333 and
    // it would fall behind the CR-V, whose crate grade is genuinely the
    // worst on the board.
    const { snapshot, optionIds } = seedCase('unknown');
    const before = scoreCaseState(snapshot);
    const beforeOutback = optionScore(before, 'Subaru Outback');
    expect(beforeOutback.coverage).toBe(1);

    const defined = defineCrateFit('unknown', snapshot, optionIds, true);
    const after = scoreCaseState(addCrateCriterion('unknown', defined));
    const afterOutback = optionScore(after, 'Subaru Outback');

    const line = crateLine(after, 'Subaru Outback');
    expect(line.status).toBe('unknown');
    expect(line.score).toBeNull();
    expect(line.value).toBeUndefined();

    // COVERAGE falls -- half the weight on this board is now unmeasured
    // for this car.
    expect(afterOutback.coverage).toBeCloseTo(0.5, 10);
    expect(afterOutback.coverage).toBeLessThan(beforeOutback.coverage);

    // SCORE does not. The total is the weighted mean over scored criteria
    // only, so it is identical to what price alone produced.
    expect(afterOutback.total).toBeCloseTo(2 / 3, 10);
    expect(afterOutback.total).toBeCloseTo(beforeOutback.total ?? Number.NaN, 10);

    // The ranking consequence, stated directly: an unmeasured car still
    // outranks one that was measured and did badly.
    expect(rankedLabels(after).indexOf('Subaru Outback')).toBeLessThan(
      rankedLabels(after).indexOf('Honda CR-V'),
    );

    // The reason is durable and option-linked, so "we could not establish
    // this" never renders as a blank cell with no explanation.
    const note = (defined.notes ?? []).find((entry) =>
      entry.optionIds.includes(optionIds.get('Subaru Outback') ?? ''),
    );
    expect(note?.body).toContain(CRATE_UNKNOWN_REASON);
    expect(note?.authoredBy).toBe('model');
  });

  it('will not let a model-supplied grade on the new dimension claim a human attestation', () => {
    // `status: 'verified'` means a person checked it. The enforcement
    // point is `attributeStatusOriginError` (packages/core/src/
    // attributes.ts), reached from `defineCaseAttribute` through
    // `createAttributeRecord`. Asserted at the ENUM seam specifically:
    // pre-authorizing a pack extension pre-authorizes the column, never
    // the attestation, and a rule proved only for `text` values would not
    // cover the value type a custom rating actually uses.
    const { snapshot, optionIds } = seedCase('provenance');

    const asAgent = service.defineCaseAttribute('provenance-define', {
      caseId: snapshot.id,
      expectedSequence: snapshot.eventSequence,
      origin: 'agent_proposed',
      definition: {
        id: CRATE_ATTRIBUTE_ID,
        label: CRATE_ATTRIBUTE_LABEL,
        valueType: 'enum',
        appliesTo: ['car'],
        allowedValues: [...CRATE_GRADES],
        orderedValues: [...CRATE_GRADES],
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        reason: 'Two dog crates have to fit behind the second row on long trips.',
      },
      values: CARS.map((car) => ({
        optionId: optionIds.get(car.label),
        status: 'verified',
        value: { type: 'enum', value: 'two crates fit' },
      })),
    });
    expect(asAgent.status).toBe('validation');
    if (asAgent.status !== 'validation') throw new Error('expected a validation failure');
    expect(asAgent.issues.join(' ')).toContain('only origin "user"');

    // Rejected as one transaction: no column, no cells, no advance.
    const stored = caseStore.load(snapshot.id);
    expect(stored?.eventSequence).toBe(snapshot.eventSequence);
    expect(stored?.caseExtensions).toHaveLength(0);

    // The rule is about WHO is claiming, not about the status existing:
    // the identical grades from a human origin are accepted and score.
    const asUser = service.defineCaseAttribute('provenance-define-user', {
      caseId: snapshot.id,
      expectedSequence: snapshot.eventSequence,
      origin: 'user',
      definition: {
        id: CRATE_ATTRIBUTE_ID,
        label: CRATE_ATTRIBUTE_LABEL,
        valueType: 'enum',
        appliesTo: ['car'],
        allowedValues: [...CRATE_GRADES],
        orderedValues: [...CRATE_GRADES],
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        reason: 'I measured the boot of each one with the crates in the back.',
      },
      values: CARS.map((car) => ({
        optionId: optionIds.get(car.label),
        status: 'verified',
        value: { type: 'enum', value: car.crate ?? 'one crate fits' },
      })),
    });
    requireOk(asUser);
    const verified = requireSnapshot(asUser.value);
    const record = verified.entities.find((entity) => entity.label === 'Toyota RAV4')?.attributes[
      CRATE_ATTRIBUTE_ID
    ];
    expect(record?.status).toBe('verified');
    expect(record?.origin).toBe('user');

    // A verified value is still just a value to the engine: it scores on
    // the same declared scale, and the evidential standing rides along on
    // the line rather than changing the number.
    const scored = scoreCaseState(addCrateCriterion('provenance', verified));
    expect(crateLine(scored, 'Toyota RAV4').score).toBe(1);
    expect(crateLine(scored, 'Toyota RAV4').valueStatus).toBe('verified');
  });
});
