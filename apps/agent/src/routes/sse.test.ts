import { describe, expect, it, vi } from 'vitest';
import { createSseWriter, type SseResponse } from './sse.js';

function fakeResponse(writeReturns: readonly boolean[]): {
  res: SseResponse;
  writes: string[];
  emitDrain: () => void;
  emitClose: () => void;
} {
  const writes: string[] = [];
  let callIndex = 0;
  let drainListener: (() => void) | undefined;
  let closeListener: (() => void) | undefined;

  const res: SseResponse = {
    write: (chunk: string) => {
      writes.push(chunk);
      const value = writeReturns[callIndex] ?? true;
      callIndex += 1;
      return value;
    },
    on: (event, listener) => {
      if (event === 'drain') drainListener = listener;
      if (event === 'close') closeListener = listener;
    },
  };

  return {
    res,
    writes,
    emitDrain: () => drainListener?.(),
    emitClose: () => closeListener?.(),
  };
}

describe('createSseWriter', () => {
  it('formats send() as a valid SSE event with id/event/data lines', () => {
    const { res, writes } = fakeResponse([]);
    const writer = createSseWriter(res, vi.fn());

    writer.send({ id: '1', type: 'command.accepted', data: { summary: 'hi' } });

    expect(writes).toEqual(['id: 1\nevent: command.accepted\ndata: {"summary":"hi"}\n\n']);
  });

  it('formats sendComment() as an SSE comment line (for heartbeats)', () => {
    const { res, writes } = fakeResponse([]);
    const writer = createSseWriter(res, vi.fn());

    writer.sendComment('heartbeat');

    expect(writes).toEqual([': heartbeat\n\n']);
  });

  it('does not call onResyncRequired while every write() flushes immediately', () => {
    const { res } = fakeResponse([true, true, true]);
    const onResync = vi.fn();
    const writer = createSseWriter(res, onResync, { maxQueueLength: 2 });

    writer.send({ id: '1', type: 'x', data: {} });
    writer.send({ id: '2', type: 'x', data: {} });
    writer.send({ id: '3', type: 'x', data: {} });

    expect(onResync).not.toHaveBeenCalled();
    expect(writer.closed).toBe(false);
  });

  it('calls onResyncRequired and closes once unacknowledged writes exceed maxQueueLength', () => {
    // Every write() returns false (backpressure never relieved).
    const { res } = fakeResponse([false, false, false, false]);
    const onResync = vi.fn();
    const writer = createSseWriter(res, onResync, { maxQueueLength: 2 });

    writer.send({ id: '1', type: 'x', data: {} });
    expect(onResync).not.toHaveBeenCalled();
    writer.send({ id: '2', type: 'x', data: {} });
    expect(onResync).not.toHaveBeenCalled();
    writer.send({ id: '3', type: 'x', data: {} });

    expect(onResync).toHaveBeenCalledTimes(1);
    expect(writer.closed).toBe(true);
  });

  it('stops writing once closed (a resync/close is terminal)', () => {
    const { res, writes } = fakeResponse([false, false, false]);
    const writer = createSseWriter(res, vi.fn(), { maxQueueLength: 1 });

    writer.send({ id: '1', type: 'x', data: {} });
    writer.send({ id: '2', type: 'x', data: {} });
    const writesAtClose = writes.length;

    writer.send({ id: '3', type: 'x', data: {} });
    expect(writes.length).toBe(writesAtClose);
  });

  it('a drain event resets the pending-write count, avoiding a false resync', () => {
    const { res, emitDrain } = fakeResponse([false, false, false]);
    const onResync = vi.fn();
    const writer = createSseWriter(res, onResync, { maxQueueLength: 1 });

    writer.send({ id: '1', type: 'x', data: {} });
    emitDrain();
    writer.send({ id: '2', type: 'x', data: {} });

    expect(onResync).not.toHaveBeenCalled();
  });

  it('a close event marks the writer closed without invoking onResyncRequired', () => {
    const { res, emitClose } = fakeResponse([]);
    const onResync = vi.fn();
    const writer = createSseWriter(res, onResync);

    emitClose();

    expect(writer.closed).toBe(true);
    expect(onResync).not.toHaveBeenCalled();
  });
});
