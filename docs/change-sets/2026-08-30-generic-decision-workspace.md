# Change Set: Generic AI-Assisted Decision Workspace

Status: **approved — authoritative requirements input**
Date received: 2026-08-30
Source: project owner, supplied directly as an approved change set.

## How to read this document

This is a **requirements input**, not a derived contract. It is an ADDITIONAL approved
change set layered on top of the previously supplied vehicle-catalog / real-comparison-product
change set (ADR 0003). It does not discard or restart that work.

The cumulative design baseline is:

1. the current repository and implementation;
2. the existing authoritative specs (`docs/specs/`);
3. the previously approved vehicle-catalog / shortlist / normal-case-creation changes (ADR 0003);
4. and this document.

Per `docs/specs/README.md`'s precedence rule, the **specs remain the authoritative contract**.
This change set is the source those specs must be updated *from* (see §65). Where this document
and a spec disagree, the spec must be updated to match this document — not the other way around,
and not silently.

The text below preserves the project owner's own wording. Formatting (headings, lists, code
fences) has been normalized for readability; no requirement has been added, removed, softened,
or reordered.

---

## Purpose

The purpose of this change set is significantly broader than visual cleanup. What Pax should
actually become has now been clarified:

> Pax is a generic AI-assisted decision workspace in which a person and ChatGPT collaboratively
> discover options, define what matters, research them, add previously-unanticipated comparison
> dimensions, manipulate how the decision is visualized, resolve unknowns, and ultimately reach
> a human-controlled decision.

The Car Purchase Decision Pack is the first polished shopping/comparison implementation of this
generic system. The Energy Guardian remains the contrasting autonomous AWS/Strands implementation.

The core architecture should remain generic. Do not hard-code the product around cars merely
because the WebMCP hero currently uses vehicles.

---

## 1. FIRST: audit current implementation against this change set

Before modifying code:

- inspect the current implementation after any work completed from the previous vehicle-catalog prompt;
- inspect current UI components and actual rendered application;
- inspect current List/Table/Kanban implementations;
- inspect current option editor/comparison components;
- inspect current WebMCP tool registry;
- inspect current case context projection;
- inspect current Decision Pack presentation metadata;
- inspect current criteria/custom-attribute/case-extension implementation;
- inspect source/research/evidence storage;
- inspect activity/runtime inspector implementation;
- inspect current app navigation and right-pane behavior;
- inspect tests for every subsystem touched.

Do not infer implementation state from old build-log entries if newer code differs.

Produce a concise internal implementation plan before editing. Identify:

- functionality already present and reusable;
- current code that is structurally correct but poorly presented;
- missing generic contracts;
- terminology leaks;
- duplicated UI concepts;
- where existing components should be reorganized rather than rewritten;
- which changes require persisted-schema/event changes;
- which changes are presentation-only;
- which changes affect WebMCP contracts.

Preserve existing tests and deterministic scenarios.

---

## 2. Central product model

Stop treating the visible product as an agent-runtime dashboard. The consumer-facing mental
model should become approximately:

- **Decision Profile** — What does this person want?
- **Options** — What are they choosing between?
- **Research** — What do we know about those options?
- **Notes** — What has the person or ChatGPT learned, observed, or recorded?
- **Questions** — What still needs to be figured out?
- **Recommendation** — Where is the evidence currently pointing?
- **Decision** — What did the human ultimately choose?

These are USER concepts.

Existing internal concepts remain valuable: Case; Decision Pack; criteria; attributes;
obligations; evidence links; claims; sources; recommendation; proposal; Graph; Swarm;
specialists; skills; interventions; E0–E3; GoalLoop; run IDs; traces.

But most of those should NOT be primary consumer-facing vocabulary. The normal UI should
project the internal model into understandable decision language.

---

## 3. Product must remain generic

The existing engine was intentionally designed around:

- **Engine** → stable evidence/readiness/policy/persistence behavior.
- **Decision Pack** → domain-specific defaults, criteria, attributes, capabilities, orchestration, and presentation.
- **Case** → one person's actual decision.

Preserve this.

Do NOT introduce generic product-level concepts named `VehicleProfile`, `VehicleComparisonView`,
`VehicleResearch`, or `CarNote` unless they are legitimately pack-specific adapters.

Prefer generic names such as: `DecisionProfile`; `Option`; `ComparisonField`; `CaseNote`;
`ResearchSource`; `WorkspaceView`; `CatalogItem`.

The car pack may render them with automotive-specific labels.

Later packs should be able to support: laptops; TVs; mattresses; strollers; appliances;
furniture; hotels; apartments; contractors; travel choices; other shopping/selection decisions.

Do not prematurely implement those additional packs. The requirement is that the architecture
does not prevent them.

---

## 4. Normal user UI must stop leaking engine terminology

The current UI exposes too much internal Pax vocabulary and runtime metadata. Consumer-facing
replacements should generally follow this direction:

| Internal | Consumer-facing |
|---|---|
| Case | Comparison / Decision |
| Decision Pack | Usually hidden; possibly "Method" or domain label in secondary details |
| Obligation | Thing to check / Question |
| Evidence | Research / Source / Fact |
| Claim | Finding |
| Recommendation | Current recommendation |
| Proposal | Decision to review |
| Accepted uncertainty | Decide without this |
| Stale evidence | Needs re-checking |
| Intervention | Hidden from consumer view |
| Guide | Agent changed approach / Rechecking another way |
| Source challenger | Hidden specialist detail |
| E1/E2/E3 | Hidden by default |
| commandId/runId | Developer view only |
| compiled hash | Developer view only |
| Graph/Swarm | Developer view only |

Do not apply this mechanically. Choose language that makes sense in context. The guiding rule:

> Consumer UI should explain what something means for the decision, not how Pax implemented it.

---

## 5. Remove empty system cards

The current UI suffers from stacked-card overload because it renders conceptual backend regions
even when nothing useful exists in them. Adopt this rule:

