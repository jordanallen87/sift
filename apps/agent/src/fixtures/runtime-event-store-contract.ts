/**
 * Shared behavioral contract both `RuntimeEventStore` implementations must
 * satisfy. See `fixtures/activity-store-contract.ts` for the same pattern
 * rationale (including why this lives under `src/fixtures/`).
 */
import { describe, expect, it } from 'vitest';
import type { RuntimeDebugEvent } from '@sift/contracts';
import type { RuntimeEventStore } from '../store/runtime-event-store.js';

const now = '2026-08-27T00:00:00.000Z';

function draft(
  runId: string,
  caseId: string,
  sequence: number,
  overrides: Partial<RuntimeDebugEvent> = {},
): RuntimeDebugEvent {
  return {
    schemaVersion: '1.0',
    sequence,
    timestamp: now,
    traceId: `trace-${runId}`,
    caseId,
    runId,
    category: 'tool',
    name: 'tool.listing_reader',
    phase: 'start',
    level: 'info',
    summary: 'Calling tool "listing_reader".',
    attributes: { toolName: 'listing_reader' },
    redactions: [],
    ...overrides,
  };
}

export function runRuntimeEventStoreContractTests(createStore: () => RuntimeEventStore): void {
  describe('RuntimeEventStore contract', () => {
    it('append() returns the persisted event with a synthetic id attached', () => {
      const store = createStore();
      const persisted = store.append(draft('run-1', 'case-1', 0));

      expect(persisted.id).toBeTruthy();
      expect(persisted.runId).toBe('run-1');
      expect(persisted.sequence).toBe(0);
    });

    it('listByRun() returns events in sequence order regardless of append order within a run', () => {
      const store = createStore();
      store.append(draft('run-1', 'case-1', 2, { summary: 'third', name: 'c' }));
      store.append(draft('run-1', 'case-1', 0, { summary: 'first', name: 'a' }));
      store.append(draft('run-1', 'case-1', 1, { summary: 'second', name: 'b' }));

      const events = store.listByRun('run-1');
      expect(events.map((event) => event.summary)).toEqual(['first', 'second', 'third']);
    });

    it('tracks events independently per run', () => {
      const store = createStore();
      store.append(draft('run-1', 'case-1', 0));
      store.append(draft('run-2', 'case-1', 0));

      expect(store.listByRun('run-1')).toHaveLength(1);
      expect(store.listByRun('run-2')).toHaveLength(1);
    });

    it('listByRun() returns an empty array for an unknown run', () => {
      const store = createStore();
      expect(store.listByRun('does-not-exist')).toEqual([]);
    });

    it('rejects a duplicate (runId, sequence) append', () => {
      const store = createStore();
      store.append(draft('run-1', 'case-1', 0));
      expect(() => store.append(draft('run-1', 'case-1', 0))).toThrow();
    });

    it('filters listByRun() by category', () => {
      const store = createStore();
      store.append(draft('run-1', 'case-1', 0, { category: 'tool' }));
      store.append(draft('run-1', 'case-1', 1, { category: 'skill', name: 'skill.activated' }));

      const skillOnly = store.listByRun('run-1', { category: 'skill' });
      expect(skillOnly).toHaveLength(1);
      expect(skillOnly[0]?.category).toBe('skill');
    });

    it('filters listByRun() by level', () => {
      const store = createStore();
      store.append(draft('run-1', 'case-1', 0, { level: 'info' }));
      store.append(draft('run-1', 'case-1', 1, { level: 'error', category: 'error' }));

      const errorsOnly = store.listByRun('run-1', { level: 'error' });
      expect(errorsOnly).toHaveLength(1);
      expect(errorsOnly[0]?.level).toBe('error');
    });

    it('combines category and level filters (AND semantics)', () => {
      const store = createStore();
      store.append(draft('run-1', 'case-1', 0, { category: 'tool', level: 'error' }));
      store.append(draft('run-1', 'case-1', 1, { category: 'tool', level: 'info' }));
      store.append(draft('run-1', 'case-1', 2, { category: 'skill', level: 'error' }));

      const matched = store.listByRun('run-1', { category: 'tool', level: 'error' });
      expect(matched).toHaveLength(1);
      expect(matched[0]?.sequence).toBe(0);
    });

    it('preserves optional correlation fields, durationMs, tokenUsage, and payload through persistence', () => {
      const store = createStore();
      store.append(
        draft('run-1', 'case-1', 0, {
          spanId: 'span-1',
          parentSpanId: 'span-0',
          sessionId: 'session-1',
          obligationId: 'obligation-1',
          agentId: 'agent-1',
          durationMs: 42,
          tokenUsage: { input: 10, output: 5, total: 15 },
          estimatedCostUsd: 0.002,
          payload: { candidateId: 'candidate-rav4' },
          stateDiff: [{ op: 'replace', path: '/status', value: 'satisfied' }],
        }),
      );

      const [event] = store.listByRun('run-1');
      expect(event?.spanId).toBe('span-1');
      expect(event?.parentSpanId).toBe('span-0');
      expect(event?.sessionId).toBe('session-1');
      expect(event?.obligationId).toBe('obligation-1');
      expect(event?.agentId).toBe('agent-1');
      expect(event?.durationMs).toBe(42);
      expect(event?.tokenUsage).toEqual({ input: 10, output: 5, total: 15 });
      expect(event?.estimatedCostUsd).toBe(0.002);
      expect(event?.payload).toEqual({ candidateId: 'candidate-rav4' });
      expect(event?.stateDiff).toEqual([{ op: 'replace', path: '/status', value: 'satisfied' }]);
    });

    it('redacts a secret-shaped value in attributes even when the caller did not already redact it (the "Redactor" stage)', () => {
      const store = createStore();
      store.append(
        draft('run-1', 'case-1', 0, {
          attributes: { note: 'token is SIFT_TEST_SECRET_ABC123' },
          redactions: [],
        }),
      );

      const [event] = store.listByRun('run-1');
      expect(event?.attributes['note']).toBe('token is [REDACTED]');
      expect(event?.redactions.length).toBeGreaterThan(0);
      expect(event?.redactions.some((r) => r.path === 'note')).toBe(true);
    });

    it('redacts a credential-shaped key in attributes regardless of nesting', () => {
      const store = createStore();
      store.append(
        draft('run-1', 'case-1', 0, {
          attributes: { config: { authorization: 'some-real-looking-value' } },
        }),
      );

      const [event] = store.listByRun('run-1');
      expect((event?.attributes['config'] as Record<string, unknown>)['authorization']).toBe(
        '[REDACTED]',
      );
    });
  });
}
