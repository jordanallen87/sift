# Claude Code Autonomous Build Prompt

Paste the text below into Claude Code while its working directory is this repository.

---

You are the lead engineer, architecture reviewer, test engineer, product designer, hackathon strategist, and release owner for Pax. Use your deepest available reasoning. Build the complete hackathon-ready product in this repository from start to finish.

Begin by reading `CLAUDE.md` and every document it lists completely, including `docs/reuse-source-map.md`, both exhaustive submission checklists, and `docs/superpowers/plans/2026-08-26-pax-hackathon-build.md`. Treat the approved product direction as the implementation contract, but do not assume that the current documents are internally complete merely because they are detailed.

## Phase zero — deep audit and specification repair

Before creating product code, perform an adversarial preimplementation review from two perspectives at once:

1. a principal engineer determining whether another team could implement the system deterministically without inventing contracts; and
2. a judge determining whether the result can credibly win the WebMCP Challenge and AWS Agents for Humans Hackathon.

Write the findings and dispositions to `docs/preimplementation-audit.md`. This audit is a gate followed by implementation, not a reason to stop, return another plan, or ask whether to continue.

### Technical audit

Review every specification, ADR, requirement, implementation task, submission gate, and reuse source. Check at least:

- complete domain types, command/event unions, state transitions, API envelopes, errors, idempotency, cancellation, optimistic concurrency, SSE replay/resync, and polling equivalence;
- deterministic evidence levels, source independence, conflicts, staleness, dependency invalidation, accepted uncertainty, readiness, scoring, hard constraints, ranking, tie-breaking, and human authority;
- exact fixture values, calculations, scripted-model beats, expected snapshots, and causal transitions required to make every demo assertion meaningful rather than hard-coded theater;
- consistency among the public activity stream, Runtime Inspector stream, Strands hooks/spans, Graph nodes, Swarm handoffs, skills, interventions, GoalLoop, sessions, snapshots, and canonical case events;
- SQLite transaction and migration design, process/restart behavior, Railway volume behavior, AgentCore boundary, S3 session requirements, telemetry propagation, redaction, and public debug access;
- right-pane interaction at 390–480 px, state hierarchy, above-the-fold hero moments, sticky actions, accessibility, error/reconnect behavior, exact user-facing copy, and whether the design will look intentional rather than like a generic dashboard;
- installed dependency exports and current official primary documentation for WebMCP, Strands TypeScript, AgentCore, Railway CLI, React, Vite, Drizzle, Playwright, and other fast-moving surfaces;
- security boundaries for browser content, submitted sources, model output, authoring paths, tool capabilities, debug payloads, credentials, and consequential actions;
- plan ordering, dependency correctness, test ownership, critical-path risk, and whether both hero vertical slices become working early enough to protect the submission.

At minimum, resolve the known seams around complete domain/event contracts, deterministic scoring, evidence/readiness algorithms, exact fixture data, UI interaction design, requirement traceability, session-storage path consistency, Energy specialist naming, public-versus-debug event coverage, and mapping `pax_request_revision` to the shared command layer. Create focused specification files when needed instead of burying contracts inside the audit report.

### Source-reuse audit

Use `docs/reuse-source-map.md` as the canonical map. Verify every listed absolute path. Read applicable source-repository instructions before inspecting code. For each candidate, record:

- canonical source path and whether it is handwritten or generated;
- the concept or fragment worth reusing;
- the exact Pax destination and owning test;
- whether the decision is concept-only reimplementation, structural adaptation, small copied fragment, or no reuse;
- dependency and architecture mismatch;
- applicable license/ownership conclusion and required attribution.

The important reference roots are `/Users/jordanallen/IdeaProjects/praetor` for Praetor/Strata19 engines, plugin sources, and UI patterns, and `/Users/jordanallen/IdeaProjects/think-os` for Murmur entities, Decision Pack manifests/compiler, reference packs, and design tokens. Inspect canonical Strata19 sources under `src/mcp/facade`, `packages/mcp`, and `apps/web/src/components/strata19`; do not copy generated `plugins/strata19/server/facade-stdio.js` or `plugins/strata19/widget/workspace.html`. Never add filesystem imports from either reference repository.

Keep `docs/reuse-source-map.md` current during this review. During implementation, record every copied or materially adapted fragment in `docs/reuse-attribution.md`. When an applicable open-source license is not explicit, reimplement the idea and state that no source code was copied.

### Hackathon-winning audit

Evaluate the WebMCP submission against its actual judging criteria and required demonstration:

- WebMCP is essential to shared attention and live steering, not a decorative list of CRUD tools;
- the page and ChatGPT operate one visible case through the same commands;
- a user concern absent from the pack changes a running backend trajectory without weakening governance;
- the experience works in the ChatGPT right pane and the winning interaction is understandable in the first 15 seconds;
- the under-three-minute story proves implementation, execution quality, human impact, creativity, and ambition.

Evaluate the Agents for Humans submission against its actual judging criteria and required demonstration:

- Strands features are genuinely executed and causally necessary, not labels wrapped around custom orchestration;
- AgentSkills, Swarm handoff, intervention steering, Context Injector, GoalLoop, sessions/snapshots, hooks, and telemetry each produce visible evidence in the hero path;
- the system completes real background work, rejects an unearned answer, interrupts the human only at a real decision, and never performs the consequential action itself;
- the design is coherent for a non-developer while the Runtime Inspector proves technical depth;
- the five-minute story clearly demonstrates technological implementation, design, impact, originality, and presentation quality;
- Railway live access and AgentCore/CloudWatch proof are included when actually verified and never fabricated.

