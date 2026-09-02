# Car Conversation and Canvas Simulation

Status: proposed golden-turn simulation for review. It specifies the target experience and records current gaps; it is not evidence that this flow is implemented.

## Scope assumption

The primary scenario begins with no preselected candidates. The user asks Sift to help find the right vehicle for a stated personal, household, or business situation. A secondary entry branch accepts known models or exact listings and joins the same journey after candidate capture.

The primary scenario initially produces model-level candidates. It does not claim live local inventory, availability, advertised price, or out-the-door cost. Specific listing analysis begins only when listing-level data is actually supplied by the user or a real integration.

## Conversation design options

### Fixed chat wizard

The system asks the same ordered questions for every household. This is predictable and easy to test, but it reproduces the form/wizard experience inside chat and does not demonstrate why a model is valuable.

### Fully model-led interview

The model decides every question from free-form instructions. This feels flexible but makes required coverage, stopping, recovery, and demo repeatability unreliable. Important questions can disappear from context without deterministic proof.

### Recommended: coverage-driven adaptive elicitation

Sift deterministically owns:

- required discovery topics and their completion state;
- confirmed facts, constraints, preferences, inferred facts, and open questions;
- which next moves are valid;
- whether candidate search is ready;
- which human-only questions remain; and
- safe default views for the current phase.

ChatGPT owns:

- which valid question has the highest information value now;
- natural wording and grouping;
- short explanations of why an answer matters;
- whether to continue in conversation or invite a direct pane interaction; and
- bounded presentation requests among pack-declared views.

This makes the conversation adaptive without asking the model to remember or enforce the workflow by itself.

## Discovery coverage

The car pack should define discovery topics, bounded interaction types, and option seeds rather than a single ordered questionnaire.

| Topic | What must become known | Typical source |
| --- | --- | --- |
| Decision goal | Desired outcome: explore models, compare known models, or evaluate listings | Human opening request |
| Usage | Daily driving, trip pattern, terrain, passenger and cargo patterns | Human conversation |
| Budget | Target and hard ceiling; whether price is model guidance or listing-specific | Human conversation |
| Timing and condition | New/used flexibility, minimum model year, urgency | Human conversation |
| Hard constraints | Physical, safety, drivetrain, charging, accessibility, feature, or size limits | Human confirmation |
| Decision drivers | The few tradeoffs that should distinguish viable candidates | Human conversation or direct ranking |
| Reference point | What the current/prior vehicle gets right and wrong | Human conversation |
| Candidate state | No candidates, model candidates, or exact listing candidates | Human plus canonical case state |

Discovery is ready for an initial model search when:

1. the decision goal is explicit;
2. the candidate type is explicit;
3. high-impact hard constraints are confirmed;
4. search scope is bounded enough to produce a useful, diverse set;
5. at least the leading decision drivers are known; and
6. no unresolved ambiguity would make the initial search misleading; and
7. the contextual blind-spot review is complete.

Not every preference must be finalized before search. Discovery alternates between elicitation and concrete candidates because people often discover preferences by reacting to examples.

Discovery is option-first when the answer space is recognizable. The model combines pack-declared seeds with current case context to produce a short relevant set, and the pane preserves an appropriate open path such as **Something else**, **None of these**, or **Not sure**. **Skip for now** is limited to standalone soft topics eligible for **Explore with gaps**. Open-ended chat remains available for nuance and unanticipated needs; it should not be the default input mechanism for every topic.

Coverage topics may be confirmed, inferred pending confirmation, explicitly deferred, not applicable, unknown, or blocked. In the ChatGPT/WebMCP journey, every pack-required discovery topic must be confirmed or not applicable before model search; conversational orchestration is responsible for helping the user complete that coverage. In the standalone app, **Explore with gaps** may defer soft topics and produce visibly provisional candidate output. Sift must never relabel deferred coverage as complete.

## How an answer becomes state

After each user turn, ChatGPT proposes a structured interpretation and Sift validates the transition.

