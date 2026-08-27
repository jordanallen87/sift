/**
 * Shared behavioral contract both `ActivityStore` implementations must
 * satisfy. See `fixtures/case-store-contract.ts` for the same pattern
 * rationale (including why this lives under `src/fixtures/`).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PublicActivityEvent } from '@pax/contracts';
import type { ActivityStore } from '../store/activity-store.js';

const now = '2026-08-27T00:00:00.000Z';

function draft(
  caseId: string,
  overrides: Partial<Omit<PublicActivityEvent, 'sequence' | 'eventId' | 'schemaVersion'>> = {},
): Omit<PublicActivityEvent, 'sequence' | 'eventId' | 'schemaVersion'> {
  return {
    timestamp: now,
    caseId,
    type: 'command.accepted',
    phase: 'completed',
    summary: 'Command accepted',
    ...overrides,
  };
}

export function runActivityStoreContractTests(createStore: () => ActivityStore): void {
  describe('ActivityStore contract', () => {
    it('append() assigns eventId/schemaVersion/sequence starting at 1', () => {
      const store = createStore();
      const event = store.append(draft('case-1'));

      expect(event.eventId).toBeTruthy();
      expect(event.schemaVersion).toBe('1.0');
      expect(event.sequence).toBe(1);
    });

    it('append() assigns a strictly increasing per-case sequence', () => {
      const store = createStore();
      const first = store.append(draft('case-1'));
      const second = store.append(draft('case-1'));

      expect(first.sequence).toBe(1);
      expect(second.sequence).toBe(2);
    });

    it('tracks sequence independently per case', () => {
      const store = createStore();
      store.append(draft('case-1'));
      const firstOfCaseTwo = store.append(draft('case-2'));

      expect(firstOfCaseTwo.sequence).toBe(1);
    });

    it('replayFrom() returns only events after the given sequence, in order', () => {
      const store = createStore();
      store.append(draft('case-1', { summary: 'first' }));
      store.append(draft('case-1', { summary: 'second' }));
      store.append(draft('case-1', { summary: 'third' }));

      const replay = store.replayFrom('case-1', 1);
      expect(replay.map((event) => event.summary)).toEqual(['second', 'third']);
    });

    it('replayFrom() returns everything when afterSequence is 0', () => {
      const store = createStore();
      store.append(draft('case-1'));
      store.append(draft('case-1'));
      expect(store.replayFrom('case-1', 0)).toHaveLength(2);
    });

    it('latestSequence() reports 0 for an unknown case and the true max otherwise', () => {
      const store = createStore();
      expect(store.latestSequence('unknown')).toBe(0);
      store.append(draft('case-1'));
      store.append(draft('case-1'));
      expect(store.latestSequence('case-1')).toBe(2);
    });

    it('subscribe() returns prior events as replay and delivers new ones live', () => {
      const store = createStore();
      store.append(draft('case-1', { summary: 'before subscribe' }));

      const listener = vi.fn();
      const subscription = store.subscribe('case-1', listener);
      expect(subscription.replay).toHaveLength(1);
      expect(subscription.replay[0]?.summary).toBe('before subscribe');

      store.append(draft('case-1', { summary: 'after subscribe' }));
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0] as [PublicActivityEvent])[0].summary).toBe('after subscribe');
    });

    it('subscribe() registers a second listener for a case that already has one, and delivers a subsequent append to both', () => {
      const store = createStore();
      const firstListener = vi.fn();
      const secondListener = vi.fn();
      store.subscribe('case-1', firstListener);
      store.subscribe('case-1', secondListener);

      store.append(draft('case-1', { summary: 'after both subscriptions' }));

      expect(firstListener).toHaveBeenCalledTimes(1);
      expect(secondListener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe() stops further delivery', () => {
      const store = createStore();
      const listener = vi.fn();
      const subscription = store.subscribe('case-1', listener);
      subscription.unsubscribe();

      store.append(draft('case-1'));
      expect(listener).not.toHaveBeenCalled();
    });

    it('preserves safeDetails and optional correlation ids through persistence and replay', () => {
      const store = createStore();
      store.append(
        draft('case-1', {
          runId: 'run-1',
          obligationId: 'obligation-1',
          agentId: 'agent-1',
          commandId: 'command-1',
          debugEventId: 'debug-1',
          safeDetails: { note: 'hello', count: 2 },
        }),
      );

      const [event] = store.replayFrom('case-1', 0);
      expect(event?.runId).toBe('run-1');
      expect(event?.obligationId).toBe('obligation-1');
      expect(event?.agentId).toBe('agent-1');
      expect(event?.commandId).toBe('command-1');
      expect(event?.debugEventId).toBe('debug-1');
      expect(event?.safeDetails).toEqual({ note: 'hello', count: 2 });
    });
  });
}
