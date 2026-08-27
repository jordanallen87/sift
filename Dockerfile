# Pax production image (docs/specs/architecture.md "Deployment": one
# Railway service serves both the built @pax/web static bundle and the
# @pax/agent API/Strands runtime from a single origin on port 8080).
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
# native addon) during `pnpm install`; removed via apt-get clean in the same
# layer to keep the final image reasonably small without a second stage.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
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
RUN pnpm --filter @pax/web build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Migrations run automatically and idempotently at every boot
# (`server.ts`'s own header comment: "safe on every boot, including every
# Railway restart/redeploy") -- no separate migration step in this image.
CMD ["pnpm", "--filter", "@pax/agent", "start"]
