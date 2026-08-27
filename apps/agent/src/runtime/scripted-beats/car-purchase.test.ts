/**
 * Structural and factual sanity tests for the car-purchase scripted beats.
 * The full causal proof (real Graph, real tools, real interventions, real
 * evidence folding) lives in `tests/scenarios/car-purchase.scenario.test.ts`;
 * this file proves the scripted content itself is schema-valid and
 * factually grounded in the real fixture math before that much larger
 * integration test consumes it.
 */
import { describe, expect, it } from 'vitest';
import { ExecutionResultSchema } from '@pax/contracts';
import { CAR_PURCHASE_GRAPH_NODE_IDS } from '../car-purchase-graph.js';
import { CAR_PURCHASE_CANDIDATE_IDS } from '@pax/scenarios';
import {
  buildCarPurchaseScriptedProviders,
  CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS,
  PROPOSAL_ROUND1,
  PROPOSAL_ROUND2,
  scriptedModelFor,
  setScenarioBeat,
} from './car-purchase.js';

describe('buildCarPurchaseScriptedProviders', () => {
  it('builds one provider per real car-purchase Graph node id', () => {
    const providers = buildCarPurchaseScriptedProviders();
    expect(Object.keys(providers).sort()).toEqual([...CAR_PURCHASE_GRAPH_NODE_IDS].sort());
  });

  it('scriptedModelFor resolves each node id to its own provider instance', () => {
    const providers = buildCarPurchaseScriptedProviders();
    const modelFor = scriptedModelFor(providers);
    for (const nodeId of CAR_PURCHASE_GRAPH_NODE_IDS) {
      expect(modelFor(nodeId)).toBe(providers[nodeId]);
    }
  });

  it('setScenarioBeat sets every provider to the given beat with a fresh (zero) cursor', () => {
    const providers = buildCarPurchaseScriptedProviders();
    setScenarioBeat(providers, 'round1');
    for (const nodeId of CAR_PURCHASE_GRAPH_NODE_IDS) {
      expect(providers[nodeId].cursorFor('round1')).toBe(0);
    }
    setScenarioBeat(providers, 'round2');
    for (const nodeId of CAR_PURCHASE_GRAPH_NODE_IDS) {
      expect(providers[nodeId].cursorFor('round2')).toBe(0);
    }
  });
});

describe('CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS', () => {
  it('every scripted ExecutionResult genuinely satisfies ExecutionResultSchema', () => {
    for (const [name, result] of Object.entries(CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS)) {
      const parsed = ExecutionResultSchema.safeParse(result);
      expect(
        parsed.success,
        `"${name}" failed: ${JSON.stringify('error' in parsed ? parsed.error.issues : null)}`,
      ).toBe(true);
    }
  });

  it('every claim cites at least one source id, and every source id looks real (source-... shaped)', () => {
    for (const result of Object.values(CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS)) {
      for (const claim of result.claims) {
        expect(claim.sourceIds.length).toBeGreaterThan(0);
        for (const sourceId of claim.sourceIds) {
          expect(sourceId).toMatch(/^source-/);
        }
      }
    }
  });

  it('never asserts car.rear_cargo_crate_fit or car.driving_comfort_rating as a fact -- both stay in limitations, never in claims', () => {
    const { householdFitRound1, householdFitRound2 } = CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS;
    for (const result of [householdFitRound1, householdFitRound2]) {
      expect(result.limitations.length).toBeGreaterThan(0);
      const claimsText = result.claims.map((claim) => claim.statement).join(' ');
      expect(claimsText).not.toMatch(
        /crate fits|crates fit|comfort is (excellent|good|fair|poor)/i,
      );
    }
  });

  it('the round-1 teaser-price evidence is degraded (never silently resolved); round-2 evidence for the same source is a fully investigated, confirmed fact, not a data-quality problem', () => {
    const round1Item = CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS.dealRound1.evidenceResults.find(
      (item) => item.sourceId === 'source-dealer-offer-candidate-rav4',
    );
    expect(round1Item?.verdict).toBe('degraded');
    const round2Item = CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS.dealRound2.evidenceResults.find(
      (item) => item.sourceId === 'source-dealer-offer-candidate-rav4',
    );
    // Round 2's item is `pass`, not `degraded`: the underlying conflict is
    // real, cited, and never hidden (still explicit in the summary and in
    // candidate-rav4's own out-the-door price), but by round 2 it is a
    // fully investigated, confirmed fact -- not an evidence-quality problem
    // any more. The car-purchase-scenario.ts engine separately marks the
    // round-1 degraded link `stale` (superseded), which is the actual
    // "conflicting evidence becomes stale" mechanism -- see that file.
    expect(round2Item?.verdict).toBe('pass');
    expect(round2Item?.summary).toMatch(/confirmed/i);
  });

  it('the source-challenger round1/round2 disposition escalates from open to satisfied, matching source-challenger resolving the obligation', () => {
    expect(CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS.challengeRound1.suggestedStatus).toBe('open');
    expect(CAR_PURCHASE_SCRIPTED_EXECUTION_RESULTS.challengeRound2.suggestedStatus).toBe(
      'satisfied',
    );
  });
});

describe('propose_recommendation payloads', () => {
  it('every candidate id cited is a real seeded car-purchase candidate', () => {
    for (const proposal of [PROPOSAL_ROUND1, PROPOSAL_ROUND2]) {
      for (const candidateId of proposal.candidateIds) {
        expect(CAR_PURCHASE_CANDIDATE_IDS).toContain(candidateId);
      }
    }
  });

  it('round1 favors candidate-rav4 alone; round2 revises to candidate-crv plus one close alternative', () => {
    expect(PROPOSAL_ROUND1.candidateIds).toEqual(['candidate-rav4']);
    expect(PROPOSAL_ROUND2.candidateIds[0]).toBe('candidate-crv');
    expect(PROPOSAL_ROUND2.candidateIds).toHaveLength(2);
    expect(PROPOSAL_ROUND2.candidateIds).not.toContain('candidate-rav4');
  });

  it('the round2 rationale cites the real $1,291.30 budget overage, not an invented number', () => {
    expect(PROPOSAL_ROUND2.rationale).toContain('33,291.30');
    expect(PROPOSAL_ROUND2.rationale).toContain('1,291.30');
  });
});
