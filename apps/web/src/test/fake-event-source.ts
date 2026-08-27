/**
 * Shared `EventSourceLike` test double (`../hooks/use-case-events.js`),
 * factored out of `use-case-events.test.ts` so `App.test.tsx` (and any
 * later test needing to drive the live SSE stream) can reuse the exact same
 * fake rather than a second hand-rolled copy -- the same reuse discipline
 * `fake-pax-commands.ts` already establishes for `PaxCommands`.
 *
 * Captures every instance ever created (`FakeEventSource.instances`) so a
 * test can find the specific connection a component opened and drive its
 * `onopen`/`onerror`/named-event listeners directly, without a real network
 * connection (webmcp.md's "in-memory adapter" pattern, applied to SSE).
 */
import type { EventSourceLike, EventSourceLikeMessageEvent } from '../hooks/use-case-events.js';
import type { PublicActivityEvent } from '@pax/contracts';

export class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  static reset(): void {
    FakeEventSource.instances = [];
  }

  readonly url: string;
  closed = false;
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  private readonly listeners = new Map<string, Set<(event: EventSourceLikeMessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: EventSourceLikeMessageEvent) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: EventSourceLikeMessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  /** Delivers a real `PublicActivityEvent` to every listener registered for its own `.type`, exactly as the real named-SSE-event server route does. */
  emit(event: PublicActivityEvent): void {
    const message: EventSourceLikeMessageEvent = {
      data: JSON.stringify(event),
      lastEventId: String(event.sequence),
    };
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(message);
    }
  }

  /** Delivers an arbitrary raw `data:` payload to listeners of `type` -- for simulating a malformed or schema-invalid wire message, which a real (if buggy or mid-upgrade) server could send. */
  emitRaw(type: string, data: string): void {
    const message: EventSourceLikeMessageEvent = { data };
    for (const listener of this.listeners.get(type) ?? []) {
      listener(message);
    }
  }

  triggerOpen(): void {
    this.onopen?.({});
  }

  triggerError(): void {
    this.onerror?.({});
  }
}

/** `createEventSource` factory for `useCaseEvents`/`AppProviders`'s `caseEventsConfig`. */
export function createFakeEventSource(url: string): EventSourceLike {
  return new FakeEventSource(url);
}
