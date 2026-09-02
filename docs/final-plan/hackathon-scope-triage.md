# Hackathon Scope Triage and Autonomous-Run Handoff

Status: strategic scope recommendation for approval. This document exists to prevent the final build from turning every good idea into deadline scope.

## The product bet

The product is not a car comparison site, a generic agent library, or two unrelated hackathon demos.

> Sift is a WebMCP-native adaptive decision experience: conversation conducts the process, a Decision Pack defines required coverage and safe capabilities, the pane generates the most useful bounded interaction for the moment, agents continuously enrich the decision, deterministic state preserves truth and authority, and the person makes the choice.

Vehicle selection is the primary proof because it makes that interaction model immediately understandable. The same engine's energy case remains valuable evidence that Sift can also run quietly and investigate before interrupting a person.

## Immediate WebMCP decision

### Show only the vehicle journey

The three-minute WebMCP video should not include Home Energy Guardian. The vehicle journey already has to prove:

- natural conversational activation;
- pack-driven but non-wizard discovery;
- bounded generative UI;
- multi-topic extraction from one answer;
- dynamic suggestions and blind-spot review;
- canonical conversation-to-pane changes;
- durable pane-to-conversation human judgments;
- continuously revised agent work;
- living recommendations and evidence; and
- human-only shortlist/decision authority.

Adding Energy would consume scarce seconds, require a second problem explanation, and weaken the claim that Sift delivers one coherent product experience. Energy remains in the repository and regression suite but receives no WebMCP-deadline product work unless a shared change breaks it.

## AWS / Agents for Humans decision

The repository's authenticated August 27 Devpost snapshot gives the AWS submission a September 14 deadline and rewards Technological Implementation, Design, Potential Impact, Creativity & Originality, and Presentation. Home Energy Guardian currently has the stronger implemented Strands proof: a real Swarm, AgentSkills, steering/interventions, GoalLoop, source challenge, sessions/snapshots, and quiet background triggering. The vehicle case has the stronger target UX and cross-hackathon story but still needs the final adaptive RunPlan behavior implemented.

Therefore, do not choose the AWS hero permanently tonight. Apply this gate immediately after the WebMCP submission:

### Use Vehicle Selection as the AWS hero only if all are proven

- a real, non-fixture-only Graph run works for a conversationally created case;
- agent work starts and focuses as canonical facts and Quick Pick dispositions change;
- at least one new concern produces a real RunPlan revision, capability change, and selective invalidation;
- skills, specialists, tools, evidence, stop conditions, and human boundary are visible and traceable;
- the complete vehicle outcome works without demo repair; and
- the experience is at least as legible as the WebMCP recording build.

### Otherwise use Home Energy Guardian as the AWS hero

Preserve its existing causal story—quiet anomaly trigger, Swarm handoffs, skills/tools, intervention, evidence challenge, plan change, persistence, and human authority—but apply only the shared orientation/action-frame and truthfulness improvements that survive the WebMCP build. The car case may appear briefly as platform proof only if the five-minute story remains easy to follow.

This gate prevents the team from forcing conceptual unity at the expense of an actually demonstrated Strands implementation.

## Demo fidelity boundary

This is a hackathon product, not a production launch. Optimize for a coherent, working, testable experience at demo scale.

### Must be real

- WebMCP tool registration and calls;
- conversational and pane-driven canonical state transitions;
- discovery coverage, confirmation, blocker, and authority rules;
- generated interaction requests validated through the bounded grammar;
- Keep / Pass / Unsure persistence and model readback;
- deterministic ranking, coverage, uncertainty, and invalidation;
- RunPlan creation/revision and agent/skill/tool events shown to judges;
- evidence-to-recommendation cause/effect;
- responsive UI, accessibility, recovery, and saved/resumed state; and
- every automated and real-host acceptance claim.

### May be curated or fixture-backed when disclosed

- the catalog and candidate cohort;
- external evidence and source responses;
- vehicle price bands and listing-like examples;
- specialist tool results;
- deterministic model/provider responses used for repeatable recording;
- failure/recovery conditions; and
- synthetic personas and conversations used by the harness.

