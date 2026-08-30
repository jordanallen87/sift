#!/usr/bin/env tsx
/**
 * Shared stub runner for release-gate stages that are declared in
 * package.json but not yet implemented (see docs/specs/testing.md
 * "Commands and gates"). Prints an honest, distinct "not yet implemented"
 * message and exits 0 — this must never be confused with a real pass, which
 * is why scripts/verify.ts records these stages as `skipped`, not `passed`.
 */

const stageName = process.argv[2] ?? 'stage';

console.log(
  `[sift] ${stageName}: not yet implemented. This gate is declared in package.json and ` +
    `docs/specs/testing.md but its real behavior has not shipped yet — see ` +
    `docs/superpowers/plans/2026-08-26-pax-hackathon-build.md for the task that implements it. ` +
    `Exiting 0 (stubbed), not reporting a pass.`,
);

process.exit(0);
