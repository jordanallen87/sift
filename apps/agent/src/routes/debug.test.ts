import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandReceipt, RuntimeDebugEvent } from '@pax/contracts';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';
import { createDebugRouter } from './debug.js';

describe('GET /api/debug/runs/:runId', () => {
  let harness: HttpTestHarness | undefined;

  afterEach(() => {
    harness?.cleanup();
    harness = undefined;
  });

  async function startDemo(): Promise<{ caseId: string }> {
    if (harness === undefined) throw new Error('harness not initialized');
    const response = await request(harness.app)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-start')
      .send({ demoId: 'car-purchase' });
    const receipt = asJson<CommandReceipt>(response.body);
    return { caseId: receipt.caseId };
  }

  function seedRun(caseId: string, runId: string): void {
    if (harness === undefined) throw new Error('harness not initialized');
    const now = '2026-08-27T00:00:00.000Z';
    harness.runStore.create({
      id: runId,
      caseId,
      obligationId: 'obligation-1',
      status: 'queued',
      createdAt: now,
      updatedAt: now,
    });
  }

  function draftEvent(
    runId: string,
    caseId: string,
    sequence: number,
    overrides: Partial<RuntimeDebugEvent> = {},
  ): RuntimeDebugEvent {
    return {
      schemaVersion: '1.0',
      sequence,
      timestamp: '2026-08-27T00:00:00.000Z',
      traceId: 'trace-1',
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

  it('returns 404 for a run that does not exist', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/debug/runs/does-not-exist');
    expect(response.status).toBe(404);
  });

  it('returns 404 for every debug route when PAX_DEBUG_ENABLED is false', async () => {
    harness = createHttpTestHarness({ debugEnabled: false });
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.app).get('/api/debug/runs/run-1');
    expect(response.status).toBe(404);
  });

  it('returns a real Overview computed from RunStore + persisted runtime_events, and an ordered Timeline', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');
    harness.runStore.updateStatus('run-1', {
      status: 'completed',
      updatedAt: '2026-08-27T00:00:05.000Z',
    });

    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 0, { category: 'graph', name: 'graph.node_completed' }),
    );
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 1, { category: 'tool', level: 'info' }),
    );
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 2, {
        category: 'error',
        level: 'error',
        phase: 'error',
        name: 'run.failed',
        summary: 'boom',
      }),
    );

    const response = await request(harness.app).get('/api/debug/runs/run-1');
    expect(response.status).toBe(200);

    const body = asJson<{
      overview: {
        runId: string;
        caseId: string;
        status: string;
        eventCount: number;
        errorCount: number;
        countsByCategory: Record<string, number>;
        countsByLevel: Record<string, number>;
        durationMs: number | null;
      };
      events: { id: string; sequence: number; category: string }[];
    }>(response.body);

    expect(body.overview.runId).toBe('run-1');
    expect(body.overview.caseId).toBe(caseId);
    expect(body.overview.status).toBe('completed');
    expect(body.overview.eventCount).toBe(3);
    expect(body.overview.errorCount).toBe(1);
    expect(body.overview.countsByCategory).toMatchObject({ graph: 1, tool: 1, error: 1 });
    expect(body.overview.countsByLevel).toMatchObject({ info: 2, error: 1 });
    expect(body.overview.durationMs).toBe(5000);

    expect(body.events).toHaveLength(3);
    expect(body.events.map((event) => event.sequence)).toEqual([0, 1, 2]);
    expect(body.events.every((event) => typeof event.id === 'string' && event.id.length > 0)).toBe(
      true,
    );
  });

  it('narrows the Timeline (events) by ?category= without changing the Overview counts', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0, { category: 'tool' }));
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 1, { category: 'skill', name: 'skill.activated' }),
    );

    const response = await request(harness.app).get('/api/debug/runs/run-1?category=skill');
    expect(response.status).toBe(200);

    const body = asJson<{
      overview: { eventCount: number };
      events: { category: string }[];
    }>(response.body);

    expect(body.overview.eventCount).toBe(2);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.category).toBe('skill');
  });

  it('narrows the Timeline by ?level=', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0, { level: 'info' }));
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 1, { level: 'warn', category: 'intervention' }),
    );

    const response = await request(harness.app).get('/api/debug/runs/run-1?level=warn');
    expect(response.status).toBe(200);

    const body = asJson<{ events: { level: string }[] }>(response.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.level).toBe('warn');
  });

  it('returns 400 for an invalid ?category=', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.app).get(
      '/api/debug/runs/run-1?category=not-a-category',
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid ?level=', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.app).get('/api/debug/runs/run-1?level=not-a-level');
    expect(response.status).toBe(400);
  });

  it('aggregates tokenUsage and estimatedCostUsd across events into the Overview when at least one event carries them', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 0, {
        category: 'model',
        name: 'model.call',
        tokenUsage: { input: 10, output: 5, total: 15 },
        estimatedCostUsd: 0.001,
      }),
    );
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 1, {
        category: 'model',
        name: 'model.call',
        tokenUsage: { input: 20, output: 8, total: 28 },
        estimatedCostUsd: 0.002,
      }),
    );
    // A third event with neither field set must not reset the running total
    // to undefined/zero -- the aggregation only adds when present.
    harness.runtimeEventStore.append(draftEvent('run-1', caseId, 2, {}));

    const response = await request(harness.app).get('/api/debug/runs/run-1');
    expect(response.status).toBe(200);

    const body = asJson<{
      overview: {
        tokenUsage: { input: number; output: number; total: number } | null;
        estimatedCostUsd: number | null;
      };
    }>(response.body);

    expect(body.overview.tokenUsage).toEqual({ input: 30, output: 13, total: 43 });
    expect(body.overview.estimatedCostUsd).toBeCloseTo(0.003, 10);
  });

  it('defaults to enabled when DebugRouterDeps.enabled is omitted entirely, not just when it is explicitly true', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    // A separate minimal app around the exact same real stores, constructed
    // via `createDebugRouter` directly with `enabled` left out of the deps
    // object -- proving the `deps.enabled ?? true` default itself, which
    // every `createHttpTestHarness()`-based test above always passes
    // explicitly (`buildApp` always sets `enabled: options.debugEnabled ?? true`).
    const app = express();
    app.use(
      createDebugRouter({
        runStore: harness.runStore,
        runtimeEventStore: harness.runtimeEventStore,
      }),
    );

    const response = await request(app).get('/api/debug/runs/run-1');
    expect(response.status).toBe(200);
    const body = asJson<{ overview: { runId: string } }>(response.body);
    expect(body.overview.runId).toBe('run-1');
  });

  it('returns a null durationMs/completedAt for a run still in progress', async () => {
    harness = createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.app).get('/api/debug/runs/run-1');
    const body = asJson<{ overview: { durationMs: number | null; completedAt: string | null } }>(
      response.body,
    );
    expect(body.overview.durationMs).toBeNull();
    expect(body.overview.completedAt).toBeNull();
  });
});