| User statement | Canonical destination | Confirmation rule |
| --- | --- | --- |
| “It must be under $35,000” | Hard constraint | Directly confirmed because the language is explicit |
| “I would like to stay around $30,000” | Target/context, not hard exclusion | Preserve as preference/target |
| “We take long trips with two kids and a dog” | Household/use context, occupants, pet/cargo pattern, trip pattern | Record every explicit fact in one transition; derive only unresolved questions |
| “One child uses a wheelchair” | Accessibility context and proposed functional-accommodation topic | Record only what was stated; offer functional options plus **Something else**; confirm the actual must-work accommodation before exclusion |
| “AWD would be nice” | Preference | Do not convert to a must-have |
| “AWD is non-negotiable” | Hard constraint | Directly confirmed |
| “The crate probably needs 36 inches” | Inferred/pending physical requirement | Ask for confirmation or exact measurement before exclusion |
| “I hate how cramped our current car feels” | Reference observation and possible decision driver | Ask which dimension/experience is responsible if material |
| New factor such as motion sickness | Proposed case extension | Confirm before it changes comparison or investigation |

Sift should not convert every sentence into a weighted criterion. Context explains the decision; constraints eliminate; criteria distinguish viable options; questions track what remains unresolved.

## When ChatGPT should ask another question

Ask when one of these conditions is true:

1. required discovery coverage is missing;
2. an ambiguity could materially change the candidate universe or ranking;
3. the user introduced an important domain factor not represented by the pack;
4. two stated preferences or constraints conflict;
5. evidence produced a question only the human can resolve; or
6. the answer would choose between meaningfully different investigative paths.

Do not ask when:

- the fact can be retrieved reliably by a tool;
- the answer is low-impact and can wait until candidates make it concrete;
- the same fact is already confirmed;
- the question exists only because a fixed questionnaire says it comes next; or
- the page can collect the same judgment faster and more clearly through recognition.

The normal turn contains one main decision question. Its pane interaction may collect several tightly related fields when that reduces work, such as target, stretch, hard ceiling, and new/used flexibility. The next turn must account for every field already supplied.

## Canvas direction policy

The system needs a view director, not a model that issues an arbitrary navigation command after every answer.

### Deterministic required transitions

The safe default changes automatically when a real state transition creates a new dominant artifact:

- no case to active case: Bootstrap to Decision Brief;
- search not ready to candidate set ready: Decision Brief to Candidate List;
- investigation starts: current exploration artifact to Investigation Progress;
- investigation blocks on a person: Evidence/Question Focus;
- recommendation becomes ready: Decision view; and
- human decides: Outcome Summary.

### Bounded model-directed presentation

ChatGPT may request a view when:

- the user explicitly asks to see something;
- the response discusses one option and showing it reduces cognitive load;
- a side-by-side difference is the subject of the turn;
- a direct pane interaction is the best way to provide judgment; or
- evidence is being cited and should be inspected.

### No view change

Keep the current body when:

- an answer only updates the Decision Brief;
- ChatGPT asks the next related discovery question;
- the user is in the middle of a direct interaction;
- a short explanation does not require another artifact; or
- switching would merely demonstrate that the system can switch.

### Human navigation precedence

An explicit human view change takes a presentation lease. ChatGPT should not immediately yank the page elsewhere. The lease ends when the user asks for another view, accepts a model suggestion, or a major deterministic phase transition creates a required artifact. Model presentation commands never change decision meaning.

## Golden-turn simulation: no shortlist

The sample household has two adults, two children, a large dog, a mix of commuting and road trips, and no selected vehicles.

