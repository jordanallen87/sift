# Sift Hackathon-Final Adaptive Decision Experience

Status: approved by the user on September 2, 2026. The design gate is closed. If an older planning document conflicts with this specification, this document wins.

## Goal

Ship a polished, judgeable demonstration of a genuinely different WebMCP experience:

> Sift turns an outcome stated in conversation into a structured, inspectable decision process. A Decision Pack defines what must be understood and what the system may do; the model dynamically conducts discovery and requests bounded generative interactions; agents continuously improve the evidence; Sift preserves canonical truth, ranking, and authority; and the person controls the shortlist and decision.

The submission is a hackathon product at demo scale, not production infrastructure. Curated external data is acceptable and desirable when disclosed. The product behavior shown to judges must execute for real.

## Hackathon strategy

### WebMCP

- One complete Vehicle Selection demonstration.
- Family/personal buying is the hero journey.
- A brief landscaping-business opening proves within-pack adaptation.
- Home Energy Guardian remains installed and documented as cross-pack proof but does not appear as a second complete story in the three-minute video.
- The differentiator is the adaptive experience, not “AI compares cars” and not a public library.

### AWS / Agents for Humans

- No AWS-specific feature or video work occurs until the WebMCP build is frozen.
- After the WebMCP deadline, Vehicle Selection becomes the AWS hero only if its real Graph/RunPlan/agent/evidence path passes the proof gate in `hackathon-scope-triage.md`.
- Otherwise Home Energy Guardian remains the AWS hero because its implemented Swarm, AgentSkills, interventions, GoalLoop, source challenge, and session story are currently deeper.

## Fidelity boundary

### These behaviors must be real

- `document.modelContext.registerTool(...)` registration and tool invocation;
- conversation-to-canonical-state mutation;
- pane-to-conversation readback;
- pack-driven discovery coverage and readiness;
- bounded interaction validation and rendering;
- human Keep / Pass / Unsure persistence and undo;
- deterministic ranking, coverage, unknown, dispute, and invalidation behavior;
- RunPlan construction/revision plus the agent/skill/tool events shown to judges;
- evidence-to-recommendation cause/effect;
- human-only shortlist/decision authority;
- responsive and accessible UI behavior;
- persistence, reconnect, and resume behavior; and
- automated and real-host verification claims.

### These inputs may be curated or fixture-backed and must be labeled

- vehicle profiles and indicative price bands;
- external evidence/source responses;
- specialist tool results;
- deterministic provider responses used for repeatable recording;
- synthetic personas;
- recoverable failures; and
- known-listing examples.

The rule is: **the external world may be simulated; the product may not be simulated.**

## Product modes

### ChatGPT/WebMCP companion

- Conversation conducts the journey.
- One pane artifact dominates at a time.
- Every pack-required discovery topic must be `confirmed` or `not_applicable` before model discovery.
- Required conversational topics do not offer **Skip for now**.
- Later evidence and physical-verification unknowns remain valid.
- The top orientation shell and bottom action dock remain visible.

### Standalone web app

- The same canonical case, contracts, ranking, and authority rules apply.
- Direct navigation, filters, search, and case management are first-class.
- A person may select **Explore with gaps** for soft unanswered topics.
- Deferred topics remain visible and every resulting candidate/ranking view is labeled provisional.

The modes are two presentations of one system, not two decision engines.

## Responsibility model

| Actor | Owns | Cannot own |
| --- | --- | --- |
| Person | Lived context, corrections, priorities, option judgments, blocker confirmation, shortlist, final choice | Tool choreography, evidence bookkeeping, agent planning |
| ChatGPT/host model | Natural conversation, extraction proposals, choosing among valid next moves, interaction wording/options, explanations, useful pane focus | Canonical truth, unvalidated transitions, deterministic ranking, evidence validity, human approval |
| Sift core | Case state, discovery coverage, origin/ownership, validation, readiness, ranking, invalidation, allowed next moves, view requirements | Open-ended investigation or subjective human judgment |
| Decision Pack | Domain topics, option seeds, mapping rules, interaction grammar, criteria/obligation templates, capabilities, evidence expectations, safety/authority bounds | Case-specific conclusion or policy override |
| Strands runtime | Validated RunPlan execution, specialists, skills, tools, evidence work, bounded adaptation | Protected human state, blocker inference, approval |
| Pane | Persistent orientation, current artifact, direct judgment/authority controls, evidence and progress | Independent shadow state or long duplicate chat prose |

## Canonical vehicle journey

### 1. Conversational activation

The person opens Sift in the browser pane and says:

> Use Sift to help me find the right car for my family. We have not picked any yet.

Global WebMCP tools describe Sift, list packs, and start/resume the case. An unambiguous request selects Vehicle Selection without manual launcher navigation. An ambiguous request receives one discriminating question. An existing case produces a resume/new choice.

The pane immediately shows the working decision, active pack, Frame phase, current coverage, current focus, and next action.

