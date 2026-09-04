/**
 * The real, non-deterministic `Clock`/`IdGenerator` (`@sift/core`)
 * implementations `server.ts` wires at boot. Every deterministic test in
 * this codebase injects a fixed `Clock`/`IdGenerator` instead (docs/engineering-principles.md:
 * "All timestamps in deterministic tests come from an injected `Clock`. IDs
 * come from an injected `IdGenerator`.") -- this is the one place real wall
 * time and real randomness are allowed to enter the system.
 */
import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '@sift/core';

export function createSystemClock(): Clock {
  return { now: () => new Date().toISOString() };
}

export function createSystemIdGenerator(): IdGenerator {
  return {
    next: (prefix) => (prefix !== undefined ? `${prefix}-${randomUUID()}` : randomUUID()),
  };
}
