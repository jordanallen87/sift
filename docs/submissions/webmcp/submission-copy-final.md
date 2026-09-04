# Sift — WebMCP Challenge submission copy (final)

Paste-ready Devpost copy. Rewritten for flow — the original draft was largely
one-sentence paragraphs, which read as a list of assertions rather than an
argument. Every number and behavior below is checked against the recorded
demo; the verification table at the end says how.

**Tagline / header:**

> Decision infrastructure where people and AI agents co-drive one live case, with evidence, uncertainty, and final approval kept human.

---

## Inspiration

A chat window is great for conversation. It is a poor place to hold a living decision.

As a decision gets more complicated, the options, priorities, evidence, tradeoffs, and unanswered questions get buried in an increasingly long conversation. Every new concern produces another answer, but nothing reorganizes around what changed. The person sees messages, the model sees context, and neither has a shared surface where the decision itself can take shape.

We wanted to explore what becomes possible when ChatGPT and a web application can do more than exchange text. What if ChatGPT could turn a conversation into a live, visual workspace, and then keep reshaping that workspace as the person's thinking evolves? That idea became Sift.

Sift creates a dedicated, adaptive workspace for each decision — something closer to an interactive chalkboard than a form or a chatbot. Options become objects that both the person and the model can manipulate, priorities become weighted criteria, evidence attaches to the claims it supports, unknowns stay visible, and comparisons reorganize as the question changes.

WebMCP is what makes the interaction genuinely two-way. Sift exposes the current workspace, evidence, ranking, and available actions to ChatGPT through typed capabilities, and ChatGPT can change the workspace in return: focusing attention, configuring views, adding information, introducing new decision dimensions, and initiating deeper investigation. Those changes flow back into Sift's deterministic analysis and become immediately visible to both sides. The result is not a chatbot bolted onto an application — it is an interaction model where conversation and interface continuously shape one another.

## What it does

Sift is a shared decision workspace for people and AI agents. Our demonstration follows a family comparing vehicles, but the system is domain-generic: each case begins with a versioned **Decision Pack** supplying the initial vocabulary, criteria, evidence requirements, and investigation capabilities, and from there the workspace adapts to the person rather than forcing the person into a fixed form.

Through WebMCP, ChatGPT can:

- Inspect the exact case, options, criteria, evidence, selection, ranking, and workspace state the person is currently looking at.
- Add or update options and populate their structured attributes.
- Add, remove, or reweight the criteria driving the decision.
- Select and focus options, evidence, or unanswered questions.
- Switch between purpose-built views and configure which options and fields appear in a comparison.
- Add notes, submit sources, evaluate evidence, and request deeper investigation.
- Read Sift's own deterministic ranking and criterion-level explanation instead of inventing a separate analysis.
- Define entirely new case-specific attributes that neither the application nor the Decision Pack ever anticipated.

That last capability is the one we most wanted to demonstrate, so the demo turns on it twice. Our buyer has an 18-month-old and a second child due in three months, and partway through the conversation he raises a concern the pack has no field for: whether a rear-facing child seat fits behind the driver without pushing the driver's seat forward. No manufacturer publishes that number, and the interface was never designed to hold it.

ChatGPT turns that sentence into structure. It defines a typed custom attribute, declares which options it applies to, specifies the allowed values, and — critically — supplies an explicit worst-to-best ordering, because Sift will not assume that `["does not fit", "fits", "fits with room to spare"]` is ordered simply because it arrived as an array. It then populates the attribute across all four vehicles, and every applicable option must receive either a real value or an explicit `unknown`. The model cannot leave an empty cell or invent a value to make the comparison look complete. In the demo the Outback comes back "fits with room to spare," the RAV4 "fits with driver seat back," the CX-5 "driver seat must move forward" — and the CR-V comes back explicitly unknown rather than guessed. That unknown then survives into the ranking as reduced evidence coverage instead of being quietly scored as zero.

ChatGPT then adds the new attribute as a weighted criterion and configures the workspace to display it. The decision has gained a dimension while it is already in progress, without a developer changing the application — and Sift's scoring engine incorporates it and recalculates immediately, with no further model call. In the recording the buyer's current pick drops from second of four at 67% to third at 64%, and the Subaru Outback takes the lead. Later in the same session the model repeats the whole pattern for a second concern, in-car software platform, and reconfigures the comparison view to show it.

