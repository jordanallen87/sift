# Conversation Orchestration

Status: proposed architecture and behavior rules. It captures the current product direction but is not yet an approved implementation specification.

## Product model

In ChatGPT pane mode, Sift is a **shared decision canvas**, not a compressed standalone application.

- **ChatGPT** facilitates the conversation and selects from valid next moves.
- **WebMCP** lets ChatGPT discover and operate the live page through typed tools.
- **The active Decision Pack** provides domain vocabulary, discovery guidance, required coverage, tool/view capabilities, evidence expectations, and safety bounds.
- **The deterministic Sift core** owns canonical case state, derives what remains unresolved, validates writes, computes readiness, and recommends valid next moves.
- **Strands** plans and performs bounded investigation after or during discovery when evidence work is warranted.
- **The canvas** shows the persistent structured artifact most useful at the current moment.
- **The human** supplies judgment, corrects facts, confirms important changes, and exclusively approves consequential decisions.

The model is not asked to remember the whole process from a one-time prompt. It receives current, structured state and valid moves as the case evolves.

## WebMCP discovery reality

When the top-level Sift page loads in a compatible ChatGPT browser, it registers tools through `document.modelContext`. The browser can then expose those tools to the model on a subsequent user turn. WebMCP registration is not itself a guaranteed page-load conversation trigger, so the empty pane must make the next human action obvious:

> Tell ChatGPT what decision you are trying to make.

Recommended opening prompts include:

> Use Sift to help me choose a car.

> I want to use this Sift page to decide which car fits my family and budget.

The task should be stated directly. “I want to use this WebMCP” is acceptable for a technical demo, but it is not the normal product language and gives the model less information for pack selection.

## Bootstrap lifecycle

### Phase 1: no active case

The page registers a deliberately small global tool surface:

1. `sift_describe_app` — returns app identity, purpose, supported lifecycle operations, active-case summary if one exists, viewport/mode, and safe recommended next calls.
2. `sift_list_packs` — returns bounded pack summaries and structured activation signals.
3. `sift_start_case` — pins a selected pack and records the user's initial decision intent.
4. `sift_resume_case` — returns resumable cases or resumes an explicitly selected case if persistence/account scope supports it.

The exact names remain subject to API design. The required behaviors do not.

### Phase 2: pack selection

ChatGPT uses the user's statement plus pack activation signals:

- If one pack clearly matches, it may select it and state what it is opening.
- If multiple packs plausibly match, it asks one discriminating question.
- If no installed pack matches, it explains the limitation and does not force the problem into the nearest pack.
- The pack ID/version/hash is pinned when the case is created; conversational guidance cannot silently replace it later.

### Phase 3: activated case

After `sift_start_case`, Sift registers the case-scoped tools and makes the following structured resources available:

- current case context;
- the pack's interaction guide;
- valid next conversation moves;
- pack-specific view capabilities;
- catalog/search and evidence capabilities;
- criteria, option, concern, note, and source operations;
- investigation execution and revision operations; and
- presentation/focus operations.

The model fetches deeper detail progressively. A bootstrap response should not contain the entire pack, case, tool catalog, and all domain instructions in one oversized result.

## The pack interaction guide

Each pack should expose one authoritative, typed **Pack Interaction Guide**. It is domain data and workflow guidance, not executable code or an instruction channel that can override the host model's policies.

Proposed shape:

```ts
interface PackInteractionGuide {
  pack: { id: string; version: string; compiledHash: string }
  domainPurpose: string
  decisionOutcome: string
  vocabulary: Record<string, string>
  discovery: {
    stages: DiscoveryStage[]
    topics: DiscoveryTopic[]
    commonUnknowns: string[]
    customConcernTriggers: string[]
    completionRule: string
  }
  elicitation: {
    allowedInteractionTypes: InteractionType[]
    optionSources: OptionSource[]
    escapeHatches: EscapeHatch[]
    confirmationPolicy: ConfirmationPolicy
  }
  presentation: {
    views: ViewCapability[]
    focusTypes: string[]
    defaultViewByStage: Record<string, string>
  }
  investigation: {
    availableQuestionTypes: string[]
    evidenceExpectations: string[]
    humanEvidenceBoundaries: string[]
  }
  authority: {
    modelAllowed: string[]
    confirmationRequired: string[]
    humanOnly: string[]
  }
}
```

