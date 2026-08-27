# Pax

Pax is a real-time, source-linked decision workspace. A person and a bounded [Strands](https://github.com/strands-agents) agent runtime work in the same browser-visible case: the agent investigates unresolved questions, changes technique when evidence warrants it, and pauses whenever human judgment or approval is required. A deterministic TypeScript core — not the model — owns case state, evidence validity, and readiness; the model may propose a recommendation but can never approve one on the user's behalf.

Pax ships two versioned **Decision Packs**, each pinned by ID/version/compiled hash on the case that uses it:

- **Choose Our Next Car** — compare shortlisted vehicles and dealer offers before buying. The WebMCP-first hero: ChatGPT's in-app browser can drive the same commands as the visible page.
- **Home Energy Guardian** — investigate why a utility bill changed. The AWS/Strands-first hero, built around a bounded Strands Swarm with specialist handoffs.

This is a dual-hackathon submission (the OpenAI WebMCP Challenge and the AWS Agents for Humans Hackathon). Full product and engineering specifications live in [`docs/specs`](docs/specs); [`docs/specs/README.md`](docs/specs/README.md) is the canonical index and precedence rule if anything here and a spec ever disagree.

## Live demo

**https://pax-hackathon-production.up.railway.app**

The deployment is a single Railway service (Docker image, `PAX_EXECUTION_TARGET=local`) with a persistent SQLite volume. Both hero packs are wired to live engines at boot and run end to end on the deployment today: **Choose Our Next Car** (a real Strands Graph) and **Home Energy Guardian** (a real bounded Strands Swarm, including a real `ConsequenceGuard` confirmation gate before it ever proposes a home inspection).

No AWS credentials are configured for this deployment, so it runs the `local` Strands execution target rather than Bedrock AgentCore; that is an honest, documented external blocker, not a missing feature.

The GitHub repository is currently private (`https://github.com/jordanallen87/pax`); it will be made public before final submission.

## Local setup

Requirements: Node.js 20+ (developed against Node 22) and pnpm 11.24.0 (pinned via `packageManager` in `package.json` — `corepack enable` will pick it up automatically). `better-sqlite3` compiles a native addon at install time; see [Troubleshooting](#troubleshooting) if that step fails.

```bash
git clone https://github.com/jordanallen87/pax.git
cd pax
pnpm install
cp .env.example .env
```

`.env.example` documents every supported variable (execution target, data directory, debug/authoring toggles, model ID, AWS region, optional OpenTelemetry exporter). The defaults are correct for local development — nothing else needs to be filled in to run the product locally.

### Running the app

Pax runs as two processes in development: the Express/Strands agent service and the Vite dev server for the React app, which proxies `/api/*` requests to the agent.

Terminal 1 — agent/API service (listens on port `8080` by default; runs migrations automatically and idempotently on every boot):

```bash
pnpm --filter @pax/agent start
```

Terminal 2 — web app (Vite dev server, default port `5173` — Vite will pick the next free port and print it if `5173` is busy, so check the terminal output):

```bash
pnpm --filter @pax/web dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

In production (and in the Docker image), there is no separate dev server: the agent process builds and serves the web app's static bundle itself from the same origin (see [Deployment](#deployment)).

## Running the demo locally

1. Open the web app. The launcher presents two options: **"Choose our next car"** and **"Investigate my energy bill."**
2. Click **"Choose our next car"** to start the car-purchase case from its checked-in fixture (a fresh case ID every time), then **"Request investigation"** to drive the live Strands Graph, watch skill activation, tool calls, evidence, and readiness update in real time in the activity ledger, edit criteria or candidates, and review the resulting recommendation.
3. **"Investigate my energy bill"** starts the Home Energy Guardian case the same way, driving a real bounded Strands Swarm across its six specialists instead of a Graph — including a real steering intervention on repeated evidence-gathering and a `ConsequenceGuard` confirmation gate before it will ever propose a home inspection.
4. Click **"Inspect run"** (next to the live run status, or on any activity item that carries a run) to open the Runtime Inspector and drill into correlated Strands hooks, OpenTelemetry spans, and state diffs. This currently ships as an Overview + Timeline slice; the fuller Execution/State/Context/Errors views described in `docs/specs/debugging-and-observability.md` are tracked as follow-on work, not yet built.

## WebMCP

Pax registers structured tools on `document.modelContext` (the WebMCP browser API) so an agent host can operate the live page directly through the same command layer the visible UI uses — there is no WebMCP-only mutation path. The full tool catalog (`pax_get_case_context`, `pax_focus_evidence`, `pax_upsert_option`, `pax_update_criteria`, `pax_request_investigation`, and more) is documented in [`docs/specs/webmcp.md`](docs/specs/webmcp.md).

**To actually exercise WebMCP you need a genuinely WebMCP-enabled client** — `document.modelContext` is not present in a stock browser. That currently means ChatGPT's WebMCP-capable in-app browser, or a Chrome build with the relevant flag/origin trial enabled. In any other browser (a normal Chrome, Firefox, or Safari tab), Pax detects the missing API and shows a non-blocking **"WebMCP unavailable in this browser"** notice — the page itself remains fully usable through its visible controls. This is correct, tested fallback behavior, not a bug: do not expect WebMCP tool discovery to "just work" in an ordinary browser tab.

## Testing and verification

```bash
pnpm verify
```

runs the ordered release-gate stages defined in `scripts/verify.ts`, fails fast on the first real failure, and always writes a machine-readable report to `artifacts/verification/latest/report.json` (plus `summary.md` on failure). As of this writing the stages are:

| Stage              | Status                                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| `format:check`     | real                                                                           |
| `lint`             | real                                                                           |
| `typecheck`        | real                                                                           |
| `test:unit`        | real                                                                           |
| `test:pack`        | real                                                                           |
| `test:integration` | real                                                                           |
| `test:contract`    | declared, not yet implemented — reported as `skipped`, never a fabricated pass |
| `test:scenario`    | real                                                                           |
| `test:e2e`         | real                                                                           |

`pnpm verify` runs with no network access once dependencies and Playwright browsers are installed.

Individual stages can be run directly, e.g. `pnpm test:unit`, `pnpm lint`, `pnpm typecheck`. `pnpm test:e2e` builds the production web bundle first and then runs the real Playwright suite (`pnpm --filter @pax/web build && playwright test`) against the real Express server at `390x844`, `430x900`, `480x900`, and `1440x1000` viewports.

`pnpm test:deployed` is opt-in and exercises a **live** deployment rather than a local build — it needs `PAX_DEPLOYED_URL` set to the target's base URL, e.g.:

```bash
PAX_DEPLOYED_URL=https://pax-hackathon-production.up.railway.app pnpm test:deployed
```

It checks health/static assets, a real fixture case and investigation run, Runtime Inspector availability, same-origin CORS, and — its core assertion — that a case survives a real Railway redeploy byte-identically.

`pnpm verify:release` is currently a declared stub (`scripts/stage-not-implemented.ts`) rather than a real composed gate — it prints an honest "not yet implemented" message and exits `0`; do not treat it as release evidence yet. `test:observability`, `test:mutation`, `test:live`, and `test:submission` are stubbed the same way. See [`docs/specs/testing.md`](docs/specs/testing.md) for the full intended verification pyramid and which layers are real today.

## Architecture

Pax is a pnpm TypeScript monorepo:

```text
pax/
  apps/
    web/         React 19 + Vite right-pane app; WebMCP registration
    agent/       Express + Strands TypeScript service; also serves the built web app in production
  packages/
    contracts/   Zod schemas and shared API/event types
    core/        Pure case reducer, routing, obligations, evidence, readiness (no React/Express/Strands/model deps)
    packs/       Decision Pack compiler, registry, built-in manifests, authoring tools
    scenarios/   Fixture data, scripted tools, scenario runner, assertions
    ui/          Reusable visual primitives and case components
  tests/         contract, integration, scenario, e2e (Playwright), and opt-in live suites
  scripts/       verification orchestration, the pax CLI, report generation
  docs/          specs, architecture diagram, build log, submission materials
```

The browser owns visible interaction and WebMCP registration; the Express/Strands service owns agent execution, intervention handling, and persistence; the pure `packages/core` engine owns routing, obligations, evidence, and readiness so it can be tested without a model, browser, or network. Every canonical mutation is an append-only domain event committed transactionally to SQLite alongside its derived snapshot (`better-sqlite3` + Drizzle migrations, WAL mode); a separate sanitized `activity_events` stream feeds the real-time UI over server-sent events, and `runtime_events` feeds the Runtime Inspector — neither can mutate case state.

Full detail — the command/event flow, the canonical `CaseState` shape, the real-time SSE contract, persistence schema, and security boundaries — is in [`docs/specs/architecture.md`](docs/specs/architecture.md). A rendered diagram is at [`docs/architecture.png`](docs/architecture.png) (source: [`docs/architecture.mmd`](docs/architecture.mmd), regenerate with `pnpm docs:diagram`).

A local, bounded `pack-authoring` CLI (`pnpm pax pack:author`, gated behind `PAX_AUTHORING_ENABLED=true`) lets you draft, validate, test, diff, and (with explicit human confirmation) publish a new Decision Pack. It is disabled by default and in the public deployment. See [`docs/specs/pack-authoring.md`](docs/specs/pack-authoring.md).

## Deployment

The production image is a single-stage `node:22-bookworm-slim` build (`Dockerfile`) — not multi-stage, because `better-sqlite3` is a native addon compiled during `pnpm install` and the agent's `start` script runs TypeScript directly via `tsx`, so the runtime container needs the same toolchain-built `node_modules` either way. The image installs `python3`/`make`/`g++` for the native build, runs `pnpm install --frozen-lockfile`, builds `apps/web` so the agent's `express.static` has a real bundle to serve, and starts with `pnpm --filter @pax/agent start` listening on port `8080`. Migrations run automatically and idempotently on every boot, including every restart or redeploy.

The live deployment was created with the Railway CLI:

```bash
railway whoami
railway up --new --name pax-hackathon --json -y --detach
railway volume add --mount-path /data --json
railway variable set PAX_DATA_DIR=/data --json
railway domain --port 8080 --json
```

Current identifiers (workspace "JAllen's Projects"): project `pax-hackathon` (`1c02545d-5ed3-4ac6-82dc-fad2e09e8999`), service `pax-hackathon` (`e98affa7-2756-4f5a-bbae-d3e84a06ced7`), environment `production` (`9e0c95c9-2f33-431a-93c3-1a592a069d00`), volume `pax-hackathon-volume` (`477985d7-abfe-4216-8281-fa01b3e7b508`) mounted at `/data`, public domain `pax-hackathon-production.up.railway.app`.

`PAX_EXECUTION_TARGET=agentcore` is supported for pointing execution at a deployed Amazon Bedrock AgentCore runtime (`/ping` and `/invocations`, per the AgentCore contract) instead of running the Strands adapter in-process; this deployment currently runs `local` because no AWS credentials were available at deploy time.

## Troubleshooting

- **`better-sqlite3` fails to build during `pnpm install`.** It compiles a native addon and needs a working C/C++ toolchain: on macOS, install Xcode Command Line Tools (`xcode-select --install`); on Debian/Ubuntu-based Linux, `python3`, `make`, and `g++` (exactly what the Dockerfile installs for the container build). Node 20+ is required.
- **The app loads blank / 404s at `/` when only running the agent process.** `apps/agent`'s Express app only serves `apps/web`'s static bundle when `apps/web/dist` exists on disk. In local development, run the Vite dev server (`pnpm --filter @pax/web dev`) instead of expecting the agent alone to serve the UI — it proxies `/api` for you. If you specifically want to test the production static-serving path locally, run `pnpm --filter @pax/web build` first so `apps/web/dist` exists, then start the agent.
- **Port already in use.** The agent defaults to `8080` (override with `PORT`); if something else is already listening there, set `PORT` before starting it and update `apps/web/vite.config.ts`'s proxy target if you change it. The Vite dev server defaults to `5173` but will silently move to the next free port and print the actual URL — always check the terminal output rather than assuming `5173`.
- **`pnpm install --frozen-lockfile` fails after editing a `package.json` by hand.** Run `pnpm install` (without the flag) to regenerate `pnpm-lock.yaml`, then re-run with `--frozen-lockfile` to confirm it's reproducible.

## License

MIT — see [`LICENSE`](LICENSE).
