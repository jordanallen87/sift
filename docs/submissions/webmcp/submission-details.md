# The WebMCP Challenge — Sift Submission Details

Status: local preparation packet; nothing has been sent to Devpost.  
Official data source: authenticated Devpost MCP responses fetched 2026-08-27 UTC.  
Official pages: [challenge](https://webmcp.devpost.com/) · [rules](https://webmcp.devpost.com/rules) · [OpenAI overview](https://openai.com/webmcp-challenge/)

Release gate: complete the [shared release checklist](../shared-release-checklist.md) and the [exhaustive WebMCP requirements checklist](./requirements-checklist.md). The shorter checklist at the end of this packet is only a summary.

## Event snapshot

- Status at fetch: submissions open.
- Submission window opened: August 25, 2026 at 12:00 p.m. PT.
- Submission deadline: September 3, 2026 at 1:00 p.m. PT / 4:00 p.m. ET (`2026-09-03T20:00:00Z`).
- Judging: September 4 through September 21, 2026.
- Winners scheduled: September 23, 2026; organizer notes that timing may change with submission volume.
- No public-voting period was returned.

## Eligibility snapshot

The Devpost eligibility response states:

> Above legal age of majority in country of residence

> Specific countries/territories excluded: Belarus, Brazil, China, Crimea, Cuba, Donetsk People’s Republic, Hong Kong, Iran Islamic Republic of, Korea Democratic People's Republic of, Luhansk People’s Republic, Quebec, Russia, Syrian Arab Republic, Venezuela

It also reports all occupations allowed, no company requirement, and no required team. Verify every team member against the full official rules before submission.

## What must be built and submitted

The official brief asks for a WebMCP-powered web application that explores a web where people and agents interact, collaborate, and create together.

Required deliverables:

- A working live URL accessible in ChatGPT's in-app browser or Google Chrome with WebMCP enabled.
- A text description explaining why the use case fits WebMCP, how it improves the experience, what people and agents can do together that was difficult before, and how WebMCP was implemented.
- A public YouTube demo video under three minutes. It must show the product working and include audio explaining the product and WebMCP use.
- A public GitHub, GitLab, or Bitbucket repository.
- Complete source, assets, setup instructions, and an open-source license visible at the top of the repository page.
- A working `document.modelContext.registerTool(...)` implementation visible in the repository.

The organizer's final checklist says to show the project working in the first 15 seconds, remove setup/loading/dead time, verify the repository in an incognito window, and test the WebMCP tools in ChatGPT's in-app browser or compatible Chrome.

## Current official form fields

| ID | Field | Required | Sift answer/status |
| --- | --- | --- | --- |
| `28249` | Submitter Type | Yes | Participant must select Individual, Team of Individuals, or Organization. |
| `28250` | Country of residence for submitter and team | Yes | Participant must select the truthful country or countries. |
| `28251` | Organization name | No | Complete only if submitting for an organization. |
| `28252` | App Status | Yes | Expected answer: `New`; confirm against the final repository history. |
| `28253` | Existing-app changes during submission period | Conditional | Not applicable if `New`; otherwise document only WebMCP work completed during the official period. |
| `28254` | Judge-accessible live URL | Yes | `https://sift-hackathon-production.up.railway.app` — the verified Railway URL. |
| `28255` | Testing instructions or credentials | No | Provide concise ChatGPT/Chrome steps even when authentication is unnecessary. |
| `28256` | Public repository URL | Yes | `https://github.com/jordanallen87/sift` — confirmed public with a visible MIT license (`gh repo view jordanallen87/sift --json visibility,licenseInfo`: `"visibility":"PUBLIC"`, `"licenseInfo":{"key":"mit"}`). |
| `28257` | Agents or clients used to test WebMCP | Yes | Record only completed tests; target ChatGPT in-app browser and Chrome 149+ with WebMCP enabled. |
| `28258` | AI tools used while building | Yes | Expected: Claude Code, Codex, and the actual model/runtime tools used; verify final list. |
| `28259` | Learning level | Yes | Participant chooses None, Moderate, or Significant. |
| `28260` | Career-reusable AI value | Yes | Participant chooses Yes or No. |

Global Devpost project fields also require a title, tagline, description, built-with list, and public video URL even when they are not repeated in the custom-field response.

## Official judging criteria

| Criterion | Official description | Sift proof to foreground |
| --- | --- | --- |
| WebMCP Leverage | How thoroughly and skillfully does the project use WebMCP? Does the code reflect genuine effort and a working, non-trivial implementation? | Current page selection, shared UI/tool commands, typed custom concern, source intake, active-run correlation, and a visible Strands replan caused by a WebMCP command. |
| Execution | Does the project deliver a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept? | Public Railway deployment, polished right-pane UI, deterministic release suite, replay/reconnect, and tested live WebMCP registration. |
| Potential Impact | Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated? | A household actively comparing real car candidates and dealer offers, with honest test-drive unknowns and human shortlist authority. |
| Creativity & Ambition | How creative and novel is the concept and does the project differ from existing concepts? | WebMCP is a live steering channel into a separate supervised multi-agent system, not a collection of CRUD shortcuts. |

## Prize snapshot

The official Devpost response lists ten winning submissions. Each winner's package includes:

- $3,000 USD from OpenAI plus $500 cash from Netlify;
- one Codex Micro;
- OpenAI swag and one year of ChatGPT Pro for up to three team members;
- Cloudflare, Vercel/Gateway, and Render credits;
- Shopify gear;
- Google AI Ultra subscriptions for team members under the stated sponsor terms.

The Devpost prize record reports a $35,000 aggregate cash value across ten winners. Sponsor credits and non-cash benefits are additional; the official rules control eligibility and fulfillment.

## Recommended Sift positioning

### Title

Sift

### One-line summary

Sift turns a WebMCP-enabled decision workspace into a shared control surface where a person and ChatGPT can redirect a supervised multi-agent investigation without losing evidence, continuity, or human authority.

### Problem

Important everyday comparisons do not fail because a model cannot produce an answer. They fail because assumptions change, evidence conflicts, subjective unknowns get fabricated, and nobody can see which conclusions became stale.

### Solution

In Choose Our Next Car, the user and ChatGPT work against the same live case. ChatGPT reads the selected vehicle, adds or reweights a household concern through structured WebMCP tools, and requests bounded investigation. Sift converts that change into typed case state and evidence obligations. A Strands Graph switches focus and skills, challenges weak sources, recomputes only affected conclusions, and streams every meaningful transition into the right pane. The user alone approves the shortlist.

Crucially, the ranking itself is computed by Sift, not narrated by the model. A reweight through WebMCP re-orders the options deterministically and immediately, and every position is explainable line by line — what each criterion contributed, which way it was scored, and what could not be scored at all. When the model's own favorite is not the option the criteria put first, Sift says so and caps its confidence rather than quietly overriding the model or quietly agreeing with it.

### Why WebMCP is essential

Without WebMCP, ChatGPT would have to infer page state, ask the user to repeat selected candidates, or manipulate visual controls indirectly. With WebMCP, the page exposes explicit shared attention, typed mutations, source submission, run receipts, and current case context. A spoken preference can therefore redirect an already-running backend investigation and remain visibly synchronized with the page.

### Distinguishing claim

Most WebMCP examples let an agent operate a website. Sift lets a website mediate collaboration among a human, ChatGPT, and a separate supervised agent team — and keeps the analysis on the website's side of that boundary. The model changes what matters; Sift decides what follows, and can be checked.

## About the project — paste-ready Devpost copy

### Inspiration

AI assistants can generate impressive answers, but important decisions rarely fail because someone could not generate another answer. They fail because the relevant state is scattered across conversations, browser tabs, evidence, assumptions, and tools. Preferences change. Sources conflict. Unknowns quietly become guesses. The assistant and the user often end up working from different versions of the problem.

We wanted to explore a more ambitious use of WebMCP:

**What if an AI assistant could participate directly in a structured decision environment — not by scraping the interface, but by sharing the application's live state and capabilities with the person using it?**

That idea became Sift: decision infrastructure for human–AI teams.

Instead of placing a chatbot beside a static application, Sift gives a WebMCP-capable assistant a typed interface to the decision itself. The person and assistant can inspect the same case, focus the same option, configure the same workspace, change what the decision measures, and initiate deeper investigation. Sift preserves the evidence, uncertainty, provenance, and authority boundaries around everything they do together.

### What it does

Sift is a shared, live environment for decisions made by people and AI agents together.

Our demonstration follows a family comparing vehicles, but the underlying system is domain-generic. Each decision begins with a versioned Decision Pack that defines its starting criteria, evidence requirements, capabilities, and investigation strategy. The case can then evolve beyond what its original pack anticipated.

Through WebMCP, an assistant can:

- Read the exact case, options, criteria, evidence, selection, and workspace state the person currently sees.
- Drive the interface by changing views, focusing options or evidence, and configuring comparisons.
- Add or reweight decision criteria through typed operations.
- Define an entirely new comparison dimension during the conversation.
- Populate that dimension across the available options using sourced values or explicit, reasoned unknowns.
- Request a bounded investigation when new information makes the current recommendation stale.
- Read Sift's own ranking and explanation instead of inventing a second analysis.

That last capability is central to Sift. The model does not calculate the official ranking. A deterministic scoring engine evaluates the evidence against the case's weighted criteria and updates the visible workspace immediately.

The engine never turns missing information into a zero, silently removes an option for violating a constraint, or pretends incomparable values can be ranked. It tracks evidence coverage separately from score, preserves disputed measurements, and can identify which criterion is actually responsible for changing the leader.

This creates a powerful WebMCP interaction: the assistant can introduce a concern that did not exist when the application was designed, add it to the live decision model, and cause the workspace to reorganize and re-rank itself around that concern.

Behind the workspace, a Strands Graph coordinates six specialists. Four analysts investigate in parallel, a source challenger examines weak or conflicting evidence, and a decision synthesizer proposes a recommendation. Skills and context are activated only when needed, and consequential actions encounter explicit intervention boundaries.

The assistant can participate deeply, but it cannot approve the final decision. There is no hidden approval endpoint and no disabled approval tool in the WebMCP catalog. The capability simply does not exist for the model. Only the person can close the case.

### How we built it

Sift is a TypeScript monorepo with a React and Vite web application, an Express service, a deterministic domain core, SQLite persistence, and a Strands Agents SDK runtime.

The application registers 26 bounded, schema-validated tools through `document.modelContext`. These are not separate automation shortcuts: WebMCP calls and visible interface controls use the same command implementation and mutate the same canonical case state.

Every mutation is recorded as an append-only domain event and committed transactionally alongside the latest case snapshot. Server-sent events keep the browser synchronized as the case or an investigation changes.

The architecture deliberately separates responsibilities:

- WebMCP gives the assistant structured access to the live environment.
- The assistant interprets intent and chooses which capabilities to invoke.
- Sift's deterministic core owns case state, ranking, evidence rules, and readiness.
- The Strands runtime performs bounded multi-agent investigation.
- The person retains authority over consequential decisions.

We also built a Runtime Inspector from real Strands lifecycle events and OpenTelemetry spans. It exposes the actual execution tree together with model calls, tool calls, skill activation, context injection, intervention decisions, state changes, measured durations, redactions, and WebMCP provenance. Its Execution view derives parallel and sequential stages from recorded runtime data rather than displaying a hard-coded architecture diagram.

The WebMCP implementation has been tested in Chrome 152 using its native `document.modelContext` support and WebMCP debugging protocol. Automated journeys alternate between visible human actions and WebMCP tool calls to verify that both sides remain synchronized.

### Challenges we ran into

The hardest challenge was allowing the assistant to do something genuinely powerful without quietly giving it authority it should not have.

We had to distinguish between configuring how information is presented, changing what the decision measures, proposing new work, and making the final decision. Those operations may look similar in an interface, but they require very different contracts and authority boundaries.

Dynamic criteria created another difficult problem. An assistant can easily invent a qualitative scale such as "does not fit," "fits," and "fits with room to spare." Sift cannot safely assume those values are ordered just because they arrived in an array. We added explicit worst-to-best ordering and strict validation so model-defined dimensions can participate in scoring without the engine guessing their meaning.

Missing and conflicting evidence were equally challenging. The obvious scoring implementation treats an unknown as zero or excludes it without explanation. Both distort the result. Sift instead calculates score and evidence coverage separately, preserves disputed values, and explains when the ranking depends on contested evidence.

Observability also required care. We wanted judges and developers to see the real agent execution without exposing prompts, private notes, or hidden reasoning. The Runtime Inspector therefore records bounded, privacy-aware telemetry: safe summaries, identifiers, metrics, real span relationships, state diffs, and redaction manifests rather than raw private context.

Finally, we had to make all of this understandable inside a narrow browser pane. The product needed to feel like a coherent decision workspace rather than a debugging console, while still making the assistant's actions and the system's response visible.

### Accomplishments that we're proud of

We are most proud that Sift demonstrates WebMCP as more than a way to automate existing buttons.

The assistant can change the structure of the environment itself. It can introduce a decision dimension the original application did not anticipate, populate it responsibly, connect it to the scoring model, and watch the workspace adapt around it.

We are also proud that:

- The model reads the same deterministic ranking the person sees.
- A WebMCP change can invalidate an existing recommendation and redirect a real multi-agent investigation.
- Unknowns, disputes, and unmeasured criteria remain visible instead of being smoothed over.
- Sift can openly disagree with its model-generated recommendation and lower its measured confidence.
- Final approval is structurally human-only.
- The Runtime Inspector connects a WebMCP-originated request to the actual specialists, skills, tools, interventions, spans, and state changes that followed.
- The result is a deployed, responsive product rather than a collection of isolated technical demonstrations.

### What we learned

WebMCP changes the role of a web application.

A traditional page primarily presents information to a person. A WebMCP-enabled page can also become a structured operating environment that tells an assistant what exists, what can change, what requires evidence, and what is outside the assistant's authority.

We learned that the most compelling agent experiences do not ask the model to own everything. They assign each part of the system a clear role. The model is excellent at understanding intent and adapting the workflow. Deterministic software is better at maintaining state, enforcing invariants, calculating rankings, and preserving authority.

We also learned that uncertainty must be modeled as real state. "Unknown," "disputed," and "not comparable" are not error conditions to hide. In consequential decisions, they are often the most important information in the workspace.

Most importantly, we learned that shared state is more valuable than another conversational answer. When the person, assistant, application, and specialist agents all work from the same durable case, the conversation can actually change the work instead of merely describing it.

### What's next for Sift

The vehicle case is only the first demonstration of the underlying decision environment.

Next, we want to make Decision Packs easier to create and distribute so Sift can support decisions across purchasing, operations, energy, healthcare navigation, vendor selection, and other evidence-heavy domains.

We also plan to expand:

- Pack-authoring and validation tools for defining new decision domains.
- Reusable WebMCP patterns for shared attention, dynamic schema extension, and bounded delegation.
- Collaborative cases involving multiple people and assistants.
- Additional evidence connectors and live data sources.
- Richer sensitivity analysis showing exactly which new fact or preference could change an outcome.
- Portable, privacy-safe execution maps that can explain agent activity across different runtimes.
- Stronger deployment and observability integrations for production agent systems.

Our larger goal is to make Sift a dependable environment for decisions that are too dynamic for a fixed form, too consequential for an untraceable model answer, and too important to remove the person from.

## Required hero demonstration

The under-three-minute video should put the best material first:

1. **0:00–0:15 — working product immediately.** Show the narrow right-pane case with a selected vehicle and active investigation.
2. **0:15–0:35 — shared attention.** Ask ChatGPT what would have to be true for the selected RAV4 to win; show `sift_get_case_context` read the exact selection, then `sift_request_investigation` fire in the same breath so Beat 4's active Strands investigation has a real cause on screen.
3. **0:35–1:05 — unanticipated concern.** Say that driving comfort is now non-negotiable and two dog crates must fit. Show WebMCP define/reweight the concern and the page add `custom.dog_crate_fit` plus an evidence question.
4. **1:05–1:35 — cross-agent steering.** Show the active Strands trajectory redirect, `household-fit` activate, source challenge occur, and prior recommendation become stale.
5. **1:35–2:05 — honest adaptation, and the ranking moves.** Show sourced cargo dimensions, explicit unknown comfort/crate fit, and test-drive questions — then the deterministic re-rank. The strongest ten seconds available: state that the reweight re-ordered the options with no model call, that the leader's own coverage figure shows how much of the household's stated priorities is still unmeasured, and that Sift flags where its scoring disagrees with the model's recommendation instead of hiding it.
6. **2:05–2:30 — human boundary.** Show that ChatGPT can request revision but cannot approve; approve the shortlist in the visible UI.
7. **2:30–2:50 — proof.** Open one correlated Runtime Inspector event and briefly show the green release evidence.
8. **2:50–3:00 — close.** State the distinguishing claim above and end on the working case.

## Testing instructions draft

1. Open the public URL in ChatGPT's in-app browser. A compatible Chrome build with WebMCP enabled is the fallback.
2. Launch **Choose Our Next Car**.
3. Select a candidate and call `sift_get_case_context`; verify `selectedOptionId` matches the page.
4. Call `sift_define_case_attribute` and `sift_update_criteria`; verify the new concern, case obligation, and unchanged pack hash appear.
5. Call `sift_request_investigation`; observe ordered queued, specialist, skill, tool, evidence, steering, and completion events.
6. Refresh or interrupt the connection; verify state and event replay recover.
7. Confirm no WebMCP approval tool exists and final shortlist approval is available only in the page.

Replace this draft with the exact deployed URL, browser versions, and observed results after live verification.

## Built-with draft

- WebMCP / `document.modelContext`
- TypeScript
- React
- Vite
- Tailwind CSS
- Express
- Zod
- Strands Agents SDK for TypeScript
- Amazon Bedrock
- SQLite / better-sqlite3 / Drizzle
- Playwright
- Docker
- Railway
- Amazon Bedrock AgentCore, only if actually deployed

**OpenTelemetry is now part of this list (2026-09-04).** The Strands SDK already creates OTEL spans on every Graph/Swarm/agent/model/tool call; Sift now registers a real `NodeTracerProvider` (via the SDK's own `setupTracer({ provider })`) and records each span into `runtime_events` with its real `span_id`/`parent_span_id` and span-measured duration, so the Runtime Inspector can render the true execution tree — `apps/agent/src/runtime/otel-span-recorder.ts`, proven end to end in `otel-span-recorder.test.ts`. Alongside it, the lifecycle-hook correlation described below is unchanged and still real: `BeforeToolCallEvent`, `AfterToolCallEvent`, `BeforeModelCallEvent`, `AfterModelCallEvent` on every agent, plus `BeforeNodeCallEvent`/`NodeResultEvent` on the Graph and Swarm and `MultiAgentHandoffEvent` on the Swarm, normalized in `apps/agent/src/runtime/event-normalizer.ts` and keyed by a Sift-minted `traceId`. What is still *not* claimed: `setupMeter()`/OTEL metrics, and W3C `traceparent` propagation to a tracing backend. See `claim-evidence-matrix.md` row E8.

## Final checklist

- [ ] Confirm registration and eligibility in Devpost.
- [ ] Confirm `New` versus `Existing` truthfully.
- [ ] Add the public repository URL and visible MIT license (already true: `https://github.com/jordanallen87/sift` is public with an MIT license — just paste the URL into field `28256`).
- [ ] Add the verified Railway URL.
- [ ] Test every registered tool in ChatGPT's in-app browser.
- [ ] Test the supported Chrome configuration and record its exact version/flag.
- [ ] Record the exact AI tools used and the participant's learning answers.
- [ ] Record a public YouTube video under three minutes with audio.
- [ ] Show working product in the first 15 seconds.
- [ ] Verify the live URL and repository from an incognito window.
- [ ] Run `pnpm verify:release` and link the report from the README.
- [ ] Submit before September 3 at 1:00 p.m. PT.
- [ ] Freeze the submitted repository, live deployment, form, and video during judging.
