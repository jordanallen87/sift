# ADR 0011: Model-Extensible Cases — Pack-Authorized Extension, Values With Definitions, Markdown, and the Reference Library

Status: accepted
Date: 2026-09-01

## Context

The project owner, on the product thesis:

> "these packs shouldnt be set in stone. We want to actually allow the model to extend on them
> where we decide that they can do so. We're trying to showcase the power of having the model/llm
> separate from the place where the work is being done, Sift. I'm basically assuming that the
> conversation is the primary place of user interaction. I dont think the user will do too much
> directly in the UI. And so we need the model to essentially be able to use webmcp to store
> relevant context and memory."

And on the specific capabilities:

> "I want to enable the model to actually be able to add custom fields for comparison - and
> require the model to actually provide the values for those."

> "This is essentially just a library of reference material… research papers, blogs, and any other
> detail that might be relevant to the case" — with tagging, to organise it in the UI.

### The distinction that was being blurred

The model cannot edit a *pack* — a case pins `pack.id`/`version`/`compiledHash`, and pack authoring
is a separate Strands AgentSkill that is not an HTTP route and is disabled in the public
deployment. That is correct and stays.

But "the model cannot touch the pack" was being treated as the design, when it was only where the
implementation stopped. A pack already declares how far a case may grow beyond it:

```ts
extensionPolicy: {
  allowCaseAttributes: boolean, allowCaseCriteria: boolean,
  allowCaseObligations: boolean, userConcernTemplateId: string,
}
```

`allowCaseAttributes` and `allowCaseCriteria` were **enforced nowhere** — one fixture, zero call
sites. A pack forbidding case attributes was silently ignored; so was one permitting them.
(`allowCaseObligations` was enforced but skipped silently; `criteria.allowUserDefined` and
`protectedCriterionIds` were already genuinely enforced for `add`/`remove`/`reweight`.)

## Decision

### 1. `extensionPolicy` is the authority boundary, and it is enforced

`requirePinnedPack` resolves the case's **pinned** pack — never the latest — and **fails closed**:
an unresolvable pack raises `500 INTERNAL` rather than being read as "no policy found, therefore
allowed". `defineCaseAttribute` is gated on `allowCaseAttributes`; `updateCriteria`'s `add` on
`allowCaseCriteria`, checked before the narrower `allowUserDefined`. A forbidden extension is
**rejected as a policy failure naming the pack and the flag**, never silently downgraded, and the
case snapshot is provably untouched.

`reweight`/`rename`/`remove` are not gated by `extensionPolicy`: they act on an existing criterion,
which is not an extension.

### 2. Pre-authorized extensions land confirmed

Where the policy permits it, an `agent_proposed` definition lands `confirmation: 'confirmed'`,
carrying its `origin`, `proposedBy`, and `reason` so the UI shows provenance and offers an undo.
Where the policy forbids it, the command is rejected.

This supersedes change-set §23's "agent-generated idea → user confirms" for the pre-authorized
case. The reasoning is the owner's: with the conversation as the primary surface, a per-item
confirmation click is one the user would never see, leaving the workspace quietly diverging from
what was discussed. Pre-authorization moves that judgment to the pack author, once, where it can be
reasoned about — instead of to a queue nobody is watching.

**The decision gate is untouched, and is now tested structurally as well as behaviourally:**
`reviewProposal` remains absent from the WebMCP catalog (a new test asserts no registered tool
matches `/approve|review_proposal|decide/i` while confirming the catalog is populated), and
`attributeStatusOriginError` still permits `status: 'verified'` only from `origin: 'user'`.
Extending a case is not deciding it.

Because `pending` becomes unreachable for pre-authorized attributes, `reviewCaseExtension` was
retargeted rather than left as dead code: rejecting a confirmed extension is the **undo**,
re-confirming is idempotent, `rejected` is terminal. It remains a human-only verb. Rejecting a
confirmed extension now invalidates a dependent `ready` recommendation.

### 3. A model-defined comparison column arrives populated

`DefineCaseAttributeInputSchema.values` carries, per option, either a real value with provenance or
`status: 'unknown'` **with a required reason**. There is no third form.

The requirement is asymmetric by origin. A person adding "dog crate fit" is *asking* a question —
the obligation system then drives the research — and demanding they fill every cell first would
invert that and make the visible `CustomConcernForm` unusable. A model adding a column has just
finished looking, so an empty one reads as a dimension the comparison *failed to resolve* rather
than one nobody asked about.