Fixture-backed must not become fake UI. The real application, WebMCP, state, runtime, events, ranking, and views must execute against the fixture data. Labels and submission copy must say which data is curated, synthetic, or fixture-backed; they must never imply live dealer inventory, real availability, or real-world transactions.

## Vehicle catalog and demo data strategy

The repository already contains a real EPA-derived catalog of **853 model/year/trim records with 83 fields**. It is useful for discovery across make/model/year, body style, drivetrain, powertrain, fuel economy, range/charging, annual fuel cost, emissions, and limited interior volume. It is not a dealer inventory feed.

Use a two-layer demo dataset:

1. **Discovery catalog:** retain all 853 EPA-derived records as the broad model universe. Extend the bounded query/ranking adapter to use the relevant existing fields.
2. **Curated hero cohort:** enrich roughly 8 candidate models used by the family journey with the decision-relevant fields the EPA source does not contain. Quick Pick operates on this stable cohort; the 3–4 retained/unsure finalists receive deeper evidence.

The curated layer may include clearly marked demo values for:

- indicative purchase-price band, never current local price;
- seating and child-seat configuration;
- cargo dimensions and opening shape;
- common driver-assistance features;
- safety/reliability demo evidence;
- winter capability;
- ownership-cost assumptions;
- test-drive/physical-verification needs; and
- accessibility or equipment compatibility as unknown/verification data unless explicitly established.

Refactor the existing fictional listing and evidence fixtures into model-level demo profiles for the hero journey, or keep exact fictional listings only in the secondary known-listing test. The UI must say **Curated demo data** and expose provenance/unknowns. Stable rich data is more valuable to the hackathon than a thin live feed.

## One hero demo, multiple packs

Keep more than one installed pack because it proves Sift is an engine rather than a hardcoded car prototype. Do not record more than one complete demo.

- **WebMCP video:** one end-to-end Vehicle Selection journey. The family-versus-landscaping contrast proves within-pack adaptation more powerfully than starting a second unrelated story.
- **Product/About/README/developer proof:** show that Vehicle Selection and Home Energy Guardian are two compiled packs with different coverage, views, specialists, tools, and execution patterns.
- **AWS video:** choose one hero after the WebMCP proof gate. The other pack may receive a brief architecture/platform mention only if it does not break the causal story.

This preserves both kinds of proof: adaptation to the individual case and reuse across decision domains.

## What must ship before the WebMCP deadline

### Product proof

1. Conversation starts/resumes the vehicle case without the launcher.
2. Required conversational discovery coverage completes through context-aware options, multi-topic extraction, consequential confirmation, and one blind-spot review.
3. Standalone mode may Explore with gaps for soft topics; the ChatGPT journey may not bypass required coverage.
4. The persistent top orientation shell and bottom contextual action dock remain clear in every pane state.
5. Model-level candidate discovery is honest about price, availability, and listing limits.
6. Quick Pick automatically follows candidate discovery and persists Keep / Pass / Unsure with undo and model readback.
7. Safe agentic enrichment begins as facts stabilize and focuses after human triage.
8. A real RunPlan revision is caused by a new concern and produces visible selective invalidation/reuse.
9. A living recommendation list shows the current strongest supported fit, every active alternative, reasons, tradeoffs, confidence/coverage, unknowns, and what could change.
10. Human shortlist confirmation and final authority remain structurally unavailable to the model.

### Verification proof

1. Deterministic contract, state, authority, provenance, readiness, and view gates.
2. Three persona journeys: family novice, landscaping owner, and known-listing comparer.
3. Turn artifacts connecting chat, tools, state diff, RunPlan/events, rendered pane, accessibility snapshot, screenshot, latency, and cost.
4. Model UX evaluation with cited evidence as a diagnostic layer, never a replacement for deterministic gates.
5. Repeated clean family runs and one real ChatGPT/WebMCP-host acceptance record.
6. A claim-evidence matrix for every spoken and written submission claim.

### Submission proof

1. Judge-mapped description and Built With details.
2. Public working URL, public repository, visible license, and clean setup/testing instructions.
3. Final under-three-minute script and shot list based on the frozen build.
4. Public video upload only after the user triple-checks the product and packet.