| Turn | Conversation | Canonical work | Pane | Directive |
| --- | --- | --- | --- | --- |
| 0 | User opens Sift beside a new ChatGPT conversation. | Register bounded pre-case tools; report readiness. | Sift identity, connection state, and example opening prompts. | `BOOTSTRAP` |
| 1 | **User:** “Use Sift to help me build a shortlist of cars my family should test-drive. We haven't picked any yet.” | Discover Sift, select `car-purchase`, create case, record goal and candidate state `none`. | Decision Brief with `Frame · 1 of N essentials covered`. | Required transition to `BRIEF` |
| 2 | **ChatGPT:** “I’ll help you narrow the field. I’ve put likely passengers, cargo, and uses in Sift—choose any that fit or add your own.” | Focus usage/household fit. Request a bounded multi-select populated from family-use pack seeds, with **Something else**, **Not sure**, and conversational input available. | Brief shows context-aware passenger/cargo/use options; no empty inventory or full criteria table. | Stay `BRIEF` |
| 3 | **User:** “Two adults, two kids, and a 70-pound dog. Mostly commuting, but several long road trips a year. We bring a large crate.” | Record confirmed household/use context. Create an unresolved crate-fit detail rather than inventing a dimension. | Brief adds confirmed facts and one open fit question. | Stay `BRIEF` |
| 4 | **ChatGPT:** “Let’s set the price boundary. Use the suggested ranges or enter your own target and absolute ceiling.” | Ask a high-elimination question while preserving target versus ceiling and model-level versus listing-level price. | Budget interaction provides context-aware ranges, target/stretch/hard-limit fields, new/used options, **Not sure**, and custom values. | Stay `BRIEF` |
| 5 | **User:** “Around $30,000 would be good; $35,000 out the door is the hard limit. Used is fine, preferably 2021 or newer.” | Record target, hard ceiling, condition flexibility, and model-year constraint. Mark out-the-door price as listing-level and unavailable during model discovery. | Coverage updates; no candidate view yet. | Stay `BRIEF` |
| 6 | **ChatGPT:** “Which of these must work for your family? You can add something I missed.” | Offer context-aware physical, safety, accessibility, charging, feature, and size suggestions. Selected items are not blockers until the person classifies or confirms them as **Must work**. | Must work / Matters a lot / Nice to have interaction with **Something else**, **None of these**, and **Not sure**. | Stay `BRIEF` |
| 7 | **User:** “AWD and adaptive cruise are must-haves. We cannot charge at home. Our current crossover feels cramped once the crate and luggage are loaded.” | Confirm AWD and feature constraints; record no-home-charging context; propose cargo loading as a decision driver. Do not silently ban every electrified powertrain without clarification. | Brief separates Must have, Prefer, and Needs confirmation. | Stay `BRIEF` |
| 8 | **ChatGPT:** “I’ll exclude vehicles that require home charging. Among viable cars, which differences matter most: safety/reliability, cargo space, total cost, comfort, or fuel economy?” | Present pack defaults as editable priorities; request relative order, not fake precision. | A compact priority-ranking interaction appears inside the Brief. | Focus `PRIORITIES`; do not replace the phase view |
| 9 | **User acts in pane:** ranks safety/reliability first, cargo second, ownership cost third, comfort fourth, fuel economy fifth. | Persist human-authored priority signals and recalculate search readiness. | Brief shows `Ready to explore` and the interpreted search frame. | Stay `BRIEF` until transition |
| 10 | **ChatGPT:** “Before I search, here are a few needs families in your situation sometimes miss: child-seat layout, mobility equipment, pets plus luggage, garage clearance, towing, and long-term operating cost. Does anything apply that we have not captured?” | Perform the required contextual blind-spot review without repeating confirmed facts. | Dynamic multi-select with **None of these** and **Something else**; top shell shows one required review remaining and bottom dock shows **Confirm brief**. | Stay `BRIEF` |
| 11 | **User:** “No towing or mobility equipment. Child seats, the dog plus luggage, garage fit, and long-term cost matter.” | Atomically confirm/not-applicable the remaining topics; complete conversational discovery coverage; allow safe background data-availability work to continue. | Brief shows `Ready to discover models`, interpreted Must work/Matters/Nice/Verify groups, and **Discover models** in the bottom dock. | Stay `BRIEF` until transition |
| 12 | **ChatGPT:** “Your required discovery coverage is complete. I’m starting with 2021-or-newer AWD crossovers and keeping the set diverse rather than pretending the first matches are final recommendations.” | Search a model-level catalog with confirmed constraints; select a bounded, diverse candidate set; preserve unknown price/feature fields; start bounded candidate enrichment in parallel. | Candidate List shows why each model was included, known gaps, source scope, and quiet real progress. | Required transition to `LIST` |
| 13 | **ChatGPT:** “I found eight plausible starting points. I’ve opened Quick Pick so you can keep, pass, or mark them unsure.” | Offer the fast human-triage interaction. | Quick Pick opens automatically with one context-rich card, Keep / Pass / Unsure, undo, sticky orientation, and a bottom progress/action dock. | Model-directed `QUICK_PICK` |
| 14 | **User acts in pane:** keeps two, passes three, marks one unsure. | Persist dispositions and reasons when supplied; concentrate deeper background enrichment on kept/unsure candidates; do not merely advance local cards. | Quick Pick progresses without losing orientation. | Stay `QUICK_PICK` |
| 15 | **ChatGPT:** “You kept the Outback and CR-V and marked the RAV4 unsure. The remaining uncertainty is cargo loading versus running cost. I’ll compare those three on those factors.” | Read the human's exact actions; select finalists and focused attributes. | Focused Compare plus a living recommendation list whose order, coverage, reasons, and unknowns reflect current evidence. | Model-directed `COMPARE` |
| 16 | **User:** “My partner gets carsick in rough-riding vehicles. That may matter more than fuel economy.” | Propose and confirm a custom ride-comfort/motion-sensitivity concern; reweight only after confirmation; open an evidence/human-test-drive obligation. | Concern confirmation and consequence preview. | Required `QUESTION_FOCUS` because meaning may change |
| 17 | **ChatGPT:** explains the consequence while the runtime revises the active plan. | Persist the confirmed concern; cancel/invalidate affected stale work; preserve unrelated work; add ride-comfort research and a physical test-drive check. | `Plan changed` projection names added, rechecking, and unchanged work; developer view shows the real RunPlan revision. | Required transition to `PLAN` |
| 18 | Background investigation continues. ChatGPT reports only decision-relevant milestones. | Execute bounded specialists; store evidence, conflicts, plan revisions, progress events, and costs. | Consumer progress; developer/judge disclosure available. | Required transition to `PROGRESS` |
| 19 | Evidence leaves crate fit and motion sensitivity unresolved while improving safety, reliability, and cost coverage. | Never fabricate fit/comfort scores; recompute deterministic ordering and readiness; create candidate-specific physical checks. | Living recommendation list updates, marks the current strongest fit as provisional where needed, and links to a test-drive checklist. | Required `DECISION` or `QUESTION_FOCUS` based on readiness |
| 20 | Human keeps/passes, confirms the test-drive shortlist, requests revision, or leaves undecided in the pane. | Record only the explicit human action. | Recommendation list, shortlist controls, and outcome summary remain distinct from a purchase instruction. | Human-authority transition |

