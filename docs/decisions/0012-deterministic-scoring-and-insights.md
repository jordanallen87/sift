# ADR 0012: Deterministic Scoring, Derived Insights, and Measured Confidence

Status: accepted
Date: 2026-09-01

## Context

CLAUDE.md's non-negotiable product truths include:

> The deterministic core, not an LLM, owns case state, evidence validity, readiness, and human
> authority.

> The model may propose candidate events and recommendations. It may never approve a consequential
> decision.

Both were honoured for state, evidence, and approval. Neither was honoured for **ranking** — and a
ranking is a claim about a case.

What was actually shipping:

- `favoredOptionId = graphResult.proposedRecommendation.candidateIds[0]`
  (`car-purchase-engine.ts:560`) — 100% LLM judgment, taken positionally from a list.
- `confidence: 0.75` and `confidence: 0.85` — constants, presented to a person as a measurement.
- `facts: []` — an empty list rendered as "nothing was found".
- **No scoring function existed anywhere in `packages/core`.** `normalizeCriterionWeights` computed
  weights that nothing consumed.
- `Criterion.weight` and `Criterion.direction` reached the model only as interpolated prompt text
  (`car-purchase-graph.ts:473`). Reweighting a criterion changed a string in a prompt and nothing
  else. There was no computation for a reweight to change.

That last point is why this was worth doing before anything else: it is the difference between a
workspace the model narrates and a workspace the model *drives*. A reweight that visibly reorders
the ranking, computed deterministically in the browser with no model round-trip, is the strongest
demonstration available of the product's thesis — the conversation is where the person works, and
Sift is where the work is actually done.

## Decision

### 1. `packages/core/src/scoring.ts` owns the ranking

`scoreCase(options, criteria, definitions)` returns a `CaseScoreboard`: every option ranked, with a
per-criterion line carrying a normalized score, a status, a plain-English reason, the underlying
value, and that value's evidential standing.

Pure — no filesystem, network, clock, or randomness — so the same inputs always produce the
identical board, including the ordering. That is what lets a re-render after a reweight be trusted
as the consequence of the reweight rather than of anything else.

`scoreCaseState` is the shared entry point both `apps/agent` and `apps/web` call. Deliberately one
function rather than a projection built separately on each side: the workspace's visible ranking and
the ranking the recommendation is validated against must be the same computation. Two
implementations that agree today are two implementations that can drift, and the failure mode is a
UI showing one leader while the recommendation names another.

### 2. Six honesty rules, each with a test named after the lie it prevents

Every one of these exists because the obvious implementation gets it wrong in a way nobody notices
until it has already misled someone.

**An unknown is never a zero.** Missing data lowers `coverage`, never `total`. `total` is the
weighted mean over *scored* criteria only. Scoring an unresearched option as 0 turns "we did not
look" into "it is bad" — the most damaging thing an automated ranking can assert about a real
purchase. Verified by mutation: changing the total to divide by the full criterion weight instead of
by coverage fails exactly the test written to catch it, and nothing else.

**The attribute owns what "better" means.** A criterion's `direction` is a claim about the
criterion; an attribute's `comparison` is a property of the measurement. Lower price is lower price
regardless of what any criterion pointed at it believes.

A related defect this rule's own tests exposed: `normalize` returned `null` for two completely
different situations — "every option sits at the same point" and "this could not be normalized at
all" — and the caller read both as a tie. A target-shaped criterion with no target declared
therefore scored **every** option 1.0 and labelled it "every option is the same here": an invented
measurement wearing the words of a real one. The two cases are now distinguishable in the type.

**Enums are not ordinal until a pack says so.** See §3.

**A hard constraint flags; it never silently eliminates.** A violating option stays on the board,
fully scored and visibly labelled, ranked below every compliant one. Removing an option from
consideration through the back door of a sort is exactly the human authority this product does not
delegate. Constraints are also evaluated *absolutely*, never relatively — scored by min/max, the
most expensive of three perfectly affordable cars would "violate" a budget constraint for being the
maximum of the set.

**Refuse rather than invent.** Mixed currencies, mismatched units, free text, and unlisted enum
grades are reported as not comparable. An engine that ranks 25,000 JPY as cheaper than 30,000 USD
has invented an exchange rate it does not have.

**A disputed fact is not a settled one.** This rule was not designed; it was *found*, by running the
finished engine against the real car scenario rather than against its own fixtures. The Subaru
Outback leads every measured criterion — cheapest out-the-door, lowest five-year ownership cost,
Top Safety Pick+ — and its safety-and-reliability lead rests on a `car.reliability_rating` that
lands `conflicted` in that trajectory, which is why the `car.safety_reliability` obligation ends
`accepted_uncertainty`. The board reported that lead as settled. That is laundering a dispute into a
ranking.

A `conflicted` value still scores — refusing to use a value that exists is its own distortion — but
the line is marked `disputed`, says so in its own `reason`, and appears in
`OptionScore.disputedCriterionIds`. That list is deliberately separate from `coverage`: coverage
answers "how much did we measure", this answers "how much of what we measured is settled", and one
number cannot honestly answer both. **A single contested part marks a whole composite**, because
averaging a contested rating together with two settled ones and reporting the result as settled is
exactly how the dispute disappears.

