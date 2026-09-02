# Target Car Decision Journey

Status: proposed product journey for review. It is grounded in the repository and the WebMCP showcase research, but it is not yet an approved implementation specification.

## Product thesis

Sift should be a **conversation-orchestrated decision workspace**.

ChatGPT is the conversational guide. Sift is the canonical decision system and shared visual artifact. Strands is the bounded investigation team. The human supplies lived context and judgment and retains final authority.

The ChatGPT browser pane is not a miniature version of the complete standalone app. It is a companion canvas that continuously shows the most useful decision artifact for the current conversation turn.

## Success experience in one paragraph

The user opens Sift beside a new ChatGPT conversation and says, “Use Sift to help me choose a car.” ChatGPT discovers Sift, identifies the vehicle pack, and creates a decision case. It fills everything the opening already answers, then uses context-aware options and one blind-spot review to complete required discovery coverage without a fixed wizard. Safe agentic enrichment begins as facts stabilize. ChatGPT discovers model candidates, and the user directly keeps, passes, or marks uncertainty in Quick Pick. Sift continuously revises the investigation plan and living recommendation list as human judgments and evidence arrive. The top orientation shell and bottom action dock remain visible while the body changes among brief, candidates, Quick Pick, comparison, evidence, progress, and recommendation views. Only the human can confirm a shortlist, choose, request revision, or continue investigation.

## Entry branches and the object being decided

The primary demo journey should assume the user has **not** selected a candidate group. A secondary branch should let a user who already has models or exact listings skip directly to evaluation. Both branches converge on the same canonical shortlist, investigation, evidence, recommendation, and human-decision flow.

The broader user-facing opening is:

> Help me find the right vehicle for my situation.

The concrete product outcome is still to build and validate a shortlist worth acting on, usually a model-level test-drive or work-vehicle shortlist before exact listings exist. This supports candidate discovery and serious comparison without claiming live local inventory, dealer availability, financing, negotiation, or purchase execution.

The same vehicle-selection pack must adapt to the case rather than assuming every user is a household consumer. A family case may emphasize child seating, safety, cargo loading, comfort, and road-trip cost. A landscaping-business case may emphasize equipment access, payload/towing, job-site conditions, daily mileage, reliability/downtime, and operating cost. The resulting discovery questions, active criteria, candidate universe, views, and investigation plan should be visibly different while using the same engine and pack contract.

There are two different candidate objects that the experience must not blur:

- **Model candidate:** a year/make/model/trim worth considering or test-driving, supported by specifications and general evidence.
- **Listing candidate:** a specific vehicle at a dealer, with mileage, advertised price, offer terms, availability, and potentially an out-the-door price.

Current reality: the pack describes each candidate as a specific shortlisted listing, while the bundled EPA catalog contains model/year/trim records and no live price or availability. Its WebMCP search can currently filter only by year, make, model, body style, and fuel type. The target journey therefore requires either an explicit two-stage model-to-listing transition or a narrower demo that stops at a model-level test-drive shortlist. It must not imply live budget-filtered inventory discovery unless a real inventory source exists.

The hackathon implementation should not build that live source. Keep the 853-record EPA-derived catalog as the broad discovery universe, then enrich a stable hero cohort of roughly eight models with clearly labeled curated demo data for the decision-relevant fields the EPA dataset lacks. The real discovery, state, agent, ranking, and UI paths operate over that data; only external-world inputs are fixture-backed. Exact fictional listings belong only to the secondary known-listing test, not the primary journey.

Current reality: the pack is also written specifically around a household—its identity, discovery guidance, criteria, obligations, specialist language, and recommendation target repeatedly say “household.” Supporting the landscaping case is therefore not a copy change. The target pack/domain model must become general vehicle selection with case-specific personal, household, or operational fit.

## Coverage and mode-specific skipping

Coverage protects quality without recreating a fixed wizard. In the **ChatGPT/WebMCP journey**, Sift does not proceed to candidate discovery until every pack-required discovery topic is `confirmed` or `not_applicable`, every proposed blocker is confirmed or rejected, and one contextual blind-spot review is complete. “Complete” means required elicitation coverage for this stage—not that every external fact or physical fit question is already knowable.

The model must help the person reach coverage: extract several answers from one response, make context-aware suggestions, ask about commonly missed needs, and avoid repeating anything already established. For example, it should not ask the personal question “Do you have kids?” if occupant needs are already known. If they are unknown, it should ask the functional version—who and what regularly needs to fit—and include children, child seats, mobility equipment, pets, cargo, and **Something else** as relevant options.

