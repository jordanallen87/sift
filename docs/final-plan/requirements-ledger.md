# Requirements Ledger

Status: initial capture. This ledger will become the acceptance spine for the final implementation plan.

## Status vocabulary

- **Verified current:** code path and evidence have been inspected.
- **Partial:** a real portion exists, but the user-visible or runtime claim is incomplete.
- **Missing:** the requested behavior is not implemented.
- **Decision required:** product direction must be approved before implementation is planned.
- **Planned:** accepted into the final sequenced plan but not implemented.
- **Proven:** implementation, automated tests, scenario evidence, and visible demo proof are all present.

“Documented” is deliberately not a completion status.

## Product and UX

| ID | Requirement | Current status | Completion proof required |
| --- | --- | --- | --- |
| UX-01 | Define the canonical car journey from a new ChatGPT conversation through a human decision. | Planned | Approved journey, state/screen specification, end-to-end acceptance scenario. |
| UX-02 | Clarify the responsibilities of ChatGPT, Sift, Strands, deterministic core, and human. | Partial | Product copy, architecture explanation, interaction tests, demo narration consistent with behavior. |
| UX-03 | Create/open a car case naturally from ChatGPT instead of requiring manual launcher navigation. | Missing | Global lifecycle tool/host integration, safety rules, UI empty state, E2E proof. |
| UX-04 | Elicit a decision brief before forcing catalog navigation. | Missing | Approved brief model, conversation/UI flow, persisted state, E2E proof. |
| UX-05 | Build and revise a shortlist collaboratively through conversation and direct manipulation. | Partial | Shared catalog/selection state, typed tools, visible controls, sync tests. |
| UX-06 | Make normal catalog-created cases support the core investigation promise. | Missing | Non-fixture engine path, real tools/data behavior, integration and scenario tests. |
| UX-07 | Maintain a versioned investigation plan throughout discovery, candidate enrichment, shortlisting, and deeper investigation; show the human-readable projection when it becomes decision-relevant. | Missing | Real continuously revised plan, background-work policy, change handling, cancellation/invalidation, and consumer UI tests. |
| UX-08 | Present progressive states for setup, planning, investigation, human input, result, and decision. | Partial | State model, screen designs, narrow/expanded acceptance, accessibility checks. |
| UX-09 | Maintain a living recommendation list led by the current strongest supported fit, with reasons, tradeoffs, confidence/coverage, caveats, what could change, and every active alternative. | Partial | Approved result hierarchy, deterministic recomputation, evidence trace, no-purchase-instruction copy, UI and scenario tests. |
| UX-10 | Treat the ChatGPT pane as a conversation-driven companion canvas rather than a compressed standalone application. | Planned | Approved mode contract, pane state designs, responsive and WebMCP E2E proof. |
| UX-11 | Define explicit rules for what appears in conversation, canvas, or both. | Missing | Approved orchestration policy and scenario tests covering each major case stage. |
| UX-12 | Let the model select and configure pack-declared views appropriate to the current turn. | Partial; four hardcoded modes exist | Pack view contract, generic validated presentation tools, cause/effect UI tests. |
| UX-13 | Keep a persistent top orientation shell and bottom contextual action dock showing phase, coverage, current focus, next step, and route to completion. | Missing | Narrow/expanded designs, iframe/sticky behavior, safe-area/keyboard/content-offset handling, state derivation, accessibility and E2E tests across every major phase. |
| UX-14 | Use direct pane interaction for preference evidence and human judgment, including a Quick Pick/keep-pass-unsure pattern. | Partial; Quick Pick exists, but Pass/Maybe only advance local position and Shortlist only focuses the option | Persisted interaction contract, canonical preference/disposition mapping, two-way ChatGPT readback, responsive UI proof. |
| UX-15 | Distinguish canonical decision changes, presentation-only changes, and human-only authority actions in the interface. | Partial | Visible feedback language, state/event classification, scenario and UI tests. |
| UX-16 | Support a primary car journey in which the user has no preselected candidate group and Sift builds a test-drive shortlist. | Missing | Approved discovery coverage, candidate-generation path, turn simulation, catalog-backed scenario, and narrow-pane E2E proof. |
| UX-17 | Support a shorter entry branch for users who already have candidate models or exact listings, then converge on the same evaluation journey. | Partial; options can be added after case creation | Explicit model/listing capture, branch transition rules, and converged state/scenario proof. |
| UX-18 | Specify every major conversational turn as chat output, canonical state transition, pane artifact, and view directive. | Missing | Approved golden-turn simulation plus alternative, interruption, correction, and resume scenarios. |
| UX-19 | Require complete pack-required discovery coverage in the ChatGPT/WebMCP journey while allowing the standalone app to Explore with gaps for soft topics with explicit provisional output. | Missing | Mode-aware readiness contract, no conversational skip of required topics, standalone defer flow, consequence labels, and both-mode scenarios. |
| UX-20 | Make one vehicle-selection pack produce materially different personal/family and landscaping-business experiences. | Missing; current pack is household-specific | Generalized pack/domain contract, persona-specific brief/criteria/candidate/plan differences, and side-by-side scenario proof. |
| UX-21 | Prefer context-aware suggestions and option-based inputs over repeated blank open-ended questions, while preserving custom, none, unsure, and defer paths. | Missing | Bounded interaction grammar, dynamic option policy, accessibility tests, conversational-equivalence tests, and persona evidence showing fewer redundant questions. |
| UX-22 | Classify decision inputs as Must work, Matters a lot, Nice to have, or Needs verification, with explicit confirmation before an inference becomes a blocker. | Missing | Pack contract, authority rules, blocker/unknown semantics, correction flow, and accessibility persona scenario. |
| UX-23 | Perform one contextual blind-spot review before conversational model discovery, using likely omissions without repeating known facts or asking unnecessary personal questions. | Missing | Pack suggestion rules, relevance/deduplication tests, completion gate, family/business scenarios, and recorded demo proof. |
| UX-24 | Make Quick Pick a durable, undoable Keep/Pass/Unsure triage step after candidate discovery and keep it distinct from shortlist confirmation or final approval. | Partial; current actions are local/focus-only | Canonical dispositions, undo, background-work concentration, model readback, shortlist transition, and narrow-pane proof. |

