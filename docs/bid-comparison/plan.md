# Build plan — `bid-comparison` pack

Decided 2026-09-06. This pack becomes the **AWS hero**. `home-energy-guardian` and `car-purchase` both stay registered and tested; nothing is removed.

## The scenario

A four-person remodeling contractor is choosing between three subcontractor bids for the **plumbing scope of a master bathroom remodel**.

| Bid | Contractor | Quoted total |
| --- | --- | --- |
| A | Northgate Plumbing | **$18,400** |
| B | Cedar & Sons | **$14,900** |
| C | Two Rivers Mechanical | **$19,250** |

Bid B is $3,500 under bid A. It is cheaper because it is silent on three things the others price:

| Missing from bid B | Plug number |
| --- | --- |
| Permits and inspections | $1,200 |
| Shower-valve rough-in | $2,100 |
| Debris haul-away | $400 |

**Adjusted: B = 14,900 + 3,700 = $18,600 — now more expensive than A's $18,400.** The ranking flips, and it flips on arithmetic anyone can follow on camera.

Secondary evidence, so the board is not decided on one axis: B wants a 45% deposit (research says over 33% is a red flag, over 50% is alarming); B's warranty has no stated term; C's license is active but its insurance certificate names a different entity than the license holder.

## Criteria

| id | kind | direction | weight |
| --- | --- | --- | --- |
| `bid.adjusted_total` | preference | lower_better | 45 |
| `bid.scope_completeness` | preference | higher_better | 20 |
| `bid.payment_risk` | preference | lower_better | 15 |
| `bid.schedule_fit` | preference | higher_better | 10 |
| `bid.warranty` | preference | higher_better | 10 |
| `bid.credentials_valid` | hard_constraint | — | protected, not reweightable |

The reweight beat: move weight off `adjusted_total` toward `scope_completeness` and `payment_risk`, and the recommendation changes again — proving the deterministic core owns the ranking.

## Obligations

1. `bid.scope_normalization` — put all three on one scope basis (scope-analyst)
2. `bid.price_verification` — line items sum to total; allowances identified (price-analyst)
3. `bid.credential_verification` — licence covers this work, insurance active, named insured matches (credential-checker)
4. `bid.schedule_feasibility` — start date and duration credible (schedule-analyst)
5. `bid.award_recommendation` — synthesis, `dependsOnCriteria: true` so a reweight reopens only this one (decision-synthesizer)

## Specialists and skills

`scope-analyst` (skill `scope-normalization`, tools `bid-reader`/`scope-differ`) → `price-analyst` (skill `price-arithmetic`, tools `bid-reader`/`bid-calculator`) → `credential-checker` (skill `credential-verification`, tool `license-lookup`) → `schedule-analyst` (skill `schedule-analysis`, tool `bid-reader`) → `source-challenger` (tools `bid-reader`/`scope-differ`) → `decision-synthesizer` (tool `propose_award`).

## The Strands beats, placed deliberately

- **Deny** — `price-analyst` reaches for `license-lookup`, which the pack grants only to `credential-checker`. Refused before it runs.
- **Guide** — `scope-analyst` runs `scope-differ` twice on the same pair with no new angle; RetrySteering redirects it to the third bid.
- **GoalLoop** — first synthesis draft ranks on raw totals and is **rejected** because the scope basis is not normalized; the corrected attempt ranks on adjusted totals and cites the plug numbers.
- **Confirm** — `propose_award` is consequential; ConsequenceGuard gates it on human review before the proposal is recorded.
- **Explicit unknown** — until a plug number is supplied, bid B's adjusted total is unknown and readiness is blocked. This is the product's whole thesis.

## Files

**New**

- `packages/scenarios/fixtures/bids/{job,bid-northgate,bid-cedar,bid-tworivers,license-registry}.json`
- `packages/packs/src/bid-comparison.ts` + `.test.ts`
- `packages/scenarios/src/tools/{bid-reader,scope-differ,bid-calculator,license-lookup}.ts` + tests
- `apps/agent/src/runtime/bid-comparison-swarm.ts` + `.test.ts`
- `apps/agent/src/runtime/scripted-beats/bid-comparison.ts` + `.test.ts`
- `apps/agent/src/runtime/bid-comparison-engine.ts` + `.test.ts`
- `tests/scenarios/bid-comparison.scenario.ts` + `.scenario.test.ts`
- `tests/e2e/bid-comparison-journey.spec.ts`
- `docs/submissions/agents-for-humans/demo-script-bid.md`

**Modified**

- `packages/contracts/src/commands.ts` — add `'bid-comparison'` to `DEMO_IDS`
- `packages/scenarios/src/tools/fixture-loader.ts` — bids fixture dir + schemas
- `packages/scenarios/src/tools/index.ts`, `packages/packs/src/index.ts` — exports
- `apps/agent/src/server.ts` — register pack, wire engine
- `apps/web/src/components/DemoLauncher.tsx` — third launcher entry
- `stryker.config.mjs` — add `bid-calculator.ts` and `scope-differ.ts` to `mutate`

## Waves

1. Fixtures + loader wiring ‖ pack manifest
2. Domain tools ‖ contracts/registration wiring
3. Swarm + scripted beats ‖ engine + server wiring
4. Scenario assertions + e2e ‖ demo script + submission docs

Full `pnpm verify` after every wave that touches runtime code. Nothing merges that leaves energy or car red.

## Non-negotiables

- No existing test weakened, no threshold lowered, no baseline updated without inspecting the image.
- The scripted provider stays a real Strands `Model`; the orchestration is genuine.
- `propose_award` can never be auto-approved; only `origin: 'user'` decides.
- Fixtures are invented and labelled fictional — no real contractor, licence number, or address.
