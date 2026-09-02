# WebMCP Final Delivery and Judge-Proof Plan

Status: approved direction, implementation pending. Official requirements were refreshed from the WebMCP Devpost integration on September 1, 2026.

## Deadline reality

The submission deadline is **September 3, 2026 at 1:00 PM Pacific / 4:00 PM Eastern**. At the September 1 refresh, the project had roughly 42 hours remaining—not three full working days.

That changes the standard for the final pass:

- one complete, reliable, judge-visible vehicle journey matters more than broad unfinished capability;
- the second persona proves that the experience adapts, but does not need a second full investigation in the video;
- deterministic UX gates are blocking; model-based UX scores are diagnostic;
- every spoken claim must be visible in the product or directly inspectable in the repository; and
- no new feature enters the deadline scope unless it replaces a weaker proof of an official criterion.

## Official judging criteria and Sift proof

The four criteria use a five-point scale and do not publish separate weights.

| Criterion | What the judges ask | Sift's strongest proof | Video proof | Submission proof | Blocking acceptance |
| --- | --- | --- | --- | --- | --- |
| WebMCP Leverage | Is WebMCP used thoroughly, skillfully, and non-trivially? | ChatGPT discovers Sift, starts a typed vehicle case, changes canonical decision state, directs the canvas, reads human pane actions, and resumes from the new state. | Show one conversation-to-canvas change and one canvas-to-conversation readback. Briefly expose the registered tool/activity trace. | Explain the lifecycle tool surface, typed tools, shared canonical state, and why a normal chat or existing site overlay cannot provide the same interaction. | A fresh real WebMCP host discovers the expected tools and completes the bidirectional loop. |
| Execution | Is it a coherent working product rather than a technical proof? | A novice begins with no shortlist, reaches an evidence-backed test-drive shortlist, understands the current phase and next action, and retains final authority. | Start with the working product in the first 15 seconds. Show no setup, loading, or unexplained fixture transitions. | Live URL, public repository, setup instructions, license, limitations, and a truthful description of what is live versus fixture-backed. | Golden family journey passes deterministic, responsive, accessibility, and real-host checks. |
| Potential Impact | Does it solve a credible, specific problem for a real audience? | People routinely face high-stakes, multi-factor decisions without knowing the right process, evidence, or tradeoffs. Sift supplies a domain process while preserving their judgment. | Contrast an unstructured “help me choose” conversation with a visible brief, coverage, shortlist, evidence, and next step. | Name the audience and outcome precisely: people making complex decisions, beginning with vehicle selection for personal and operational needs. | The family persona can complete the outcome without hidden product knowledge or developer intervention. |
| Creativity & Ambition | Is the concept novel and meaningfully different? | Sift is a WebMCP-native adaptive decision experience, not an existing web app with chat controls layered on top. The same engine produces different process, criteria, and canvas emphasis for a family and a landscaping business. | Use a 10–15 second family/business contrast after the complete journey. | Frame the adaptive decision experience as the product; describe the reusable pack engine as the enabling architecture, not the headline. | Side-by-side persona artifacts prove materially different briefs, criteria, questions, and plan—not merely different copy. |

## Required deliverables

Before submission, the project must have:

- a working live URL usable in ChatGPT's in-app browser or a WebMCP-enabled Chrome build;
- a public video shorter than three minutes, with audio and a clear working demonstration;
- a public GitHub, GitLab, or Bitbucket repository with complete source, assets, and setup instructions;
- an open-source license visible at the top level or in the repository About area;
- a real `document.modelContext.registerTool(...)` implementation;
- a description that explains why the use case fits WebMCP, how it improves the UX, what the person and agent can now do together, and how WebMCP was implemented; and
- a clear record of the WebMCP-specific work completed after August 25 if the project predates the challenge.