## WebMCP and conversation orchestration

| ID | Requirement | Current status | Completion proof required |
| --- | --- | --- | --- |
| WM-01 | Register a bounded pre-case bootstrap tool surface that explains Sift, lists packs, and supports starting/resuming a case. | Partial; two read tools only | Tool contracts, lifecycle tests, ChatGPT in-app-browser walkthrough. |
| WM-02 | Select a pack from structured activation signals, with clarification and no-match behavior. | Partial; pack listing exists | Selection policy, ambiguous/no-match tests, visible case pinning. |
| WM-03 | Expose one typed, pinned Pack Interaction Guide as the domain workflow source of truth. | Partial; `DecisionGuide` exists | Contract/compiler/runtime tests and model-facing payload inspection. |
| WM-04 | Derive and expose bounded valid next conversation moves from pack plus current case state. | Missing | Deterministic derivation tests and multi-turn car scenario. |
| WM-05 | Use progressive disclosure rather than returning every pack, case, tool, and instruction in one bootstrap payload. | Missing | Payload bounds, call sequence tests, stale-context regression test. |
| WM-06 | Re-register or otherwise expose the correct case/pack-specific tools and views after activation. | Partial; case tools re-register | Start-case lifecycle E2E proof including tool availability change. |
| WM-07 | Preserve a bidirectional loop: conversation changes the canvas and direct canvas changes are readable on the next turn. | Partial | Two-way scenario with exact state/tool/UI correlation. |
| WM-08 | Define safe mappings from conversational answers/inferences into canonical criteria, constraints, context, options, and concerns. | Partial | Mapping contracts, confirmation boundaries, invalidation tests. |
| WM-09 | Protect human-authored and human-confirmed state from silent agent overwrite. | Missing as a general contract | Origin/ownership model, tool validation, conflict behavior, regression scenarios. |
| WM-10 | Inspect and selectively reuse the user's existing discovery engine once its location is provided. | Pending external input | Code review, extraction map for stages/rules/tests, explicit keep/adapt/retire decisions. |
| WM-11 | Expose WebMCP connection/readiness and prove the expected tool surface after a fresh page load and lifecycle transition. | Partial; status component exists | Fresh-load registration test, pre-case/active-case tool assertions, visible recovery state, deployed walkthrough. |
| WM-12 | Direct pane views by deterministic stage defaults plus bounded model presentation requests, while yielding to explicit human navigation. | Partial; presentation tools exist without a complete director policy | Approved view-director rules, persisted presentation ownership, and multi-turn no-jump/required-transition tests. |
| WM-13 | Let the model request bounded generative elicitation components and populate context-specific options from pack seeds plus canonical case state. | Missing | Typed WebMCP interaction contract, server validation, durable human response, escape-hatch behavior, model/pane round-trip, and hostile/invalid request tests. |
| WM-14 | Map one conversational or pane response into every supported discovery topic it answers and suppress redundant follow-up questions. | Missing | Atomic proposed mappings with origin/confidence, deterministic validation, confirmation boundaries, and multi-topic extraction scenarios. |