### 2. Adaptive discovery, not a questionnaire

The pack declares required topics and bounded interaction patterns, not a fixed ordered script. The model:

1. extracts every explicit fact supported by one message;
2. proposes atomic topic mappings with source and confidence;
3. asks only for the highest-value unresolved information;
4. prefers recognition through relevant options over blank recall;
5. uses open conversation for nuance and unanticipated needs; and
6. never repeats an answered topic.

Allowed interaction patterns include single/multi-select cards, yes/no/not sure, target/stretch/hard-limit ranges, Must work/Matters a lot/Nice to have sorting, relative priority ranking, confirmation summaries, Quick Pick, physical-verification checklists, and **Something else** custom input.

The pack supplies option seeds. The model narrows, relabels, and prioritizes them using confirmed context. Sift validates the result against the pack grammar. No suggestion is silently preselected.

### 3. Needs, importance, and blockers

User-facing classification:

- **Must work** — confirmed feasibility requirement;
- **Matters a lot** — important ranking driver;
- **Nice to have** — preference;
- **Needs verification** — important but not established.

Explicit statements may be recorded directly. Consequential inferences remain `inferred_pending`. A model cannot turn an inference into a blocker or relax a blocker without explicit human confirmation.

A verified incompatibility with **Must work** blocks recommendation. Missing compatibility data is **Needs verification**; it is neither pass nor failure.

### 4. Contextual blind-spot review

Before model discovery, Sift performs one required challenge pass based on the pack and current brief. It offers only plausible omissions—such as child-seat layout, accessibility/mobility equipment, pets plus luggage, garage clearance, charging, towing, or long-term cost—and includes **None of these** and **Something else**.

Sift asks functional questions rather than unnecessary personal questions. It asks who and what must fit, not “Do you have kids?” if occupant needs are already known.

When all required topics are confirmed/not applicable and blockers are resolved, the pane shows **Ready to discover models** plus the interpreted brief.

### 5. Model discovery from a truthful demo catalog

The full discovery universe remains the 853-record, 83-field EPA-derived model/year/trim catalog. It does not contain live dealer inventory, local availability, actual purchase price, or complete safety/reliability/fit data.

A stable hero cohort of roughly eight model profiles adds clearly labeled `curated_demo` attributes for the missing decision-relevant fields. Discovery is real and deterministic over the catalog; selected hero candidates receive curated enrichment without changing identity or silently switching to a seeded case.

The candidate view explains why each model entered, confirmed matches, conflicts, unknowns, and provenance. No-result states surface the conflicting boundaries and ask the person which is flexible; Sift never silently relaxes them.

### 6. Automatic Quick Pick

Quick Pick opens automatically after the first candidate set. It presents one context-rich card at a time with:

- Keep;
- Pass;
- Unsure;
- undo;
- a custom reason when useful; and
- persistent progress/orientation.

Every action is canonical and readable by ChatGPT on the next turn. Keep retains a candidate for comparison/deeper work; it is not shortlist confirmation. Pass preserves history and may be undone. Unsure creates or focuses an information need.

### 7. Continuous agentic enrichment

Run planning begins as facts stabilize rather than at one late ceremony:

1. pack activation establishes available specialists, skills, tools, evidence expectations, budgets, and stop conditions;
2. confirmed discovery facts may trigger safe, read-only data-availability or domain-enrichment work;
3. candidate discovery triggers bounded parallel enrichment;
4. Quick Pick focuses deeper work on Keep/Unsure candidates;
5. new concerns revise the RunPlan and selectively stale/cancel affected work while preserving unaffected results; and
6. accepted evidence recomputes readiness and the living recommendation list.

Background work is observable, cancellable, deduplicated, budgeted, and unable to mutate protected human state. The consumer sees only decision-relevant progress. Developer/judge disclosure exposes the real plan, revisions, agents, skills, tools, events, evidence, costs, and state effects.

### 8. Comparison and living recommendations

The result is a continuously recomputed recommendation list, not a single purchase instruction.

When evidence supports a leader, the first card is labeled **Current strongest supported fit** and shows:

- up to three decisive reasons;
- material tradeoffs;
- deterministic score and evidence coverage as one qualified claim;
- contested evidence;
- unresolved unknowns;
- what could change the position;
- human disposition/shortlist state; and
- links to comparison and evidence.

Every active alternative remains visible with why it is still present, where it is stronger, what keeps it below the leader, and its coverage. A fragile order is provisional. A genuine tie is shown as a tie/group. Unknown never becomes zero; disputed never becomes settled.

### 9. Test-drive shortlist and optional listings

The primary outcome is an evidence-backed model-level shortlist worth test-driving, plus candidate-specific checks for physical fit, comfort, trim features, and other unresolved facts.

Only the person may confirm that shortlist or a final choice. ChatGPT and agents may focus and explain the control but cannot activate it.

