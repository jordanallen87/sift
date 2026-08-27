# Pax Source Reuse Map

Status: verified source-location map for preimplementation review. This file identifies where reusable ideas and small implementation patterns live and where they may land in Pax. It does not authorize wholesale copying or make another repository a Pax runtime dependency.

## Reuse rules

- Read each source repository's `AGENTS.md` before inspecting or adapting its code.
- Treat `/Users/jordanallen/IdeaProjects/praetor` and `/Users/jordanallen/IdeaProjects/think-os` as read-only reference repositories.
- Never import either repository through a filesystem path.
- Prefer adapting a concept or contract over copying a component with unrelated dependencies.
- Before copying code, inspect the applicable license and ownership status. If an applicable open-source license is not explicit, reimplement the concept and record that no source code was copied.
- Record every copied or materially adapted fragment, its source path, license conclusion, changes, and Pax destination in `docs/reuse-attribution.md`.
- Preserve Pax's narrower contracts, TypeScript stack, SQLite store, Strands runtime, WebMCP boundary, and right-pane design. Source-project behavior is inspiration, not authority over Pax specifications.
- Do not copy generated Strata19 plugin artifacts. `plugins/strata19/server/facade-stdio.js` and `plugins/strata19/widget/workspace.html` are build outputs; inspect their canonical sources instead.

## Praetor and Strata19 UI map