> Do not render an empty conceptual region merely because CaseState contains a corresponding field.

For example: do not show a large "Your decision" card whose only content is "No proposal is
pending." Do not show developer metadata just because it exists. Do not show full
activity/history unless the user asks for it.

Sections should appear when useful. Empty states should be intentional and compact.

---

## 6. Default right-pane experience

Remember the primary viewport is NOT a full desktop dashboard. Pax appears next to an active
ChatGPT conversation, effectively as another narrow browser pane.

The canonical consumer layout must be designed natively for roughly 390px, 430px, 480px.
Do not shrink a desktop dashboard. At narrow width, the experience should feel like a focused
decision companion.

A likely high-level structure:

**Header** — decision title (e.g. "Family SUV Comparison"); compact status (e.g.
"4 vehicles · Comparing · 2 things need attention"); optional compact action menu.
Do NOT put pack hashes, IDs, command IDs, or developer metadata here.

**Primary workspace view switcher** — e.g. Quick Pick / List / Compare / Board. Use
user-facing terminology rather than developer terminology. Internally these may correspond to
swipe / list / table / kanban.

**Secondary decision navigation** — potential concepts: Priorities; To Check; Recommendation.
This may be tabs, compact navigation, drawers, sheets, or context-sensitive sections depending
on viewport. Do not create excessive permanent navigation chrome.

---

## 7. Expanded mode vs narrow mode

Design two intentional information architectures.

**Narrow/default pane** optimized for: ChatGPT side-by-side collaboration; focused option
browsing; quick comparison; current priorities; unresolved issues; current recommendation.
Avoid giant multi-column tables.

**Expanded mode** optimized for: deeper comparison; multi-option table; more attributes visible
simultaneously; larger board; research inspection; profile editing; richer option management.

Responsive behavior must alter INFORMATION ARCHITECTURE where appropriate, not merely CSS widths.
Example: at expanded width 4 vehicle columns may be useful; at 390px a two-option head-to-head
comparison may be far more usable.

---

## 8. Workspace views

The existing List/Table/Kanban views should remain, but their purpose must be clarified.
Add Quick Pick / Swipe. These are not cosmetic renderings of identical information — each
solves a different decision task.

---

## 9. Quick Pick / Swipe view

Create a generic option-triage experience. Consumer-facing name should likely be **Quick Pick**
rather than "Tinder" or "Swipe", though swipe gestures are allowed.

A single option should dominate the pane. Example vehicle card:

```text
2025 Honda CR-V EX-L
$32,400 estimated
32 MPG
39.3 cu ft cargo

WHY IT FITS
- Strong safety evidence
- Excellent cargo space
- Within target budget

WATCH OUT
- Dealer price not verified
- Personal ride comfort still unknown
```

Actions: Pass / Maybe / Shortlist. Also support gestures where appropriate. Buttons remain
available for accessibility and discoverability.

**Quick Pick may help elicit preferences.** If the user repeatedly rejects options sharing a
characteristic, Pax/ChatGPT may identify the pattern. Example: "You've passed on three options
above $40,000. Should I make $40,000 a hard ceiling?"

Do NOT silently convert behavioral patterns into hard criteria. User confirmation is required.
This interaction should eventually be possible through the shared decision profile and WebMCP tools.

---

## 10. List view

List view answers: *Tell me about each option.*

Each option gets a rich but compact card. Show things such as: identity; price; high-value
attributes; strengths; concerns; unresolved information; current fit; relevant source-backed
findings.

Avoid dumping every available field. Pack presentation metadata should influence which fields
are prominent.

---

## 11. Compare / Table view

Compare view answers: *How do these options differ?*

Expanded mode may show several option columns. Narrow mode should support: head-to-head
comparison; horizontally scrollable candidates where appropriate; user-selected candidate
subset; configurable visible rows.

**Important:** the model must be able to configure which fields/rows appear.

Example user request: "Show me the three finalists and only the things that matter most to me."

ChatGPT should be able to configure candidates (CR-V, RAV4, Forester) and rows (Price, Safety,
Cargo, Reliability, Laptop work fit, Dog crate fit, Comfort). The UI should visibly change.
This is an important WebMCP demonstration.

---

## 12. Board / Kanban view

Board answers: *Where does each option currently stand?*

A useful default set of columns may be: Considering; Top choices; Need to verify; Out.
These should be configurable where appropriate.

Moving an option must preserve human authority. The AI may suggest movement. Do not silently
eliminate a candidate based solely on a model judgment unless the relevant workflow explicitly
allows it.

Example: RAV4 → Need to verify (reason: dealer offer conflicts with advertised price);
CR-V → Top choices (reason: strong household fit with fewer unresolved issues).

---

## 13. Model-controlled presentation

Create a generic persisted or session-scoped workspace view state. A likely conceptual contract:

```ts
interface WorkspaceViewState {
  mode: 'quick_pick' | 'list' | 'compare' | 'board'
  focusedOptionId?: string
  visibleOptionIds?: string[]
  visibleAttributeIds?: string[]
  pinnedAttributeIds?: string[]
  sort?: {
    fieldId: string
    direction: 'asc' | 'desc'
  }
  filters?: WorkspaceFilter[]
  compare?: {
    optionIds: string[]
  }
  board?: {
    columns: BoardColumnDefinition[]
  }
  quickPick?: {
    queue: string[]
    position: number
  }
}
```

Do not copy this blindly if a cleaner shape fits the existing architecture.

Requirements:

- user can manipulate the view;
- ChatGPT can manipulate the SAME view through WebMCP;
- focusing through WebMCP should visibly focus the page;
- changing view through WebMCP should visibly change the page;
- configuring comparison rows should immediately change table/compare UI;
- case data must remain distinct from ephemeral presentation state where appropriate;
- determine what needs persistence across reload and what can remain session/local UI state.

---

## 14. WebMCP must support both read and write

The current WebMCP design is mutation-heavy. The revised product should make WebMCP a genuine
TWO-WAY collaboration layer.

