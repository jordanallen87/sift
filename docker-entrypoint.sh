#!/bin/sh
# Docker entrypoint: drops root privileges to the image's non-root `node`
# user (uid/gid 1000, pre-created by the upstream `node:22-bookworm-slim`
# base image) before ever executing the real Pax process.
#
# Why this cannot simply be a Dockerfile `USER node` instruction instead:
# Pax's canonical SQLite store lives under `PAX_DATA_DIR`
# (`.pax-data` locally, `/data` on Railway -- config.ts, db/connection.ts).
# `/data` is a Railway *volume*, mounted into the container at boot time,
# not baked into the image -- there is nothing to `chown` for it at image
# build time. A freshly attached Railway volume (and this image's own prior
# root-owned deploys, which created `/data/pax.sqlite` while the container
# still ran as root) is owned by `root:root`; starting the process directly
# as `node` would be unable to create or open the database file at all,
# genuinely breaking the deployment this task must not break.
#
# So the container still *starts* as root (no Dockerfile `USER`
# instruction), this entrypoint creates/`chown -R`s the real configured
# data directory (idempotent -- safe on every boot, matching
# `server.ts`'s own migration-on-every-boot convention) while it still has
# permission to do so, then re-executes the real command as `node` via
# `gosu` (a minimal, purpose-built setuid replacement -- avoids `sudo`'s
# much larger dependency footprint) -- from that point on, the actual Pax
# process, and every file it subsequently creates, is genuinely non-root.
set -e

# `SIFT_DATA_DIR`, matching `apps/agent/src/config.ts` (which defaults it to
# `.sift-data` and, on Railway, is set to `/data`). This read `PAX_DATA_DIR`
# with a `.pax-data` default -- a name the application has never used and the
# last surviving `PAX_` reference in tracked source. The consequence was not
# cosmetic: the entrypoint created and chowned an empty `.pax-data` beside the
# app and left the real volume at `/data` owned by root, so the first boot on a
# FRESH volume died in `mkdir` with `EACCES` before it could open the database.
# The current volume only works because it was already chowned by hand once.
DATA_DIR="${SIFT_DATA_DIR:-.sift-data}"
mkdir -p "$DATA_DIR"
chown -R node:node "$DATA_DIR"

exec gosu node "$@"