In the **standalone web app**, a person may choose **Explore with gaps**. Sift records unanswered soft topics as deferred, explains what may be missed, and labels all candidate and ranking output provisional. Confirmed blockers, evidence integrity, and human authority can never be skipped in either mode.

## Responsibility contract

| Actor | Owns | Must not own |
| --- | --- | --- |
| Human | Goals, lived context, subjective preferences, corrections, tradeoffs, option dispositions, consequential approval | Tool choreography, evidence bookkeeping, runtime planning |
| ChatGPT | Conversation, natural-language elicitation, selecting among valid next moves, explaining changes, choosing useful page focus | Canonical case truth, readiness, evidence validity, final approval |
| Sift deterministic core | Case state, pack pin, coverage, obligations, ownership, validation, invalidation, evidence status, readiness, valid next moves | Open-ended web investigation or subjective human judgment |
| Decision Pack | Domain vocabulary, discovery topics, requirements, catalog mappings, evidence expectations, view/capability declarations, safety rules | Case-specific conclusions or policy overrides |
| Strands runtime | Bounded plan execution, specialist/skill/tool selection, evidence-producing investigation, adaptation within limits | Changing protected human state or declaring human approval |
| Canvas | Persistent orientation, current artifact, direct controls, activity, evidence, recommendation, approval surface | Long conversational explanation or an independent shadow state |

## The persistent orientation shell

Every active-case view retains a compact, deterministic orientation layer.

Required fields:

- decision title and active pack;
- current phase;
- required coverage completed versus remaining;
- current focus or question;
- current state such as waiting, investigating, blocked, ready, or decided;
- recommended next step; and
- a visible route to completion.

The shell has two persistent parts:

- a sticky top header/subheader for orientation; and
- a sticky bottom action dock for the one or two actions relevant to the current artifact, such as **Confirm**, **Add something else**, **Continue**, **Start Quick Pick**, **Compare shortlist**, or **Review remaining question**.

CSS positioning is contained inside Sift's own document, so an iframe does not prevent the header or action dock from remaining visible within the pane viewport. The implementation must reserve content space, respect safe areas and the on-screen keyboard, and never cover the final card or accessibility focus target.

Example narrow shell:

```text
Choose our next car
Explore · 4 of 6 essentials covered
Now: cargo and everyday usability
Next: review 4 candidates
```

The shell is not a generic progress bar. It is derived from case coverage, active obligation, run state, pending human action, and recommendation readiness. It remains stable while the body view changes.

## Two intentional display modes

### Narrow ChatGPT companion mode

- Conversation is the primary navigation and explanation surface.
- One artifact dominates the body at a time.
- The orientation shell remains compact and sticky.
- Direct actions are limited to actions that supply judgment, correct state, inspect evidence, or exercise authority.
- Consumer activity is visible; technical execution is disclosed on demand.
- View tabs may exist as a small escape hatch, but they do not become the primary workflow.
- Required discovery coverage is completed through conversation plus pane interactions before model discovery begins.

### Expanded standalone mode

- The same phases and canonical case state apply.
- More context may appear simultaneously: brief, options, evidence, and supporting navigation.
- Direct search, filters, view switching, and case management are first-class.
- The user can complete the full journey without ChatGPT.
- **Explore with gaps** is available for soft unanswered topics and produces visibly provisional output.
- Expanded mode does not introduce a second decision engine or different acceptance rules.

## Proposed journey

## 0. Page opened, no case

### User experience

The narrow pane does not begin with a product launcher or vehicle inventory. It shows:

- Sift identity and WebMCP readiness;
- one sentence explaining the product;
- the prompt “Tell ChatGPT what decision you are trying to make”; and
- two or three copyable examples, led by “Use Sift to help me choose a car.”

If WebMCP is unavailable, pending, or failed, the state is explicit and includes a recovery action. The pane does not pretend that ChatGPT is connected.

The expanded standalone page may retain a pack/decision launcher because it must work without ChatGPT.

### WebMCP behavior

The page registers only a bounded lifecycle surface:

- `sift_describe_app` — identity, purpose, lifecycle, connection/mode, and active-case summary;
- `sift_list_packs` — installed packs and activation signals;
- `sift_start_case` — pin a pack and create a case from the user's stated intent; and
- `sift_resume_case` — list/resume explicit prior cases when supported.

