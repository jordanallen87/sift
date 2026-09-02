# 0009. Adaptive decision experience: responsibility, modes, state, and fidelity

- Status: accepted
- Date: 2026-09-02
- Supersedes nothing; extends ADR 0005 (workspace view state) and ADR 0006 (WebMCP two-way collaboration)
- Required by: `docs/final-plan/final-hackathon-execution-plan.md` Task 1

## Context

Sift had a working decision engine and a working WebMCP surface, but the two
were joined by a launcher and a fixed set of screens. A person arrived at a
catalog, not at a conversation, and the pack's questions existed only as
prose suggestions inside a `DecisionGuide` — a model could read them, but
nothing in the system knew whether they had been answered.

That left four claims the product wanted to make and could not:

1. that conversation drives the decision rather than narrating it;
2. that a model proposes and only a person decides;
3. that a candidate is a *model* and never implicitly a listing for sale; and
4. that shortlist confirmation and the final decision are structurally out of
   a model's reach.

The canonical experience (`docs/final-plan/final-approved-experience.md`)
makes all four load-bearing. This ADR records the decisions taken to make
them true rather than asserted.

## Decision

### 1. Discovery is canonical, event-sourced case state

A `DiscoveryState` lives on `CaseState` alongside criteria, obligations, and
evidence, and changes only through `CaseEvent`s (`discovery.topic_updated`,
`discovery.interaction_requested`, `discovery.interaction_answered`,
`discovery.blind_spot_reviewed`, `candidate.disposition_set`).

It is `.optional()`, and a case carries no `discovery` key until something
actually happens in discovery. An absent key reads as "this case has not
started discovery", which is true; an eagerly-created empty one would be a
placeholder that every existing snapshot and fixture would have to grow.

**Consequence:** the pane's coverage indicator, ChatGPT's next-turn readback,
and the persona harness's turn diff are three views of one record rather than
three copies that can disagree.

### 2. Four authority rules are structural, not documented

Where a rule can be made unrepresentable, it is:

- A `DiscoveryTopicState` with `origin: 'model'` cannot be `confirmed`
  without `humanConfirmed`, and nothing reaches `importance: 'must_work'` —
  the tier that removes options from consideration — without a human behind
  it. A model-proposed blocker is recorded as `needs_verification`:
  downgraded, not dropped.
- A `required` topic template may not declare a defer escape hatch, and a
  `companion`-mode `DecisionBrief` may not contain a deferred required topic.
- `CandidateProvenance` refuses `level: 'listing'` without listing
  provenance, and refuses listing provenance on a model-level candidate.
- A `NextMove` of a human-only kind must declare `humanOnly`, and a
  `humanOnly` move may not carry a `toolName`.

The last one is the sharpest: nothing that walks the move list looking for
tools to register can find one for confirming a shortlist. The capability is
absent rather than guarded.

**Consequence:** these rules cannot be regressed by a caller, a refactor, or
a new code path, because the illegal state has no representation.

### 3. What a schema cannot know, `packages/core` enforces

A schema rejects illegal *shapes*. It cannot know that the topic a model is
writing to was already answered by a person, that the topic does not exist in
this pack, or that it does not apply to this case. `planDiscoveryResponse`
checks all three, in that order, and reports each rejection with a reason
rather than silently dropping it.

**Consequence:** the authority rules are enforced twice, at different layers,
for different reasons — and a defect in one does not open the other.

### 4. Two modes, one engine

`DecisionMode` is `companion` or `standalone`. The only behavioural
difference the contracts encode: standalone may defer a soft topic, and pays
for it by marking its own output `provisional`. Companion may not defer a
required topic at all.

**Consequence:** "the modes are two presentations of one system" is a
checkable property rather than an intention.

### 5. Discovery derivation is pure

`deriveDiscoveryReadiness`, `deriveNextMoves`, and `compileDiscoveryTopics`
read no clock, no random source, and no model. Identical state always
produces identical readiness, allowed moves, and required pane view.

**Consequence:** reload does not restore a remembered position, it recomputes
the same one — so a refresh lands a person exactly where they were, and what
ChatGPT reads matches what the pane shows.

### 6. The fidelity boundary is per-field, not per-product

The bundled EPA catalog (853 model/year/trim records) is the real discovery
universe and carries no cargo dimensions, child-seat layout, safety or
reliability ratings, ownership cost, or price of any kind. A curated cohort
of eight models supplies those, and every value carries
`provenance: 'curated_demo'`.

Three rules keep that honest: a curated profile attaches only to a record
discovery could actually find; `enrichWithDemoProfile` adds detail without
rewriting identity; and `provenanceByField` labels each field rather than
returning one flattened object in which a curated cargo width looks measured.

There is deliberately no field anywhere for a price, a dealer, or an
availability. `indicativePriceBandUsd` is a rough national band for a model
at a trim level — the strongest price claim this data supports.

**Consequence:** "the external world may be simulated; the product may not
be" is enforced at the field level, where a person actually reads it.

### 7. Quick Pick is triage, not approval

`keep`, `pass`, and `unsure` are canonical, undoable, human-only judgments.
Undo writes `unreviewed` as a forward event carrying `previousDisposition`,
so the history of what someone considered and rejected stays in the log.

Keep is explicitly not shortlist confirmation, and the card says so where a
person forms their idea of what the button meant.

**Consequence:** the pane-to-conversation half of the WebMCP loop is real —
a judgment survives a reload and is readable by the model on its next turn.

## Alternatives considered

**Discovery as prompt convention.** The `DecisionGuide`'s
`suggestedQuestions` already existed and a model could be asked to track
coverage itself. Rejected: nothing could then verify that a required topic was
answered, and "required conversational discovery cannot be skipped" would have
been a request rather than a rule.

**A single `confirmed` boolean instead of six statuses.** Rejected because
`inferred_pending`, `deferred`, `not_applicable`, and `blocked` are four
genuinely different situations, and collapsing any of them into "not
confirmed" loses the distinction between "we asked and they said it does not
apply" and "we never asked".

**Flattening curated data onto the catalog record.** Simpler for every
consumer, and precisely how a curated cargo width comes to look like a
measured one. Rejected.

**Changing the pack id to `vehicle-selection`.** Every stored case pins the
id in `CasePackPin`, so a rename orphans them for no user-visible gain. Only
the user-facing name changed.

## Consequences

- `CaseState`, `DecisionPackManifest`, and `AttributeRecord` all gained
  optional fields, so every existing snapshot still parses and every existing
  pack still compiles to the same `compiledHash`.
- The WebMCP catalog grew from 23 to 26 tools. None of the three new ones can
  confirm anything.
- `pref.household_fit` keeps its id and gained the label "Practical fit",
  because it now measures a landscaper's van as readily as a family's estate.