Exact fictional listings belong only to the secondary known-listing scenario. Live feeds, transaction execution, negotiation, and purchase flows are outside deadline scope.

## Persistent pane composition

### Top orientation shell

Always shows:

- decision title and pack;
- phase;
- required coverage;
- current focus;
- latest meaningful change/status;
- next step; and
- route to completion.

### Body

Shows the single most useful artifact: Decision Brief, interaction card, candidate list, Quick Pick, focused comparison, plan/progress, evidence, living recommendations, or human confirmation.

### Bottom contextual action dock

Shows no more than two primary actions for the artifact, such as **Confirm brief**, **Discover models**, **Continue Quick Pick**, **Compare retained**, **Review remaining question**, or **Confirm shortlist**.

Sticky/fixed positioning remains inside Sift's iframe document. The implementation reserves content space, handles safe areas/on-screen keyboards, maintains visible focus, and never covers the last content or error state.

## Critical retained edge cases

1. One answer fills several topics without redundant questions.
2. The person provides a custom need absent from suggestions.
3. An inferred need cannot become a blocker without confirmation.
4. Required conversational discovery cannot be skipped into search.
5. Standalone soft gaps produce provisional output.
6. No candidate satisfies all confirmed blockers.
7. Compatibility is unknown rather than pass/failure.
8. A new concern revises the plan without discarding unaffected work.
9. Human Quick Pick/navigation is durable and not overwritten.
10. Conflicting or missing evidence changes coverage/confidence honestly.
11. Disconnect/reload restores the case and next action.
12. No supported leader produces a tie/group rather than a fake winner.

## UX evaluation harness

The existing scenarios and Playwright stack are extended rather than replaced.

Three personas:

- novice family buyer with no shortlist;
- landscaping-business owner with no shortlist; and
- informed shopper with known listings.

Every turn records conversation, tools, state before/after/diff, coverage, next move, RunPlan/events, current view/ownership, screenshot, accessibility snapshot, visible controls, latency/cost, deterministic assertions, and model UX findings with cited evidence.

Hard gates fail the journey for state/UI contradiction, unsupported claims, authority violations, incomplete conversational discovery, invalid blocker inference, missing next action, broken orientation/action frame, fabricated progress, serious accessibility failure, console/network failure, or outcome dead-end.

Diagnostic dimensions are scored separately from 1–5: orientation, next-action clarity, relevance, efficiency, conversation–canvas coherence, control/flexibility, trust/evidence, and cognitive load. Release requires all hard gates, median ≥4 in every dimension, no Orientation/Next-action turn below 3, repeated clean family runs, and real-host acceptance.

## Three-minute WebMCP demo

Target 2:45–2:55:

1. **0:00–0:12** — “Use Sift to help me find the right car for my family.” Case opens from conversation; pane immediately orients.
2. **0:12–0:38** — one answer fills several topics; bounded option interaction and blind-spot review complete coverage.
3. **0:38–1:02** — model discovery produces a small, honest candidate set from the catalog/curated cohort.
4. **1:02–1:25** — automatic Quick Pick; person acts; ChatGPT reads exact dispositions.
5. **1:25–1:57** — new concern revises already-running agent work; visible plan diff and evidence caveat.
6. **1:57–2:22** — living recommendation list updates with leader, why, tradeoffs, coverage, alternatives, and test-drive steps.
7. **2:22–2:38** — landscaping opening produces materially different brief/options/plan from the same pack.
8. **2:38–2:50** — concise tool → state → RunPlan → pane cause/effect proof.
9. **2:50–2:55** — close: “Conversation is the conductor. Sift is the decision system.”

The video does not show Energy, setup, loading, live typing, a terminal tour, or a second full scenario.

## Explicit non-goals before the WebMCP deadline

- live dealer feeds, current availability, or transactions;
- arbitrary generated HTML;
- public SDK/library, marketplace, or production commercialization;
- full second pack/demo narrative;
- full landscaping investigation;
- accessibility compatibility as a central claim without trustworthy data;
- comprehensive Runtime Inspector redesign or elaborate animation;
- full standalone-desktop redesign;
- autonomous real-ChatGPT control in CI;
- exhaustive edge cases beyond the retained set;
- production auth, tenancy, billing, scaling, or operations; and
- AWS-specific recording/submission work before WebMCP freeze.

## Definition of done

The WebMCP build is ready to freeze only when:

1. the hero family journey completes twice from clean state without repair;
2. every deterministic persona hard gate passes;
3. the model UX thresholds pass with inspectable evidence;
4. the three persona branches prove the intended divergence/convergence;
5. the real ChatGPT/WebMCP host discovers tools and completes both directions of shared control;
6. every submission/video claim maps to code, automated proof, visible proof, and limitation;
7. the public deployment, repository, license, and instructions work while signed out;
8. the video is under three minutes and shows the working product in the first 15 seconds; and
9. no copy or UI implies unsupported live inventory, price, availability, evidence, or authority.