ChatGPT must be able to pull enough structured state OUT of Pax to conduct an informed
conversation. It should be able to understand: what decision is being made; what the user wants;
constraints; preferences; current options; current selection; available comparison fields;
custom fields; research already collected; notes; unresolved questions; stale/conflicted
information; current recommendation; available actions; current workspace view.

Do not require the model to reconstruct this from screen text.

---

## 15. Decision Profile

Add/promote a first-class consumer concept: **Decision Profile**. This should aggregate the
structured information representing: *What are we actually looking for?*

For the car pack this could include: budget (target, hard ceiling); usage (commute, household
size, driving environment); must-haves; preferences; nice-to-haves; priority ordering;
human-specific concerns; things still needing clarification.

The underlying representation may continue using criteria; attributes; typed custom fields;
case extensions. Do not create a competing second source of truth if existing structures can
represent the information cleanly. The UI needs a coherent projection.

---

## 16. Decision Profile should guide ChatGPT

ChatGPT should be able to see: established profile facts; missing important profile information;
suggested discovery questions; hard vs soft preferences; user-confirmed vs model-proposed concerns.

```json
{
  "profile": {
    "known": [
      {"id":"budget.max","value":"40000","kind":"hard_constraint"},
      {"id":"priority.safety","weight":30}
    ],
    "missing": [
      "typical_passenger_count",
      "annual_mileage"
    ],
    "suggestedQuestions": [
      "Do you need AWD?",
      "Is $40,000 a hard ceiling or target?"
    ]
  }
}
```

Exact schema should be designed from existing contracts.

---

## 17. WebMCP workspace / decision guide

We want Pax to be able to teach ChatGPT how to collaborate with a particular kind of decision.

Do NOT implement this as hidden prompt injection or an attempt to override host instructions.
Implement it explicitly as structured application guidance.

Conceptually distinguish three layers:

**Tool descriptions** — explain what each capability does and WHEN it should be used. Example
for custom fields: "Use this when the user introduces an important comparison factor that is not
represented by an existing field. Prefer a typed custom field over storing important comparable
information only in prose. Do not infer subjective values without supporting evidence or human
observation."

**Decision Guide** — pack-level guidance about the class of decision. Examples for car purchase:
important discovery questions; useful starter fields; important hard constraints; recommended
research categories; which attributes should not be inferred; available catalog filters; useful
default comparison views; common unresolved human-observation questions.

**Case Context** — what is true for THIS decision right now.

Do not dump an enormous guide into every tool response. Use progressive disclosure.

Possible tools/concepts: `pax_get_workspace_context`; `pax_get_decision_guide`; or an evolved
`pax_get_case_context`. Choose the cleanest design after inspecting current WebMCP contracts.

---

## 18. Case context should become central

`pax_get_case_context` or its successor should provide a rich but bounded representation of the
active decision. Potential shape:

```ts
{
  workspace: {
    kind: 'comparison',
    decisionType: 'vehicle_purchase',
    status: ...
  },
  profile: {...},
  options: [...],
  researchSummary: {...},
  questions: [...],
  recommendation: {...},
  selection: {
    optionId: ...,
    evidenceId: ...
  },
  view: {...},
  capabilities: {...},
  guidanceSummary: {...}
}
```

Do not expose: chain-of-thought; enormous raw source excerpts; unnecessary internal telemetry;
secrets. Keep a bounded context contract.

---

## 19. Search / catalog must also be available to ChatGPT

The vehicle catalog from the previous change set must not exist only as a human browser control.
ChatGPT should be able to search the same catalog. This allows the conversation itself to begin
the decision.

Example — User: "I need a family SUV under $40k with good cargo space and safety." ChatGPT:
reads Decision Guide; asks missing profile questions where useful; searches Pax's catalog;
discusses results; adds candidates to the visible shortlist.

Do NOT rely on the model's internal automotive knowledge to hallucinate catalog options.
Use Pax's real catalog data.

---

## 20. Make catalog search generic where practical

Avoid making the generic WebMCP contract permanently car-specific. Evaluate a concept like
`pax_search_options` or `pax_search_catalog` where the active Decision Pack provides: catalog
type; allowed filters; filter schema; result projection.

Example vehicle search: `bodyStyle = SUV`, `maxPrice = 40000`, `fuelType = hybrid`.
Future laptop pack: `minimumMemory = 32GB`, `maxPrice = 2000`, `maxWeight = 4lb`.

Do not over-engineer an abstract catalog framework if it creates unnecessary risk for the
hackathon. But avoid hard-coding the entire browser/client/domain layer around `VehicleCatalog`.
A vehicle adapter may be pack-specific.

---

## 21. Normal end-to-end shopping flow

The polished car experience should support this conceptual lifecycle:

1. **Find** — user begins either through page or ChatGPT ("I need a family SUV under $40k").
   ChatGPT may search Pax's catalog.
2. **Shortlist** — ChatGPT and/or user adds plausible options. User may use Quick Pick.
3. **Refine** — Decision Profile evolves ("Cargo matters more than MPG").
4. **Compare** — use Compare/Table/List/Board.
5. **Investigate** — user/ChatGPT requests deeper work on finalists. Strands performs evidence gathering.
6. **Add actual listing information** — "This dealer has the CR-V for $32,900 with 18k miles."
   Persist listing-specific facts separately from model specifications.
7. **Add unusual personal concerns** — "I need two dog crates behind the second row." Or "I work
   on my laptop in the car and need the center console to support that." Pax extends the schema.
8. **Resolve unknowns** — some issues remain measurements or test-drive questions.
9. **Recommend** — current recommendation becomes visible when earned.
10. **Decide** — human remains final authority.

---

## 22. Custom fields must become a hero feature

The existing `custom.*` case-extension architecture is no longer merely an edge-case capability.
Promote it into a major product behavior. This is one of the most differentiated AI/WebMCP
capabilities.

Traditional comparison sites have fixed schemas. Pax should allow the user's comparison schema
itself to evolve during conversation.

