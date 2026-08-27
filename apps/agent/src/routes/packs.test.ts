import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompiledDecisionPack } from '@pax/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';

describe('GET /api/packs', () => {
  let harness: HttpTestHarness | undefined;

  afterEach(() => {
    harness?.cleanup();
    harness = undefined;
  });

  it('lists the registered synthetic pack (success)', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/packs');

    expect(response.status).toBe(200);
    const body = asJson<{ packs: CompiledDecisionPack[] }>(response.body);
    expect(body.packs).toHaveLength(1);
    expect(body.packs[0]?.identity.id).toBe('car-purchase');
    expect(body.packs[0]?.compiledHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