## Current implementation breaks in this simulation

| Turn | Current reality |
| --- | --- |
| 1 | No global WebMCP tool starts a case from the opening message. |
| 2-10 | The Decision Guide offers example questions, but no deterministic discovery-topic coverage, search-readiness rule, or valid-next-move projection exists. |
| 5 | The bundled catalog has no live or historical purchase price, dealer availability, or out-the-door cost. |
| 7/10 | Catalog records expose drivetrain and many useful fields, but WebMCP search filters only year, make, model, body style, and fuel type. |
| 8-9 | No canonical relative-priority elicitation interaction is wired to the proposed discovery coverage. |
| 10 | The pack calls candidates specific listings while catalog-created candidates are model/year/trim records. |
| All | The current pack is explicitly household-oriented and does not declare business/operational-fit discovery topics, criteria templates, attributes, obligations, or presentation guidance. |
| 13 | Quick Pick Pass/Maybe advance local position; Shortlist focuses the option. The actions are not durable dispositions. |
| 15-17 | General custom concerns exist in pieces, but a complete concern-to-obligation-to-revised-run-plan path is not implemented. |
| 17 | The live hero path does not yet generate and adapt a real per-move `RunPlan`. |

## Simulation/emulator artifact

The implementation plan should include a conversation-and-canvas scenario harness. Each scripted turn provides:

- current canonical case snapshot;
- active pack and discovery coverage;
- latest user message or direct UI event;
- current pane view and presentation owner; and
- tool/runtime results available at that point.

Each expected turn asserts:

- conversational goal and main question;
- permitted and forbidden tool classes;
- exact canonical state diff;
- view directive: stay, focus, offer, or required transition;
- visible pane artifact and orientation shell;
- facts that must remain unknown;
- authority boundary; and
- consumer and developer proof events.

The minimum scenario suite is:

1. no shortlist, successful model discovery;
2. known model shortlist;
3. exact dealer listings supplied;
4. ambiguous budget or must-have correction;
5. user introduces a new concern after candidate selection;
6. user manually changes the pane while ChatGPT is explaining another artifact;
7. catalog returns no honest match;
8. required evidence remains unresolved;
9. WebMCP registration or case activation fails; and
10. interrupted session resumes without repeating completed discovery.
11. landscaping-business discovery produces a materially different brief, criteria, candidates, and investigation plan from the family journey; and
12. an informed user skips general discovery and supplies exact listings without being forced backward through the interview.

## Decisions for review

1. The primary demo outcome is a model-level test-drive shortlist, not live local inventory search.
2. The interview is coverage-driven and adaptive, not a fixed ordered wizard.
3. Search begins once high-impact constraints and leading drivers are sufficient, then discovery continues through reactions to real candidates.
4. The system determines required stage transitions; ChatGPT receives bounded presentation discretion; direct human navigation temporarily wins.
5. A turn simulator becomes a specification and evaluation artifact, not necessarily a consumer-facing product feature.