Example — User: "I work on my laptop in the car sometimes. I need the console/armrest to work
for that." Existing vehicle catalogs almost certainly have no direct field called "Laptop work
fit". Pax should be able to create `custom.laptop_work_fit` and display it alongside native fields.

The exact field type might be enum, qualitative, boolean, number, etc. The AI should help choose
an appropriate structured representation.

---

## 23. Custom field creation authority

Distinguish:

**Explicit user request** — if the user directly introduces the concern, ChatGPT may create it
as user-originated.

**Agent-generated idea** — if ChatGPT independently thinks another factor may matter, it should
propose it. Example: "You mentioned two child seats. Rear-door access may matter. Add it to the
comparison?" User confirms. Then it becomes active.

Preserve existing origin/confirmation semantics.

---

## 24. Model must be able to populate custom fields

Creating the definition is not enough. The model should be able to add values/findings for options.

Example — custom field "Laptop work fit": CR-V = Likely good; RAV4 = Unknown; Forester = Poor
candidate; CX-50 = Good candidate.

But values must not be unsupported model guesses. Each populated field must preserve: provenance;
origin; confidence where applicable; sources; evidence level/status; uncertainty.

For subjective/personal concerns, specification research may support "likely" but not "verified
comfortable." Human observation may later replace or strengthen the result.

---

## 25. Add/refine a tool for attribute value updates

Evaluate whether existing `pax_upsert_option` is sufficient to clearly support: setting existing
attribute values; setting custom attribute values; associating sources; marking unknowns;
preserving confidence/evidence status.

If it becomes awkward, add a clearer capability such as `pax_set_option_attribute` or
`pax_update_option_attributes`. Do NOT duplicate functionality unnecessarily.

The important requirement is:

> ChatGPT can create a comparison field and then populate that field across options using
> structured, provenance-aware values.

---

## 26. Custom fields should look first-class in the UI

Do not render them as weird developer extensions. In Compare view:

| | CR-V | RAV4 | Forester |
|---|---|---|---|
| Safety | ... | ... | ... |
| Cargo | ... | ... | ... |
| Laptop work fit | Likely good | Unknown | Poor |
| Two dog crates | Verify | Likely | Verify |

Indicate subtly that a row was "Added for your comparison". Possible indicator: `Custom` or a
small sparkle/icon.

Do not expose raw IDs such as `custom.laptop_work_fit` in normal UI.

Opening the field should explain: why it exists; who added it; how values are being determined;
what sources exist; what is still unknown; what human verification might be necessary.

---

## 27. Research must be a first-class shared resource

ChatGPT should be able to research externally and add relevant material into Pax. Existing
source/evidence capabilities should be surfaced coherently.

Example conversation: "I've heard the CX-50 rides pretty stiff. Look into that." ChatGPT
researches and adds a review, a second review, an owner discussion, other relevant sources.

Pax stores: URLs; publisher; dates; excerpts; claims; applicable options; provenance.

Submission does not automatically make a source trusted. Existing source-challenge/evidence rules
remain authoritative. Research should survive conversation closure/reload because it is part of
the decision.

---

## 28. Notes

Add a generic `CaseNote` concept if a clean equivalent does not already exist. Not every thought
belongs as evidence, criterion, or attribute.

Examples: "My wife liked the CR-V interior." / "Dealer said they may waive the package." /
"Need to check this Saturday." / "Child climbed into Forester easily."

These matter to the decision but may not constitute objective research evidence. A conceptual shape:

```ts
interface CaseNote {
  id: string
  caseId: string
  optionIds: string[]
  author: 'user' | 'chatgpt'
  kind:
    | 'observation'
    | 'research'
    | 'question'
    | 'preference'
    | 'reminder'
  text: string
  sourceIds?: string[]
  createdAt: string
}
```

Design the actual schema appropriately. Requirements: user can add notes; ChatGPT can add notes;
note attribution is clear; notes may reference options; notes are included in bounded decision
context when relevant; notes do NOT automatically become evidence; notes survive reload.

---

## 29. WebMCP should be able to add research and notes

Ensure explicit structured capabilities exist for: adding a source; attaching research to
options; adding a note; optionally updating a note if safe/appropriate.

Reuse existing source APIs. Add missing note capability.

Tool descriptions should clearly distinguish: Research source vs Note vs Criterion vs Custom
comparison field. This prevents ChatGPT from dumping everything into notes.

---

## 30. WebMCP should control focus

Shared attention remains central.

If the user manually selects Forester, then ChatGPT should see `selectedOptionId = forester`.
If ChatGPT focuses RAV4, the page should visibly focus the RAV4.

This should work in Quick Pick, List, Compare, and Board. "this one" should have meaningful
shared context.

---

## 31. Model-controlled comparison configuration

Add explicit WebMCP capability to configure the visual comparison. Potential semantic actions:
set view mode; focus option; choose visible options; choose comparison fields; pin fields; sort;
filter; change head-to-head pair; configure board columns if allowed; configure Quick Pick queue.

Do not expose one enormous unsafe arbitrary UI mutation object if narrower typed operations are
safer. The model should not manipulate arbitrary DOM. It should manipulate structured application state.

---

## 32. Examples this must support

**"Show me only where the Toyota beats the Honda."** — ChatGPT configures a head-to-head
comparison and filters visible rows to meaningful advantages/differences.

**"Show me the biggest unknowns."** — ChatGPT presents fields/questions with weak or unresolved support.

**"Forget fuel economy for now. Show me what my wife cares about."** — ChatGPT changes the
comparison rows without necessarily changing the underlying Decision Profile unless the user
explicitly wants priorities changed.

> Important distinction: presentation filtering ≠ criterion mutation.

**"Walk me through them instead."** — ChatGPT changes to Quick Pick.

**"Put the questionable ones somewhere else."** — ChatGPT may suggest/configure a Board view, but
must avoid implying options are objectively eliminated unless decision rules support it.

---

## 33. Dev / inspect mode must remain

