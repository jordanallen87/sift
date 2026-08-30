# Why Sift Instead of a Direct Model Answer

## Direct answer

An LLM can often produce a useful first answer to either demo question. That is not the problem Sift claims to solve.

Sift is valuable when the answer must remain correct enough to revisit, challenge, update, and act on after the initial conversation. It turns probabilistic model work into a durable, inspectable decision process with explicit completion rules and human authority.

## Capability boundary

| A direct model interaction can | Sift adds |
| --- | --- |
| Generate a plausible recommendation | Deterministic obligations that define what must be known before a recommendation is ready |
| Search or call tools in one run | A bounded investigation that changes skills and specialists when progress stalls |
| Cite sources in prose | Typed claims linked to durable sources, evidence levels, conflicts, and staleness |
| Remember some conversational context | Versioned case state, event history, sessions, snapshots, pause, reload, and resume |
| Ask for clarification | Explicit `Confirm`, `Guide`, and `Deny` boundaries tied to consequence and authority |
| Produce another answer after a correction | Dependency invalidation that reopens affected obligations and recomputes only what became stale |
| Interact with a web page through generic browsing | Purpose-built WebMCP tools operating on the user's current case and visual selection |
| Sound confident | Fail-closed readiness and output validation that can withhold unsupported conclusions |
| Consider a new preference in prose | Typed case extensions that preserve the concern, evidence question, origin, uncertainty, and downstream invalidation |
| Describe progress after finishing | Truthful real-time specialist, skill, tool, evidence, steering, and readiness events while work is happening |
| Recreate a domain prompt | Versioned Decision Packs with compiler, capability allowlists, conformance tests, and human publication |

The moat is not a claim that Sift has a smarter base model. It is the supervisory system around models: durable state, adaptive capability selection, evidence governance, deterministic convergence, visible intervention, and shared human control.

## Required observable proof

The product must demonstrate the distinction rather than explain it in marketing copy.

### Premature-conclusion sequence

At least one deterministic scenario causes the model to produce a plausible conclusion before all required obligations are satisfied.

1. The model proposes a conclusion.
2. GoalLoop output validation or the deterministic readiness gate rejects it with specific missing requirements.
3. The activity ledger displays `Draft withheld` and the missing questions without exposing private chain-of-thought.
4. The Strands runtime changes technique, skill, or specialist.
5. New source-linked evidence resolves or explicitly records uncertainty for the missing requirements.
6. A later recommendation passes validation.
7. A human remains responsible for the consequential approval.

Required visible copy:

```text
Draft withheld
This answer is plausible, but 3 required questions are still unresolved.
Sift is continuing the investigation before asking you to decide.
```

### Counterfactual update sequence

The user excludes evidence or changes a decision criterion. Sift must identify the affected claims, obligations, option scores, and recommendation; mark them stale; and recompute them. It must not simply prompt a model to "answer again."

Car-buying proof:

```text
Dealer teaser-price claim challenged
    ↓
Out-the-door cost became stale
    ↓
Deal-normalization obligation reopened
    ↓
Option scores and recommendation invalidated
    ↓
Only affected comparisons rerun
```

If the household later prioritizes driving comfort, Sift records that comfort is unresolved and creates a test-drive question instead of inventing a score.

### Unanticipated-concern sequence

The car pack does not predeclare every household concern. When the user adds a two-dog-crate requirement, Sift creates a typed `custom.dog_crate_fit` definition and criterion, derives a case-specific evidence question, and targets household-fit capabilities. Known dimensions may be recorded as sourced facts; actual fit remains unknown until measurement or a test drive. The compiled pack ID/version/hash does not change.

This is the intended meaning of adaptable: the model can reshape the case-specific run plan and extend typed case data without rewriting the safety, evidence, capability, or authority contract.

### Persistence sequence

The runtime pauses at a human confirmation, persists the case and Strands snapshot, restarts, restores, and continues without losing evidence or granting itself approval.

### Model-controlled presentation sequence

**Status: implemented at the application layer; not yet proven as one end-to-end demo take.** `WorkspaceViewState`'s durable write path (the `setView` command, routed through `updateSelection()`) exists, the four option views exist and are wired into the live page, and every PRESENTATION-class WebMCP tool in the catalog durably persists through it — no tool holds view state only in browser-session memory (see `webmcp.md` for the current, exact tool list and each tool's contract). What remains is proving the full narrative below as one continuous, camera-ready sequence against the real build. It is recorded here because it is a materially stronger WebMCP proof than "ChatGPT changed a criterion," per change-set §57: showing only a mutation understates what a genuine two-way, shared-workspace integration can do.

The required narrative: ChatGPT pulls real structured case state out of Sift (not only pushing mutations into it) — implemented, via the widened case context; the user selects an option on the page and ChatGPT correctly understands "this one" through shared focus — implemented, via `focusOption`; the user asks ChatGPT to show only the finalists and only what matters most, and the visible view/rows/options reconfigure without click automation, while the underlying decision criteria remain unchanged (`product.md`'s "Workspace views", `webmcp.md`'s PRESENTATION tools) — implemented at the view-component and tool-catalog level; the user introduces a comparison factor the product never anticipated, and ChatGPT creates a typed custom field for it — implemented; ChatGPT researches and populates that field across options, while an unsupported subjective value stays honestly unknown rather than becoming a fabricated inference — implemented; the research becomes a durable, source-linked part of the case rather than disappearing at the end of the conversation — implemented, since `submitSource` now persists claims as durable `Claim` records; and the model still cannot approve the final decision — implemented and test-guarded. Change-set §58 and §59 name the two strongest individual moments inside this sequence: the model reconfiguring the comparison table, and shared focus surviving a Quick Pick walkthrough. Neither has yet been rehearsed or recorded as an actual demo take.

## Competition-specific expression

### WebMCP submission

The car-buying demo proves that the current candidate selection and visible application state are meaningful agent context. ChatGPT invokes structured page tools that reuse the same commands as the human controls, and the right-pane comparison changes in place. Sift is a generic AI-assisted decision workspace; the car-purchase Decision Pack is its first polished shopping/comparison implementation, not a car-specific product (change-set, Purpose). The strongest version of this proof, once "Model-controlled presentation sequence" above is implemented, goes beyond a single mutation: shared selection, model-controlled presentation, dynamic schema extension, and durable research together, still bounded by human-only final approval.

### AWS submission

The Energy demo proves that a background Strands system can work quietly across multiple techniques, redirect itself when progress stalls, validate its own artifact, persist through interruption, and surface only a bounded decision.

## Claims Sift must not make

- Sift does not make the underlying model infallible.
- Sift does not prove that its recommendation is professional advice.
- A readiness score is evidence coverage under a Decision Pack plus confirmed case-specific questions, not objective truth.
- Steering is a supervised trajectory control, not access to hidden reasoning.
- Fixture-backed demo evidence proves application behavior, not real-world automotive or energy expertise.
