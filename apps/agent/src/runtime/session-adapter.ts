/**
 * Real `SessionManager` + `LocalFileStorage` wiring for local case sessions
 * (docs/specs/strands-runtime.md "Sessions and snapshots": "Local:
 * `SessionManager` with `LocalFileStorage` imported from
 * `@strands-agents/sdk/storage` (not the deprecated root-level `FileStorage`
 * export) under `.sift-data/sessions`").
 *
 * Verified directly against the installed package (see the dated
 * docs/build-log.md entry for this task): the task prompt's example wired
 * `LocalFileStorage` through the legacy `{ snapshot: new LocalFileStorage(...)
 * }` wrapper shape. Reading `session/session-manager.d.ts` and
 * `session/storage.d.ts` directly shows that shape (`SessionStorage`,
 * `SnapshotStorage`) is explicitly `@deprecated` -- "Prefer passing a
 * unified `Storage` directly to `SessionManagerConfig.storage`" -- and that
 * `LocalFileStorage` (from `@strands-agents/sdk/storage`) already
 * `implements Storage` directly. The non-deprecated, currently-recommended
 * call is therefore `new SessionManager({ sessionId, storage: new
 * LocalFileStorage(baseDir) })`, passing the `Storage` instance directly
 * rather than wrapped in `{ snapshot: ... }`. This module uses that form.
 */
import { join } from 'node:path';
import { SessionManager, type Agent, type SessionManagerConfig } from '@strands-agents/sdk';
import { LocalFileStorage } from '@strands-agents/sdk/storage';
import {
  normalizeSessionEvent,
  type NormalizerContext,
  type RuntimeEvent,
} from './event-normalizer.js';

/** `.sift-data/sessions` locally (`dataDir` matches `config.ts`'s `SIFT_DATA_DIR`, mirroring `db/connection.ts`'s own `dataDir`-relative resolution). */
export function localSessionsDir(dataDir: string): string {
  return join(dataDir, 'sessions');
}

export type LocalSessionManagerOptions = Partial<
  Omit<SessionManagerConfig, 'sessionId' | 'storage'>
>;

/**
 * Builds a real `SessionManager` backed by a real `LocalFileStorage` rooted
 * at `<dataDir>/sessions`. `sessionId` is the case's own session identifier
 * -- "Each case uses one Strands orchestrator session"
 * (strands-runtime.md).
 */
export function buildLocalSessionManager(
  dataDir: string,
  sessionId: string,
  options: LocalSessionManagerOptions = {},
): SessionManager {
  return new SessionManager({
    sessionId,
    storage: new LocalFileStorage(localSessionsDir(dataDir)),
    ...options,
  });
}

export interface SessionEventDeps {
  ctx: NormalizerContext;
  sequence: () => number;
  emit: (event: RuntimeEvent) => void;
}

/**
 * Saves an immutable-and-latest snapshot of `agent`'s current state through
 * a real `SessionManager.saveSnapshot` call, then emits a normalized
 * `session.snapshot_saved` event. strands-runtime.md "Sessions and
 * snapshots": "Create an immutable snapshot before a human confirmation and
 * after a recommendation proposal."
 */
export async function saveCaseSnapshot(
  sessionManager: SessionManager,
  agent: Agent,
  deps: SessionEventDeps,
): Promise<void> {
  await sessionManager.saveSnapshot({ target: agent, isLatest: true });
  deps.emit(normalizeSessionEvent({ kind: 'snapshot_saved' }, deps.ctx, deps.sequence()));
}

/**
 * Restores `agent`'s state from the session's latest snapshot through a
 * real `SessionManager.restoreSnapshot` call, then emits a normalized
 * `session.snapshot_restored` event recording whether a prior snapshot
 * actually existed. Returns the same boolean `restoreSnapshot` returns.
 */
export async function restoreCaseSnapshot(
  sessionManager: SessionManager,
  agent: Agent,
  deps: SessionEventDeps,
): Promise<boolean> {
  const restored = await sessionManager.restoreSnapshot({ target: agent });
  deps.emit(
    normalizeSessionEvent({ kind: 'snapshot_restored', restored }, deps.ctx, deps.sequence()),
  );
  return restored;
}
