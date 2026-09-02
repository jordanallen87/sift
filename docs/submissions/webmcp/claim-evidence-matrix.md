# Claim–evidence matrix

Every claim Sift makes — in the UI, in the narration, in the README, in the submission copy — mapped to the code that implements it, the automated test that proves it, the visible proof a judge can see, the provenance of the data behind it, and the limitation that stays true.

A claim with no row here is a claim we do not make. A row with no automated proof is marked as such rather than quietly counted.

Legend for **Proof**: `automated` = a test fails if the claim stops being true. `visible` = a judge can see it without running anything. `both` = both. `attestation` = a human has to confirm it; no code can.

---

## A. What the product does

| # | Claim | Implementation | Automated proof | Visible proof | Data provenance | Limitation |
|---|---|---|---|---|---|---|
| A1 | A person and ChatGPT act on the same live case through the same command implementation. | `apps/agent/src/services/command-service.ts`; `apps/web/src/model-context/register-sift-tools.ts` | `apps/web/src/model-context/webmcp-contract.test.ts` (26 tools, exact schemas pinned) | Tool calls in ChatGPT change the pane without a reload | n/a | Requires a WebMCP-capable host; the pane says so plainly when one is absent |
| A2 | Sift asks what a person needs before showing options, and the questions adapt to the answers. | `packages/packs/src/car-purchase.ts` discovery block (14 topics, conditional); `packages/core/src/discovery.ts` | `pnpm test:persona` — family and landscaping personas answer *whatever Sift asks* and receive different question sets | The pane's question sequence differs between the two journeys | Pack-declared topics | Conditional topics are declared per pack; an unanticipated *category* still needs a pack edit |
| A3 | Quick Pick judgments are canonical: they persist, and ChatGPT can read them back. | `setCandidateDisposition` command; `candidate.disposition_set` event | `tests/e2e/adaptive-vehicle-journey.spec.ts` — Keep, reload, then read the disposition back from the API | Reload the pane; the judgment is still there | User-entered | Undo restores the previous disposition, not an arbitrary history |
| A4 | A new concern revises work already under way instead of restarting it. | `apps/agent/src/runtime/run-plan.ts`; `apps/agent/src/services/run-plan-service.ts` | `apps/agent/src/routes/run-plan.test.ts` — v2 over real HTTP with `reusedSignatures` populated | `plan.revised` in the activity stream, naming what it reused | Derived from case state | The demo beat currently revises on triage and discovery changes; a concern raised as a case extension revises on the next plan derivation |
| A5 | Expensive work only happens on options a person kept or flagged. | `RunPlanItem.depth`/`triageBasis` | `apps/agent/src/runtime/run-plan.test.ts`; mutation-tested | Before triage every planned item is shallow (asserted in E2E) | n/a | "Expensive" is depth, not literal spend; cost accounting is not implemented |
| A6 | The deterministic core owns the ranking; the model does not narrate it. | `packages/core` scoring | `packages/core/src/*.test.ts` | Reweight re-orders options with no model call | Pack-declared criteria | — |
| A7 | Sift says what it does not know instead of filling the gap. | `AttributeRecord.status: 'unknown'`; `RunPlan.unverifiable` | `run-plan.test.ts` "records a concern no pack capability can answer as an explicit unknown" | "STILL RESEARCHING … is still unknown" in the pane | n/a | — |

## B. Authority

| # | Claim | Implementation | Automated proof | Visible proof | Limitation |
|---|---|---|---|---|---|
| B1 | No WebMCP tool can approve a consequential decision. | `SIFT_WEBMCP_TOOL_NAMES` — `reviewProposal` is absent from the catalog | `webmcp-contract.test.ts` pins the exact tool list | The dock marks human-only actions | The capability is **absent**, not guarded — there is no disabled path to re-enable |
| B2 | A model cannot mark a topic as a hard requirement. | `updateDiscovery` downgrades a model-proposed `must_work` to `needs_verification` | `packages/core/src/discovery.test.ts` | The pane shows the tier the person actually set | — |
| B3 | A model-origin topic cannot reach `confirmed` without a human. | `DiscoveryTopicStateSchema` refinement | `packages/contracts/src/discovery.test.ts` | — | Structural: the schema rejects it |
| B4 | Deep agent work cannot be authorized by a candidate nobody reviewed. | `TriageBasis.disposition` is `'keep' \| 'unsure'` | `run-plan.test.ts` "has no way to write down a triage basis a person never gave" | — | Structural: `pass` and `unreviewed` are not members of the union |
| B5 | Runtime work cannot write discovery answers, dispositions, the shortlist, or the decision. | `RunPlanItem.writes` is `'evidence' \| 'enrichment' \| 'none'` | `run-plan.test.ts` "offers no write target for the parts of the case only a human owns" | — | Structural: absence, not a check |
| B6 | Only `origin: 'user'` may claim `status: 'verified'`. | Attribute protocol refinement | `packages/contracts/src/attributes.test.ts` | Provenance labels in the pane | — |

