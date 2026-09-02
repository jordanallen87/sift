# Developer and Judge Experience

Status: requirements capture. Detailed interaction and visual design remain open.

## Purpose

The developer experience must answer two different questions without exposing private chain-of-thought:

- **Judge/technical evaluator:** “What advanced behavior is happening, and why is it materially better than a single prompt plus a table?”
- **Developer:** “What ran, what changed, why did it change, and where did a failure originate?”

The same truthful telemetry should support both. The judge view is a clear projection; the developer view is the deep inspection surface.

## Current reality

The Runtime Inspector currently implements Overview, Timeline, and an embedded consumer Activity view. The existing observability specification also calls for Execution, State, Context, and Errors views, but those dedicated views are not implemented.

The runtime already emits useful events for portions of:

- agent/model/tool lifecycle;
- skill activation;
- Graph nodes and Swarm handoffs;
- interventions and GoalLoop validation;
- context injection;
- domain state changes; and
- WebMCP-originated commands.

However, those events do not yet form an immediately legible explanation of the system. A chronological log alone cannot show the relationship between a user statement, WebMCP call, case-state change, new obligation, revised run plan, capability change, evidence, and recommendation.

## Required information architecture

### 1. Learn: “How Sift works”

The developer view should contain a concise, durable explanation of the architecture:

```text
ChatGPT conversation
  -> WebMCP page tools
  -> canonical Sift case state
  -> deterministic obligation/readiness engine
  -> bounded Strands plan and execution
  -> evidence proposals and state transitions
  -> user-visible decision
```

This explanation should identify the responsibility boundary:

- ChatGPT collaborates with the active page.
- WebMCP reads or changes the shared page through typed tools.
- the deterministic core owns canonical state, evidence validity, readiness, and invalidation;
- Strands decides how to investigate inside a bounded capability envelope; and
- only the human can approve a consequential decision.

The repository README should carry the same concise explanation and link to deeper architecture documentation. Help content in the consumer product should use plain language and omit implementation detail unless the user explicitly opens the developer explanation.

### 2. Run map: “What is happening now?”

Provide a visual run representation in addition to the raw log:

- Graph nodes and dependencies for fixed-topology execution;
- Swarm handoffs and reasons for adaptive execution;
- queued, running, completed, redirected, blocked, and failed states;
- duration and evidence delta per node/handoff;
- the active obligation and its relationship to the user's decision question; and
- clear distinction between scripted fixture behavior and live model behavior.

The visual must be derived from persisted runtime events, never separately simulated for the UI.

### 3. Dynamic capability surface: “Why did the strategy change?”

For every run or plan revision, show:

- candidate and activated skills;
- candidate and selected specialists;
- the pack's full declared tool catalog;
- tools exposed for this move;
- tools withheld, grouped by reason (irrelevant, specialist restriction, unavailable, policy denied, budget/consequence boundary);
- the current `RunPlan` and its stop conditions;
- a diff from the previous plan; and
- the case change or evidence event that caused the revision.

This view cannot be implemented truthfully until per-move `RunPlan` creation and dynamic capability resolution exist in the runtime. The UI requirement and runtime requirement must remain one tracked workstream.

### 4. WebMCP cause-and-effect: “What did ChatGPT do to the page?”

Show a correlated sequence such as:

```text
User: “Driving comfort matters more.”
  -> sift_get_case_context
  -> sift_update_criteria
  -> criterion weights changed
  -> evidence/recommendation invalidated
  -> household-fit obligation reopened
  -> next run plan changed
  -> page focused the affected comparison
```

Required details:

- tool name and authority class (read/write/presentation/execution);
- safe normalized input and result;
- command, case, and run correlation;
- canonical state diff versus presentation-only diff;
- UI effect; and
- elapsed time and error state.

This is a central WebMCP showcase: the proof is not merely that ChatGPT called a tool, but that the model and user manipulated one shared, stateful application without bypassing its safety boundaries.

### 5. Decision/evidence map: “Why does Sift believe this?”

Connect criteria and obligations to claims, sources, contradictions, evidence strength, readiness, and recommendation changes. A judge should be able to select a recommendation reason and trace it backward to evidence and execution.

### 6. Deep timeline and export

Retain the chronological event log for debugging, with filtering, structured safe payloads, state diffs, errors, correlation IDs, redactions, and sanitized run export. The timeline is the forensic fallback, not the primary explanation.

## Presentation layers

One event stream should produce three projections:

1. **Consumer progress:** plain-language decision questions and meaningful updates.
2. **Technical showcase:** visual plan, agents, skills, tools, handoffs, WebMCP cause/effect, and evidence flow.
3. **Developer forensics:** complete safe timeline, payloads, diffs, errors, and export.

These projections must never invent separate status or execution data.

## Acceptance direction

A developer-view feature is not complete merely because a component renders. Completion requires:

- a real originating runtime or WebMCP event;
- persisted correlation fields;
- a deterministic projection test;
- a UI test for the relevant state;
- a scenario assertion proving the expected trajectory; and
- a demo beat that can be recorded without narration doing all the explanatory work.