The current `DecisionGuide` is a useful starting point, but it does not yet define the full elicitation state model, next moves, option-generation rules, or pack-specific presentation contract required here.

## General decision process

There is no single fixed questionnaire for every pack. All packs should specialize a shared decision pattern:

1. **Frame the decision** — desired outcome, scope, timing, and who is affected.
2. **Establish hard constraints** — facts that can disqualify an option.
3. **Elicit preferences and tradeoffs** — what matters, relative importance, and acceptable compromises.
4. **Capture context of use** — circumstances that change what “best” means.
5. **Identify or create options** — known candidates, catalog discovery, and exclusions.
6. **Expose uncertainty and evidence gaps** — what is known, assumed, disputed, or still needed.
7. **Expose the evolving investigation plan** — questions, sources, techniques, human inputs, stop conditions, and safe work already underway.
8. **Investigate and adapt continuously** — start useful read-only work as facts stabilize; focus deeper work after shortlisting; revise when evidence or preferences change.
9. **Maintain and challenge a living recommendation list** — recompute supported order, reasons, alternatives, coverage, and caveats without turning the leader into a purchase instruction.
10. **Ask the human to decide** — choose, revise, or continue investigation.

The order may change. Coverage, evidence, authority, and completion conditions do not disappear simply because the conversation took a different route.

## How the next question is chosen

The model should not invent the entire interview from prose instructions. Sift should derive a bounded list of **valid next moves** from the pinned pack and current case state.

Example:

```ts
interface ConversationMove {
  id: string
  kind:
    | 'ask_user'
    | 'confirm_inference'
    | 'show_view'
    | 'search_options'
    | 'update_case'
    | 'request_evidence'
    | 'start_investigation'
    | 'present_result'
  purpose: string
  priority: number
  resolves?: string[]
  suggestedPrompt?: string
  viewId?: string
  requiredTool?: string
}
```

The deterministic layer ranks moves using factors such as:

- required-before-optional coverage;
- disqualifying constraints before fine-grained preferences;
- expected information gain;
- dependency order;
- whether the answer can be obtained from the user, catalog, evidence, or investigation;
- current confidence and contradiction state;
- conversation fatigue and whether several related facts can be confirmed together; and
- whether a visual would materially improve understanding.

ChatGPT chooses among the valid moves, phrases the question naturally, and may combine compatible low-risk moves. One answer may resolve several topics at once; the model proposes every supported mapping rather than asking redundant follow-ups. It cannot mark a required topic complete without a valid case update or evidence transition.

## Dynamic elicitation rules

