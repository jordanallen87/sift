# Pax — Completion Report

**Date:** 2026-08-28
**Final git SHA:** `b9b0b60a6dba66186befef46efaddf8bace3c285`
**Repository:** https://github.com/jordanallen87/pax (currently private — see Known limitations)
**Live deployment:** https://pax-hackathon-production.up.railway.app

This report is written per CLAUDE.md's completion contract. It documents what is implemented, exactly how it was verified, what remains genuinely external to this build environment, and what is honestly still missing.

## Implemented capabilities

- **Two complete, live, tested Decision Packs** sharing one runtime:
  - **car-purchase** ("Choose Our Next Car") — the WebMCP-first hero, running a real Strands **Graph** with 4 parallel specialist nodes, a source-challenger, GoalLoop-validated recommendation synthesis, criteria reweighting, user-defined custom concerns (`custom.*` extensions), and human-only proposal approval.
  - **home-energy-guardian** ("Investigate My Energy Bill") — the AWS/Strands-first hero, running a real bounded Strands **Swarm** with sequential specialist handoffs, `RetrySteering`, home-event correlation, a `Draft withheld` rejection/retry cycle (GoalLoop `maxAttempts: 2`), `ConsequenceGuard`-gated proposal creation, and a genuine session-snapshot restart/restore.
- Both packs are versioned Decision Packs (pinned pack ID/version/compiled hash per case), compiled through the shared pack compiler, and pass the shared compiler/conformance suite.
- Deterministic core (`packages/core`) owns case state, evidence validity, readiness, and human authority — the model proposes, it never approves.
- Real-time workspace: queued/specialist/skill/tool/evidence/steering/recommendation/completion states render only from actual command receipts and ordered SSE events, with replay, duplicate suppression, resync, and polling fallback.
- Real Strands SDK integration (`@strands-agents/sdk@1.14.0`), not simulated: `AgentSkills` progressive activation, a real Graph and a real bounded Swarm, TypeScript interventions (`Guide`/`Confirm`/`Deny`, visible outcomes), Context Injector, GoalLoop with a callable validator, structured output validation, streaming/hook normalization into Pax activity events, real `SessionManager`/`LocalFileStorage` snapshot/restore, and AgentCore-compatible `/ping` + `/invocations` routes (verified against current official AWS documentation, not invented).
- A separate real `pack-authoring` AgentSkill with bounded catalog/scaffold/validate/test/diff/publish tools, human-only publication.
- SQLite (via `better-sqlite3` + Drizzle) as the canonical store: WAL, foreign keys, transactional event+snapshot writes, unique event sequences/idempotency keys. Sanitized public activity stream and detailed runtime telemetry are stored and replayed separately from canonical case events; telemetry never mutates case state.
- Full Runtime Inspector: hooks, OTEL spans, correlations, state diffs, filters, Graph/Swarm visualization, tokens/latency, errors, export, activity-to-trace navigation, redaction (no credentials/auth headers/cookies/raw private reasoning/unredacted notes ever persisted).
- Docker image serving the built web app and API as one Railway service, non-root, real `/health` healthcheck.
- `PAX_EXECUTION_TARGET=local|agentcore` supported.

## Verification commands and counts

