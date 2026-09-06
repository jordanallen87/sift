# Where every advanced Strands feature lands in the bid pack

The Agents for Humans rubric weights **Technological Implementation** on "how thoroughly and skillfully does the project use Strands Agents." Home Energy Guardian is currently the pack that carries that proof. Before retargeting the demo, every one of those capabilities needs a concrete home here — otherwise we trade a better *story* for a worse *score*.

This file does that mapping honestly, including the two places where this pack is genuinely **weaker** than energy.

Baseline for each row is what `docs/submissions/agents-for-humans/claim-evidence-matrix.md` already proves against a real exported run.

---

## The mapping

| # | Capability | Energy today | Bid pack | Strength |
| --- | --- | --- | --- | --- |
| S1 | Real SDK (`otel.scope: strands-agents`) | Every span | Unchanged — same runtime | **Same** |
| S2 | AgentSkills progressive activation | 4 skills, one per obligation | `scope-normalization`, `price-arithmetic`, `credential-verification`, `schedule-analysis` | **Same** |
| S3 | Bounded Swarm, model-decided handoffs | 6 specialists, 5 handoffs | scope-analyst → price-analyst → credential-checker → schedule-analyst → source-challenger → decision-synthesizer | **Same** |
| S5 | Context Injector | 19 injections/run | Current weights, plus which scope gaps are still unresolved | **Same** |
| S6 | GoalLoop, `maxAttempts: 2` | First draft cites no source, rejected | **First draft ranks on raw totals; validator rejects because scope is not normalized** | **Stronger** |
| S7 | Structured output via SDK | Typed `ExecutionResult` | Unchanged | **Same** |
| S8a | `Guide` (RetrySteering) | Weather lookup repeated with no new angle | scope-analyst re-reads the same bid hunting a permit line that is not there | **Same** |
| S8b | `Confirm` (ConsequenceGuard) | `propose_inspection` | **`propose_award` — awarding a contract, real money** | **Stronger** |
| S8c | `Deny` (ScopeAuthorization) | anomaly-investigator reaches for `household-event-lookup` | price-analyst reaches for `license-lookup`, granted to credential-checker | **Same** |
| S9 | Sessions and snapshots | Restore across confirmation | Unchanged | **Same** |
| S10 | OTel spans → Runtime Inspector | 76 spans/run | Unchanged | **Same** |
| S11 | AgentCore `/ping` + `/invocations` | Served, exercised | Unchanged | **Same** |
| — | Deterministic scoring, human-only approval | Real | Unchanged, and more legible: price vs completeness | **Same** |
| — | Evidence conflicts | Engineered into the demo | **Native — bids genuinely disagree about scope** | **Stronger** |
| — | Explicit unknowns blocking readiness | Real | **Native — the domain's own word for it is a "plug number"** | **Stronger** |
| — | Custom `custom.*` concerns | Supported | **"Does it include haul-away?" — the most natural instance of this feature we have** | **Stronger** |

**Result: nothing is lost, five things get materially better motivated.** The GoalLoop rejection stops being "the model forgot to cite a source" and becomes "these bids are not comparable yet, so ranking them would be a lie" — which is the product's actual thesis, doing visible work.

---

## The two honest losses

**1. There is no background trigger.** Energy opens itself: a bill feed arrives, `evaluateBillFeed` finds 42% over baseline, and a case exists without anyone asking. That is the strongest evidence for "works quietly and surfaces you only for a real decision," and it maps to the Everyday track description almost word for word.

Bids arrive because you went and asked for them. There is no honest analogue, and **we should not invent one** — a fake "we noticed your quotes came in" watcher would be exactly the kind of staged autonomy the rest of this project refuses.

Mitigation: keep the energy pack in the repo and give it the versatility beat. The quiet-background claim stays provable; it just is not the hero.

**2. Anomaly arithmetic is deterministic and impressive.** `calculateEnergyAnalysis` does weather normalization and rate-change attribution — real math the model never touches, and a good answer to "is the model just guessing?" The bid pack's arithmetic is simpler: sum line items, add plug numbers, compare adjusted totals.

Mitigation: simpler is not weaker here, it is *auditable on camera*. A viewer can follow "$18,400 plus a $2,100 plug for the permits nobody priced equals $20,500" in a way nobody follows cooling-degree-day normalization. Trade sophistication for legibility deliberately, and say so.

---

## What gets reused unchanged

Effectively the whole engine. This is a retarget, not a rebuild:

- `packages/core` — obligations, evidence, readiness, scoring, criteria weights, human-only approval
- The Swarm runtime, interventions, plugins, event normalizer, OTel recorder
- The entire web workspace: activity stream, specialist panel, recommendation hero, approval card, criteria editor, Runtime Inspector
- Pack compiler, registry, conformance suite
- `SIFT_DEMO_PACING_MS`, the live-tailing dev view, the AgentCore routes

## What is genuinely new

- The pack manifest (criteria, obligations, specialists, skills, attribute definitions)
- Fixtures: three bids for one job, plus a license/insurance registry
- A `scope-differ` tool — compares line items across bids and reports what is priced in some and absent in others. **The one novel tool**, and the reason the demo works.
- Scripted beats for the Swarm trajectory
- Unit tests, scenario trajectory assertions, an e2e journey with baselines at six viewports
- A demo script

---

## The demo beat this is all for

1. Three bids for the same job. One is **$8,000 cheaper**.
2. The Swarm reads all three. `scope-differ` reports: bids A and C price permits and electrical; **bid B is silent on both**.
3. decision-synthesizer drafts *"take bid B, it is cheapest."*
4. **GoalLoop rejects it.** The bids are not on a common scope basis; ranking them would be false. The pane shows *Draft withheld*.
5. An obligation opens in plain words: *nobody priced the permits on bid B.* The person supplies the number, or marks it explicitly unknown.
6. Re-scored on an adjusted basis, **bid B is no longer cheapest** — and the recommendation flips.
7. `propose_award` requires human confirmation. The agent recommends; it never awards.

Every step is a real Strands capability doing work a person can see the point of, in a situation almost everyone has personally been in.
