import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent, SessionManager } from '@strands-agents/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSequenceCounter,
  type NormalizerContext,
  type RuntimeEvent,
} from './event-normalizer.js';
import { ScriptedModelProvider } from './model-provider.js';
import {
  buildLocalSessionManager,
  localSessionsDir,
  restoreCaseSnapshot,
  saveCaseSnapshot,
} from './session-adapter.js';

const CTX: NormalizerContext = { traceId: 'trace-1', runId: 'run-1', caseId: 'case-1' };

let dir: string | undefined;

afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

function tempDataDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'pax-session-adapter-test-'));
  return dir;
}

describe('localSessionsDir', () => {
  it('is <dataDir>/sessions', () => {
    expect(localSessionsDir('.pax-data')).toBe(join('.pax-data', 'sessions'));
  });
});

describe('buildLocalSessionManager', () => {
  it('builds a real SessionManager backed by LocalFileStorage', () => {
    const manager = buildLocalSessionManager(tempDataDir(), 'case-1');
    expect(manager).toBeInstanceOf(SessionManager);
  });
});

describe('saveCaseSnapshot / restoreCaseSnapshot round trip', () => {
  it('restoring before any save reports no prior snapshot and emits restored: false', async () => {
    const dataDir = tempDataDir();
    const manager = buildLocalSessionManager(dataDir, 'case-fresh');
    const agent = new Agent({ model: new ScriptedModelProvider({ beats: {} }), printer: false });

    const events: RuntimeEvent[] = [];
    const sequence = createSequenceCounter();
    const restored = await restoreCaseSnapshot(manager, agent, {
      ctx: CTX,
      sequence,
      emit: (event) => events.push(event),
    });

    expect(restored).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('session.snapshot_restored');
    expect(events[0]?.attributes['restored']).toBe(false);
  });

  it('a genuine round trip through the real filesystem: save from one Agent instance, restore into a brand-new one', async () => {
    const dataDir = tempDataDir();
    const sessionId = 'case-round-trip';

    const providerA = new ScriptedModelProvider({
      beats: { turn: [{ text: 'the household prefers the RAV4' }] },
    });
    providerA.setBeat('turn');
    const managerA = buildLocalSessionManager(dataDir, sessionId);
    const agentA = new Agent({ model: providerA, sessionManager: managerA, printer: false });
    await agentA.invoke('What does the household prefer?');
    expect(agentA.messages.length).toBeGreaterThan(0);

    const savedEvents: RuntimeEvent[] = [];
    const sequenceA = createSequenceCounter();
    await saveCaseSnapshot(managerA, agentA, {
      ctx: CTX,
      sequence: sequenceA,
      emit: (event) => savedEvents.push(event),
    });
    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0]?.name).toBe('session.snapshot_saved');

    // A brand-new Agent + brand-new SessionManager instance, pointed at the
    // *same* dataDir/sessionId -- restore must come from the real
    // filesystem, not from any shared in-memory state.
    const managerB = buildLocalSessionManager(dataDir, sessionId);
    const agentB = new Agent({ model: new ScriptedModelProvider({ beats: {} }), printer: false });
    expect(agentB.messages).toHaveLength(0);

    const restoredEvents: RuntimeEvent[] = [];
    const sequenceB = createSequenceCounter();
    const restored = await restoreCaseSnapshot(managerB, agentB, {
      ctx: CTX,
      sequence: sequenceB,
      emit: (event) => restoredEvents.push(event),
    });

    expect(restored).toBe(true);
    expect(restoredEvents[0]?.attributes['restored']).toBe(true);
    expect(agentB.messages.length).toBe(agentA.messages.length);
    expect(agentB.messages[0]?.content).toEqual(agentA.messages[0]?.content);
  });
});