## Candidate discovery and data

| ID | Requirement | Current status | Completion proof required |
| --- | --- | --- | --- |
| CD-01 | Distinguish model candidates from specific dealer listings throughout state, UI, tools, evidence, and narration. | Missing; the pack says listing while the bundled catalog supplies model/trim records | Approved entity semantics, migration plan, schemas, UI labels, and scenario tests. |
| CD-02 | Define the honest boundary of “find cars”: model-level candidate discovery, live listing discovery, or an explicit two-stage transition. | Planned: model discovery followed by optional exact-listing verification | Approved product boundary and terminology audit across pack, UI, README, demo, and submission. |
| CD-03 | Make candidate discovery queryable by the hard constraints used in the conversation. | Missing; catalog search filters only year, make, model, body style, and fuel type | Filter/ranking contract, data coverage report, unknown handling, and discovery scenario proof. |
| CD-04 | Never imply live price, local availability, dealer terms, or out-the-door cost from the bundled EPA model catalog. | Partial; model/listing semantics are currently blurred | Proven provenance labels, unavailable-state behavior, and claim-evidence audit. |
| CD-05 | Generalize the current household car-purchase domain into vehicle selection with case-specific personal, household, or operational fit. | Missing; household language and assumptions are embedded throughout the current pack | Approved migration, generalized entities/topics/templates/obligations, family and business conformance scenarios, and truthful compatibility plan. |
| CD-06 | Use the full 853-record EPA-derived catalog for broad model discovery and a stable, richly curated hero cohort for decision-relevant fields absent from EPA data. | Partial; broad catalog and fictional four-candidate fixtures exist but are disconnected and semantically mixed with listings | Curated model-profile schema, roughly eight candidate profiles, explicit demo provenance, unknown handling, deterministic discovery-to-enrichment path, and no live-inventory claims. |

## UX evaluation

| ID | Requirement | Current status | Completion proof required |
| --- | --- | --- | --- |
| EV-01 | Define versioned persona scenarios that act only from visible information and declared persona knowledge. | Missing | Family, landscaping, and known-listing persona files with hidden facts, behavior, outcome, and assertions. |
| EV-02 | Record every turn's conversation, tools, state diff, coverage, view, screenshot, accessibility tree, runtime events, and costs. | Missing | Bounded/redacted artifact schema and reproducible run bundle. |
| EV-03 | Enforce deterministic hard gates for state consistency, truthfulness, authority, accessibility, failure handling, and task completion. | Partial across existing tests | Persona-journey oracle integrated with current scenario/contract/Playwright gates. |
| EV-04 | Score orientation, next-action clarity, relevance, efficiency, conversation-canvas coherence, control, trust, and cognitive load with cited evidence. | Missing | Versioned rubric/evaluator, three-run median/range report, variance escalation. |
| EV-05 | Track objective journey metrics including turns, redundant questions, corrections, view reversals, deferred-topic revisits, latency, and cost. | Missing | Instrumented report and baseline comparison. |
| EV-06 | Provide a model-driven local/CLI persona runner over the real app and model-context adapter. | Missing; current CLI is pack-authoring only | `test:persona`-style command, isolated test state, artifacts, and three complete scenarios. |
| EV-07 | Run milestone and pre-submission acceptance in a real WebMCP-capable ChatGPT/compatible host. | Manual gap; deployed test skips registration | Timestamped host record, discovered tools, transcript, screenshots/video, case/run IDs, and outcome. |
| EV-08 | Turn accepted UX findings into requirements and deterministic regression tests at the lowest reliable layer. | Missing as a formal loop | Finding ledger with classification, repair link, test evidence, and closed/rejected rationale. |

## Agent runtime