Current reality: only `sift_get_case_context` and `sift_list_packs` are global, and no global tool can create the initial case.

## 1. First user turn and pack activation

### Conversation

User:

> Use Sift to help me choose a car.

ChatGPT discovers the page tools, reads Sift's identity and installed packs, selects the car pack because the activation signal is unambiguous, and creates the case. If the request is ambiguous across packs, it asks one discriminating question. It does not force a weak match.

ChatGPT responds with a short orientation, not a feature dump:

> I’ve opened a vehicle decision in Sift. I’ll help you define what matters, narrow the options, investigate the important unknowns, and then bring the decision back to you. I’ve put a few likely use cases in the pane; choose any that fit or add your own.

### Canvas

The pane transitions immediately to the Decision Brief view. The orientation shell reads `Frame · 0 of N essentials covered`. The body shows the single active question and any facts already inferred from the user's opening message.

### Canonical transition

Case creation pins pack ID, version, and compiled hash; records the user's initial intent; creates required coverage/obligations; and derives valid next moves.

## 2. Frame the decision

### Conversation

ChatGPT fills every topic supported by the user's opening message, then selects the highest-information unresolved topic rather than walking a fixed form:

- use case and affected people;
- hard budget and timing;
- non-negotiable physical or safety constraints;
- current vehicle/reference point; and
- one or two tradeoffs that most change the candidate space.

It usually offers a short, dynamically tailored option set in the pane because recognition is easier than recall. It uses open conversation when nuance is the point, accepts a conversational answer at any time, and does not ask for facts the catalog or investigation can retrieve.

### Canvas

The Decision Brief body shows:

- confirmed facts;
- inferred facts awaiting confirmation;
- explicit unknowns;
- hard constraints versus preferences; and
- what remains required before useful option search.

The pane normally shows one bounded generative interaction for the active topic: passenger/cargo scenarios, use patterns, target/stretch/hard budget, must-work requirements, tradeoff choices, or an inference-confirmation summary. Options come from the pack plus current context and almost always include the appropriate escape hatch—**Something else**, **None of these**, or **Not sure**. **Skip for now** appears only for standalone soft topics eligible for **Explore with gaps**. ChatGPT explains why the answer matters. Sift never silently preselects a suggestion.

One answer may cover several topics. ChatGPT proposes all supported mappings together, Sift validates them, and the journey advances without repeating questions. Explicit facts may be recorded directly; consequential inferences remain pending; anything that excludes candidates or creates a blocker requires explicit human confirmation.

### Hard boundaries without a hard-to-use form

Sift presents boundaries in the shape easiest to answer:

- budget separates comfortable target, stretch amount, and absolute ceiling;
- condition and timing use short selectable options plus **Something else**;
- physical, accessibility, safety, charging, towing, payload, and size needs use multi-select suggestions tailored to the stated use case;
- each selected item can be classified as **Must work**, **Matters a lot**, or **Nice to have**; and
- **Not sure** creates a verification question rather than forcing a false answer.

A verified failure against **Must work** blocks recommendation. Missing compatibility data remains **Needs verification**; it is neither treated as satisfied nor used to eliminate the candidate. The model cannot promote a suggestion or inference into a blocker without confirmation.

### Contextual blind-spot review

Before candidate discovery, Sift performs one explicit challenge pass derived from the pack and current brief:

> Based on what you told me, people in similar situations often need to consider child-seat layout, accessibility or mobility equipment, pets plus luggage, garage clearance, home charging, towing, and long-term operating cost. Are any of these relevant?

The actual options are dynamically narrowed to plausible omissions. This is not an exhaustive checklist and does not repeat confirmed facts. It is the last required conversational discovery gate. The pane then shows **Ready to discover models** and the complete interpreted brief for confirmation.

### Interaction context

After activation, ChatGPT should be able to call a compact `sift_get_interaction_context`-style resource containing:

- phase and coverage;
- current focus and visible view;
- protected human state;
- unresolved obligations;
- a bounded ranked set of valid next moves;
- pending human action;
- recommended presentation capability; and
- links/names for deeper pack, case, catalog, evidence, and runtime calls.

This is the coordination source of truth. It should not embed every option attribute, source body, tool descriptor, and runtime event.

Current `sift_get_case_context` is a strong case-state foundation, and `sift_get_decision_guide` provides domain guidance. The missing layer is deterministic phase/coverage/valid-next-move orchestration.

## 3. Explore and build the candidate set

### Conversation