Official references: [challenge overview](https://webmcp.devpost.com/) and [official rules](https://webmcp.devpost.com/rules).

## Final product promise

> Sift turns a conversation into a structured, inspectable decision process. The model conducts the work, Sift owns the decision state and adaptive canvas, specialist agents investigate, and the person keeps authority over preferences and the final choice.

For the vehicle demo, the honest outcome is:

> Help me discover and validate a shortlist of vehicle models worth test-driving, then help me evaluate exact listings when I provide them.

The bundled EPA catalog supports model/year/trim discovery. It does **not** prove live inventory, local availability, dealer terms, or out-the-door price. The product, narration, and submission must preserve that boundary.

For the hackathon, retain the full 853-record EPA-derived discovery catalog and add a small, richly curated hero cohort with clearly labeled demo data for the decision-relevant fields the EPA source lacks. External evidence and specialist results may be fixture-backed for determinism, but the WebMCP calls, canonical state, agent/runtime events, ranking, and UI effects shown in the demo must execute for real.

## Three-minute recording spine

Target length: **2:45–2:55**, assembled from tested clips.

| Time | Beat | What must be visible | Criterion served |
| --- | --- | --- | --- |
| 0:00–0:12 | Cold open | “Help me find the right car for my family.” Sift opens a vehicle decision and the pane immediately shows purpose, phase, and next step. | Execution, Impact |
| 0:12–0:38 | Adaptive discovery | ChatGPT extracts several facts from one answer, requests a context-aware option interaction, and performs a short blind-spot review. Required conversational coverage completes without a repetitive wizard. | Execution, WebMCP, Creativity |
| 0:38–1:02 | Candidate discovery | The model searches the bounded catalog using the confirmed constraints and presents a small model-level candidate set. | WebMCP, Impact |
| 1:02–1:25 | Human pane action | The person keeps, passes, or marks unsure in Quick Pick. ChatGPT reads that durable action on the next turn and changes its next move. | WebMCP, Creativity |
| 1:25–1:57 | Continuous investigation | A new concern revises the already-running plan. Strands cancels/reuses/focuses work and produces source-linked evidence plus an explicit caveat. | Execution, WebMCP |
| 1:57–2:22 | Living decision support | The recommendation list updates to show the current strongest fit, why, tradeoffs, confidence/coverage, alternatives, and test-drive steps without issuing a purchase instruction. | Impact, Execution |
| 2:22–2:38 | Adaptivity contrast | Start “help me choose a truck for my landscaping business.” Show a materially different brief, constraints, questions, and investigation plan from the same vehicle pack. | Creativity, Impact |
| 2:38–2:50 | Technical proof | Brief, readable tool/run trace: registered WebMCP tool, state change, plan revision, pane update. | WebMCP |
| 2:50–2:55 | Close | “Conversation is the conductor. Sift is the decision system.” | All |

Do not include account setup, terminal commands, loading waits, live typing, a full second scenario, or an inspector tour. Those dilute the product proof.

## Deadline scope

### P0 — submission blocking

1. A fresh ChatGPT conversation can discover Sift, select the vehicle pack, and start or resume a case.
2. Vehicle discovery coverage is structured and visible; required topics must complete in the ChatGPT journey, while only standalone mode may Explore with gaps for soft topics.
3. The pack declares coverage and a bounded interaction grammar; the model supplies context-aware suggestions and sequences them without creating a fixed wizard.
4. One response can populate multiple topics, while blocker creation remains explicitly human-confirmed.
5. Model-level candidates and exact listings are explicitly different entities and claims.
6. The broad catalog plus curated hero cohort provide enough stable detail for useful suggestions, Quick Pick, comparison, agent enrichment, and living recommendations without live dealer dependencies.
7. Family and landscaping intents produce materially different decision briefs from one generalized vehicle pack.
8. The narrow pane always answers: what decision, what phase, what changed, and what happens next.
9. Quick Pick actions persist and are readable through WebMCP on the next turn.
10. Normal catalog-created cases can reach the demonstrated investigation/recommendation path without secretly switching to a seeded case.
11. A real continuously evolving run plan, background enrichment, and one revision are visible at consumer and inspector levels for the hero scenario.
12. The persona harness records the full turn artifact and blocks deterministic failures for three scenarios.
13. The golden journey passes in a real WebMCP-capable host and the final video is recorded from that proven build.
14. Submission copy, README, live URL, public repository, license, and video satisfy the official checklist.
15. A living recommendation list and persistent top/bottom action frame remain coherent through every recorded state.

### P1 — only after every P0 gate passes

- model-based UX scoring across three repetitions with median and range;
- richer plan/agent visualization beyond a legible chronological projection;
- expanded standalone desktop composition;
- additional candidate filters supported truthfully by the bundled data; and
- a polished in-product “How Sift works” explainer.

### Explicitly deferred

- live dealer inventory or transactional listing integrations;
- a general-purpose library launch or public pack-authoring campaign;
- a second full landscaping investigation in the recording;
- autonomous ChatGPT browser driving in normal CI;
- broad runtime-inspector redesign unrelated to the recorded proof; and
- AWS-specific submission polish until the WebMCP submission is frozen.

## Release gates

The recording build is frozen only when all of these are true:

1. unit, contract, integration, scenario, and focused E2E checks pass;
2. the three persona hard-gate reports contain no blocking failure;
3. the family golden path completes twice from clean state without manual repair;
4. the real WebMCP host record includes discovered tools, transcript, screenshots, case/run IDs, and outcome;
5. every video claim has a row in the claim-evidence matrix;
6. public URL, repository, license, and instructions work from a logged-out/private browser;
7. the final cut is under three minutes and the first 15 seconds show the product working; and
8. no product or submission copy implies live price, availability, or listing evidence that Sift does not have.

## Source-control boundary

The active Claude Code session advanced and rewrote `main` several times while this plan was being written. At the latest check, HEAD is `da3ad9f`; its decision-profile, ranking, screenshots, build log, completion report, and release metadata are committed. A temporary commit (`710cc17`) swept the new `docs/final-plan` directory into the concurrent session, but that session subsequently reset/amended its history and removed the directory from its commit. The files remain intact and are currently untracked. No work was discarded, but future execution must recheck HEAD and status immediately instead of assuming this recorded snapshot is still current.

Before implementation begins:

1. capture `git status --short` and the current HEAD;
2. let the active session finish or establish an explicit integration checkpoint;
3. inspect the `6edf2d1` UI changes, the later documentation commits through `da3ad9f`, and their test results;
4. rebase the implementation task map on the resulting code; and
5. preserve the untracked `docs/final-plan` directory, do not casually regenerate the newly accepted screenshots, and do not amend the concurrent session's commits.

The implementation plan treats those files as an integration boundary, not expendable work.
