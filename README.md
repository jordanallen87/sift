# Sift

Sift is a real-time, source-linked decision workspace. A person and a bounded [Strands](https://github.com/strands-agents) agent runtime work in the same browser-visible case: the agent investigates unresolved questions, changes technique when evidence warrants it, and pauses whenever human judgment or approval is required. A deterministic TypeScript core — not the model — owns case state, evidence validity, readiness, and the ranking itself; the model may propose a recommendation but can never approve one on the user's behalf, and every number attached to that recommendation is computed rather than asserted.

Sift ships two versioned **Decision Packs**, each pinned by ID/version/compiled hash on the case that uses it:

- **Choose Our Next Car** — compare shortlisted vehicles and dealer offers before buying. The WebMCP-first hero: ChatGPT's in-app browser can drive the same commands as the visible page.
- **Home Energy Guardian** — investigate why a utility bill changed. The AWS/Strands-first hero, built around a bounded Strands Swarm with specialist handoffs.

This is a dual-hackathon submission (the OpenAI WebMCP Challenge and the AWS Agents for Humans Hackathon). Full product and engineering specifications live in [`docs/specs`](docs/specs); [`docs/specs/README.md`](docs/specs/README.md) is the canonical index and precedence rule if anything here and a spec ever disagree.

## Live demo

**https://pax-hackathon-production.up.railway.app**

The deployment is a single Railway service (Docker image, `SIFT_EXECUTION_TARGET=local`) with a persistent SQLite volume. Both hero packs are wired to live engines at boot and run end to end on the deployment today: **Choose Our Next Car** (a real Strands Graph) and **Home Energy Guardian** (a real bounded Strands Swarm, including a real `ConsequenceGuard` confirmation gate before it ever proposes a home inspection).

No AWS credentials are configured for this deployment, so it runs the `local` Strands execution target rather than Bedrock AgentCore; that is an honest, documented external blocker, not a missing feature.

The GitHub repository is currently private (`https://github.com/jordanallen87/sift`); it will be made public before final submission.

## Local setup

Requirements: Node.js 20+ (developed against Node 22) and pnpm 11.24.0 (pinned via `packageManager` in `package.json` — `corepack enable` will pick it up automatically). `better-sqlite3` compiles a native addon at install time; see [Troubleshooting](#troubleshooting) if that step fails.

```bash
git clone https://github.com/jordanallen87/sift.git
cd sift
pnpm install
cp .env.example .env
```

`.env.example` documents every supported variable (execution target, data directory, debug/authoring toggles, model ID, AWS region, public origin). The defaults are correct for local development — nothing else needs to be filled in to run the product locally.

### Running the app

Sift runs as two processes in development: the Express/Strands agent service and the Vite dev server for the React app, which proxies `/api/*` requests to the agent.

Terminal 1 — agent/API service (listens on port `8080` by default; runs migrations automatically and idempotently on every boot):

```bash
pnpm --filter @sift/agent start
```

Terminal 2 — web app (Vite dev server, default port `5173` — Vite will pick the next free port and print it if `5173` is busy, so check the terminal output):

```bash
pnpm --filter @sift/web dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

In production (and in the Docker image), there is no separate dev server: the agent process builds and serves the web app's static bundle itself from the same origin (see [Deployment](#deployment)).

## Running the demo locally

1. Open the web app. The launcher's primary action is **"Compare vehicles"**; below it, under **"Or try a finished example,"** are the two original demo cards: **"Choose our next car"** and **"Investigate my energy bill."**
2. Click **"Choose our next car"** to start the car-purchase case from its checked-in fixture (a fresh case ID every time), then **"Request investigation"** to drive the live Strands Graph. The page's answer-first hero, workspace view switcher (Quick Pick/List/Compare/Board), readiness ("Still checking"), and findings update in real time from the same event stream, edit criteria or candidates, and review the resulting recommendation. The raw chronological activity ledger is developer-only now (see step 4) rather than a consumer-surface card.
3. **"Investigate my energy bill"** starts the Home Energy Guardian case the same way, driving a real bounded Strands Swarm across its six specialists instead of a Graph — including a real steering intervention on repeated evidence-gathering and a `ConsequenceGuard` confirmation gate before it will ever propose a home inspection.
4. Open the Runtime Inspector either way: click the small **"Developer view"** icon in the case header (always available once a case is open, no run required) or **"Inspect run"** in the hero once a run is active (pre-targets the inspector at that specific run). Either entry point drills into real Strands TypeScript lifecycle-hook events (`BeforeToolCallEvent`/`AfterToolCallEvent`/`BeforeModelCallEvent`/`AfterModelCallEvent`, plus `BeforeNodeCallEvent`/`NodeResultEvent` and the Swarm's `MultiAgentHandoffEvent`), correlated by a Sift-minted trace id, with state diffs and redactions, and a consumer activity item's own "Inspect event" control (inside the inspector's Activity tab) jumps straight to its exact Timeline entry. This currently ships as an Overview + Timeline + Activity slice; the fuller Execution/State/Context/Errors views described in `docs/specs/debugging-and-observability.md` are tracked as follow-on work, not yet built. **That spec's OpenTelemetry section is also unbuilt:** Sift never calls the Strands SDK's `setupTracer()`, so no OTEL span is produced and setting `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS` has no effect — the inspector's correlation ids are Sift's own, not span ids (`docs/submissions/webmcp/claim-evidence-matrix.md` rows E8/E9). Note: the "Developer view" control is not itself gated by `SIFT_DEBUG_ENABLED` — only the server-side debug routes it depends on are (see that spec's "Acceptance requirements").

## Vehicle catalog and "Compare vehicles"

Beyond the two seeded demos, Sift is a normal, useful vehicle-comparison product on its own (`docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md`): click **"Compare vehicles"** to browse a bundled, offline catalog of real published vehicle specifications (year/make/model/trim/body style/drivetrain/powertrain/combined fuel economy — sourced from the EPA's public fueleconomy.gov dataset, see `docs/reuse-attribution.md`), build a 2–5 vehicle shortlist, and start a real, persisted `car-purchase` case from it (`startCase`, then one `upsertOption` per vehicle — the exact same commands the visible UI and WebMCP already share). From there you can add listing-specific facts, change criteria, submit your own sources, and record findings yourself. Guided/automated investigation (`requestInvestigation`) currently runs only against the deterministic example case above; a catalog-built case's investigation request fails fast with a clear, honest explanation rather than a crash or a fabricated result — every other capability works identically on both kinds of case.

## A generic decision workspace, not a car-only tool

Sift's underlying engine is domain-generic: a **Decision Pack** supplies the vocabulary, defaults, and orchestration for one class of decision, and a **case** is one person's actual use of a pinned pack version. Choose Our Next Car and Home Energy Guardian are the two hackathon hero packs, not the limit of what the architecture supports.

Inside any comparison-shaped case (Choose Our Next Car today), the workspace offers four purpose-built ways to work through options — **Quick Pick** (one-at-a-time triage with Pass/Maybe/Shortlist), **List** (a compact card per option), **Compare** (a configurable table, head-to-head at narrow widths), and **Board** (movable status columns) — switchable by the user or by ChatGPT through WebMCP, sharing one view state so the two stay in sync. When a user raises a concern the pack never anticipated (`"I work on my laptop in the car and need the console to support that"`), Sift creates a typed, provenance-tracked custom comparison field on the spot rather than forcing the conversation into free text; the field renders beside native fields, ChatGPT can populate it with sourced research, and an unsupported subjective judgment stays honestly unknown rather than becoming a fabricated value. See `docs/specs/product.md` for the full consumer-facing contract and `docs/specs/webmcp.md` for exactly which of this is reachable from ChatGPT today.

## The ranking is computed, not asserted

Ask most AI shopping tools why something came first and you get a paragraph the model wrote. Sift
computes the ranking deterministically in `packages/core` from your criteria and the evidence
actually gathered, and can show its work line by line: what each criterion contributed, which way it
was scored, and what it could not score at all. Change a weight and the order moves immediately,
with no model call.

That machinery is built around a handful of rules that matter more than the arithmetic:

- **An unknown is never a zero.** An option nobody has finished researching is not ranked last
  _because_ nobody finished researching it. Missing evidence lowers the stated **coverage**, never
  the score — so "82% of your criteria, measured across 45% of what matters" reads as the weaker
  claim it is.
- **A hard requirement flags; it never silently eliminates.** An option that fails something you
  called non-negotiable stays on the board, fully scored and clearly labelled, ranked last. Removing
  it on your behalf is not the software's call.
- **A disputed fact is not a settled one.** When sources contradict each other, the value still
  counts but is marked as contested — and Sift tells you when the leader's lead actually _depends_
  on it, verified by removing that criterion and checking whether the order flips.
- **Refuse rather than invent.** Mixed currencies, incomparable units, and free-text judgments are
  reported as not comparable instead of being coerced into a number.

The same engine validates the model's own recommendation. When the model's favorite is not the
option your criteria put first, Sift says so in plain words and caps its own confidence rather than
quietly overriding the model or quietly agreeing with it. On the shipped car demo it does exactly
that. See [`docs/decisions/0012-deterministic-scoring-and-insights.md`](docs/decisions/0012-deterministic-scoring-and-insights.md).

## WebMCP

Sift registers structured tools on `document.modelContext` (the WebMCP browser API) so an agent host can operate the live page directly through the same command layer the visible UI uses — there is no WebMCP-only mutation path. The full tool catalog (`sift_get_case_context`, `sift_focus_evidence`, `sift_upsert_option`, `sift_update_criteria`, `sift_request_investigation`, and more) is documented in [`docs/specs/webmcp.md`](docs/specs/webmcp.md).

**To actually exercise WebMCP you need a genuinely WebMCP-enabled client** — `document.modelContext` is not present in a stock browser. That currently means ChatGPT's WebMCP-capable in-app browser, or a Chrome build with the relevant flag/origin trial enabled. In any other browser (a normal Chrome, Firefox, or Safari tab), Sift detects the missing API and shows a non-blocking **"WebMCP unavailable in this browser"** notice — the page itself remains fully usable through its visible controls. This is correct, tested fallback behavior, not a bug: do not expect WebMCP tool discovery to "just work" in an ordinary browser tab.

## Testing and verification

```bash
pnpm verify
```

runs the ordered release-gate stages defined in `scripts/verify.ts`, fails fast on the first real failure, and always writes a machine-readable report to `artifacts/verification/latest/report.json` (plus `summary.md` on failure). As of this writing the stages are:

| Stage              | Status |
| ------------------ | ------ |
| `format:check`     | real   |
| `lint`             | real   |
| `typecheck`        | real   |
| `test:unit`        | real   |
| `test:coverage`    | real   |
| `test:pack`        | real   |
| `test:integration` | real   |
| `test:contract`    | real   |
| `test:scenario`    | real   |
| `test:e2e`         | real   |

`pnpm verify` runs with no network access once dependencies and Playwright browsers are installed.

Individual stages can be run directly, e.g. `pnpm test:unit`, `pnpm lint`, `pnpm typecheck`. `pnpm test:e2e` builds the production web bundle first and then runs the real Playwright suite (`pnpm --filter @sift/web build && playwright test`) against the real Express server at `390x844`, `430x900`, `480x900`, and `1440x1000` viewports.

`pnpm test:coverage` (`vitest run --coverage`) runs the same full suite as `pnpm test:unit` but also measures coverage and enforces `vitest.config.ts`'s `coverage.thresholds` (branches 90%, functions/lines/statements 95%) — Vitest itself exits non-zero on a threshold miss, and `pnpm verify` fails the whole gate if it does. A coverage HTML/LCOV/JSON-summary report is written to `artifacts/verification/coverage/`.

`pnpm test:deployed` is opt-in and exercises a **live** deployment rather than a local build — it needs `SIFT_DEPLOYED_URL` set to the target's base URL, e.g.:

```bash
SIFT_DEPLOYED_URL=https://pax-hackathon-production.up.railway.app pnpm test:deployed
```

It checks health/static assets, a real fixture case and investigation run, Runtime Inspector availability, same-origin CORS, and — its core assertion — that a case survives a real Railway redeploy byte-identically.

`pnpm test:host` is opt-in and drives a **real WebMCP host** against a running instance. Chrome 152 ships WebMCP natively (`document.modelContext`) and exposes a `WebMCP` CDP domain, so the host acceptance session is automated rather than transcribed by hand (ADR 0013):

```bash
SIFT_HOST_URL=https://pax-hackathon-production.up.railway.app pnpm test:host
```

It launches Chrome with a throwaway profile — never your own — and checks tool discovery before and after a case exists, that JSON schemas reach the host, that a person's click in the pane is visible to the host and the host's write is visible in the pane without a reload, that a write with no `expectedSequence` is refused, that **no tool in the catalog can approve a decision**, an investigation from request to recommendation, reload persistence, and re-registration after a host reconnect. Evidence and screenshots land in `artifacts/host-acceptance/<runId>/`.

Two things it does not prove, and says so in its own report: it is **Chrome, not ChatGPT** (a page cannot tell hosts apart, so the page-side contract is the same, but naming a product needs a session in that product), and **no model chose anything** — the script picks every call. It exits non-zero rather than reporting a pass when no WebMCP host is available, and never falls back to Playwright's bundled Chromium, which has no WebMCP at all.

`pnpm test:journey` runs four **turn-based journeys** through the rendered pane in the same real WebMCP browser, and after every turn evaluates three things separately (ADR 0014):

| Kind        | Question                                               |
| ----------- | ------------------------------------------------------ |
| `data`      | Is the case state what this turn should have produced? |
| `ui`        | Does the pane show what a person should now see?       |
| `agreement` | Do those two describe the same case?                   |

```bash
SIFT_HOST_URL=http://localhost:8080 pnpm test:journey            # all four
SIFT_HOST_URL=http://localhost:8080 pnpm test:journey webmcp-hero
```

The journeys are `webmcp-hero` (the eight beats of the WebMCP demo script, with every assistant action a real tool call), `aws-hero` (the Strands runtime claims of the AWS demo script), `shared-control` (a person and a host alternating on one case), and `family-novice` (a first-time person answering questions on screen). A turn is taken by the **person**, through visible controls, or by the **assistant**, through WebMCP — interleaving them is the only way to test the claim that both reach the same command implementation. Screenshots and a `summary.md` land in `artifacts/journey/<runId>/`; they are the input to `docs/ux-review-2026-09-02.md`.

`pnpm webmcp:bridge` lets a **real model** drive the page. It is a stdio MCP server that maps `tools/list` to the page's live WebMCP registrations and `tools/call` to `WebMCP.invokeTool`, so Codex, Claude Code, or any MCP client can operate Sift with the real tool descriptions:

```jsonc
{
  "mcpServers": {
    "sift-page": {
      "command": "pnpm",
      "args": ["-s", "webmcp:bridge"],
      "env": { "SIFT_HOST_URL": "http://localhost:8080" },
    },
  },
}
```

This is the half no scripted harness can reach — whether a model _finds_ the tools and sequences them sensibly. It is a development tool, not part of the product, and it hands a model real control of a real page: point it at a local build, not at anything whose state you care about.

```bash
pnpm verify:release
```

runs `pnpm verify` (above), then `pnpm test:mutation` (real Stryker-based mutation testing, invoked as a plain external command), a production build check (`pnpm --filter @sift/web build`), a Docker build contract check (`docker build -t sift-release-check .` against the repo-root `Dockerfile` — honestly skipped with a reason if the `docker` CLI is not available in the current environment, never silently passed), and `pnpm test:submission`. It fails fast on the first real stage failure and always writes a machine-readable report to `artifacts/verification/release-latest/report.json` (plus `summary.md` on failure), separate from `pnpm verify`'s own `artifacts/verification/latest/report.json` so both remain independently inspectable.

`pnpm test:submission` (`scripts/test-submission.ts`) is the automated half of `docs/submissions/`: it checks that required submission files exist, README commands match real `package.json` scripts, `LICENSE` is present and MIT, `.env.example` contains no likely secrets, the architecture diagram source/export exist, fixture/reuse attribution is real, both hero scenarios' deterministic assertion reports exist and passed, the latest `pnpm verify` report's Git SHA matches the current commit, any present demo recording is within its competition's time limit, and required public URL fields are set in `docs/submissions/release-metadata.json`. It never marks eligibility, country, submitter type, learning, career-value, AWS Builder ID ownership, or other personal/legal attestations complete — those stay human-only gates in the Markdown checklists under `docs/submissions/`. `docs/submissions/release-metadata.json` now exists and both hero scenarios' reports (`artifacts/verification/scenarios/car-purchase/`, `artifacts/verification/scenarios/home-energy-guardian/`) have been generated; the video URL fields in that metadata file remain empty pending the actual demo recordings — see the checklists under `docs/submissions/` for current submission-readiness status rather than treating this paragraph as a live status report.

```bash
pnpm test:persona
```

runs the **persona UX harness** (`scripts/test-persona.ts`): three scripted people — a family novice, a landscaping business owner, and someone who arrives with one specific vehicle already in mind — walked through the real stack in process, then checked against eleven deterministic hard gates.

The executor answers whatever Sift actually asks rather than replaying a fixed input per turn, so the landscaping journey diverges from the family journey because the pack's conditional topics diverge, not because two scripts differ.

Two things it will not do. It never invents a usability score: a run with no diagnostic pass reports `scored: false` rather than a number, and a `DiagnosticScore` with no cited turn evidence cannot be constructed at all. And it never reports a gate it could not check as passing — accessibility, console/network, and unsupported-claim gates report `not_evaluated` with a reason, because an in-process run has no browser console, no axe tree, and no model-authored prose to inspect. Per-turn reports land in `artifacts/persona/<persona>.json`.

`test:observability` and `test:live` remain declared stubs (`scripts/stage-not-implemented.ts`) — they print an honest "not yet implemented" message and exit `0`; do not treat either as release evidence yet. See [`docs/specs/testing.md`](docs/specs/testing.md) for the full intended verification pyramid and which layers are real today.

## Architecture

Sift is a pnpm TypeScript monorepo:

```text
sift/
  apps/
    web/         React 19 + Vite right-pane app; WebMCP registration
    agent/       Express + Strands TypeScript service; also serves the built web app in production
  packages/
    contracts/   Zod schemas and shared API/event types
    core/        Pure case reducer, routing, obligations, evidence, readiness, scoring (no React/Express/Strands/model deps)
    packs/       Decision Pack compiler, registry, built-in manifests, authoring tools
    scenarios/   Fixture data, scripted tools, scenario runner, assertions
  tests/         contract, integration, scenario, e2e (Playwright), and opt-in live suites
  scripts/       verification orchestration, the sift CLI, report generation
  docs/          specs, architecture diagram, build log, submission materials
```

The browser owns visible interaction and WebMCP registration; the Express/Strands service owns agent execution, intervention handling, and persistence; the pure `packages/core` engine owns routing, obligations, evidence, readiness, and scoring so it can be tested without a model, browser, or network. Every canonical mutation is an append-only domain event committed transactionally to SQLite alongside its derived snapshot (`better-sqlite3` + Drizzle migrations, WAL mode); a separate sanitized `activity_events` stream feeds the real-time UI over server-sent events, and `runtime_events` feeds the Runtime Inspector — neither can mutate case state.

Full detail — the command/event flow, the canonical `CaseState` shape, the real-time SSE contract, persistence schema, and security boundaries — is in [`docs/specs/architecture.md`](docs/specs/architecture.md). A rendered diagram is at [`docs/architecture.png`](docs/architecture.png) (source: [`docs/architecture.mmd`](docs/architecture.mmd), regenerate with `pnpm docs:diagram`).

A local, bounded `pack-authoring` CLI (`pnpm sift pack:author`, gated behind `SIFT_AUTHORING_ENABLED=true`) lets you draft, validate, test, diff, and (with explicit human confirmation) publish a new Decision Pack. It is disabled by default and in the public deployment. See [`docs/specs/pack-authoring.md`](docs/specs/pack-authoring.md).

## Deployment

The production image is a single-stage `node:22-bookworm-slim` build (`Dockerfile`) — not multi-stage, because `better-sqlite3` is a native addon compiled during `pnpm install` and the agent's `start` script runs TypeScript directly via `tsx`, so the runtime container needs the same toolchain-built `node_modules` either way. The image installs `python3`/`make`/`g++` for the native build, runs `pnpm install --frozen-lockfile`, builds `apps/web` so the agent's `express.static` has a real bundle to serve, and starts with `pnpm --filter @sift/agent start` listening on port `8080`. Migrations run automatically and idempotently on every boot, including every restart or redeploy.

The live deployment was created with the Railway CLI:

```bash
railway whoami
railway up --new --name pax-hackathon --json -y --detach
railway volume add --mount-path /data --json
railway variable set SIFT_DATA_DIR=/data --json
railway domain --port 8080 --json
```

Current identifiers (workspace "JAllen's Projects"): project `pax-hackathon` (`1c02545d-5ed3-4ac6-82dc-fad2e09e8999`), service `pax-hackathon` (`e98affa7-2756-4f5a-bbae-d3e84a06ced7`), environment `production` (`9e0c95c9-2f33-431a-93c3-1a592a069d00`), volume `pax-hackathon-volume` (`477985d7-abfe-4216-8281-fa01b3e7b508`) mounted at `/data`, public domain `pax-hackathon-production.up.railway.app`.

> **On the `pax-` prefix above:** the product was renamed from Pax to Sift on 2026-08-30, but these Railway resources and the public domain deliberately keep their original names. The domain is already published in `docs/submissions/release-metadata.json` and quoted in both demo scripts, so renaming it would break links a judge may already hold. These identifiers describe live infrastructure and are recorded here as they actually are, not as the new product name would suggest. The database file inside the volume _is_ renamed (`pax.sqlite` → `sift.sqlite`); `apps/agent/src/db/connection.ts` adopts the existing file on first boot after the rename, so no deployed data is lost.

`SIFT_EXECUTION_TARGET=agentcore` is supported for pointing execution at a deployed Amazon Bedrock AgentCore runtime (`/ping` and `/invocations`, per the AgentCore contract) instead of running the Strands adapter in-process; this deployment currently runs `local` because no AWS credentials were available at deploy time.

## Troubleshooting

- **`better-sqlite3` fails to build during `pnpm install`.** It compiles a native addon and needs a working C/C++ toolchain: on macOS, install Xcode Command Line Tools (`xcode-select --install`); on Debian/Ubuntu-based Linux, `python3`, `make`, and `g++` (exactly what the Dockerfile installs for the container build). Node 20+ is required.
- **The app loads blank / 404s at `/` when only running the agent process.** `apps/agent`'s Express app only serves `apps/web`'s static bundle when `apps/web/dist` exists on disk. In local development, run the Vite dev server (`pnpm --filter @sift/web dev`) instead of expecting the agent alone to serve the UI — it proxies `/api` for you. If you specifically want to test the production static-serving path locally, run `pnpm --filter @sift/web build` first so `apps/web/dist` exists, then start the agent.
- **Port already in use.** The agent defaults to `8080` (override with `PORT`); if something else is already listening there, set `PORT` before starting it and update `apps/web/vite.config.ts`'s proxy target if you change it. The Vite dev server defaults to `5173` but will silently move to the next free port and print the actual URL — always check the terminal output rather than assuming `5173`.
- **`pnpm install --frozen-lockfile` fails after editing a `package.json` by hand.** Run `pnpm install` (without the flag) to regenerate `pnpm-lock.yaml`, then re-run with `--frozen-lockfile` to confirm it's reproducible.

## License

MIT — see [`LICENSE`](LICENSE).
