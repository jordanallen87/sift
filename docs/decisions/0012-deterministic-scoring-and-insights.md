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

### 2. Five honesty rules, each with a test named after the lie it prevents

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

## Consequences

- `@sift/core` 362 tests (was 323), `@sift/agent` 838 (was 823), `@sift/packs` 175, contracts 233.
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
- No WebMCP read tool exposes the board, so the model cannot read Sift's analysis and must still
  re-derive it from raw attributes — the exact duplication this ADR's thesis argues against.
- Live what-if (reweight → watch the order move) is computable but has no control surface.