## C. Orientation

| # | Claim | Implementation | Automated proof | Visible proof | Limitation |
|---|---|---|---|---|---|
| C1 | A novice can answer "what am I doing, where am I, what changed, what next" from the pane alone. | `DecisionOrientationShell`, `ContextActionDock` | `tests/e2e/adaptive-vehicle-journey.spec.ts` at 390/430/480/1440 | The frame, on every case view | Diagnostic *quality* scores are unmeasured — see E1 |
| C2 | The pane never claims more progress than the case supports. | `deriveDisplayedCoverage`, `deriveDecisionPhase` (both in `@sift/core`) | `state_ui_contradiction` hard gate; the same assertion against real pixels in E2E | Phase and coverage never disagree on screen | The gate checks the displayed claim, which is the only claim a person can act on |
| C3 | The next step is never empty. | `buildDecisionOrientation` `FALLBACK_NEXT_STEP` | `decision-orientation.test.ts`; `missing_next_action` hard gate | "Next: …" on every turn | — |

## D. Runtime

| # | Claim | Implementation | Automated proof | Limitation |
|---|---|---|---|---|
| D1 | A real Strands Graph runs the vehicle investigation. | `apps/agent/src/runtime/car-purchase-graph.ts` | `car-purchase-graph.test.ts` with a scripted model provider | The model is scripted in tests; the orchestration is real |
| D2 | A real bounded Strands Swarm runs Home Energy Guardian. | `home-energy-swarm.ts` | `home-energy-swarm.test.ts` | as above |
| D3 | Interventions produce visible Guide / Confirm / Deny outcomes. | `interventions.ts` | `interventions.test.ts` | — |
| D4 | Every activity event resolves to exactly one runtime event. | `debugEventId` correlation | `routes/debug.test.ts` | — |
| D5 | Case state and plan history survive a restart. | SQLite + `run_plans` | `store/run-plan-store.test.ts` "keeps the whole revision history across a restart" | In-process second store over the same database file; a true process restart is proven by `pnpm test:deployed` |

## E. Claims we deliberately do **not** make

| # | Non-claim | Why |
|---|---|---|
| E1 | "The experience scores well on usability." | `pnpm test:persona` reports `scored: false` until a diagnostic pass supplies scores with cited turn evidence. No such pass has been run, and the harness refuses to default a number. |
| E2 | "Accessibility and console cleanliness are proven for every persona turn." | The persona harness runs in process and reports those two gates as `not_evaluated` with a reason. Browser-level axe and console evidence comes from `tests/e2e/`, which covers the journeys it names and not every persona turn. |
| E3 | "Listings, prices, dealers, or availability are real." | `packages/catalog/data/vehicle-demo-profiles.json` is `curated_demo` provenance and has no price, dealer, or availability field at all. The pane labels demo data. |
| E4 | "Sift verifies every concern a person raises." | A concern with no matching pack capability is recorded in `RunPlan.unverifiable` and stays an explicit unknown. |
| E5 | "The model chose the ranking." | It did not, and where Sift's scoring disagrees with the model's recommendation the pane says so and caps confidence. |
| E6 | "A real ChatGPT host session has been recorded." | See `host-acceptance.md`. That requires a person with a WebMCP-capable host and is not something this build can attest to. |

## F. Items that require a human attestation

These cannot be discharged by any test and remain assigned to the submitter.

| # | Item | Owner |
|---|---|---|
| F1 | Eligibility under the official rules (age, country, occupation). | Submitter |
| F2 | Real-host acceptance session in ChatGPT or a WebMCP-enabled Chrome. | Submitter |
| F3 | Demo video: recording, audio, duration, public upload, and re-check of the public link. | Submitter |
| F4 | Devpost submission itself. | Submitter |
| F5 | Repository visibility and the license being visible at the top of the repository page. | Submitter |