The ranking is computed deterministically from the criteria and evidence stored in the case, under rules that hold regardless of what the model does:

- Missing information reduces evidence coverage; it is never scored as zero.
- Conflicting evidence stays visibly disputed.
- A hard-constraint violation flags an option but never silently removes it.
- Mixed currencies, incompatible units, free text, and unordered qualitative values are refused rather than coerced into a misleading number.
- Every score can be explained criterion by criterion, and Sift can name the single criterion that actually causes one option to outrank another.
- The ranking the person sees is the same ranking ChatGPT reads and the same one used to validate the recommendation.

Together this forms a continuous loop: the person raises a concern in conversation, ChatGPT turns it into a structured part of the workspace, Sift recomputes the ranking and exposes what changed, ChatGPT reads that new state and decides what still needs investigation, the workspace updates as evidence arrives — and the person keeps the final decision.

Behind the workspace, a Strands Graph coordinates six specialist agents across three stages. Four analysts investigate in parallel, a source challenger examines weak or conflicting evidence, and a decision synthesizer proposes a recommendation, with skills and context activating only when the work requires them.

The model can reshape the workspace and start investigations, but it cannot approve the decision. There is no hidden approval endpoint and no disabled approval tool in the WebMCP catalog — the capability does not exist for ChatGPT at all. The demo shows this directly: asked to approve the purchase, the model reaches for a review tool and the host answers that no such tool is registered. Only the person can close the case.

## How we built it

Sift is a TypeScript monorepo: a React and Vite web application, an Express service, a deterministic domain core, SQLite persistence, and a multi-agent runtime built on the Strands Agents SDK. The web application registers 26 bounded, schema-validated tools through `document.modelContext`.

Those tools are not a parallel automation layer. Actions taken through WebMCP and actions taken through the visible interface run the same command implementation against the same case and produce the same domain events, so a change made in chat appears in the workspace and a change made in the workspace is immediately available to ChatGPT.

We organized the capabilities into complementary forms of control:

- **Shared awareness** — read the active case, options, criteria, ranking, evidence, research, notes, and interaction state.
- **Shared attention** — focus an option, evidence item, or question so the person and the model are looking at the same thing.
- **Workspace configuration** — change views and configure comparisons without changing the underlying criteria.
- **Structured mutation** — add options, attributes, notes, sources, evidence dispositions, and weighted criteria.
- **Dynamic schema extension** — define and populate new case-specific attributes at runtime.
- **Bounded delegation** — request investigation or revision through the supervised Strands runtime.

Every canonical mutation is recorded as an append-only domain event and committed transactionally alongside the latest case snapshot, with server-sent events updating the browser as case state and investigation results change. Mutating tools carry an `expectedSequence`, so a stale write is rejected rather than silently overwriting newer state — the recorded demo contains a real conflict, where the model's write is refused, it re-reads the case, and retries successfully.

The architecture deliberately gives each part of the system one job. WebMCP gives ChatGPT structured access to the live workspace; ChatGPT interprets intent and decides how to adapt it; Sift's deterministic core owns case state, ranking, evidence rules, and readiness; the Strands runtime performs bounded multi-agent investigation; and the person retains authority over consequential decisions.

We also built a Runtime Inspector on real Strands lifecycle events and OpenTelemetry spans, exposing the actual execution tree along with model calls, tool calls, skill activation, context injection, intervention decisions, state changes, measured durations, redactions, and WebMCP provenance. Its Execution view derives the parallel and sequential stages from recorded runtime data rather than drawing a hard-coded architecture diagram — what you see is what that particular investigation actually did.

The WebMCP implementation is tested in Chrome 152 against native `document.modelContext` support and the WebMCP debugging protocol, with automated journeys alternating visible human actions and WebMCP tool calls to verify that both sides stay synchronized.

## Challenges we ran into

The first challenge was designing a genuinely two-way interaction instead of a collection of chatbot shortcuts. Reading page state is only half the problem — ChatGPT also had to change the workspace in ways that were visible, structured, and durable, while changes made through the interface stayed available to the model. That ruled out separate UI and AI implementations and forced a shared command and state model.

