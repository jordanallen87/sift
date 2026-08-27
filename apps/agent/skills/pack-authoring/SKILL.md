---
name: pack-authoring
description: Conducts a bounded interview with a human pack author to turn a described decision domain into a declarative Decision Pack draft — a decision boundary, default/required criteria, required obligations and evidence levels, reusable capability selections from the installed catalog, an explicit orchestration strategy under bounds, extension policies for unanticipated user concerns, generic-UI presentation metadata, and required success/incomplete-evidence/steering/human-boundary scenario coverage — then validates, tests, and diffs the draft before a human explicitly publishes it. Not enabled inside normal decision runs; developer/local authoring only, gated by PAX_AUTHORING_ENABLED.
---

# Pack authoring

## What this technique does

Pax is a platform for **Decision Packs**, not two hard-coded demos. This skill is how a new pack — a new class of decision Pax has never seen, like "compare apartment listings" or "choose a graduate program" — gets turned into a real, installable, compiled artifact without ever letting a model author executable code, weaken human authority, or silently reinterpret an existing case.

The interview is bounded: it produces exactly the following, and nothing else.

1. **Decision boundary and prohibited effects** — what class of decision this pack covers, and what it must never do (approve its own recommendation, mutate an existing case's pinned pack, act on someone else's money or property without confirmation).
2. **Default and required criteria** — the pack's `criteria.defaults`, which are user-removable/reweightable, and which (`protectedCriterionIds`) are not.
3. **Required obligations and evidence levels** — the questions the case must resolve before it can be ready, each with a `requiredEvidenceLevel` (E0–E3), `maxAttempts`, and whether accepted uncertainty is allowed.
4. **Reusable capability selections from the installed catalog** — every skill, specialist, and tool the pack declares must already be installed (call `pack_catalog` first; never invent an id).
5. **Orchestration strategy under explicit bounds** — `graph`, `swarm`, `single_agent`, or `hybrid`, always with `maxSteps`/timeouts and (for `graph`) `maxConcurrency` or (for `swarm`) repetitive-handoff detection bounds set explicitly.
6. **Extension policies for unanticipated user concerns** — whether this pack allows case-scoped `custom.*` attributes/criteria/obligations, and the `userConcernTemplateId` a case uses to derive a new obligation from an unanticipated criterion.
7. **Presentation metadata for the generic right-pane UI** — `optionLabel`/`optionLabelPlural` and `attributeGroups`; every non-sensitive declared attribute must be assigned to a group or the generic renderer has nowhere to place it.
8. **Required scenario coverage** — at least one `success`, `incomplete_evidence`, `steering`, and `human_boundary` scenario file, each a declarative JSON file under `scenarios/`, not executable code.
9. **A declarative pack draft and a readable authoring report** — the assembled `pack.json` plus a plain-language summary of what was decided and why, for the human reviewer to read before publishing.

## Bounded tools

This skill may call only these six tools, and no others. It receives no arbitrary shell tool and cannot write outside the selected pack draft directory.

- **`pack_catalog`** — lists installed skills, specialists, tools, UI renderers, and orchestration templates. Read-only. Always call this before proposing a capability selection; never propose an id it did not list.
- **`pack_scaffold`** — creates files only under the draft directory (`pack.json`, `README.md`, `skills/<id>/SKILL.md`, `fixtures/<scenario-id>/*.json`, `scenarios/<scenario-id>.json`). Path-traversal-safe: a `relativePath` that resolves outside the draft directory, or that does not match the pack bundle file layout, is rejected before anything is written.
- **`pack_validate`** — runs schema, reference, security, and graph/bounds validation against the real compiler. Call this after every scaffold step, not only once at the end.
- **`pack_test`** — runs deterministic conformance checks and verifies the four required scenario-coverage kinds are present.
- **`pack_diff`** — compares the current draft against any already-installed version of the same pack id. Read-only.
- **`pack_publish`** — installs a validated draft. Requires `actor: 'human'` and `confirmed: true`; rejects failing validation, missing negative scenario coverage, an undeclared/unresolved capability, executable content anywhere in the draft, and any request whose actor is not literally `'human'` — unconditionally, before any other check.

## Required interview flow

1. Ask the author to describe the decision domain in plain language. Do not scaffold anything yet.
2. Call `pack_catalog` and ground every later capability choice in what it actually returned.
3. Draft the manifest incrementally with `pack_scaffold`, calling `pack_validate` after each meaningful change so validation failures surface early, one at a time, rather than as one large dump at the end.
4. Once `pack_validate` passes cleanly, scaffold all four required scenario files and call `pack_test`. Do not proceed to publication while any scenario kind is missing or any conformance check fails.
5. Call `pack_diff` when a prior version of the same pack id may already be installed, and summarize the diff for the human.
6. Present the full draft, the validation/test results, and the diff (if any) as a readable authoring report. Ask the human to review it.
7. Only after the human explicitly confirms, call `pack_publish` with `actor: 'human'`, `confirmed: true`, and the reviewing human's identifier as `confirmedBy`. Never call `pack_publish` speculatively, and never treat your own judgment that a draft "looks good" as the confirmation it requires.

## Required honesty behavior

This skill proposes; it never approves. If `pack_validate` or `pack_test` reports an issue, state exactly what failed and why — do not soften, summarize away, or silently work around a rejection by removing the thing that failed instead of fixing it. A required obligation, a protected criterion, or an approval policy for a consequential tool is never dropped to make a check pass. When the author's description implies a capability that is not in the catalog `pack_catalog` returned, say so plainly and either ask which installed capability to use instead or record the concern as an explicit unknown — never invent a plausible-sounding id and hope it resolves.

This skill's own tools are not available to any other running specialist. It exists only for authoring a pack, not for using one, and it is disabled entirely (`PAX_AUTHORING_ENABLED=false`) in the unauthenticated public hackathon deployment.
