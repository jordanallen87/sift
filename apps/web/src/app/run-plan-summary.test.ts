/**
 * Reading the run-plan response into the one line the pane shows.
 *
 * The interesting cases are all about refusing to say something. A case
 * with no plan is the ordinary state of most of discovery, and a body this
 * build cannot read is not worth breaking the workspace over — both have to
 * produce silence rather than a zero, because "Sift is looking into 0
 * things" reads as a broken product and "nothing shown" reads as a product
 * that has not started yet.
 */
import { describe, expect, it } from 'vitest';
import { summarizeRunPlanResponse } from './run-plan-summary.js';

function planResponse(items: unknown[], unverifiable: unknown[] = [], version = 1) {
  return { plan: { version, items, unverifiable }, history: [] };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    signature: 'check_concern:reliability+rav4',
    status: 'planned',
    depth: 'deep',
    targetEntityId: 'rav4',
    ...overrides,
  };
}

describe('summarizeRunPlanResponse', () => {
  it('returns null for a case with no plan yet', () => {
    // `GET /api/cases/:id/run-plan` answers 404 here, which the caller
    // turns into `null` before this function sees it -- but a null body
    // must produce silence too.
    expect(summarizeRunPlanResponse(null)).toBeNull();
    expect(summarizeRunPlanResponse(undefined)).toBeNull();
  });

  it('returns null rather than guessing at a shape it cannot read', () => {
    expect(summarizeRunPlanResponse({})).toBeNull();
    expect(summarizeRunPlanResponse({ plan: {} })).toBeNull();
    expect(summarizeRunPlanResponse({ plan: { version: 'one', items: [] } })).toBeNull();
    expect(summarizeRunPlanResponse({ plan: { version: 1, items: 'lots' } })).toBeNull();
  });

  it('counts only outstanding work, not work already finished', () => {
    const summary = summarizeRunPlanResponse(
      planResponse([
        item({ signature: 'a', status: 'planned' }),
        item({ signature: 'b', status: 'running' }),
        item({ signature: 'c', status: 'accepted' }),
        item({ signature: 'd', status: 'cancelled' }),
      ]),
    );
    expect(summary?.plannedItems).toBe(2);
  });

  it('counts options under investigation from deep work only', () => {
    // Enrichment touches every candidate in the catalog. Counting it would
    // report the whole catalog as "under investigation", which is both
    // untrue and the kind of inflated number that costs a person's trust in
    // everything else on the screen.
    const summary = summarizeRunPlanResponse(
      planResponse([
        item({ signature: 'a', depth: 'deep', targetEntityId: 'rav4' }),
        item({ signature: 'b', depth: 'deep', targetEntityId: 'rav4' }),
        item({ signature: 'c', depth: 'deep', targetEntityId: 'crv' }),
        item({ signature: 'd', depth: 'shallow', targetEntityId: 'outback' }),
      ]),
    );
    expect(summary?.optionsUnderInvestigation).toBe(2);
  });

  it('carries the count of concerns nothing can check', () => {
    const summary = summarizeRunPlanResponse(
      planResponse(
        [item()],
        [{ concernId: 'dog_crate', obligationIds: [], reason: 'no capability' }],
      ),
    );
    expect(summary?.unverifiableConcerns).toBe(1);
  });

  it('reports zero outstanding work without pretending there is none to report', () => {
    // A plan whose items are all accepted is a real state: the summary is
    // present with `plannedItems: 0`, and the shell decides not to render a
    // line for it. That decision belongs to the component, not here.
    const summary = summarizeRunPlanResponse(planResponse([item({ status: 'accepted' })]));
    expect(summary).not.toBeNull();
    expect(summary?.plannedItems).toBe(0);
  });

  it('carries the plan version, so a consumer can tell one revision from the next', () => {
    expect(summarizeRunPlanResponse(planResponse([item()], [], 3))?.planVersion).toBe(3);
  });
});