All commands below were run independently by the orchestrating session (not only trusted from a subagent's self-report) at the final commit `b9b0b60a6dba66186befef46efaddf8bace3c285`.

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Succeeds from a clean checkout |
| `pnpm verify` | **PASSED** — all 10 stages: `format:check`, `lint`, `typecheck`, `test:unit`, `test:coverage`, `test:pack`, `test:integration`, `test:contract`, `test:scenario`, `test:e2e` |
| `pnpm test:unit` (via `test:coverage`) | 2084/2084 tests passed, 130 files |
| `pnpm test:e2e` | 32/32 tests passed, across 4 Playwright viewport projects x 5 spec files |
| `pnpm verify:release` | verify + mutation + build + docker all **PASSED**; `test:submission` fails only on the two genuinely human-only video-URL fields (see below) |
| `pnpm test:submission` | 9 passed, 2 skipped (video-duration checks — structurally cannot pass without a recorded file, by design), 1 failed (`release-metadata-public-urls`: `webmcpVideoUrl`/`agentsForHumansVideoUrl` — human-only, see Known limitations) |
| `pnpm test:deployed` (`PAX_DEPLOYED_URL=https://pax-hackathon-production.up.railway.app`) | **11 passed, 1 skipped, 0 failed** against the live deployment (see Deployed checks) |

`pnpm verify` was run to a genuinely clean state three times at this exact commit; two intermediate attempts each surfaced one different, unrelated test failure (`events.sse.test.ts`, `agentcore.test.ts`, `debug.test.ts`) while a concurrent Railway Docker build and this machine's other sessions drove the load average above 20 — each failing test was independently confirmed to pass 100% in isolation immediately afterward, consistent with this session's established environment-contention diagnosis, not a defect in the code. The final clean run (`report.json` `gitSha: b9b0b60...`, `status: passed`) is the one recorded here.

## Coverage and mutation results

Coverage is a real, enforced release-gate stage (`test:coverage` = `vitest run --coverage`, added to `DEFAULT_STAGES` this session — previously `test:unit` ran without `--coverage`, so the configured thresholds were decorative; this was found and fixed).

| Metric | Result | Threshold |
|---|---|---|
| Statements | 97.81% | 95% |
| Branches | 95.76% | 90% |
| Functions | 98.43% | 95% |
| Lines | 98.00% | 95% |

Residual uncovered branches are documented in code rather than silently accepted: real Strands-SDK-adjacent "no result for node X" defensive guards (not reached without invasive SDK-internal mocking, a deliberate tradeoff), a few provably-dead duplicate guards and unset-field fallbacks, and `home-energy-swarm.ts`'s repetitive-handoff/wall-clock-timeout safety nets.

**Mutation testing** (Stryker, `packages/core/src` + `packages/packs/src`): **90.84%**, against a break threshold of 80% (high/low targets 90/70).

## Playwright projects and screenshot inventory

4 viewport projects (`right-pane-390` 390x844, `right-pane-430` 430x900, `right-pane-480` 480x900, `desktop-1440` 1440x1000) x 5 spec files (`car-purchase-journey`, `home-energy-guardian-journey`, `reload-persistence`, `error-recovery`, `keyboard-accessibility`) = 32 tests, all passing.

**48 named visual baseline screenshots**, added this session (previously zero existed — `screenshot: 'only-on-failure'` left no evidence on a passing run, and only `docs/architecture.png` was git-tracked before this):

- `tests/e2e/car-purchase-journey.spec.ts-snapshots/` — 24 PNGs
- `tests/e2e/home-energy-guardian-journey.spec.ts-snapshots/` — 24 PNGs
- States: `initial-launcher`, `seeded-case`, `recommendation-ready`, `recommendation-stale`, `awaiting-approval`, `decided`, each x 4 viewports.
- Confirmed genuinely deterministic (zero pixel diff) across 8+ consecutive runs. Two real sources of run-to-run visual noise were found and fixed at the causal level, not masked over: every event's real wall-clock timestamp and generated run/command ids (masked at the correct DOM boundary after a failed double-run traced a 1-2px sibling shift to timestamp-text width), and — a genuinely interesting finding — car-purchase's real Strands Graph fans 4 specialist nodes out in parallel, producing an identical final case state and event set every run but a genuinely different interleaved order (confirmed via 3 independent direct-API runs), which was made deterministic for screenshot purposes by hiding (not masking) the two variable-height regions this affects.
- **Visually inspected as a set** (required before completion, not merely pixel-diffed): legible and structurally sound at all four viewports; `desktop-1440` correctly renders the canonical narrow right-pane content capped at 480px max-width, not a stretched dashboard, matching CLAUDE.md's "390-480px ChatGPT right pane, not a desktop dashboard shrunk after the fact." The UI is functionally correct and calm but visually plain — the shadcn/ui redesign the user asked for is real, queued work, not yet done (see Known limitations).

## Railway deployment

| Field | Value |
|---|---|
| Project | `pax-hackathon` (`1c02545d-5ed3-4ac6-82dc-fad2e09e8999`) |
| Service | `pax-hackathon` (`e98affa7-2756-4f5a-bbae-d3e84a06ced7`) |
| Environment | `production` (`9e0c95c9-2f33-431a-93c3-1a592a069d00`) |
| Volume | `pax-hackathon-volume` (`477985d7-abfe-4216-8281-fa01b3e7b508`), mounted at `/data` |
| Latest deployment | `54fd4ac5-6094-4df1-9f8e-621ae0e00370` — `SUCCESS`, built from this exact final commit |
| Public URL | https://pax-hackathon-production.up.railway.app |

### Deployed checks (`pnpm test:deployed`, real network, against the live URL above)

11 passed, 1 skipped, 0 failed: `health`, `static-assets`, `spa-no-catchall`, `fixture-case`, `investigation-run`, `inspector-availability`, `cors`, `agentcore-ping`, `agentcore-invocations-car-purchase`, `agentcore-invocations-home-energy-guardian`, and — notably — **`redeploy-persistence`**, which proved a real case and its 244 runtime events survived the actual redeploy just performed to bring the live service onto this final commit. The one skip, `webmcp-client-registration`, genuinely requires a real WebMCP-enabled browser (ChatGPT in-app browser or a flagged Chrome build) this script cannot drive from a CI-style network check.

### AWS Bedrock AgentCore

**Not deployed — external blocker, not a shortcut taken.** No AWS credentials were available in this build environment. The AgentCore-compatible routes (`/ping`, `/invocations`) are real, implemented, and verified against the live Railway deployment (`PAX_EXECUTION_TARGET=local`) for both hero packs, including the structural authority boundary (`reviewProposal`/`reviewCaseExtension` are excluded from the AgentCore-reachable command surface — a consequential decision can never be approved through this channel). If AWS credentials become available, deploying to Bedrock AgentCore and testing `/ping` plus one invocation per hero pack is the remaining step.

## Known limitations

- **UI visual design is queued, not done.** Per explicit user instruction this session ("The UI is secondary to everything working though, but add it to your queue"), the shadcn/ui + Tailwind "reusable components across the board" redesign pass was deliberately deprioritized behind functional completeness and has not been started beyond the Tailwind styling already in place. The product is fully functional and was visually inspected as legible, calm, and structurally correct at every required viewport — it is simply visually plain.
- **Home Energy Guardian's round-2 re-investigation has no dedicated visible-UI control.** This is a pre-existing, deliberately scoped and already-documented limitation (`apps/agent/src/services/command-service.ts`'s own header comment: obligation-derivation from `updateCriteria` was explicitly deferred as out-of-scope business logic, not missed), independently rediscovered and confirmed live by two separate paths this session (the new E2E journey spec, and — already, before this session's work — the Agents for Humans demo script's own "Flagged gap #2," which documents the identical `"No open obligation remains to select"` failure and the exact working fallback phrasing/API call). The required demo sequence explicitly permits "the user or ChatGPT" to drive this step, so it is spec-compliant, not broken — but a bystander clicking the bare visible button alone, with no WebMCP client and no knowledge of the API fallback, cannot complete this pack's full journey unaided. car-purchase does not have this gap because its own equivalent step (a custom concern) creates a genuinely new obligation the generic button auto-selects.
- **GitHub repository is still private.** Must be flipped to public before final submission — a deliberate, reversible human decision this build environment does not make unilaterally.
- **Two demo videos are not recorded.** Both shot-by-shot scripts exist and are ready to follow: `docs/submissions/webmcp/demo-script.md` (under 3:00) and `docs/submissions/agents-for-humans/demo-script.md` (under 5:00). `docs/submissions/release-metadata.json`'s `webmcpVideoUrl`/`agentsForHumansVideoUrl` are deliberately left empty until recorded and uploaded.
- **Real WebMCP client registration is untested by automation.** `pnpm test:deployed`'s one skip; genuinely requires a ChatGPT in-app browser or a flagged Chrome build. Per `docs/specs/testing.md`, record one manual host smoke test (timestamp, deployed URL, tool names discovered, outcome) and list it in `release-metadata.json`'s `webmcpTestClients`.
- **AWS Bedrock AgentCore is not deployed** — no AWS credentials in this environment (see above).

