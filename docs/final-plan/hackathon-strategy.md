# Hackathon Strategy

Status: early positioning notes. Official rules and submission fields remain governed by [`docs/submissions`](../submissions/README.md) and must be refreshed before submission.

## Shared product thesis

Sift is a WebMCP-native adaptive decision experience. It turns a consequential choice into a shared workspace where ChatGPT conducts the conversation, the interface changes with the decision, bounded specialist agents investigate unresolved questions, and the human retains authority.

Most current WebMCP applications give the model typed access to a recognizable existing application. Sift's stronger claim is that WebMCP can change the interaction architecture itself: the user begins with an outcome, conversation conducts the journey, and the browser becomes the shared artifact most useful to the current decision stage.

The car journey is the concrete product proof. The reusable decision engine and Decision Pack system are enabling architecture, not the primary hackathon headline. See [Product Positioning](./product-positioning.md) for the full framing and claim guardrails.

The differentiator is not “AI compares cars.” It is the combination of:

- a typed, stateful application that ChatGPT can read and operate through WebMCP;
- deterministic decision state, evidence, invalidation, and readiness;
- bounded Strands agents that adapt investigative technique;
- visible provenance from user intent through tools and evidence to a recommendation; and
- an explicit human approval boundary.

## WebMCP Challenge pitch

### Core claim

Most WebMCP apps teach a model to operate an existing website. Sift uses WebMCP to make the experience itself adaptive to the outcome the user is trying to achieve.

ChatGPT and the user share control of a real application. ChatGPT does not scrape the UI or maintain a private shadow copy of the decision: it reads typed case context, changes the same canonical state as visible controls, and visibly reconfigures the workspace as the conversation evolves.

### Moments the product must make obvious

- ChatGPT creates or opens the decision experience from the conversation.
- A manual page selection is read correctly by ChatGPT.
- A conversational preference change calls a typed WebMCP tool and visibly changes canonical criteria.
- A presentation request changes only the view, proving the distinction between “show me” and “this matters to me.”
- An unanticipated concern becomes a typed case extension and a new question without changing the pinned pack.
- The new concern changes the investigation plan and capability surface, not merely the displayed columns.
- A WebMCP cause-and-effect view correlates user language, tool call, state diff, invalidation, plan change, and UI result.
- Human approval remains unavailable to WebMCP.

### Main current risks

- no clean ChatGPT-first case-creation lifecycle;
- catalog-created cases cannot run the hero investigation;
- WebMCP behavior is difficult to see without tool-call narration;
- current demo scripts contain staging assumptions from older layouts; and
- dynamic plan/capability adaptation is specified but not implemented.

## AWS / Agents for Humans pitch

### Core claim

Sift uses bounded Strands agents to investigate the right unresolved decision questions, challenge weak evidence, change technique when work stalls, reject premature conclusions, and stop at genuine human judgment boundaries.

### Moments the product must make obvious

- real specialist agents with narrow responsibilities;
- AgentSkills progressive disclosure;
- Graph execution where dependencies are known;
- Swarm handoffs where the next expert depends on findings;
- Context Injector using current canonical state;
- intervention handlers enforcing scope, consequence, budget, retry, evidence quality, and output safety;
- GoalLoop withholding an invalid recommendation;
- session/snapshot restoration if retained in the final scope;
- dynamic per-move run planning and capability resolution; and
- deterministic readiness and human approval outside the model.

### Main current risks

- the live hero engines use deterministic scripted model providers;
- several impressive behaviors exist mechanically but are not intelligible in the interface;
- the full dynamic `RunPlan` loop does not exist;
- the Runtime Inspector lacks Execution, State, Context, and Errors views; and
- AWS deployment/AgentCore claims must remain distinct from local Strands execution unless deployed evidence exists.

## Shared investments with two different edits

The strongest implementation work should serve both submissions:

- conversation-led case creation and a coherent consumer journey;
- general investigation for user-created car cases;
- real `RunPlan` generation, validation, persistence, and revision;
- dynamic capability resolution;
- one correlated telemetry model;
- visual execution and WebMCP cause-and-effect views;
- an evidence-to-decision explanation;
- truthful fixture/live labeling; and
- scenario-backed demo data with reliable reset and recording paths.

### Deadline sequencing decision

Until the WebMCP submission is frozen, the product effort is vehicle-only. Home Energy Guardian remains in the repository and regression suite but receives no dedicated feature or presentation work. It does not appear in the three-minute WebMCP video.

After the WebMCP deadline, the AWS hero is selected by proof: use Vehicle Selection only if its real adaptive RunPlan/Graph/agent/evidence path meets the gate in [Hackathon Scope Triage](./hackathon-scope-triage.md); otherwise retain Home Energy Guardian as the AWS hero because it currently has the deeper implemented Strands Swarm, skills, interventions, GoalLoop, source challenge, and session story. This avoids weakening either submission to force both videos into the same use case.

The videos then emphasize different slices:

- **WebMCP:** shared control, typed state, conversational adaptation, visible page effects, safety boundary.
- **AWS:** agent planning, skills, specialists, tools, steering, validation, evidence quality, human boundary.

## Pitch-development work still needed

For each hackathon, the final plan must produce:

- one-sentence problem and value proposition;
- target user and decision moment;
- three defensible technical differentiators;
- a sub-three/sub-five-minute recording spine that matches the official limit;
- an exact map from each spoken claim to visible proof;
- an honest limitations statement;
- screenshot and architecture-diagram requirements; and
- final README/submission copy that describes shipped behavior only.