The consumer UI should hide implementation complexity. But we ABSOLUTELY still need a developer
view for: debugging; hackathon demonstrations; proving genuine Strands usage; showing WebMCP
calls; exposing evidence provenance; demonstrating agent behavior.

Do not remove existing observability functionality. Instead, separate it intentionally.

- Consumer workspace: *What does this mean for my decision?*
- Developer/Inspect workspace: *What exactly did the system do?*

---

## 34. Developer view content

The dev view should be able to expose: case ID; Decision Pack ID/version/hash; case sequence;
command IDs; run IDs; WebMCP tool calls; registered tools; tool inputs/results; selected context
projection; obligation IDs/status; E0–E3 evidence levels; source IDs; stale/conflict logic;
specialist IDs; active skill; Graph node transitions; Swarm handoffs; interventions;
Guide/Confirm/Deny/Transform; GoalLoop validation attempts; Context Injector activity;
session/snapshot events; runtime target; model metadata; token usage; timing; trace/span IDs;
state diffs; event streams; errors/redactions.

Reuse the existing Runtime Inspector wherever possible. Do not build a redundant separate debug system.

---

## 35. User activity vs dev activity

Consumer activity should say: "Dealer price needs re-checking."

Developer view may say: `evidence.conflicted`, `car.deal_normalization`, `source-challenger`,
`runId=...`, `E1 -> stale`.

Same underlying event. Two projections. This is important. Avoid creating parallel truth sources.

---

## 36. Dev mode access

Provide an intentional developer/inspect entry point. Potentially: "Inspect" / "Developer view" /
"View activity details".

Do not place technical information permanently in the normal workspace.

For the public hackathon fixture/demo deployment, developer view may be enabled read-only.
For user-entered/private cases, respect existing debug-payload/redaction rules.

---

## 37. Progress/lifecycle language

Current lifecycle wording such as Started / Investigating / Pick ready / Decided should be
reconsidered. Consumer-facing stages should reflect the task.

Potential generic shopping/comparison lifecycle: Find; Shortlist; Compare; Review; Decide.
Or a compact subset depending on current stage.

Do not make lifecycle visualization dominate the page after onboarding. Once inside an active
comparison, workspace views are more valuable than a giant permanent process tracker.

---

## 38. Recommendation language

Avoid overly-final wording like "Our pick" before readiness is earned. Prefer: "Current
recommendation"; "Leading option"; "Current leader".

When insufficient evidence exists: "Not ready yet" with concrete reasons. Example: "2 important
things still need checking."

Do not expose a fake confidence of completion.

---

## 39. Current work / active investigation language

Instead of "What Pax is doing" plus agent/runtime terminology, prefer consumer statements like:

> **Currently checking** — Whether the Forester's lower price still holds after dealer fees.

or:

> **Rechecking** — Ride-comfort evidence after your priorities changed.

Developer view can reveal: active obligation; specialist; skill; tool; run.

---

## 40. Questions / to check

Consumer projection of obligations should become something like **To Check**. Examples:

- CR-V dealer price still needs verification.
- Forester ride comfort needs a test drive.
- Dog-crate fit is still unknown.
- Laptop work fit needs a console measurement.

Allow the user/ChatGPT to focus one of these. Selecting/focusing a Question should inform
subsequent case context.

---

## 41. Research UI

Research should be accessible without overwhelming the workspace. Potential hierarchy:
Option → Research summary → Findings → Sources.

Show: source title; publisher; relevance; freshness; whether verified/questioned/conflicted;
key supported claim.

Technical evidence levels stay in Inspect mode unless useful.

---

## 42. Decision Profile UI

Make profile editing understandable. Potential sections: Must have; Important; Nice to have;
Context; Personal concerns.

Weights should not necessarily be exposed as raw numeric percentages to ordinary users by default.
Allow simplified priority manipulation (Very important / Important / Somewhat important) while
preserving numeric representation internally if needed. Advanced editing may expose exact weights.

---

## 43. ChatGPT-first start experience

We now consider ChatGPT the primary interaction path for the WebMCP hero. The user should NOT
need to understand WebMCP.

Initial page should make the relationship obvious. Possible copy:

> What are you looking for?
> Search here, or tell ChatGPT what matters to you.

The page can work independently. But the expected hero flow is conversational.

---

## 44. Example start flow

User: "I need a family SUV under $40k. Safety and cargo matter a lot."

ChatGPT: (1) reads workspace/decision guide; (2) reads current profile; (3) identifies important
missing questions; (4) asks only useful clarifying questions; (5) searches Pax catalog; (6) adds
plausible options; (7) page visibly updates.

The user then controls the visual experience through clicks, selection, Quick Pick, table, board
— while continuing to talk to ChatGPT.

---

## 45. User does not need to know when WebMCP is used

Do not design UX around "Now invoke WebMCP." The user thinks: "I'm talking to ChatGPT while
looking at my comparison."

WebMCP is the application integration layer. Keep any WebMCP status indicator subtle.
The unsupported-host state remains visible but non-blocking.

---

## 46. Generic pack presentation metadata

Evaluate expanding Decision Pack presentation metadata so a Pack can declare: recommended
workspace views; default visible fields; prominent fields; profile sections; profile discovery
questions; catalog capability; useful initial filters; subjective/human-only fields; fields safe
for model inference; recommended Question wording; board column defaults; Quick Pick summary fields.

Do NOT put executable behavior into the declarative pack. Compiler/conformance should validate
new presentation metadata. Avoid hard-coded per-pack React conditionals where metadata can
express the difference cleanly.

---

## 47. Decision Guide may also live in pack metadata

Consider a declarative pack-level Agent Guide including: domain purpose; discovery strategy;
suggested questions; important unknowns; research guidance; custom-field guidance; presentation
guidance.

This is conceptually similar to a lightweight skill for ChatGPT operating the webpage. However:

- it must remain data, not executable prompts capable of overriding system authority;
- do not attempt prompt injection;
- do not pretend it is a host-level system prompt;
- tool descriptions and structured tool outputs remain the integration mechanism.

---

## 48. Consumer / dev terminology must be separate

Maintain a mapping layer. Example:

| Consumer | Dev |
|---|---|
| Need to verify | `status=blocked`, `requiredEvidenceLevel=E2`, `achieved=E1` |
| Pax changed approach | `intervention.guide`, `RetrySteering` |
| Research disagrees | `evidence.conflicted` |

This should be deliberate and testable.

---

## 49. Accessibility

Swipe is never gesture-only. Every action has accessible controls. View changes have accessible
names. Focus state is visible and screen-reader meaningful. Table/Compare works by keyboard.
Board changes must not rely solely on drag-and-drop. Developer view remains keyboard navigable.

At all canonical widths: no horizontal page overflow; interactive targets meet existing minimum
dimensions; sticky controls do not obscure focused content.

---

## 50. Persistence decisions

Clarify persistence for new concepts.

**Must persist:** Decision Profile; options; custom fields; populated custom-field values;
research; notes; Questions/obligations; recommendation; human decision.

**Likely persist or restore:** selected option; current view; visible comparison fields;
shortlist categories; Quick Pick status — if these are important to shared WebMCP context.

Avoid storing purely transient animation details. The browser and ChatGPT must agree on shared
focus/view state.

---

## 51. Case note / research event model

If adding persisted concepts such as `CaseNote` requires new domain events, do it through the
existing deterministic event architecture where appropriate. Do not casually create more
canonical snapshot-only mutation exceptions.

Evaluate `note.created`; `note.updated`; `note.removed`; and any missing research/attribute-value
events against current patterns.

Preserve optimistic concurrency and idempotency. Update SQLite migrations safely.

---

## 52. WebMCP tools to evaluate

Do not blindly implement this exact list, but evaluate whether the final generic WebMCP API
should cover these concepts:

**READ** — `pax_get_case_context`; `pax_get_decision_guide`; `pax_search_options`;
`pax_get_option_details`; `pax_list_research`; `pax_list_notes`

**WRITE** — `pax_upsert_option`; `pax_update_criteria`; `pax_define_case_attribute`;
`pax_set_option_attribute`; `pax_submit_source`; `pax_add_note`; `pax_set_evidence_disposition`

**PRESENTATION** — `pax_focus_option`; `pax_focus_evidence`; `pax_focus_question`;
`pax_set_view`; `pax_configure_comparison`

**EXECUTION** — `pax_request_investigation`; `pax_request_revision`

**HUMAN AUTHORITY** — There must STILL be no agent tool capable of approving the final
consequential decision.

Keep the tool catalog understandable. Do not create dozens of tiny tools if a few coherent typed
operations suffice.

---

## 53. WebMCP tool descriptions are part of the product

Improve descriptions. They should teach ChatGPT: what the tool does; when it is appropriate;
what it does NOT do; how it relates to user intent.

Examples:

- **Custom field tool:** "Use when the user introduces a comparison factor not represented by
  existing fields. When the request is explicitly user-originated, create the field directly.
  Agent-suggested factors require confirmation."
- **Research tool:** "Use to preserve external research in the decision workspace. Submitted
  sources remain unverified until Pax evaluates them."
- **View configuration:** "Use to make the visible workspace better match the user's current
  question. Changing visible rows does not change decision priorities."

That last distinction is critical.

---

## 54. UI action vs decision mutation

Do not confuse "Show only safety and cargo." with "Safety and cargo are the only things I care about."

The first changes presentation. The second changes criteria.

WebMCP contracts and application UI must preserve this distinction. This is a key correctness requirement.

---

## 55. Difference between WebMCP hero and AWS hero

Do NOT accidentally force both demos into the same interaction model. They should demonstrate
opposite strengths of the same engine.

### WebMCP / car-shopping hero

Primary idea: human + ChatGPT collaboratively build and manipulate a decision.

Characteristics: user actively converses; ChatGPT reads application state; ChatGPT searches
options; user/ChatGPT refine profile; model adds research; dynamic custom fields appear; model
configures visual views; page selection informs conversation; shared focus matters; user drives
the interaction; WebMCP is the hero integration.

> What happens when ChatGPT can actually understand and reshape the application you're using?

### AWS / Energy Guardian hero

Primary idea: agent works quietly without requiring an ongoing conversation.

Characteristics: deterministic watcher detects anomaly; background investigation starts;
rate/weather/household work occurs; premature conclusion is withheld; no-progress triggers Guide;
Swarm changes specialist; evidence improves; only then is the person interrupted; consequential
proposal requires human confirmation; Strands autonomous runtime is the hero.

> What happens when an agent works until it has earned the right to interrupt you?

Do not redesign Energy Guardian around shopping views. The generic engine supports different
product modes.

---

## 56. Generic does not mean lowest common denominator

Decision Packs should remain capable of defining specialized experiences.

Car Purchase benefits from: catalog; Quick Pick; comparison table; board; lots of dynamic attributes.

Energy Guardian benefits from: event timeline; anomaly investigation; active specialist; causal
evidence; response options.

The generic workspace should provide composable primitives. Pack metadata decides what is
relevant. Do not force every Pack to expose every view.

---

## 57. Demo / hackathon WebMCP moments to emphasize

The final WebMCP demo should visibly prove several unusually strong capabilities. At minimum try
to include:

- **Model pulls real structured data from Pax** — not just pushes mutations.
- **Shared selection** — user clicks one option; ChatGPT correctly understands "this one."
- **Model controls the presentation** — "Show me the finalists and only what matters most." Pax
  visibly changes view/rows/options.
- **Dynamic comparison schema** — user says something the original product schema never
  anticipated ("I work on my laptop in the car and need the console/armrest to support that").
  ChatGPT creates a custom field.