## Demo recording steps

1. **WebMCP demo** (car-purchase, under 3:00): follow `docs/submissions/webmcp/demo-script.md` exactly, recording in a WebMCP-capable browser (ChatGPT in-app browser, or Chrome with the WebMCP origin trial flag) against the live deployment. The script is honest about what is and is not reachable through a plain click versus a ChatGPT tool call.
2. **Agents for Humans demo** (home-energy-guardian, 5:00 or under): follow `docs/submissions/agents-for-humans/demo-script.md`. Rehearse "Flagged gap #2" (the criteria-reweight / round-2 trigger beat) once before recording, exactly as that script instructs, to confirm the exact phrasing/API call works before going live.
3. Upload both recordings, then set `webmcpVideoUrl` and `agentsForHumansVideoUrl` in `docs/submissions/release-metadata.json`.
4. Flip the GitHub repository to public.
5. Re-run `pnpm verify` and `pnpm test:submission` one final time at the exact commit being submitted, so `release-verification-sha` matches through to submission.

## Final state

- `docs/build-log.md` and `docs/preimplementation-audit.md` record the phase-zero gate and task-by-task history.
- MIT `LICENSE`, `.env.example`, `docs/architecture.mmd`/`docs/architecture.png`, `docs/reuse-attribution.md` (297 lines of real attribution), submission copy, and demo scripts all exist and are verified present by `pnpm test:submission`'s `required-files` check.
- Every machine-verifiable item in the shared and competition-specific submission checklists is green; the human/legal attestations named above remain explicitly assigned to the submitter.
- **Final git SHA:** `b9b0b60a6dba66186befef46efaddf8bace3c285`