- Prefer recognition over recall. When the answer space can be represented honestly, show a short set of context-aware suggestions or options instead of requiring a blank free-text response.
- Ask one clear question at a time unless a short, closely related group is easier for the user.
- Treat the pack's options as seeds, not a static form. The model may add, remove, relabel, or prioritize options using confirmed case context, but Sift validates them against the pack's allowed interaction grammar and mappings.
- Nearly every option interaction includes an appropriate escape hatch: **Something else**, **None of these**, and/or **Not sure**. **Skip for now** appears only where the current mode and topic allow deferral—principally standalone **Explore with gaps**—and never on a required conversational discovery or human-authority decision.
- Never silently preselect a suggested answer. Clearly distinguish a recommendation from a default, and explain why a personalized suggestion is being made when it could steer the decision.
- Extract and propose all supported facts from each user response. Do not ask separately for an item already answered in the same message or pane submission.
- Ask disqualifying questions early.
- Do not ask the user for information Sift can retrieve reliably through an allowed tool.
- Do not retrieve subjective judgment that only the user can supply.
- Reflect an inferred preference back for confirmation before treating it as a hard constraint or materially reweighting the decision.
- Preserve explicit unknowns instead of forcing an answer.
- When the user introduces an unanticipated concern, determine whether it maps to an existing attribute, requires a typed case extension, or cannot be supported by installed capabilities.
- Stop discovery when required framing/constraints are covered and the next useful step is option search or investigation; do not complete an exhaustive questionnaire for its own sake.
- In the ChatGPT/WebMCP journey, do not offer a skip that leaves a pack-required discovery topic unresolved before model search. Complete it, mark it not applicable, or resolve the ambiguity. The standalone app may offer **Explore with gaps** for soft topics and must label the result provisional.
- Before search, perform one context-aware blind-spot review of commonly missed needs. Do not ask “Do you have kids?” as an isolated personal question; ask who and what must fit, and follow up only on functional child-seat, accessibility, pet, cargo, or other needs that remain unknown.

## Bounded generative elicitation

Sift should expose a typed `request_interaction`-style WebMCP capability rather than letting a model generate arbitrary HTML. The model selects from a pack-declared UI grammar and supplies context-specific wording and options. Sift validates the request, renders it in the pane, persists the human response, and exposes the resulting canonical state on the next model turn.

Allowed patterns should include:

- single-select cards;
- multi-select chips;
- yes / no / not sure;
- target, stretch, and hard-limit ranges;
- Must work / Matters a lot / Nice to have sorting;
- relative priority ranking;
- Keep / Pass / Unsure;
- inference-confirmation summaries;
- physical-verification checklists; and
- free-text **Something else**.

The question remains understandable in conversation, while the pane carries the fastest useful response surface. A capable host may also collect the answer conversationally. A minimal WebMCP host still works because Sift owns the interaction component and canonical response.

Suggestions must become more relevant as context accumulates. For a generic family case, the pack may suggest children, child seats, pets, commuting, and luggage. If the user mentions mobility equipment, the next interaction should instead offer relevant functional accommodation categories and an open custom response. The model must not infer a diagnosis, accommodation, or blocker beyond what the person stated.

This is generative UI within a bounded contract: dynamic enough to demonstrate why WebMCP changes the experience, but typed, testable, accessible, and unable to bypass pack or authority rules.

## Conversation versus canvas

### Put in the conversation

- questions and follow-ups;
- explanations and reasoning summaries;
- uncertainty stated in natural language;
- requests for consent or clarification;
- narration of meaningful changes; and
- the recommended next action.

### Put in the canvas

- the persistent decision brief;
- options and current focus;
- comparisons and rankings;
- criteria, constraints, and unresolved questions;
- the investigation plan and progress;
- evidence, sources, contradictions, and confidence;
- recommendation and alternatives; and
- explicit human approval controls.

The canvas also owns a persistent action frame: the orientation shell stays at the top and the current artifact's primary actions stay in a bottom dock. The body may change; the person's location and next available decision do not disappear.

### Put in both, at different resolution

- major plan changes;
- a material contradiction;
- a recommendation and its decisive reasons; and
- a blocked state requiring human input.

ChatGPT explains; the canvas preserves and visualizes. Avoid duplicating the same long prose in both places.

## Choosing what the pane shows

The pack declares trusted view capabilities. Each includes an ID, purpose, valid stages, required data, supported focus types, and configurable fields. Sift validates every presentation call against that declaration.

Working defaults:

| Case moment | Preferred pane view |
| --- | --- |
| No active case | Bootstrap/empty canvas |
| Early discovery | Decision brief |
| Candidate search | Candidate list or shortlist |
| Discussing one option | Option detail |
| Discussing tradeoffs | Focused comparison |
| Planning investigation | Investigation plan |
| Work in progress | Question-oriented progress |
| Reviewing a claim | Evidence/source focus |
| Ready to decide | Recommendation and alternatives |
| Human action required | Confirmation/approval view |