- **Model researches/populates it** — research supports candidate-level values. Some remain unknown.
- **Honest uncertainty** — Pax does NOT claim personal comfort can be fully established from specifications.
- **Research becomes durable** — sources appear in the workspace.
- **Human approval** — agent still cannot make the final consequential decision.

This is a much stronger WebMCP narrative than merely showing "ChatGPT changed a criterion."

---

## 58. UI demo moment: model reconfigures table

This should be treated as a deliberate showcase.

User: "Compare the CR-V, Forester and RAV4, and only show me the things that matter most to us."

ChatGPT: changes view to Compare; limits candidates; sets visible rows; includes dynamic custom
fields; page visibly reconfigures without click automation.

That strongly demonstrates structured WebMCP control.

---

## 59. UI demo moment: Quick Pick shared focus

Possible second showcase.

User: "Walk me through them." ChatGPT switches to Quick Pick. Forester appears. ChatGPT explains
the Forester. User swipes Maybe. The next option becomes focused. ChatGPT's subsequent context
reflects the new option.

This demonstrates genuine shared attention.

---

## 60. Testing requirements

This redesign must be comprehensively tested.

**Generic workspace** — view switching; narrow vs expanded behavior; consumer terminology;
developer terminology; conditional region rendering; empty state suppression; profile projection;
Questions projection; Recommendation projection.

**Quick Pick** — queue order; pass/maybe/shortlist actions; focus changes; keyboard controls;
touch controls; duplicate handling; end-of-queue behavior; persistence where intended; accessibility.

**Compare view** — configurable rows; configurable option subset; head-to-head narrow mode;
expanded multi-column mode; custom fields; missing values; sorting/filtering; WebMCP-driven configuration.

**Board** — columns; moving options through visible controls; keyboard alternative to drag;
model-controlled configuration if supported.

**Decision Profile** — projection from criteria/attributes; editing; hard vs soft distinction;
agent-proposed concern confirmation; conversation-driven updates.

**Custom fields** — test full lifecycle: (1) user introduces new concern; (2) field definition
created; (3) no pack hash mutation; (4) field renders; (5) criterion can reference it; (6) case
obligation created if needed; (7) model can populate candidate values; (8) source provenance
retained; (9) unknown values remain unknown; (10) human evidence can strengthen/replace weak
inference; (11) recommendation invalidates/recomputes where dependency requires.

**Research** — model submission; storage; option linking; provenance; source challenge;
conflict/staleness; reload.

**Notes** — user note; ChatGPT note; option linking; persistence; no automatic evidence
promotion; bounded context inclusion.

**WebMCP read behavior** — test model can retrieve: profile; options; custom fields; research;
notes; Questions; view state; selection; recommendation.

**WebMCP presentation behavior** — test: set view; focus option; configure rows; configure
options; changes page; does not alter criteria unless explicitly requested.

**Dev view** — consumer mode hides raw internal metadata; dev mode exposes it; correlated
activity opens exact runtime event; redaction still holds.

---

## 61. Playwright required journeys

Add/extend a real browser journey approximately like:

1. Open normal comparison start.
2. Tell the in-memory WebMCP test bridge to search catalog.
3. Add several options.
4. Verify page updates.
5. Open Quick Pick.
6. Change shortlist state.
7. Open Compare.
8. Configure rows through WebMCP.
9. Select an option in page.
10. Verify case context contains exact selection.
11. Add an unusual concern through WebMCP.
12. Verify custom field appears.
13. Add research/source.
14. Populate custom field.
15. Verify unknown remains where unsupported.
16. Add note.
17. Update criterion.
18. Verify recommendation invalidation.
19. Enter Developer view.
20. Verify technical trail matches consumer event.
21. Reload.
22. Verify durable state survived.

Run at 390x844, 430x900, 480x900, desktop. No horizontal page overflow.

---

## 62. Visual design

Preserve the general successful direction from the recent mockups: calmer; more spacious; clear
hierarchy; less "stack of unrelated cards"; comparison-oriented; strong selected-state treatment;
useful progress without engine jargon; light dossier/productivity feel.

Do NOT slavishly reproduce the generated mockup. The mockup is directional. Use the existing
token system unless a justified design adjustment is needed. Avoid generic dashboard aesthetics.

---

## 63. Component architecture

Favor components around generic product concepts such as: `DecisionHeader`; `ViewSwitcher`;
`DecisionProfile`; `OptionCard`; `QuickPickView`; `OptionListView`; `OptionCompareView`;
`OptionBoardView`; `QuestionList`; `ResearchPanel`; `CaseNotes`; `RecommendationSummary`;
`DeveloperInspector`.

Exact naming may vary. Avoid scattering car-specific conditions across generic components.
Car-specific formatting should come from pack metadata; attribute definitions; adapters/renderers
where necessary.

---

## 64. Refactor current UI rather than just adding more

This task should REDUCE apparent complexity despite adding functionality.

Do not append a Decision Profile card, Research card, Notes card, and Quick Pick card beneath the
existing stack. That would make the problem worse.

The existing stacked information architecture should be redesigned. Primary workspace view should
dominate. Secondary information should be tabs, drawers, sheets, contextual sections, detail
routes, or expandable panels where appropriate. Developer information belongs in Developer mode.

---

## 65. Spec updates

Update relevant authoritative specs. At minimum inspect/update: product; architecture;
packs/routing; pack authoring; WebMCP; testing; demos/submission; value proposition;
debugging/observability; architecture diagram if changed; README; demo scripts; build log.

Document: Decision Profile; generic workspace views; model-controlled presentation; Decision
Guide; case notes; custom-field population; research contribution; consumer/developer
projections; WebMCP read/write/view responsibilities.

Do not let docs remain car-specific if code becomes generic.

---

## 66. Naming

The product name is currently Pax. There is active consideration of a more decision-oriented
consumer brand.

Do NOT rename the codebase/product globally without an explicit final naming decision from the
project owner. However: avoid further entrenching "Pax" into generic contracts unnecessarily;
internal namespaces may remain `pax_*` for this hackathon unless explicitly changed; keep
product-facing naming easy to replace; do not perform a speculative massive rename.