Once disqualifying constraints are sufficiently covered, ChatGPT searches Sift's catalog. It proposes a small candidate set and explains inclusion diversity:

> I found four candidates worth testing: two strongest overall fits, one lower-cost alternative, and one option that trades cargo space for efficiency.

The model does not claim that catalog matches are recommendations. Unknown or weakly evidenced fields remain visible.

### Canvas

The body switches to one of three artifacts depending on the turn:

- candidate list for scanning;
- option detail for discussing one vehicle; or
- Quick Pick for rapid human preference elicitation.

Quick Pick shows one option or tradeoff at a time with:

- identity and the few attributes most relevant to confirmed criteria;
- why it may fit;
- what is concerning or under-evidenced;
- `Pass`, `Unsure`, and `Keep` actions; and
- progress through the current queue.

### Critical behavior change

Each action becomes durable state:

- `Pass` records a human option disposition and optional reason;
- `Unsure` records uncertainty and can create a follow-up question;
- `Keep` records shortlist membership/human interest; and
- direct correction records a human-authored fact.

Current reality: Quick Pick exists, but Pass and Maybe only advance local position; Shortlist only focuses the option and advances. The target journey requires canonical events that ChatGPT can read on the next turn.

### Bidirectional proof moment

The user keeps one car directly in the pane. On the next turn, ChatGPT reads that exact state and says:

> You kept the Outback and passed on the CX-5. The strongest unresolved difference is rear-seat comfort versus running cost, so I’m narrowing the comparison to those factors.

That is a stronger WebMCP demonstration than ChatGPT merely changing the page itself.

## 4. Focused comparison and preference refinement

### Conversation

ChatGPT selects a focused comparison only when it advances the current question. It may ask the user to choose between concrete tradeoffs, confirm an inference, or explain why one option moved.

### Canvas

The Compare view shows only the relevant finalists and rows. It must visibly distinguish:

- values known with support;
- values known but under-evidenced;
- contradictions; and
- unknowns.

Showing/hiding rows is presentation-only. Changing criterion importance is canonical decision state. The UI confirms which happened.

The existing `sift_set_view` and `sift_configure_comparison` contracts already encode this distinction. The orientation shell and interaction context must make it understandable to the user and model.

## 5. Continuously plan and investigate

### Trigger

Investigation begins opportunistically as soon as a stable fact creates useful, read-only work. The system does not wait for a ceremonial late-stage “build plan” moment. Early work may validate catalog support, identify available evidence, prepare derived fields, or discover that a proposed requirement cannot be verified from current data.

After candidates exist, the plan becomes candidate-specific and more visible. After Quick Pick creates a shortlist, deeper and more expensive work concentrates on the remaining options. Sift changes the dominant phase to Investigate when agent work becomes the main activity, but one versioned RunPlan has been evolving throughout the journey.

### Deterministic planning input

The case core derives unresolved obligations from:

- required pack coverage;
- selected/shortlisted options;
- custom confirmed concerns;
- missing or conflicted attributes;
- evidence expectations;
- recommendation invalidation; and
- explicit user questions.

### Canvas

When the plan becomes decision-relevant, the body can show its current projection:

- questions Sift will answer;
- why each could change the decision;
- expected evidence/source types;
- which work Sift/agents can perform;
- which facts require the human;
- stop conditions; and
- expected limitations.

The person can correct the plan or add a concern. Safe, read-only, budgeted work may run quietly in the background. Consequential, external side-effecting, or out-of-budget work follows explicit authority rules.

### Runtime

The runtime generates and validates a real per-move `RunPlan`, resolves specialists, skills, and tools against the pinned pack and current obligation, and persists the capability decision. State revisions cancel or invalidate stale queued work, reusable results are cached/deduplicated, and background activity never silently mutates protected human state. The developer projection can show the full catalog, exposed subset, and withheld capabilities with reasons.

## 6. Investigate visibly

### Conversation

ChatGPT does not stream low-level tool logs. It reports milestones that matter:

> Sift confirmed the cargo measurements but found conflicting owner-report evidence about rear-seat comfort. It is checking a second source before updating the comparison.

### Canvas

The body becomes question-oriented progress:

- active decision question;
- queued/in-progress/complete/blocked status;
- evidence gained;
- contradictions or failed checks;
- meaningful plan changes; and
- the next expected transition.

A compact consumer activity strip is derived from real WebMCP and runtime events. It may say “Checking third-row dimensions,” “Two sources disagree,” or “Comparison updated.” It never invents progress.