The second was making the workspace dynamic without letting the model invent semantics. A model can easily propose qualitative values like "does not fit," "fits," and "fits with room to spare," but Sift cannot assume those are ordered just because they arrived in that order in an array. We required an explicit worst-to-best ordering and strict schema validation before a model-defined attribute is allowed to participate in scoring.

The third was handling incomplete and conflicting evidence honestly. The obvious implementations all distort the decision: treating an unknown as zero, silently excluding it, or letting the model fill the gap with something plausible. Sift instead separates score from evidence coverage, requires a reason for every unknown, preserves disputed measurements, and can identify when a result depends on contested evidence.

The fourth was separating adaptation from authority. ChatGPT needed enough control to configure the interface, change criteria, extend the case schema, add information, and start agent work — without that control becoming final decision-making authority. We enforced the boundary structurally, by leaving approval out of the capability catalog entirely rather than exposing it and refusing.

Observability posed its own problem: we wanted judges and developers to see real agent execution without exposing private notes, prompts, source bodies, or hidden reasoning. The Runtime Inspector records bounded, privacy-aware telemetry — safe summaries, identifiers, metrics, real span relationships, state diffs, provenance, and redaction manifests.

Finally, we had to make a sophisticated adaptive system legible inside a narrow browser pane, useful to an ordinary person while still making the effects of ChatGPT's actions and the underlying agent work visible.

## Accomplishments that we're proud of

We are most proud that Sift demonstrates WebMCP as more than a way for ChatGPT to press buttons that already exist. ChatGPT can change both the contents and the structure of the workspace: it can take a concern expressed in ordinary conversation, turn it into a typed comparison dimension, populate it across every option, add it to the scoring model, and configure the interface to show its effect. That is a capability the application did not have to anticipate when it was designed.

We are also proud that the person and ChatGPT operate on the same live, durable case, with actions flowing in both directions between conversation and interface. Custom attributes can be created and populated at runtime, and model-created qualitative dimensions can safely participate in deterministic scoring. The model reads the same ranking the person sees instead of inventing a second one, and changing a criterion reorders the workspace immediately without another model call.

Beyond that, a WebMCP change can invalidate an existing recommendation and redirect a real multi-agent investigation. Unknowns, disputes, and unmeasured criteria stay visible instead of being smoothed over — Sift will openly disagree with its own model-generated recommendation and lower its measured confidence. Final approval remains structurally human-only, and the Runtime Inspector connects a WebMCP request to the specialists, skills, tools, interventions, spans, and state changes that followed. The result is a running, responsive product rather than a collection of isolated technical demonstrations.

## What we learned

WebMCP is most interesting when it is treated as a two-way interaction layer rather than an automation API. A traditional website presents a fixed interface to a person; a traditional chatbot presents a stream of text generated from context. Combining ChatGPT with WebMCP lets those two forms strengthen one another: conversation gives the person a flexible way to express intent, introduce concerns, and redirect the work, while the workspace gives that conversation durable structure — visible options, editable criteria, inspectable evidence, explicit unknowns, and a ranking that can be checked. ChatGPT continuously reshapes that structure, Sift continuously exposes the consequences, and neither side has to reconstruct what the other is doing from screenshots, DOM text, or repeated explanation.

We also learned that the strongest agent systems do not ask the model to own everything; they give each part of the system a clear role. The model is excellent at understanding intent, translating conversation into structure, and adapting the workflow. Deterministic software is better at maintaining canonical state, enforcing invariants, calculating rankings, and preserving authority. Specialist agents are useful for bounded investigation. People remain responsible for judgment and consequential decisions.

Uncertainty, finally, has to be modeled as real state. `Unknown`, `disputed`, and `not comparable` are not errors to hide — in an important decision they may be the most valuable things the system can tell you. And shared state turns out to be worth more than another generated answer: when the person, ChatGPT, the workspace, and the specialist agents all operate on the same durable case, the conversation changes the work instead of merely describing it.

## What's next for Sift

The vehicle case is one demonstration of a much broader interaction model. Next we want to make Decision Packs easier to author and distribute, so Sift can generate specialized workspaces for purchasing, operations, energy, healthcare navigation, vendor selection, hiring, planning, and other evidence-heavy decisions.