The `disputed_evidence` insight fires only when the dispute is **load-bearing**, established by the
same leave-one-out experiment `decisive_criterion` uses. On the real scenario it correctly stays
quiet — the Outback still leads without that criterion — because warning on an immaterial dispute
trains people to ignore the warning.

### 3. Two latent pack defects, visible only once something read these fields

Neither was reachable before: nothing in the product had ever consumed `direction` or ordered an
enum.

**`car.crash_safety_rating` lists its `allowedValues` best-first** —
`['Top Safety Pick+', 'Top Safety Pick', 'Recommended', 'Not Rated']` — as do
`driver_assistance_rating`, `reliability_rating`, and `driving_comfort_rating`. The natural ordinal
mapping (array index ascending = quality ascending) would have ranked an **unrated car as the safest
one on the lot**, silently, inside a 30%-weight criterion. Nothing in the contract ever said which
end of `allowedValues` was good, because `allowedValues` is a membership set.

So the engine refuses to treat an enum as ordinal at all, and packs opt in with an explicit
`AttributeDefinition.orderedValues`. That field supplies the **scale**; `comparison` supplies the
**direction** — `energy.rough_effort_level` is `['low', 'medium', 'high']` with `lower_better`,
while `car.crash_safety_rating` is `['Not Rated', …, 'Top Safety Pick+']` with `higher_better`.
Reading `orderedValues` as "worst first" instead double-inverts against a `lower_better` comparison
and scores the most laborious option as the best one — which is precisely the mistake made while
first authoring `energy.rough_effort_level`, caught by running the tests, and now pinned by a
regression test of its own. A value absent from `orderedValues` is **unscorable, not worst**: a
grade nobody anticipated is missing information, and treating it as the bottom of the scale would
invent a fact about it.

**`pref.deal_value` declares `direction: 'higher_better'` over `car.out_the_door_price`**, whose own
`comparison` is `lower_better`. Read literally, a 20%-weight criterion ranks the most expensive car
as the best deal.

The first instinct — flip the pack — is wrong, and the fixture proves it:
`household-profile.json` seeds exactly this, and *correctly at the criterion level*, because more
deal value **is** better. The measurement simply points the other way. A criterion phrased as a
benefit over a cost measurement is an ordinary modelling pattern, not an authoring mistake, and
nothing distinguishes it from a genuine polarity error except intent the engine cannot see. So the
attribute is authoritative (rule 2) and **no warning is emitted** — warning here would make the
warning channel permanent noise on the hero pack. The effective direction is disclosed where it is
actually useful instead: every `CriterionScore.reason` states it in words ("lower is better"), so
the row itself shows which way it was scored.

### 4. Composite criteria

`pref.safety_reliability` (30%) and `pref.household_fit` (15%) name no attribute at all — their
`question` describes a composite. Together that is **45% of the car pack's weight**, permanently
unscorable, leaving the pack's single heaviest criterion with no number beside it.

`Criterion.composedOfAttributes` names the parts. Each is normalized by its **own** attribute's
`comparison`, since the parts of a composite need not point the same way, and the results are
averaged. A car missing one of three ratings still scores from the other two, with the basis stated
("from 2 of 3 measures") — a composite built on partial evidence is a weaker claim on its face
rather than an equal one.

`car.rear_cargo_crate_fit` is deliberately **excluded** from `pref.household_fit`: it is the
case-specific question the dog-crate obligation investigates, and folding it in would double-count
the same concern once as evidence and once as score.

### 5. Insights are derived, never asserted

`deriveInsights(board)` is a pure function of the board — no model, no re-scoring, no access to
anything the UI cannot also see.

`decisive_criterion` is the one worth naming. The claim "price alone is what puts the RAV4 ahead —
drop it and the CR-V wins" is not narrated; it is **verified**, by recomputing each option's total
without that criterion from the lines already on the board and checking whether the top two actually
swap. When no single criterion flips the order, no such insight is emitted. That is an experiment
with a negative result, which is the property that makes the positive result worth reading.

`leader` is suppressed for a field of one, because leading a field of one says nothing.

### 6. Recommendations carry measured numbers

`deriveScoredRecommendationFields` replaces the constants:

```
confidence = coverage × (0.6 + 0.4 × min(1, margin / 0.1))
```

A stated function of two measured quantities, not an estimate. A fully-evidenced, clearly-leading
recommendation reaches 1.0; a fully-evidenced dead heat reaches 0.6, because "we measured everything
and they are tied" is genuine knowledge about a genuinely close call. **Both inputs are reported
alongside the number in `facts`**, so a reader can check the arithmetic — which is the whole reason
for preferring a stated formula over a model's self-assessed confidence, a figure that cannot be
checked at all.

**The divergence case is the important one.** When the model's favorite is not the deterministic
leader, silently overwriting the model's pick and silently accepting it are both ways of hiding a
real disagreement between two things the product claims to trust. So the proposal stands — the model
may be accounting for something no attribute captures — the disagreement is stated in `limitations`
in the person's own terms, and confidence is capped at 0.4. Not zero: reporting no confidence at all
would overstate the disagreement as badly as ignoring it understates it.