### Developer projection

Behind an explicit developer/judge control, the same event stream expands into:

- Graph nodes and Swarm handoffs;
- agents/specialists and AgentSkills;
- tool exposure and calls;
- run-plan revisions and stop conditions;
- WebMCP cause/effect;
- state diffs and invalidation;
- evidence lineage; and
- errors/recovery.

The consumer and developer surfaces are two projections of one truth.

## 7. Human intervention and adaptation

### Trigger examples

- a source conflict cannot be resolved automatically;
- an option appears to violate a lived constraint;
- the model inferred a preference that would materially change ranking;
- the user introduces a new concern; or
- a shortlisted vehicle becomes unavailable.

### Conversation

ChatGPT explains what changed and asks the smallest necessary question.

### Canvas

The body focuses the affected evidence, option, or custom-concern confirmation. The orientation shell shows `Blocked on you` or `Plan changed` and explains the consequence.

When the human changes a criterion or concern:

1. Sift records origin/ownership;
2. affected evidence/recommendation state is invalidated;
3. obligations reopen or are added;
4. the run plan/capability surface is revised; and
5. the canvas shows the actual consequence.

The user must never wonder whether a conversational statement merely changed what is displayed or changed what the decision means.

## 8. Maintain the living recommendation list

### Readiness rule

The model does not decide that research “feels sufficient.” The deterministic core checks required coverage, evidence expectations, contradictions, invalidation, pending human actions, and recommendation support.

Before sufficient evidence exists, Sift may show an explicitly **provisional order** based on current deterministic scoring and coverage. It must explain which positions are fragile and what would most likely change them. It withholds any stronger recommendation language until the readiness rule passes.

### Canvas

The recommendation list is recomputed whenever confirmed priorities, dispositions, evidence, constraints, or relevant unknowns change. It contains every active candidate, led by the current strongest supported fit when one exists. The first card shows:

- **Current strongest fit**, never “go buy this”;
- three or fewer decisive reasons tied to criteria and evidence;
- material tradeoffs;
- confidence and what it means;
- unresolved caveats;
- what could change its position; and
- direct links into comparison and evidence.

The remaining cards show why each option is still present, where it is stronger, what keeps it below the leader, its evidence coverage, and its Keep / Pass / Unsure / Shortlist state. When evidence cannot support a meaningful order, Sift presents a group or tie instead of forcing a winner.

### Conversation

ChatGPT explains the result in natural language and offers a focused follow-up, not a generic “anything else?”

> The Outback is the current strongest supported fit, mainly because it clears your cargo and winter constraints without exceeding your total-cost range. The RAV4 remains stronger on fuel cost. This is decision support, not a purchase instruction, and local availability has not been verified.

## 9. Human decision

Only the visible human control may:

- keep, pass, mark unsure, or add/remove from the shortlist;
- confirm a test-drive shortlist or final choice;
- reject;
- request revision;
- continue investigation; or
- leave the case undecided.

WebMCP and Strands may focus the approval surface and explain it, but cannot activate human approval.

Quick Pick is the fast triage step after the initial candidate set and may be reopened whenever the set changes. Its Tinder-like rhythm is deliberate: one context-rich card, Keep / Pass / Unsure, immediate durable feedback, undo, and no loss of orientation. “Keep” retains a candidate for consideration; shortlist confirmation remains a separate human action after comparison and evidence.

After the human decides, Sift records the outcome and preserves:

- the final brief and criteria;
- considered options and dispositions;
- investigation/evidence record;
- recommendation version and caveats;
- the human's decision; and
- a concise export/share summary if supported.

The final state explains that the decision is complete and what could trigger reopening it.

## View-selection policy

The canvas body follows a state-derived default with bounded overrides:

| Moment | Default body |
| --- | --- |
| No case | Bootstrap/readiness |
| Early framing | Decision Brief |
| Recognizing preferences | Quick Pick/tradeoff prompt |
| Candidate discovery | Candidate List |
| Discussing one option | Option Detail |
| Discussing differences | Focused Compare |
| Preparing research | Investigation Plan |
| Work running | Question Progress |
| Reviewing a claim | Evidence Focus |
| Human correction needed | Intervention/confirmation |
| Ready | Decision |
| Decided | Outcome Summary |

Rules:

- phase transitions choose the safe default automatically;
- ChatGPT may select/focus only pack-declared valid views;
- the human may navigate directly without changing canonical decision meaning;
- presentation tools yield to subsequent direct human focus;
- the orientation shell does not disappear; and
- developer detail never becomes the consumer body's default.

