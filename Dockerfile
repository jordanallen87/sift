# Sift production image (docs/specs/architecture.md "Deployment": one
# Railway service serves both the built @sift/web static bundle and the
# @sift/agent API/Strands runtime from a single origin on port 8080).
#
# Single-stage, not multi-stage: `better-sqlite3` is a native addon compiled
# against this image's own glibc/Node ABI at `pnpm install` time, and
# `apps/agent`'s own "start" script runs TypeScript directly via `tsx`
# (matching this repo's existing local-dev convention -- there is no
# separate `tsc`-to-`dist` build step for `apps/agent`), so the runtime
# container needs the same toolchain-built `node_modules` and the same `tsx`
# available at boot. A multi-stage copy-only-`node_modules` split would still
# have to carry the native build output either way; staying single-stage
# keeps the Dockerfile simple and avoids a second image needing its own
# native rebuild.
FROM node:22-bookworm-slim

# python3/make/g++ are required to compile `better-sqlite3` (and any other
# native addon) during `pnpm install`. `gosu` backs `docker-entrypoint.sh`'s
# root -> `node` privilege drop (see that file's header comment for why a
# plain Dockerfile `USER node` instruction is not enough on its own). All
# three are removed via apt-get clean in the same layer to keep the final
# image reasonably small without a second stage.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ gosu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# corepack ships with Node 22 and reads `packageManager` from package.json
# (pnpm@11.24.0, pinned) -- no separate pnpm install needed.
RUN corepack enable

# Copy only the manifests first so `pnpm install` is cached across rebuilds
# that only change source, not dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/agent/package.json apps/agent/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/packs/package.json packages/packs/package.json
COPY packages/scenarios/package.json packages/scenarios/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

# Now the full source.
COPY . .

# Builds the static bundle `apps/agent/src/app.ts`'s `express.static` serves
# from `apps/web/dist` (resolved relative to that source file at runtime).
RUN pnpm --filter @sift/web build

RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# docs/specs/strands-runtime.md "AgentCore contract": "The Docker image
# exposes port 8080, runs as a non-root user, includes a health check, and
# contains no development credentials." `/health` (routes/health.ts) --
# not the AgentCore-specific `/ping` (routes/agentcore.ts) -- backs this
# check: `/health` performs a real `SELECT 1` liveness query against the
# live SQLite connection, so a genuinely broken container (e.g. a corrupted
# or unwritable database) is actually detected. `/ping` always reports a
# static `Healthy` once the process is up (per its own real AgentCore
# contract, and AWS's own documented guidance against churning its status
# outside that protocol's own polling) -- it is the right endpoint for
# AgentCore's runtime to poll, but not the more failure-sensitive one this
# generic container-orchestration health check should use. `node`'s own
# `http` module avoids adding a `curl`/`wget` dependency to the image only
# for this one check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||8080,path:'/health',timeout:4000},(res)=>{process.exit(res.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Starts as root (no Dockerfile `USER` instruction -- `docker-entrypoint.sh`
# itself performs the actual root -> non-root `node` privilege drop, after
# fixing up ownership of the real configured data directory; see that
# file's header comment for why that ordering matters).
ENTRYPOINT ["./docker-entrypoint.sh"]

# Migrations run automatically and idempotently at every boot
# (`server.ts`'s own header comment: "safe on every boot, including every
# Railway restart/redeploy") -- no separate migration step in this image.
CMD ["pnpm", "--filter", "@sift/agent", "start"]
