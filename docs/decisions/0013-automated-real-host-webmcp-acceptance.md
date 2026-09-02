# 0013 — Real-host WebMCP acceptance is automated, not transcribed

**Date:** 2026-09-02
**Status:** Accepted
**Supersedes:** the manual host-smoke allowance in `docs/specs/testing.md` "External hosts"

## Context

`docs/specs/testing.md` said this:

> The ChatGPT in-app browser itself is an external host that cannot be run in repository CI. Release evidence therefore includes one manual host smoke record with timestamp, deployed URL, tool names discovered, and outcome.

That was accurate when written. Every WebMCP host then available was a product with a chat UI and no control surface, so the only way to observe real tool discovery was for a person to sit in front of one and write down what they saw. `docs/submissions/webmcp/host-acceptance.md` recorded the session as **not performed**, and `claim-evidence-matrix.md` row E6 carried it as the one release claim with no repository evidence behind it at all.

Everything page-side was covered — `webmcp-contract.test.ts` pins all 26 tool names, descriptions, and schemas, and drives them through `InMemoryModelContextAdapter`. But a test double proves the code agrees with itself. It cannot prove a browser's own WebMCP implementation accepts the schemas, delivers the calls, or returns the envelopes.

**Chrome 152 changed the available facts.** It ships WebMCP natively in Blink — `document.modelContext` with `registerTool`, `getTools`, `executeTool`, and an `ontoolchange` event — and, decisively, exposes a `WebMCP` CDP domain:

| | |
| --- | --- |
| Commands | `enable`, `disable`, `invokeTool`, `cancelInvocation` |
| Events | `toolsAdded`, `toolsRemoved`, `toolInvoked`, `toolResponded` |

`Tool` carries `name`, `description`, `inputSchema`, `frameId`, and the registration `stackTrace`. `invokeTool` is frame-scoped and returns an `invocationId`; the result arrives on `toolResponded` with `status` and `output`.

That is a real host with a real control surface. The premise of the manual allowance — that no host can be driven — no longer holds.

## Decision

**1. `pnpm test:host` replaces the manual host-smoke record.** `scripts/test-host.ts` launches the installed Chrome against a running Sift instance and drives the acceptance session over CDP: discovery before and after a case exists, schema delivery, read tools, a person acting in the pane, the host acting on the case, blind-write refusal, the absence of any approval tool, an investigation watched to its recommendation, reload persistence, and host reconnect. It writes evidence and screenshots to `artifacts/host-acceptance/<runId>/`.

**2. It is opt-in and never part of `pnpm verify` or `pnpm verify:release`.** Both must run with no network and no browser download. This gate needs a specific browser build and a running instance, so it stays a deliberate command.

**3. It refuses to degrade into a green run that proves nothing.** No Chrome, no `WebMCP` CDP domain, or no `SIFT_HOST_URL` exits non-zero with the reason. It never falls back to Playwright's bundled Chromium, which has no WebMCP at all — a fallback there would report a pass for a browser that cannot host a single tool.

**4. The evidence names its own limits, in the artifact.** Every `report.json` carries a `doesNotProve` array, and it is not decoration:

- **This is not ChatGPT.** It is Chrome's WebMCP implementation. A page cannot tell one host from another, so the page-side contract proven here is the contract any host exercises — but a claim naming a product still needs a session in that product.
- **No model chose anything.** The script picks every call. It proves the tools are callable and correct, not that a model discovers them, sequences them sensibly, or reads their descriptions the way a person would want.

**5. The remaining manual session is narrowed, not eliminated.** What still requires a person in a specific product is exactly the two things above: that product's own discovery, and a model's unaided use of the catalog. Everything mechanical is now automated.

## Consequences

**`WebMcpStatus` stopped naming a product.** The supported-state copy read *"WebMCP ready — ChatGPT can operate this page directly."* The first real host to render that line was Chrome — the pane told the person an assistant that was not there was driving. `adapter.supported()` is a feature detect for `document.modelContext`; it proves a host exists and reveals nothing about which one. The line now reads *"WebMCP ready — a connected assistant can operate this page directly,"* and a test pins that it names no product. **This defect was reachable only by rendering the page in a real host** — every unit test passed before and after.

**One deliberate reported gap.** `activeRun.runId` is populated only while a specialist holds an obligation, and the fixture run resolves faster than a one-second poll, so the harness usually reports `(never sampled in flight)` while still proving the host read the finished recommendation. That is reported rather than smoothed over: the honest statement is that the host saw the outcome, not that it watched the work.

**`test:deployed`'s note is now wrong and was corrected.** Its header said WebMCP registration "needs a real WebMCP-enabled browser this script cannot drive". True of that script; no longer true of the repository.

## Alternatives rejected

**Keep the manual record.** It was the honest answer to "no host can be driven", and that sentence stopped being true. A manual transcript is also unrepeatable — it cannot catch a regression on the next commit, which is precisely what a release gate is for.

**Use a WebMCP polyfill or the MCP-B extension.** Either would test the polyfill's interpretation of the spec rather than a browser's. `adapter.ts` already documents why no polyfill ships in production; adding one in the test path would prove the wrong thing more conveniently.

**Fold it into `pnpm verify`.** Verify must run offline and without a browser download. Making the strongest available WebMCP evidence conditional on a specific Chrome build in the mandatory gate would either weaken verify or make it unrunnable on a clean checkout.