## Reusing what already exists

The target is a refactor and orchestration layer, not a ground-up UI rebuild.

| Existing asset | Target role | Current gap |
| --- | --- | --- |
| [`DecisionProfileView`](../../apps/web/src/components/DecisionProfileView.tsx) | Decision Brief | Needs phase/coverage/next-question integration |
| [`QuickPickView`](../../apps/web/src/components/QuickPickView.tsx) | Human preference/option elicitation | Actions are not durable decision dispositions |
| [`OptionListView`](../../apps/web/src/components/OptionListView.tsx) | Candidate scan | Must be stage-focused in narrow mode |
| [`OptionCompareView`](../../apps/web/src/components/OptionCompareView.tsx) | Focused tradeoff comparison | Needs stronger conversation/coverage context |
| [`OptionBoardView`](../../apps/web/src/components/OptionBoardView.tsx) | Working arrangement in expanded mode | Board placement is not yet canonical shared state |
| [`RecommendationHero`](../../apps/web/src/components/RecommendationHero.tsx) plus a living-list projection | Current strongest fit, alternatives, provisional/withheld state | Current hero is a single late artifact and appears before the journey has been established |
| [`LiveRunStatus`](../../apps/web/src/components/LiveRunStatus.tsx) | Consumer investigation activity | Needs question/obligation-oriented projection |
| [`EvidenceCard`](../../apps/web/src/components/EvidenceCard.tsx) and [`ReferenceLibrary`](../../apps/web/src/components/ReferenceLibrary.tsx) | Evidence focus and trace | Need direct connection to reasons/obligations |
| [`RuntimeInspector`](../../apps/web/src/components/RuntimeInspector.tsx) | Developer/judge projection | Missing complete run/capability/cause-effect views |
| [`WorkspaceViewSwitcher`](../../apps/web/src/components/WorkspaceViewSwitcher.tsx) | Body-view router | In narrow mode should be conversation/stage directed rather than workflow-defining tabs |
| [`WebMcpStatus`](../../apps/web/src/components/WebMcpStatus.tsx) | Connection/readiness | Needs full lifecycle and recovery proof |

## Demo spine implied by the journey

1. Open a new ChatGPT conversation with Sift in the pane.
2. Say, “Use Sift to help me choose a car.”
3. Show automatic pack activation and the Decision Brief.
4. Answer one question conversationally; show several topics fill and a contextual option interaction appear.
5. Complete the blind-spot review; show the required conversational coverage gate open candidate discovery.
6. Keep/pass/mark unsure directly in Quick Pick while bounded enrichment runs.
7. Have ChatGPT read those exact human actions and focus a comparison.
8. Add a new concern conversationally; show canonical change, reopened obligation, and live plan/capability diff.
9. Show evidence updating the living recommendation list, reasons, coverage, and test-drive checks.
10. End on human shortlist/decision controls rather than a purchase instruction.

This single spine supports both submissions. The WebMCP edit emphasizes shared page control and bidirectional state. The AWS edit spends more time on the investigation plan, agents, skills, tools, evidence, and validation.

## Product decisions for review

The proposal assumes:

1. conversation-led use is canonical in the ChatGPT pane;
2. expanded standalone use remains complete;
3. the five user-facing phases are Frame, Explore, Investigate, Decide, and Complete;
4. Quick Pick actions become durable human signals;
5. the top orientation shell and bottom contextual action dock are persistent across all body views;
6. stage determines the default body, with bounded model/human presentation overrides; and
7. developer/judge views remain a projection of real events rather than a separate demo mode.
8. the primary demo begins without a shortlist and aims to build and validate a model-level test-drive shortlist;
9. users with known models or listings enter through a shorter evaluation branch; and
10. model candidates and specific dealer listings remain distinct, with no invented price or availability transition between them.
11. the car pack becomes a general vehicle-selection pack capable of visibly different personal/family and business journeys; and
12. required discovery coverage completes before search in conversation mode, while standalone mode may explicitly Explore with gaps for soft topics;
13. one contextual blind-spot review is the final conversational discovery gate;
14. safe agentic enrichment and RunPlan revision continue throughout the journey; and
15. the result is a living recommendation list led by the current strongest supported fit, never a purchase instruction.

These assumptions should be reviewed before this document becomes the approved target specification or is converted into an implementation plan.