Naming is a separate final decision.

---

## 67. Definition of done

This change set is complete when:

1. Consumer UI no longer feels like a stack of backend-state cards.
2. Consumer UI avoids unnecessary internal terminology.
3. Developer/Inspect mode preserves and improves technical visibility.
4. Narrow pane is a first-class design, not compressed desktop.
5. Expanded view supports richer comparison.
6. Quick Pick exists and is useful.
7. List exists and has a distinct purpose.
8. Compare exists and supports configurable rows/options.
9. Board exists and has a distinct decision-narrowing purpose.
10. Shared `WorkspaceView` state exists where necessary.
11. User can control views.
12. ChatGPT can control views through WebMCP.
13. User-selected focus is visible to ChatGPT.
14. ChatGPT-controlled focus is visible on page.
15. Decision Profile is coherent and visible.
16. ChatGPT can retrieve Decision Profile.
17. ChatGPT can retrieve meaningful structured workspace context.
18. Pack-level Decision Guide exists if adopted by final design.
19. Catalog search is available to ChatGPT.
20. Generic architecture is preserved.
21. Custom comparison fields are a first-class feature.
22. User-requested custom field can be created directly.
23. Agent-suggested field requires confirmation.
24. Model can populate custom-field values.
25. Provenance and uncertainty are retained.
26. Unsupported subjective values remain unknown.
27. Custom fields render beside native fields.
28. ChatGPT can add research.
29. Research remains durable and source-linked.
30. Research does not bypass evidence governance.
31. User/ChatGPT can add notes.
32. Notes are not silently treated as evidence.
33. Questions/Things to Check replace obligation jargon in consumer UI.
34. Current recommendation uses user-friendly language.
35. Empty conceptual regions are not rendered unnecessarily.
36. Presentation changes remain distinct from criterion changes.
37. Developer view can show raw runtime details for hackathon demonstration.
38. Consumer and Developer projections derive from the same underlying state/events.
39. Existing deterministic car scenario remains green.
40. Existing Energy/AWS scenario remains green.
41. Human-only final approval remains absolute.
42. Reload preserves all required decision state.
43. Canonical narrow viewports pass.
44. Accessibility passes.
45. Specs match implementation.
46. Tests prove every important new behavior.
47. No acceptance tests were weakened to reach green.
48. WebMCP demo visibly proves shared context, model-controlled presentation, dynamic schema
    extension, durable research, and human authority.

---

## 68. Implementation strategy

Do not attempt this as one giant UI rewrite. Suggested sequencing:

- **Phase A — information architecture:** consumer terminology; navigation; narrow/expanded modes; hide technical metadata; dev-mode boundary.
- **Phase B — generic workspace/view state:** modes; focus; visible options; visible attributes; sort/filter; persisted/shared state where appropriate.
- **Phase C — views:** Quick Pick; List; Compare; Board.
- **Phase D — Decision Profile:** projection; editing; missing questions; WebMCP context.
- **Phase E — WebMCP read/context/guide:** workspace context; Decision Guide; catalog search; richer read capabilities.
- **Phase F — dynamic custom fields:** creation; value population; provenance; comparison rendering; investigation lifecycle.
- **Phase G — Research and Notes:** storage/events; UI; WebMCP capabilities; context projection.
- **Phase H — model-controlled presentation:** view; focus; comparison configuration; strict distinction from criteria changes.
- **Phase I — developer view integration:** consumer ↔ debug correlation; hackathon-friendly technical proof.
- **Phase J — E2E polish/docs:** Playwright; right-pane UX; demo scripts; specs; README; release verification.

After each phase: run focused tests; repair causally; run appropriate package gate; periodically
run the full project gate.

---

## 69. Final product principle

The finished product should make the following interaction feel natural:

User tells ChatGPT what they want. ChatGPT asks useful questions because Pax tells it what
matters for this kind of decision. ChatGPT searches real options from Pax. Those options appear
on the page. The user swipes, clicks, sorts, and compares. ChatGPT always knows what the page is
focused on. The user says something unusual that no product database anticipated. ChatGPT turns
that concern into a typed comparison field. Research is gathered and attached. The field begins
populating across candidates. Some answers remain explicitly unknown. ChatGPT changes the visible
comparison to focus on what matters right now. The page becomes a durable visual representation
of the decision being constructed in conversation. Pax's deterministic engine decides what
evidence is sufficient. Strands performs deeper investigation when needed. The user eventually
receives a recommendation. The AI still cannot make the final consequential decision.

That is the product.

Do not optimize merely for making the current car demo prettier. Implement the architecture and
UX needed to make that interaction real, generic, durable, understandable, and demonstrably
WebMCP-native.

---

## 70. Final completion report

At completion, provide a detailed report including: before/after information architecture;
consumer terminology changes; new developer-mode structure; generic workspace contracts; Decision
Profile implementation; Decision Guide implementation if adopted; WebMCP tool additions/changes;
catalog-read/search behavior; shared focus behavior; model-controlled view behavior; Quick Pick
behavior; List/Compare/Board behavior; custom field creation lifecycle; custom field
population/provenance; Research implementation; Notes implementation; persistence/schema/event
changes; specification changes; tests added; exact test results; screenshots reviewed at narrow
widths; known limitations; release blockers; whether every Definition of Done item above is satisfied.

Do not represent incomplete functionality as finished. If an item was intentionally changed during
implementation because repository reality justified a better design, document exactly what changed
and why.

---

## Supplementary owner direction (2026-08-30)

Recorded verbatim from the same exchange, in response to the finding that `CaseState.activeFocus`
can never be set and that four of six `CaseStatus` values are never assigned:

> "I dont get what you're saying. If they arent getting changed then remove them."

Disposition: dead subsystems that the UI still renders are to be **removed**, not left in place.
Where the new design genuinely needs the capability (for example §39's "Currently checking"),
it must be built from real, actually-populated data rather than revived from a field nothing writes.
