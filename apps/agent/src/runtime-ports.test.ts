import { describe, expect, it } from 'vitest';
import { createSystemClock, createSystemIdGenerator } from './runtime-ports.js';

describe('createSystemClock', () => {
  it('returns a valid, current-ish ISO 8601 datetime string', () => {
    const clock = createSystemClock();
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();

    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = new Date(now).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

describe('createSystemIdGenerator', () => {
  it('returns a bare UUID when called without a prefix', () => {
    const idGenerator = createSystemIdGenerator();
    const id = idGenerator.next();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('prefixes the id with "<prefix>-" when given a prefix', () => {
    const idGenerator = createSystemIdGenerator();
    const id = idGenerator.next('case');
    expect(id).toMatch(/^case-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('never repeats an id across calls', () => {
    const idGenerator = createSystemIdGenerator();
    expect(idGenerator.next('x')).not.toBe(idGenerator.next('x'));
  });
});