## What to cut now

These ideas may be valuable later but do not add enough winning proof before the WebMCP deadline:

- any Home Energy feature or polish not required to keep shared regression tests green;
- live dealer feeds, local-availability claims, transaction execution, or listing-provider integrations; retain the bundled model catalog and a rich curated demo cohort;
- arbitrary model-generated HTML or a general generative-UI framework beyond the bounded interaction grammar used in the hero journey;
- a public library/SDK launch, pack marketplace, or generalized commercial packaging;
- a complete second landscaping investigation—the first discovery/brief/plan divergence is enough for the WebMCP contrast;
- accessibility compatibility as the central video claim unless trustworthy compatibility data is added; keep it as a branch/authority/unknown test;
- autonomous control of the real ChatGPT UI in normal CI; use the real app/model-context boundary plus a manual real-host gate;
- a comprehensive Runtime Inspector redesign; implement only the RunPlan/capability/cause-effect proof needed by judges;
- elaborate Graph/Swarm animation; a clear event-derived plan/agent trace is enough;
- complete standalone-desktop redesign; keep it functional and use narrow companion clarity as the deadline priority;
- exhaustive edge-case coverage; prioritize the hero path and the critical failures listed below;
- AWS-specific video, article, architecture export, or AgentCore polish until the WebMCP build is frozen; and
- model UX scoring on every edit. Run one diagnostic evaluation during iteration and the required repetitions at milestone/final gates.

## Critical edge cases that stay

The deadline build must handle these because failure would undermine the demo thesis:

1. one answer fills several topics without redundant questions;
2. a custom need not present in suggestions;
3. an inferred need cannot become a blocker without confirmation;
4. a required conversational topic cannot be skipped into search;
5. a standalone soft gap produces provisional output;
6. no catalog result satisfies confirmed blockers;
7. unknown compatibility is not treated as pass or failure;
8. a new concern revises the plan without discarding unaffected work;
9. human Quick Pick/navigation is durable and not overwritten by the model;
10. conflicting or missing evidence changes confidence/coverage honestly;
11. WebMCP reconnect/resume restores the same case and next action; and
12. no deterministic leader produces a tie/group rather than a fake winner.

## Discretion policy for the autonomous run

During implementation and UX repair, an agent may make local decisions without interrupting the user when all are true:

- the change strengthens an approved journey requirement;
- it stays within the P0 scope above;
- it preserves truthfulness, human authority, accessibility, and the current data boundary;
- deterministic tests can prove the behavior;
- the visible result improves a scored UX dimension or official judging proof; and
- it does not introduce a new external dependency, irreversible action, submission claim, or major product branch.

When tradeoffs are necessary, optimize in this order:

1. complete working hero journey;
2. understandable next action and pane orientation;
3. genuine bidirectional WebMCP proof;
4. truthful agent/evidence behavior;
5. deterministic regression coverage;
6. demo clarity;
7. visual polish; and
8. breadth.

The agent should cut or simplify work that ranks low in this order rather than asking the user to adjudicate routine implementation details.

## Inputs needed from the user before “run free” begins

### Required before implementation autonomy

- explicit approval of the final journey and scope triage;
- confirmation that the active Claude Code session has stopped or a clear statement that concurrent work may continue;
- the path/repository for the existing discovery engine if it should be considered before implementation; and
- any non-negotiable visual/brand constraint not already captured.

### Required before public submission—not before implementation

- final eligibility/registration confirmations;
- permission and timing to make the repository public;
- final repository and live URLs;
- personal form fields, including country/submitter type and AWS Builder ID where required;
- final review of the public description, screenshots/thumbnail, architecture diagram, and testing instructions;
- choice of who records narration and any voice/identity preference; and
- explicit approval before the final Devpost submission action.

The implementation agent may prepare every submission artifact and field value in advance. It must not publish private information, make the repository public, or submit to Devpost without the user's explicit authority.

## Final cut rule

If a feature cannot be proven in the product, harness, or recorded video before the freeze, it is not part of the submission claim. If it does not strengthen one of the official criteria or protect a critical demo failure, it is the first candidate to remove.