| ID | Requirement | Current status | Completion proof required |
| --- | --- | --- | --- |
| AG-01 | Generate a structured per-move `RunPlan`. | Missing; schema only | Runtime producer, validation tests, persisted plan event, inspector proof. |
| AG-02 | Validate plan references and limits against pack, policy, registry, and current case. | Missing | Resolver/validator tests including denial and fallback paths. |
| AG-03 | Resolve tools dynamically by declared pack, specialist, installed registry, obligation relevance, policy, and budget. | Partial; static specialist grants exist | Capability-resolution tests and per-run persisted decision record. |
| AG-04 | Revise the plan when criteria, concerns, evidence, steering, or human input changes. | Missing | Before/after plan scenario and visible plan diff. |
| AG-05 | Turn a new case concern into a general obligation and investigative path. | Partial | Pack-generic derivation tests and non-dog-crate scenario. |
| AG-06 | Preserve deterministic ownership of state, evidence validity, readiness, invalidation, and human approval. | Verified current foundation | Regression tests across every new planning/execution path. |
| AG-07 | Distinguish scripted fixture execution from live/adaptive model execution everywhere. | Partial | Runtime metadata, UI label, export field, README and submission language. |
| AG-08 | Start safe agentic enrichment as facts stabilize, then continuously revise, cancel, deduplicate, and focus the RunPlan as candidates and human judgments change. | Missing | Trigger policy, budgets, cancellation/staleness rules, plan-revision events, cache/deduplication proof, consumer progress, and developer trace. |

## Developer and judge experience

| ID | Requirement | Current status | Completion proof required |
| --- | --- | --- | --- |
| DX-01 | Retain a chronological, filterable, correlated safe event log. | Partial | Missing filters/actions completed or explicitly descoped; UI/performance/export tests. |
| DX-02 | Visualize Graph execution and Swarm handoffs. | Missing | Event-derived visual, active/completed/redirected/error states, both hero scenarios. |
| DX-03 | Show skills available/activated and specialists available/selected. | Partial telemetry, missing coherent UI | Runtime capture plus Context/Capability view and scenario assertions. |
| DX-04 | Show full, exposed, and withheld tools with reasons. | Missing | Capability resolver record and UI projection. |
| DX-05 | Show current `RunPlan`, revisions, stop conditions, and plan diffs. | Missing | AG-01/AG-04 plus inspector UI and tests. |
| DX-06 | Correlate WebMCP user intent, tool call, command, state diff, plan change, and UI effect. | Partial origin marker only | End-to-end correlation event model and cause/effect view. |
| DX-07 | Connect recommendation reasons backward to obligations, claims, sources, contradictions, and execution. | Partial | Selectable evidence/decision trace and scenario-backed UI tests. |
| DX-08 | Include an in-product “How Sift works” explanation. | Missing | Approved copy/visual, accessible help placement, docs parity check. |
| DX-09 | Complete or explicitly rescope Runtime Inspector Execution, State, Context, and Errors views. | Missing | Approved scope and corresponding acceptance evidence. |
| DX-10 | Update the repository README with a truthful system breakdown and links. | Partial | README review against code and final requirement ledger. |

## Hackathon delivery

| ID | Requirement | Current status | Completion proof required |
| --- | --- | --- | --- |
| HK-01 | Define a distinct WebMCP thesis and demonstration spine. | Partial; existing script is stale against current UI | Re-walked recording, exact proof map, official-limit check. |
| HK-02 | Define a distinct AWS/Strands thesis and demonstration spine. | Partial | Re-walked recording, exact proof map, deployment/fixture claims verified. |
| HK-03 | Ensure both pitches describe one coherent product. | Missing | Cross-script terminology and behavior audit. |
| HK-04 | Map every spoken/submission claim to code, tests, visible evidence, and limitations. | Missing | Claim-evidence matrix with no unsupported rows. |
| HK-05 | Keep official requirements, dates, and submission fields refreshed. | Existing packet; temporally sensitive | Final official-source refresh and checklist signoff. |
| HK-06 | Establish and consistently use the product category and WebMCP differentiation: an adaptive decision experience, with the reusable engine secondary to the user product. | Planned | Approved positioning, terminology audit across product/docs/scripts, and demo proof of each differentiating claim. |
| HK-07 | Show one complete vehicle hero while retaining multiple installed packs as architecture/repository proof rather than recording multiple complete product demos. | Planned | Video scope audit, About/README pack comparison, pack conformance proof, and no second-story dilution in the three-minute edit. |

## Anti-drift completion record

Each implementation-plan item must eventually record:

| Field | Required content |
| --- | --- |
| Requirement IDs | One or more ledger IDs addressed. |
| Owner/scope | Files or subsystem owned; overlap risks called out. |
| Runtime evidence | Exact event, persisted record, or state transition proving behavior. |
| Automated evidence | Unit, contract, integration, scenario, UI, and/or E2E tests as appropriate. |
| Consumer proof | What a normal user sees. |
| Technical proof | What the Runtime Inspector or sanitized export shows. |
| Demo proof | Hackathon beat and recording action. |
| Documentation impact | Specs, README, diagrams, scripts, and limitations updated. |
| Final status | `Proven` only after every applicable evidence field is satisfied. |