We also plan to expand:

- Pack-authoring and validation tools for defining new decision domains.
- Reusable WebMCP patterns for shared awareness, shared attention, dynamic schema extension, and bounded delegation.
- More workspace components that ChatGPT can select and configure around the current decision.
- Collaborative cases involving multiple people and assistants.
- Additional evidence connectors and live data sources.
- Richer sensitivity analysis showing which preference or missing fact could change the outcome.
- Portable, privacy-safe execution maps for explaining agent activity across runtimes.
- Stronger production deployment, tracing, and evaluation integrations.

Our larger goal is to make Sift a dependable workspace for decisions that are too dynamic for a fixed form, too consequential for an untraceable model answer, and too important to remove the person from.

---

# Verification notes (not for submission)

## What changed from the draft

| Change | Why |
| --- | --- |
| One-sentence paragraphs merged into 3–5 sentence paragraphs | The draft read as a list of assertions; the argument now carries between sentences. Bulleted capability lists were kept — they are genuinely scannable. |
| The child-seat example moved from hypothetical ("Suppose the user mentions…") to what the demo actually does | It is the demo. Framing it as a supposition undersold it and would not match the video a judge watches next. |
| Added the measured re-rank: #2 of 4 at 67% → #3 of 4 at 64%, Outback takes the lead | Concrete and on screen. |
| Added the second custom attribute (in-car software platform) | The demo does the pattern twice; the draft implied once. |
| Added the `expectedSequence` conflict / re-read / retry | Visible in the recording and in the tool log — strong evidence the tools are real. |
| Added "six specialists **across three stages**" | Matches the Execution view in the video exactly. |
| Approval section now states what the demo shows: the model reaches for a review tool and the host reports none is registered | Turns a claim into an observation. |
| "a **deployed**, responsive product" → "a **running**, responsive product" | Railway has not been redeployed since the last day of work, so the public URL is behind the branch the video was recorded from. Redeploy before submitting if you want "deployed" back. |

## Claims checked against the recording

| Claim | Evidence |
| --- | --- |
| 26 bounded, schema-validated tools via `document.modelContext` | `sift_get_tools` returned 26 names (`artifacts/demo/model-driven-tool-log.jsonl`) |
| Six specialists, four analysts in parallel, three stages | Runtime Inspector → Execution: "6 nodes · 3 stages", "4 IN PARALLEL" |
| Approval is absent, not disabled | `sift_review_proposal` → `not registered with the host`, on screen |
| The model reads Sift's ranking rather than inventing one | `sift_explain_ranking` immediately precedes the model's answer |
| Two model-defined attributes with worst-to-best ordering | `custom.rear_facing_seat_behind_driver`, then `custom.infotainment_platform` |
| The four per-vehicle values, incl. one honest unknown | Outback "Fits with room to spare"; RAV4 "Fits with driver seat back"; CX-5 "Driver seat must move forward"; CR-V `status: "unknown"`, no value. Note the persisted record stores no reason string — do not claim a "reasoned" unknown. |
| Sift flags disputed evidence | Outback carries `disputedCriterionIds: ["pref.safety_reliability"]`, `reason: "conflicted"` on `car.reliability_rating` |
| A criterion change reorders with no further model call | RAV4 #2 of 4 @ 67% → #3 of 4 @ 64% |
| Optimistic concurrency is real | Genuine `expectedSequence` conflict, re-read, retry in the log |
| Tested in Chrome 152 with native WebMCP | Chrome 152 + `--enable-features=WebMCP,WebMCPTesting,DevToolsWebMCPSupport` |

## Demo video

`artifacts/demo/sift-webmcp-demo-FINAL.mp4` — 2:53, 1920×1080.

Recorded against the real local build in Chrome 152. Every tool call was issued by a model reading live page state and deciding what to call next. The left pane is the real page under CDP screencast, which is why there is no cursor — nothing is clicked. The take is compressed to the narration's length per beat, dropping the dead air where the model was deliberating; no frame is fabricated and nothing is reordered.

One thing a judge may notice: at the approval beat the left pane already reads "Your decision: APPROVED" while the narration says a human just closed this. That is consistent — the human approved earlier in the session, and the narration is past tense — but it is a static badge rather than a live reveal.