Coverage is enforced in the command service (the only layer that can see the case's entities): an
agent definition must account for every applicable option, and the error names the ones omitted.
Values are written through the real `createAttributeRecord`, so existing status/origin invariants
apply unchanged, and the whole thing is one transactional append — a case can never hold a column
that half exists.

Requiring values could have become pressure to invent them. The reasoned-unknown escape is what
prevents that, and it is why the reason is mandatory: an unknown with no reason is
indistinguishable from an oversight.

### 4. Markdown, never HTML

`TextAttributeValueSchema.format?: 'markdown'` and `Source.summaryFormat`. Optional throughout, so
existing values keep their meaning and their hash.

**This is a security boundary, not a styling preference.** Every string in the contracts passes
`safeString`, which rejects `<tag`, `javascript:`, and `on*=` handlers — a control that exists
precisely because this content is model-written and browser-rendered. Markdown needs none of what
it blocks. Accepting HTML would mean deleting it.

`MarkdownText.tsx` adds **no dependency** and **never produces an HTML string** — no
`dangerouslySetInnerHTML`, only React elements and text nodes, so raw HTML becomes an escaped text
node *structurally* rather than by filtering. A library would need an HTML-disabled configuration
re-audited on every upgrade; a renderer with no HTML-output path has no such setting to get wrong.
`safeLinkHref` is a fail-closed allowlist: protocol-relative `//evil.com` is rejected before the
scheme test, then `http`/`https` only, which also catches a control character smuggled into
`java\x01script:`. Images render alt text and produce no `<img>` at any URL. 22 adversarial tests
assert on the DOM (`querySelector('script')` null), never on strings.

### 5. The reference library is the model's durable memory

`Source` gained `tags` (free-form, bounded) and `summary`/`summaryFormat` — the submitter's OWN
words about why a reference matters, deliberately distinct from `excerpt`, which is a quotation
FROM the source. Conflating them would let a model's paraphrase read as the publisher's words.

**A source with no claims and no obligation is a reference; one with them is evidence.** Both are
`Source` records; `ReferenceLibrary` shows both and makes which is which legible without implying a
reference is deficient. `claims`/`evidenceLinks` are therefore *required* props — an unwired caller
would label every evidence source a bare reference, which is a false claim about the case.

The gap that would have broken the thesis: `sift_list_research` returned sources but **not `tags`
or `summary`**, so a model could file a tagged, summarised reference and then had no way to read
back either the tag it filed it under or its own note about why. Write-only memory is not memory.
Both fields are now in the projection (`excerpt` stays out — it is someone else's prose). Both tool
descriptions were rewritten: `sift_submit_source` already *accepted* the fields for free via the
schema, but nothing told the model they existed.

### 6. Protected criteria may not be renamed

Found while enforcing the above. `protectedCriterionIds` was enforced for `remove` and `reweight`
but not `rename`, which made the protection largely cosmetic: a WebMCP caller could not delete or
down-weight a pack's mandatory criterion, but could relabel it to anything. A criterion reaches the
consumer surface **by its label alone** — its id never does — so a silent relabel is
indistinguishable from a substitution, while it stays weighted and stays protected. Now gated, with
a default that keeps every existing caller byte-identical.

## Consequences

- `pnpm verify` passes all ten stages. `@sift/web` 1399, `@sift/agent` 823, `@sift/core` 323,
  contracts 233. Playwright green — the hero-demo timing shift below did not break the journeys.
- `determineCarPurchaseRound` now returns `round2` the moment the model defines the dog-crate
  concern; the human Confirm is a re-affirmation rather than the trigger.
- `CaseExtensionReviewCard.tsx` is no longer reachable from the command path. It should be
  retargeted as the provenance + undo affordance rather than deleted.
- An unknown's `reason` persists as a linked `CaseNote`, not on the `AttributeRecord`, because that
  schema is `.strict()` with no such field. Same transaction, option-linked, never truncated. Moving
  it onto the record would be a contract change and is deliberately deferred.
- A model cannot define a column on a case with zero options — `values` must be non-empty for an
  agent definition, and there would be nothing to populate.
- Coverage is keyed on the wire `input.origin`; the in-process `originParam` channel (unreachable
  from HTTP/WebMCP) is exempt, or the hero scenario would have had to fabricate values before the
  investigation that establishes them.

## Still open

`sift_set_view` exposes `mode`, `focusedOptionId`, and `visibleOptionIds` but **not `filters`**, and
`visibleOptionIds` is still read by nobody — so the model can call "show only these three", receive
a success receipt, and the page will not move. That is the other half of the two-way loop this ADR's
thesis depends on, and it remains unfixed.