Look for opportunities to make the causal proof clearer and more memorable without adding another product demo or expanding the approved scope.

### Audit disposition and continuation gate

For every finding, record severity, evidence, disposition, changed files, owning implementation task, and verification method. Final dispositions may be `resolved`, `accepted_with_rationale`, or `external_blocker`.

Resolve every internally answerable critical or high-severity finding by updating the canonical specification, ADR, requirement matrix, demo contract, source map, and implementation plan before coding. You may clarify and reorder work, but you may not silently delete an approved capability, weaken a release gate, substitute a mock for a required real integration, or turn a required item into a stretch goal. Ask the user only when two valid resolutions would materially change the approved product or when new external authority is required; continue all independent work first.

Phase zero passes only when:

- all `PAX-Pxx` requirements map to an implementation owner, automated test layer, demo or operational proof, and relevant submission gate;
- every required hero beat has exact input, causal state transition, expected event/trace evidence, visible UI proof, and automated assertion;
- deterministic fixture math produces the documented recommendation changes without a scripted final-result shortcut;
- every reuse candidate has a verified source-to-destination decision;
- current platform claims are supported by installed code or official primary documentation;
- no known internal contradiction can produce incompatible implementations;
- the implementation plan prioritizes working Car and Energy vertical slices while still delivering every approved requirement.

Record the phase-zero gate in `docs/build-log.md`, then immediately execute the revised implementation plan. Do not stop after the audit, documentation repair, scaffolding, a partial demo, local tests, or deployment configuration.

The required output is working software:

- a polished React right-pane application;
- a truthful real-time experience driven by command/run receipts and ordered SSE events for queued work, specialists, skills, tools, steering, evidence, readiness, and completion, with replay, reconnect, duplicate suppression, resync, and polling fallback;
- a deterministic SQLite-backed case/evidence/readiness engine using `better-sqlite3`, Drizzle migrations, transactional events/snapshots, replayable public activity, and a Railway `/data` volume;
- versioned compiled Decision Packs for Car Purchase and Home Energy, plus a typed extensibility model where users can add `custom.*` attributes, criteria, and evidence questions without changing the installed pack or bypassing Zod validation;
- real TypeScript Strands AgentSkills, car-purchase Graph, Energy Swarm, interventions/steering, Context Injector, GoalLoop, streaming events, sessions, and snapshot restoration;
- a real developer-mode `pack-authoring` Strands skill with bounded catalog/scaffold/validate/test/diff/publish tools, deterministic conformance tests, explicit human publication, and disabled authoring in the unauthenticated public deployment;
- imperative WebMCP tools registered through `document.modelContext` and backed by the exact same commands as visible UI actions;
- two complete fixture-backed demos, with Choose Our Next Car optimized for the WebMCP Challenge and Home Energy optimized for the AWS Agents for Humans hackathon;
- a first-class right-pane Runtime Inspector powered by Strands TypeScript hooks and native OpenTelemetry, with correlated model/tool/plugin/Graph/Swarm/session/domain events, state diffs, tokens, latency, errors, filters, sanitized payloads, activity-to-trace links, and downloadable run bundles;
- a comprehensive unit, property, component, contract, integration, scenario, mutation, and Playwright suite;
- visual verification at 390, 430, 480, and 1440 pixel widths, including screenshot comparison, geometry/overflow checks, accessibility, console/network failure detection, and manual inspection of actual/diff images;
- a self-healing machine-readable verification loop;
- a production build, a newly created and fully deployed Railway project/service with persistent volume and public domain, and an AgentCore-compatible execution target;
- accurate README, architecture, demo, deployment, and submission materials.

Prove why this is not merely an LLM wrapper. The Energy trajectory must include a plausible premature recommendation that Pax visibly withholds because required evidence is missing; the runtime must redirect, change specialist/skill, collect source-linked evidence, pass bounded GoalLoop validation, persist/restore across a confirmation pause, and leave final authority with the human.

Prove that Pax is adaptable rather than a pair of closed Zod objects. In the car journey, add a household concern absent from the installed pack, persist it as a typed case extension, derive an evidence question, adapt the run plan, preserve an honest unknown when no tool can verify it, and show that the pack ID/version/hash remains unchanged. Run the shared pack conformance suite against both hero packs and the compact apartment-authoring fixture.

Use fixture and scripted-model mode for deterministic release tests, but run the actual Strands orchestration surfaces claimed by the product. Do not create look-alike local abstractions and call them Strands integration. Verify current TypeScript APIs from the installed SDK and official docs.

Continue through failures using the repair protocol in `CLAUDE.md`. Do not weaken tests or update visual baselines blindly. You have authority to make all normal in-repository implementation choices. Ask only when an external credential, account action, destructive operation outside this repository, or genuine contradictory product decision makes progress impossible; otherwise fill in the blanks and keep going.

Run `pnpm verify:release` before declaring completion. Completion requires a green release report, inspected Playwright screenshots, both working demos, a production build, a verified Railway deployment, and `docs/completion-report.md`. Railway deployment is mandatory because its CLI is authenticated. Only AWS/AgentCore deployment may be recorded as externally blocked when AWS credentials or account permissions are absent.

The Railway CLI is already authenticated. You are explicitly authorized and required to create a new Railway project for Pax, deploy the application, attach `/data`, configure variables, generate a public domain, run migrations, run deployed smoke and Playwright verification, restart/redeploy, and prove SQLite plus Runtime Inspector history persist. Do not stop after emitting Railway configuration files, and do not attach Pax to an unrelated existing project.

Start now and keep working until the completion contract is satisfied.

---
