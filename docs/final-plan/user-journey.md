# Car Decision User Journey

Status: discovery notes. The current-state section is grounded in the repository as of 2026-09-01. The target section is a proposal awaiting product decisions.

## Current journey

### Entry

1. The user opens Sift in ChatGPT's browser pane or directly in a browser.
2. Sift shows a launcher with **Compare vehicles** plus two seeded examples.
3. ChatGPT cannot currently create the initial case through the registered WebMCP catalog. Global WebMCP tools can read packs/context; most useful tools are registered only after an active case already exists.

### Real vehicle comparison

1. The user selects **Compare vehicles**.
2. A separate catalog flow asks the user to search/filter, manually shortlist two to five vehicles, and start the comparison.
3. Sift creates a persisted `car-purchase` case and opens the workspace.
4. The workspace immediately exposes a recommendation hero, four view modes, filtering, priorities, questions, findings, references, notes, custom concerns, option management, and developer inspection.
5. The user can ask ChatGPT to read and change the active page through WebMCP, or use visible controls directly.
6. The user can request investigation, but guided investigation for a normal catalog-created case currently fails fast because the car runtime is tied to the seeded example candidates.

### Seeded car demonstration

1. The user selects **Choose our next car**.
2. Sift creates the known fixture case.
3. The user requests investigation.
4. Real Strands Graph/Agent/AgentSkills machinery executes a deterministic scripted trajectory over fixture-backed tools.
5. Runtime events, evidence, readiness, recommendation, and proposal state stream into the page.
6. The human can approve, reject, or request revision when a proposal is pending.

## Current experience problems

- The entry flow is app-first even when the experience is launched from ChatGPT.
- The product begins with vehicle inventory rather than the person's decision, constraints, and uncertainty.
- The normal case path cannot fulfill the central investigation promise demonstrated by the fixture path.
- ChatGPT, Sift, and the Strands runtime do not have a legible division of responsibility in the interface.
- The workspace reveals many capabilities at once without a clear sequence or dominant next action.
- “Ask Sift to look into this” does not preview what will be investigated, why those questions matter, or when human input will be required.
- Agent behavior is either hidden behind generic progress language or exposed as low-level telemetry; the useful middle layer is missing.
- Before, during, blocked, ready, and decided states share too much of the same information architecture.

## Proposed canonical journey

The working recommendation is **conversation-led, shared-canvas-assisted**:

1. **Open Sift and describe the decision.** Sift registers a small global WebMCP bootstrap surface. The pane asks the user to tell ChatGPT what decision they are trying to make; it does not require manual navigation through a product launcher.
2. **Discover and activate the pack.** On the next user turn, ChatGPT discovers Sift's page tools, reads the available decision packs, selects a pack when the match is clear or asks one clarifying question when it is not, and creates a pinned case through WebMCP.
3. **Build the decision brief.** ChatGPT asks only the highest-value questions. Sift visibly maintains budget, must-haves, preferences, household context, and unresolved uncertainties.
4. **Build the shortlist together.** ChatGPT searches Sift's catalog and explains a small candidate set. The app supports recognition, comparison, and direct manipulation; it does not force a separate inventory workflow first.
5. **Review the investigation plan.** Sift converts unresolved decision questions into a human-readable plan: what it will check, which information sources it expects, and what may require the user.
6. **Investigate visibly.** The app shows progress by decision question. ChatGPT reports meaningful changes; the developer view proves which agents, skills, tools, interventions, and state transitions produced them.
7. **Adapt the plan.** A new preference or concern updates criteria, obligations, the run plan, and the exposed capability surface. The page shows the consequence rather than merely accepting another field.
8. **Present a decision, not a dashboard.** Lead with the best-supported choice, decisive reasons, material tradeoffs, confidence, unresolved caveats, and strongest alternative. Deeper comparison and evidence remain available progressively.
9. **Keep authority human.** The person chooses, requests revision, or continues research. ChatGPT and Strands cannot approve the decision.

## Persistent orientation shell

Every active-case view, narrow or expanded, should retain a compact orientation layer above the changing canvas:

- the current decision and active pack;
- the current phase;
- required coverage completed and still missing;
- the material question or action happening now;
- the recommended next step; and
- the visible route to completion.

The body can switch between brief, quick-pick, shortlist, comparison, evidence, investigation, and recommendation views without making the user rediscover where they are. In narrow pane mode this should be a compact header/subheader, not a second dashboard.

## Meaningful direct interaction

Direct interaction should produce information or exercise human authority rather than duplicate conversational navigation. A Quick Pick/Tinder-like view is a strong example: the user rapidly keeps, dismisses, or marks uncertainty on one option or tradeoff at a time, and those actions become explicit preference evidence that ChatGPT can read on the next turn.

Other high-value direct actions are correcting a fact, selecting a comparison focus, opening source evidence, confirming an inferred concern, and approving/rejecting the final decision. Each action must visibly show whether it changed canonical decision state, presentation state, or human-only authority state.

The proposed bootstrap, pack guide, discovery loop, next-move contract, and conversation-versus-canvas rules are specified in [Conversation orchestration](./conversation-orchestration.md).

## Standalone fallback

The direct web application should support the same conceptual journey with guided prompts and visible controls. It does not need to imitate a chat transcript, but it must preserve the same decision brief, shortlist, investigation plan, progress, and result states.

## Product decisions still required

- Confirm that conversation-led ChatGPT use is the canonical pane experience and the standalone app is a complete direct-use mode.
- Confirm which direct pane interactions remain primary: current proposal is selection, correction/input, evidence inspection, and human approval.
- Confirm whether an ambiguous first request should ask one clarifying question before pack activation or display a small pack chooser in the pane as well.