Engine-authored limitations are **merged** with derived ones rather than replaced. "Whether both dog
crates fit behind the second row remains unverified" is a better sentence than any derivation would
produce, and dropping it for uniformity would trade real information away.

A defect found in a live run and fixed: with two options scoring identically, `leader` is merely
whichever the tiebreak put first, and the divergence branch emitted the flatly false sentence
"scoring puts X ahead (100% to 100%)". Agreement is now about **score**, not identity — choosing
among co-leaders is the judgment the model is there to exercise.

A second one: the two **scenario runners** (`car-purchase-scenario.ts`,
`home-energy-guardian-scenario.ts`) carry their own recommendation-writing paths, separate from the
engines. Patching the engines alone left the demo the product actually executes still shipping
`confidence: 0.85` and `facts: []`. All four sites now derive from the board.

### 7. What the hero demo now says, and why that is better

On the real car trajectory the model favors the CR-V, the deterministic leader is the Outback, and
the product says so:

> This recommendation favors 2022 Honda CR-V EX-L AWD, but scoring your criteria puts 2022 Subaru
> Outback Premium AWD ahead (94% to 59%). The reasoning above may account for something the scoring
> does not — it is worth reading before deciding.
>
> Driving comfort carries 20% of the weight on this case but is not part of the score: nobody has
> established this for this option yet, so it is left out of the score rather than counted against
> it.

Confidence: 0.4, down from a hardcoded 0.85.

This was initially alarming — the hero demo's headline outcome now carries a caveat — and it is in
fact the strongest thing the product does. The model recommends the CR-V on grounds (driving
comfort, dog-crate fit) that nobody has established; those two criteria are 36% of the case's weight
and entirely unmeasured. The Outback leads everything that *was* measured, and its lead depends
partly on a contested rating. All of that is true, none of it was visible before, and no LLM-only
product says any of it.

It is pinned as a scenario assertion rather than left as an accident of the fixtures.

## Consequences

- `@sift/core` 367 tests (was 323), `@sift/agent` 839 (was 823), `@sift/packs` 175, contracts 233,
  scenarios 4.
- The car scenario test gained end-to-end assertions no unit fixture can make: that the persisted
  `confidence` and `facts` reproduce **exactly** when recomputed from the final snapshot (a
  surviving constant anywhere would diverge); that the deliberately-unknown driving comfort scores
  `unknown` with a null score and coverage below 1; that the Outback's composite safety line reads
  `disputed`; and that the model's favorite is not the deterministic leader, with the disagreement
  present in the persisted limitations.
- Two pack manifest snapshots updated: **40 insertions, 0 deletions** — purely the new optional
  fields, no existing manifest content altered.
- Both new contract fields are optional, so packs authored before them keep their meaning and their
  `compiledHash` (canonicalization drops `undefined` before hashing). The two shipped packs *do*
  change hash, which is correct — their manifests genuinely changed.
- One existing test was **retargeted, not weakened**:
  `home-energy-engine.test.ts`'s limitation de-duplication case asserted
  `limitations).toEqual([shared])`, which is no longer the whole array. It now asserts the
  context-collected entry appears first and exactly once — proving the same de-duplication property
  against the changed shape.
- `reviewProposal` remains absent from the WebMCP catalog and `attributeStatusOriginError` still
  permits `status: 'verified'` only from `origin: 'user'`. Scoring a case is not deciding it.

## Still open

- The workspace does not yet **render** the scoreboard: option cards show pack-declared prominent
  attributes, not rank, score, or the per-criterion breakdown. The engine is wired into the
  recommendation but not into the option views.
- ~~No WebMCP read tool exposes the board, so the model cannot read Sift's analysis and must still
  re-derive it from raw attributes — the exact duplication this ADR's thesis argues against.~~
  **Closed.** `sift_explain_ranking` (READ) returns the board with its reasoning attached — rank,
  score, coverage, the per-criterion breakdown with each line's own plain-English `reason`, violated
  constraints, and the derived insights (`docs/specs/webmcp.md`,
  `apps/web/src/model-context/ranking-context.ts`). It calls the same `buildWorkspaceScoreboard`
  adapter the workspace does, so there is no second ranking to disagree with the first; it carries no
  `expectedSequence` and no `SiftCommands` dependency, so it is structurally incapable of writing;
  and its bounds report what they dropped, including the *share of weight* each truncated breakdown
  left out — a silently truncated analysis being a lying analysis. All six honesty rules survive the
  projection rather than being restated in it: `CriterionScoreStatus` round-trips faithfully (a
  `disputed` line is never collapsed into `scored`, since both carry a number), `disputedCriterionIds`
  is carried beside `coverage` rather than folded into it, and the tool description tells the model in
  as many words that an unknown is not a zero, a disputed measurement is not a settled one, and a
  violated constraint is a flag rather than an elimination.
- Live what-if (reweight → watch the order move) is computable but has no control surface.
