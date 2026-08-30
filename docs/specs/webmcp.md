# WebMCP Contract Specification

Official implementation references:

- [WebMCP repository and explainer](https://github.com/webmachinelearning/webmcp)
- [Current specification source](https://github.com/webmachinelearning/webmcp/blob/main/index.bs)

## Role of WebMCP

Sift is a normal browser application first. It registers structured tools with `document.modelContext` so ChatGPT's in-app browser agent can operate the active page directly. Tool callbacks reuse client commands and update the same case state rendered to the user.

WebMCP complements the Strands backend. WebMCP represents page interaction; Strands performs adaptive case work.

Every tool in this catalog operates identically on a demo case (`startDemo`) and a normal, user-built case (`startCase` + `upsertOption`, docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md) — none of them branch on how the case was created. This is a structural consequence of the registration lifecycle below (tools re-register against whatever the active case snapshot currently is) rather than special-cased logic; `sift_get_case_context` in particular is exactly as useful describing a shortlist a person just built from the vehicle catalog as it is describing the deterministic example case. The one exception is `sift_request_investigation` against a catalog-built `car-purchase` case: the tool call itself still succeeds (the run is durably accepted and a `RunReceipt` returned, exactly as usual), but the run then fails quickly and honestly rather than executing guided investigation, since the deterministic Strands engine behind that pack currently only knows how to investigate the checked-in example case's four candidates (ADR 0003 §4). ChatGPT and the page both observe this the normal way any run failure is observed — a `run.failed` activity event with a clear, human-readable explanation, and `sift_get_case_context`'s active-run correlation reflecting the failed status — not a distinct WebMCP error shape. Every other tool remains fully functional on a catalog-built case.

## Browser adapter

All browser-specific access is isolated behind:

```ts
interface ModelContextAdapter {
  supported(): boolean
  registerTool(definition: WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<void>
}
```

Production uses `document.modelContext`. Tests inject an in-memory adapter that captures registrations and executes callbacks with schema validation.

When WebMCP is unavailable, the website remains fully usable through visible controls and shows a non-blocking `WebMCP unavailable in this browser` notice.

## Registration lifecycle

- Register global read tools when the application mounts.
- Register case tools only when an active case snapshot exists.
- Register proposal-review context only while a proposal is pending; final approval remains a visible human UI action.
- Abort the previous registration controller whenever the active case changes or the component unmounts.
- Tool names are stable across Decision Packs. Pack-specific meaning is expressed through current case context, declarative schemas, and labels, not dynamically invented tool names.

## Tool catalog

### `sift_get_case_context`

Returns the active case summary, selected pack ID/version/hash, pack-defined and case-defined criteria/attributes, options, readiness counts, current focus, selected option/evidence, recommendation, active run correlation, and pending human action. It omits private model messages and oversized source bodies.

Input: empty object.  
Effect: read-only.

### `sift_list_packs`

Returns installed compiled Decision Packs with descriptions, versions, hashes, and activation signals.

Input: empty object.  
Effect: read-only.

### `sift_select_pack`

Selects a registered Decision Pack for a case that has no evidence yet.

Input:

```ts
{ caseId: string; packId: string; expectedSequence: number }
```

Effect: durable case update. The result explains why selection succeeded or why an evidence-bearing case cannot be reinterpreted.

### `sift_focus_evidence`

Changes the evidence item highlighted in the shared page. This is the primary WebMCP collaboration tool: the user can select an item manually, or ChatGPT can focus it before discussing or revising the case.

Input:

```ts
{ caseId: string; evidenceId: string; expectedSequence: number }
```

Effect: visible selection state only; no evidence is deleted or changed.

### `sift_focus_option`

Changes the current option highlighted in the shared page and includes its safe summary in subsequent case context. This is the car-buying demo's primary shared-attention tool, but the contract works for any pack-defined option kind.

Input:

```ts
{ caseId: string; optionId: string; expectedSequence: number }
```

Effect: visible selection state only. It does not change ranking or evidence.

### `sift_upsert_option`

Adds or updates one manually supplied option using the pack's declared fields plus typed case extensions. It accepts structured facts supplied by the user or ChatGPT; it does not fetch or scrape a URL.

Input:

```ts
{
  caseId: string
  optionId?: string
  expectedSequence: number
  option: {
    label: string
    kind: string
    attributes: Array<{
      definitionId: string
      label?: string
      value: AttributeValue
      sourceIds?: string[]
    }>
  }
}
```

Effect: durable update. The demo packs permit at most five options. Unknown `definitionId` values are accepted only under the compiled pack's extension policy and must include a valid `custom.*` definition. Changed facts invalidate affected evidence, obligations, scores, and recommendations.

### `sift_update_criteria`

Adds, removes, reweights, or relabels decision criteria. Removing a criterion referenced by a decided case is rejected. A successful update invalidates the comparison and recommendation, then asks the engine to recompute.

Input:

```ts
{
  caseId: string
  expectedSequence: number
  operations: Array<
    | {
        op: 'add'
        criterion: {
          id: string
          label: string
          kind: 'hard_constraint' | 'preference' | 'consideration'
          weight: number
          direction: 'higher_better' | 'lower_better' | 'target' | 'qualitative'
          target?: AttributeValue
          appliesToAttribute?: string
          question?: string
        }
      }
    | { op: 'remove'; criterionId: string }
    | { op: 'reweight'; criterionId: string; weight: number }
    | { op: 'rename'; criterionId: string; label: string }
  >
}
```

Effect: durable update plus deterministic invalidation. Weights must be integers from 0 through 100 and are normalized for comparison. Adding an unknown criterion creates a typed case extension; when its question requires evidence, the core derives a case-specific obligation from the pack's `userConcern` template. Protected pack criteria cannot be removed.

### `sift_define_case_attribute`

Defines a typed case-specific concern that the installed pack did not anticipate. A WebMCP call made in response to the user's explicit request records origin `user`; an extension autonomously proposed by a runtime agent uses an internal proposal event and remains pending until the user confirms it through the visible UI.

Input:

```ts
{
  caseId: string
  expectedSequence: number
  definition: {
    id: `custom.${string}`
    label: string
    valueType: AttributeValue['type']
    appliesTo: string[]
    unit?: string
    allowedValues?: string[]
    evidenceExpectation: 'assertion' | 'source' | 'corroborated' | 'verification'
    comparison: 'none' | 'lower_better' | 'higher_better' | 'target' | 'constraint'
    reason: string
  }
}
```

Effect: durable case extension when the pack permits it. It never changes or republishes the installed pack.

### `sift_submit_source`

Submits a structured source discovered by the user or ChatGPT for bounded Sift investigation. This lets ChatGPT contribute research while Sift retains provenance, challenge, and readiness control.

Input:

```ts
{
  caseId: string
  expectedSequence: number
  source: {
    url: string
    title: string
    publisher?: string
    publishedAt?: string
    retrievedAt: string
    excerpt?: string
    claims: Array<{ statement: string; appliesToEntityIds: string[] }>
  }
}
```

Effect: persists an unverified submitted source and starts no implicit network request. `source-challenger` must validate relevance, recency, contradiction, and support before it may satisfy an obligation.

### `sift_set_evidence_disposition`

Lets the user tell the case to include, exclude, or question one evidence item. Exclusion preserves provenance and reason; it does not delete the source.

Input:

```ts
{
  caseId: string
  evidenceId: string
  disposition: 'included' | 'excluded' | 'questioned'
  reason: string
  expectedSequence: number
}
```

Effect: durable update; affected obligations and recommendations become stale and are reevaluated.

### `sift_request_investigation`

Requests the next bounded engine move or asks the engine to revisit one named obligation.

Input:

```ts
{ caseId: string; obligationId?: string; expectedSequence: number }
```

Effect: starts a run and returns a `RunReceipt`. Duplicate idempotency keys return the existing run.

### `sift_request_revision`

Attaches a human revision request to the pending recommendation and reopens affected obligations.

Input:

```ts
{ caseId: string; proposalId: string; instructions: string; expectedSequence: number }
```

Effect: durable update. It cannot approve or reject the decision.

## Tool result envelope

Every tool returns:

```ts
interface SiftToolResult<T> {
  ok: boolean
  message: string
  data?: T
  commandId?: string
  runId?: string
  caseId?: string
  sequence?: number
  ui: {
    changed: boolean
    focusTarget?: string
  }
  error?: {
    code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'POLICY' | 'UNAVAILABLE' | 'INTERNAL'
    retryable: boolean
  }
}
```

Tool callbacks must return honest failure envelopes and must not claim a mutation occurred when it did not.

Mutating tools return after command acceptance rather than waiting for the entire investigation. ChatGPT and the page correlate subsequent work through `commandId` and `runId`; the right-pane UI continues to update from the event stream while the conversation remains usable.

## Cancellation and concurrency

- Each callback accepts the browser-provided abort signal and forwards it to fetch.
- Cancellation produces `UNAVAILABLE` with `retryable: true` and does not apply a late response.
- Mutations include `expectedSequence`. Conflicts return the latest sequence so ChatGPT can call `sift_get_case_context` before retrying.
- Retried mutations reuse an idempotency key derived from the browser tool call ID.

## Automated contract requirements

Tests must verify:

- exact tool names, descriptions, and JSON schemas;
- global versus case-scoped registration;
- unregister-on-case-change and unregister-on-unmount;
- unsupported-browser fallback;
- callback and visible-control equivalence;
- success, validation, not-found, policy, conflict, abort, and server-error envelopes;
- UI state update after tool completion;
- selected evidence included in subsequent case context;
- selected option included in subsequent case context;
- generic option upsert and pack-specific visible-form equivalence, five-option demo limit, typed custom attributes, and no implicit URL fetch;
- a new user criterion/attribute creates a case extension without mutating the compiled pack;
- submitted sources remain unverified until source challenge and retain provenance;
- no final approval tool is registered;
- no tool operates on a case other than the active case without an explicit matching `caseId`.