Rules:

- Change the pane when the visual context materially helps the current turn, not merely because a new message arrived.
- Preserve the compact orientation shell—phase, coverage, current focus, next step, and completion path—while the body view changes.
- Focus before referring to an item as “this” or “the one on the right.”
- Prefer the smallest useful comparison rather than displaying every field.
- A presentation change never changes criteria, evidence, readiness, or recommendation state.
- A pack may offer different views, but stable generic WebMCP tools operate them through validated view IDs and parameters.

## Direct interaction in pane mode

Conversation is primary. Direct manipulation remains important for:

- selecting, dismissing, or focusing an option;
- rapidly expressing preference through a Quick Pick/keep-pass-unsure interaction;
- correcting a fact or supplying missing personal information;
- opening evidence and sources;
- confirming or rejecting an inferred/custom concern;
- adjusting an explicitly subjective preference; and
- human-only approval.

Navigation, filtering, view configuration, research initiation, and most workflow progression should normally be conversation-driven in pane mode. The standalone application exposes familiar controls for those same capabilities.

Quick Pick is offered after the first candidate set and may recur after additions or major evidence changes. It deliberately optimizes fast human judgment: one card, Keep / Pass / Unsure, undo, and a custom reason when useful. Keep is not final approval; it retains the option for comparison and deeper work.

## Continuous agentic enrichment

Run planning is continuous rather than a single late transition:

1. pack activation establishes available specialists, skills, tools, evidence expectations, and budgets;
2. confirmed discovery facts may trigger safe data-availability or domain-enrichment work;
3. a candidate set triggers bounded parallel candidate enrichment;
4. human dispositions concentrate deeper work on retained/unsure options;
5. new concerns revise the plan and invalidate only affected results; and
6. recommendation order recomputes from canonical state after each accepted result.

Background work must be observable, cancellable, deduplicated, budgeted, and unable to mutate protected human state. The consumer sees only decision-relevant progress; the developer/judge projection exposes the evolving RunPlan, agent/skill/tool selection, revisions, cancellation, evidence, and state effects.

### Ownership and overwrite rules

Every case mutation must identify its origin and ownership: human-authored, human-confirmed, agent-proposed, agent-authored, or system-derived. Agent tools must not silently overwrite human-authored or human-confirmed state. When a conflict exists, the model should read the protected value, explain the issue, and propose or request a revision through the appropriate confirmation path.

This protection belongs in tool/state validation, not only in prompt wording or UI copy.

## Reusing an existing discovery engine

If an existing discovery engine contains valuable domain sequencing, question selection, or completion logic, reuse its **declarative model and tested decision rules**, not a second conversational agent that competes with ChatGPT.

The preferred extraction is:

- discovery stages and topic definitions;
- dependencies and required coverage;
- candidate next-move calculation;
- answer-to-case mapping;
- completion and fallback rules; and
- tests/evaluations of the elicitation behavior.

ChatGPT remains the conversational surface; the extracted engine becomes the pack/core guidance behind it.

## One engine, two hackathon lenses

The WebMCP and AWS demonstrations should share this exact lifecycle and case engine:

```text
Conversation
  -> WebMCP bootstrap and case changes
  -> deterministic case/obligation/next-move state
  -> RunPlan and capability resolution
  -> Strands investigation
  -> evidence/readiness/recommendation
  -> WebMCP-driven canvas response
  -> human decision
```

The WebMCP submission emphasizes conversational shared control and visible page adaptation. The AWS submission emphasizes planning, skills, specialists, tools, steering, evidence quality, and human boundaries. Different recordings may be necessary because of time limits, but they must show different projections of the same product architecture.