| Source | Inspect for | Intended Pax destination | Reuse posture |
| --- | --- | --- | --- |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/orchestration/ReadinessPanel.tsx` | Blocker taxonomy, threshold presentation, action hierarchy, explicit not-ready behavior | `apps/web/src/components/ReadinessPanel.tsx` | Adapt the information architecture and state treatment; remove Praetor APIs, routing, auth, and desktop assumptions. |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/ReadinessPanel.tsx` | Expandable readiness breakdown and compact progress treatment | `apps/web/src/components/ReadinessPanel.tsx` | Compare with the orchestration version; borrow only the smaller useful patterns. Avoid dynamic Tailwind class construction. |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/inline/renderers/ApprovalGateCard.tsx` | One-primary-action approval surface and visual separation between pending and settled decisions | `apps/web/src/components/ApprovalCard.tsx` | Strong candidate for a small structural adaptation; Pax server-side human authority remains canonical. |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/inline/renderers/ReadinessStateCard.tsx` | Fail-closed readiness copy and non-vacuous check counts | `apps/web/src/components/ReadinessPanel.tsx` and `RecommendationCard.tsx` | Adapt the absent-measurement safeguards and concise copy. |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/EngineProgressCompact.tsx` | Honest empty/out-of-scope/version states, compact progress, and container-query behavior near 440 px | `apps/web/src/components/CurrentFocusCard.tsx` and `LiveRunStatus.tsx` | Adapt narrow-pane state handling and container-query ideas; do not copy Strata19 tool-output contracts. |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/EngineProgressView.tsx` | Full-versus-compact projection consistency and validation boundary | `apps/web/src/components/CurrentFocusCard.tsx` and debug execution view | Inspect alongside the compact component so Pax's normal and inspector views cannot disagree. |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/hq/ActivityView.tsx` | Chronological activity grouping, labels, evidence links, and detail disclosure | `apps/web/src/components/ActivityTimeline.tsx` and Runtime Inspector timeline | Adapt hierarchy and interaction patterns to Pax's persisted activity/debug event contracts. |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/execute/activity-labels.ts` | Centralized safe labels for runtime activity | `apps/web/src/components/activity-labels.ts` | Adapt the label-registry pattern so user-visible activity never falls back to raw internal event names. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/shared-design/src/tokens.ts` | Spacing, radius, restrained shadow, typography, and motion scales | `apps/web/src/styles/tokens.css` | Translate selected values into CSS variables; do not import the package. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/shared-design/src/colors.ts` and `/Users/jordanallen/IdeaProjects/think-os/packages/shared-design/src/fonts.ts` | Palette and font direction | `apps/web/src/styles/tokens.css` and `global.css` | Inspect during the visual-design audit; select only values that support Pax's calm narrow-pane identity. |

## Strata19 engine and supervised-execution map

| Source | Inspect for | Intended Pax destination | Reuse posture |
| --- | --- | --- | --- |
| `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/convergence/engine.ts` | Bounded generate/verify/repair loop, attempt records, strategic restart, and terminal human-review status | `scripts/verify.ts` and the bounded repair protocol; conceptual input to `packages/core/src/readiness.ts` | Reuse concepts and possibly small dependency-free helpers only. Pax decision readiness is domain evidence governance, not code-generation convergence. |
| `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/convergence/types.ts` | Typed attempts, budgets, outcomes, token/cost metadata, and callbacks | `packages/contracts/src/runtime.ts` and verification report types | Adapt the bounded-attempt vocabulary where it matches Pax; preserve Pax event names and limits. |
| `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/convergence/runner.ts` | Generator/verifier separation and minimal counterexample feedback | `scripts/verify.ts`, scenario runner, and GoalLoop validation adapter | Use as a test/repair design reference rather than a runtime dependency. |
| `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/convergence/observability.ts` | Attempt-level event logging and correlation | `apps/agent/src/observability/normalizer.ts` and verification artifacts | Translate into Pax `RuntimeDebugEvent`; do not inherit unrelated code-generation fields. |
| `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/convergence/db/persistence.ts` | Durable attempt/counterexample history and calibration boundaries | `apps/agent/src/observability/runtime-event-store.ts` and verification artifact storage | Inspect for transaction and recovery patterns; implement against Pax's Drizzle schema. |
| `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/db/local-convergence.ts` | Fail-closed readiness, explicit degraded measurement, and non-vacuous completion | `packages/core/src/readiness.ts` and evidence evaluation | Adapt the semantic safeguards, not the Strata19 schema or hosted/local compatibility layer. |
| `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/tools/obligations-tools.ts` | Obligation ledger operations and bounded status transitions | `packages/core/src/obligations.ts` and command contracts | Reimplement against Pax obligations and immutable case events. |
| `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/tools/convergence.ts` and `/Users/jordanallen/IdeaProjects/praetor/packages/mcp/src/tools/convergence-loop.ts` | Tool-facing readiness checks and repair-loop orchestration | Pax run service and test verifier | Inspect response/error posture; do not expose Strata19 tool names in Pax. |
| `/Users/jordanallen/IdeaProjects/praetor/packages/praetor-mcp/src/tools/engine-tools.ts` | Config validation, duplicate obligation detection, field collision checks, and handoff-reference validation | `packages/packs/src/compiler.ts` and `conformance.ts` | Reimplement the checks over `DecisionPackManifest`; the source uses text inspection and is not the target implementation. |

## Strata19 plugin map

The shipped plugin directory is assembled from multiple source trees. The canonical source map is documented in `/Users/jordanallen/IdeaProjects/praetor/plugins/strata19/README.md` under `Developing this plugin — source map & the release loop`.

| Source | Inspect for | Intended Pax destination | Reuse posture |
| --- | --- | --- | --- |
| `/Users/jordanallen/IdeaProjects/praetor/src/mcp/facade/facade-tools.ts` | Bounded façade tools, Zod validation, path containment, truthful capability claims, degradation, and authority checks | WebMCP command adapters, authoring tools, redaction, and policy boundaries | Inspect selected patterns only. The file is large and contains extensive Strata19-specific behavior that Pax must not inherit. |
| `/Users/jordanallen/IdeaProjects/praetor/src/mcp/facade/facade-stdio.ts` | Schema publication, dispatch composition root, host capability boundaries, and structured failure behavior | WebMCP registration tests and service composition | Conceptual reference; Pax is not an MCP stdio server and should not port this composition root. |
| `/Users/jordanallen/IdeaProjects/praetor/src/mcp/facade/tool-registry-kit.ts` | Side-effect classification and centralized write/capability authority enforcement | `packages/core/src/policy.ts` and pack compiler capability resolution | Adapt the centralized-gate pattern. |
| `/Users/jordanallen/IdeaProjects/praetor/src/mcp/facade/runtime-claim-guard.ts` | Preventing unearned runtime capability claims | submission verifier, tool responses, and completion report validation | Adapt the truthfulness concept and tests. |
| `/Users/jordanallen/IdeaProjects/praetor/src/mcp/facade/text-redaction.ts` | Secret-pattern redaction | `apps/agent/src/observability/redactor.ts` | Candidate for a small, audited adaptation after license and dependency review. |
| `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/data/strata19-client.ts` | Typed bridge between widget UI and service | `apps/web/src/api/pax-client.ts` | Inspect request/cancellation/error patterns; use Pax contracts and same-origin API. |
| `/Users/jordanallen/IdeaProjects/praetor/plugins/strata19/skills/strata19-guide-change/SKILL.md` | Finite obligation interview, provenance, readiness authority, and human decision posture | `apps/agent/skills/pack-authoring/SKILL.md` | Adapt authoring-interview principles without copying Strata19 tools or project workflow. |
| `/Users/jordanallen/IdeaProjects/praetor/plugins/strata19/skills/strata19-verify-remediate/SKILL.md` | Evidence-driven verify/repair loop | Claude repair instructions and authoring conformance feedback | Conceptual reference. |
| `/Users/jordanallen/IdeaProjects/praetor/plugins/strata19/skills/strata19-design-audit/SKILL.md` | Visual inspection discipline | Playwright screenshot review workflow | Conceptual reference; Pax tests remain the authority. |

## Think OS and Murmur Pack map

| Source | Inspect for | Intended Pax destination | Reuse posture |
| --- | --- | --- | --- |
| `/Users/jordanallen/IdeaProjects/think-os/packages/pack-spec/src/manifest.ts` | Root pack composition, cross-section validation, and non-executable manifest boundary | `packages/contracts/src/packs.ts` and `packages/packs/src/compiler.ts` | Adapt schema-organization patterns to the smaller Pax manifest. Do not import Murmur packages. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/pack-spec/src/ontology.ts` | Typed concepts, fields, relations, extension disposition, and strict cross-field Zod validation | `packages/contracts/src/attributes.ts`, `extensions.ts`, and pack definitions | Adapt the typed-open-domain approach; Pax uses its own `AttributeValue` variants and `custom.*` policy. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/pack-spec/src/policy.ts`, `/Users/jordanallen/IdeaProjects/think-os/packages/pack-spec/src/evaluation.ts`, `/Users/jordanallen/IdeaProjects/think-os/packages/pack-spec/src/experience.ts`, and `/Users/jordanallen/IdeaProjects/think-os/packages/pack-spec/src/behavior.ts` | Policy, conformance/evaluation, generic rendering metadata, and lifecycle declarations | Decision Pack manifest sections and compiler checks | Inspect before finalizing the Pax schema so important cross-section invariants are not omitted. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/pack-spec/src/canonicalize.ts` | Deterministic semantic serialization | `packages/packs/src/canonicalize.ts` | Strong candidate for a small audited adaptation if its contract matches Pax's hash rules. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/compile.ts` and `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/compile.test.ts` | Parse/validate/resolve/compile pipeline and structured diagnostics | `packages/packs/src/compiler.ts` and compiler tests | Inspect implementation and tests; simplify to one-pack Pax compilation. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/topological-sort.ts` and `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/topological-sort.test.ts` | Deterministic dependency ordering and cycle errors | Decision Pack Graph/obligation validation | Candidate for audited adaptation if Pax requires the same semantics. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/diff.ts` and `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/diff.test.ts` | Semantic manifest diff and breaking-change classification | `pack_diff` authoring tool | Adapt only the subset relevant to immutable Pax pack versions. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/precedence.ts`, `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/precedence.test.ts`, `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/compose.ts`, and `/Users/jordanallen/IdeaProjects/think-os/packages/pack-compiler/src/compose.test.ts` | Conflict and composition logic | No hackathon destination | Inspect only to understand prior design. Automatic pack composition is explicitly out of scope for Pax. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/reference-packs/src/decision-workspace/manifest.ts` and `/Users/jordanallen/IdeaProjects/think-os/packages/reference-packs/src/decision-workspace/manifest.test.ts` | Option/criterion/evidence/claim/source/recommendation/approval ontology and manually reviewed reference-pack structure | Built-in Car Purchase and Home Energy manifests | Adapt domain vocabulary and lifecycle ideas; do not copy the broad Murmur experience contract. |
| `/Users/jordanallen/IdeaProjects/think-os/packages/shared-design/src/tokens.ts`, `/Users/jordanallen/IdeaProjects/think-os/packages/shared-design/src/colors.ts`, and `/Users/jordanallen/IdeaProjects/think-os/packages/shared-design/src/fonts.ts` | Shared design primitives | Pax CSS token layer | Translate a small selected set after the visual audit. |

## Required preimplementation output

Before product code is written, the implementation audit must:

1. verify every path in this map still exists;
2. add or remove mappings based on the final technical design;
3. state which entries will be concept-only, structurally adapted, or copied in small part;
4. identify the applicable license/ownership posture for each copied fragment;
5. confirm every selected source has an explicit Pax destination and test owner;
6. preserve a concise decision record in `docs/preimplementation-audit.md`;
7. keep `docs/reuse-attribution.md` synchronized as implementation proceeds.
