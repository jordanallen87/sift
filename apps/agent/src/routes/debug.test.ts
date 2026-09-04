import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommandReceipt, RuntimeDebugEvent } from '@sift/contracts';
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
    const response = await request(harness.server)
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
    harness = await createHttpTestHarness();

    const response = await request(harness.server).get('/api/debug/runs/does-not-exist');
    expect(response.status).toBe(404);
  });

  it('returns 404 for every debug route when SIFT_DEBUG_ENABLED is false', async () => {
    harness = await createHttpTestHarness({ debugEnabled: false });
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.server).get('/api/debug/runs/run-1');
    expect(response.status).toBe(404);
  });

  it('returns a real Overview computed from RunStore + persisted runtime_events, and an ordered Timeline', async () => {
    harness = await createHttpTestHarness();
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

    const response = await request(harness.server).get('/api/debug/runs/run-1');
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
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0, { category: 'tool' }));
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 1, { category: 'skill', name: 'skill.activated' }),
    );

    const response = await request(harness.server).get('/api/debug/runs/run-1?category=skill');
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
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0, { level: 'info' }));
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 1, { level: 'warn', category: 'intervention' }),
    );

    const response = await request(harness.server).get('/api/debug/runs/run-1?level=warn');
    expect(response.status).toBe(200);

    const body = asJson<{ events: { level: string }[] }>(response.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.level).toBe('warn');
  });

  it('returns 400 for an invalid ?category=', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.server).get(
      '/api/debug/runs/run-1?category=not-a-category',
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid ?level=', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.server).get('/api/debug/runs/run-1?level=not-a-level');
    expect(response.status).toBe(400);
  });

  it('aggregates tokenUsage and estimatedCostUsd across events into the Overview when at least one event carries them', async () => {
    harness = await createHttpTestHarness();
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

    const response = await request(harness.server).get('/api/debug/runs/run-1');
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
    harness = await createHttpTestHarness();
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
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.server).get('/api/debug/runs/run-1');
    const body = asJson<{ overview: { durationMs: number | null; completedAt: string | null } }>(
      response.body,
    );
    expect(body.overview.durationMs).toBeNull();
    expect(body.overview.completedAt).toBeNull();
  });

  // --- Timeline's remaining spec'd filters (debugging-and-observability.md
  // "Runtime Inspector UI" item 2: "category, agent, level, and free-text
  // filters", plus the WebMCP-origin distinction that section requires
  // "once the WebMCP origin marker ... is implemented"). ---

  describe('?agent=', () => {
    it('narrows the Timeline to one emitting agent without changing the Overview counts', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0, { agentId: 'deal-analyst' }));
      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 1, { agentId: 'reliability-analyst' }),
      );
      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 2));

      const response = await request(harness.server).get(
        '/api/debug/runs/run-1?agent=deal-analyst',
      );
      expect(response.status).toBe(200);

      const body = asJson<{
        overview: { eventCount: number };
        events: { sequence: number; agentId?: string }[];
      }>(response.body);

      expect(body.overview.eventCount).toBe(3);
      expect(body.events.map((event) => event.agentId)).toEqual(['deal-analyst']);
    });

    it('returns an empty Timeline for an agent that emitted nothing, rather than falling back to every event', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0, { agentId: 'deal-analyst' }));

      const response = await request(harness.server).get('/api/debug/runs/run-1?agent=nobody');
      expect(response.status).toBe(200);
      expect(asJson<{ events: unknown[] }>(response.body).events).toEqual([]);
    });

    it("lists the run's real emitting agents on the Overview so a client can offer them without guessing", async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 0, { agentId: 'reliability-analyst' }),
      );
      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 1, { agentId: 'deal-analyst' }));
      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 2, { agentId: 'deal-analyst' }));
      // An event with no agentId at all must not become an empty-string
      // "agent" in the list -- absence is not an agent.
      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 3));

      const response = await request(harness.server).get(
        '/api/debug/runs/run-1?agent=deal-analyst',
      );
      const body = asJson<{ overview: { agentIds: string[] } }>(response.body);

      // Sorted, de-duplicated, and computed from the WHOLE run -- not from
      // the narrowed Timeline, which would collapse the list to the one
      // agent already selected and make the control un-unselectable.
      expect(body.overview.agentIds).toEqual(['deal-analyst', 'reliability-analyst']);
    });

    it('returns 400 for an over-long ?agent= rather than scanning every event with it', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      const response = await request(harness.server).get(
        `/api/debug/runs/run-1?agent=${'a'.repeat(201)}`,
      );
      expect(response.status).toBe(400);
    });
  });

  describe('?q= (free text)', () => {
    it('matches an event summary case-insensitively', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 0, { summary: 'BudgetGuard allowed the tool call.' }),
      );
      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 1, { summary: 'Calling tool "listing_reader".' }),
      );

      const response = await request(harness.server).get('/api/debug/runs/run-1?q=budgetguard');
      expect(response.status).toBe(200);

      const body = asJson<{ overview: { eventCount: number }; events: { summary: string }[] }>(
        response.body,
      );
      expect(body.overview.eventCount).toBe(2);
      expect(body.events).toHaveLength(1);
      expect(body.events[0]?.summary).toContain('BudgetGuard');
    });

    it('also matches the event name and agent id, the other text a Timeline item renders', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 0, { name: 'swarm.handoff', summary: 'Handing off.' }),
      );
      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 1, { agentId: 'deal-analyst', summary: 'Reading listings.' }),
      );
      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 2, { summary: 'Unrelated.', name: 'tool.other' }),
      );

      const byName = await request(harness.server).get('/api/debug/runs/run-1?q=swarm.handoff');
      expect(
        asJson<{ events: { sequence: number }[] }>(byName.body).events.map((e) => e.sequence),
      ).toEqual([0]);

      const byAgent = await request(harness.server).get('/api/debug/runs/run-1?q=deal-analyst');
      expect(
        asJson<{ events: { sequence: number }[] }>(byAgent.body).events.map((e) => e.sequence),
      ).toEqual([1]);
    });

    it('combines with the other filters conjunctively rather than replacing them', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 0, { level: 'warn', summary: 'Budget exceeded.' }),
      );
      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 1, { level: 'info', summary: 'Budget exceeded.' }),
      );

      const response = await request(harness.server).get(
        '/api/debug/runs/run-1?q=budget&level=warn',
      );
      const body = asJson<{ events: { sequence: number }[] }>(response.body);
      expect(body.events.map((event) => event.sequence)).toEqual([0]);
    });

    it('treats a blank ?q= as no free-text filter at all rather than an unmatchable one', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0));

      const response = await request(harness.server).get('/api/debug/runs/run-1?q=%20%20');
      expect(response.status).toBe(200);
      expect(asJson<{ events: unknown[] }>(response.body).events).toHaveLength(1);
    });

    it('returns 400 for an over-long ?q=', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      const response = await request(harness.server).get(
        `/api/debug/runs/run-1?q=${'a'.repeat(201)}`,
      );
      expect(response.status).toBe(400);
    });
  });

  describe('?origin= (WebMCP provenance)', () => {
    it('narrows the Timeline to events whose own attributes carry the webmcp origin marker', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 0, {
          summary: 'Command issued through a registered WebMCP tool.',
          attributes: { origin: 'webmcp' },
        }),
      );
      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 1, {
          summary: 'Command issued through a visible UI control.',
          attributes: {},
        }),
      );

      const response = await request(harness.server).get('/api/debug/runs/run-1?origin=webmcp');
      expect(response.status).toBe(200);

      const body = asJson<{ events: { sequence: number }[] }>(response.body);
      expect(body.events.map((event) => event.sequence)).toEqual([0]);
    });

    it('counts only real, recognized origin markers on the Overview -- an absent marker is never collapsed into one', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 0, { attributes: { origin: 'webmcp' } }),
      );
      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 1, { attributes: {} }));
      // Free text in `attributes.origin` is NOT a Sift origin: the closed
      // COMMAND_ORIGINS vocabulary is the only thing that counts, so an
      // unrecognized value is reported as no origin rather than invented.
      harness.runtimeEventStore.append(
        draftEvent('run-1', caseId, 2, { attributes: { origin: 'something-else' } }),
      );

      const response = await request(harness.server).get('/api/debug/runs/run-1');
      const body = asJson<{ overview: { countsByOrigin: Record<string, number> } }>(response.body);
      expect(body.overview.countsByOrigin).toEqual({ webmcp: 1 });
    });

    it('reports no origins at all for a run whose events predate origin propagation', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0));
      harness.runtimeEventStore.append(draftEvent('run-1', caseId, 1));

      const response = await request(harness.server).get('/api/debug/runs/run-1');
      const body = asJson<{ overview: { countsByOrigin: Record<string, number> } }>(response.body);
      expect(body.overview.countsByOrigin).toEqual({});
    });

    it('returns 400 for an ?origin= outside the closed COMMAND_ORIGINS vocabulary', async () => {
      harness = await createHttpTestHarness();
      const { caseId } = await startDemo();
      seedRun(caseId, 'run-1');

      const response = await request(harness.server).get('/api/debug/runs/run-1?origin=ui');
      expect(response.status).toBe(400);
    });
  });
});

describe('GET /api/debug/runs/:runId/export', () => {
  let harness: HttpTestHarness | undefined;

  afterEach(() => {
    harness?.cleanup();
    harness = undefined;
  });

  async function startDemo(): Promise<{ caseId: string }> {
    if (harness === undefined) throw new Error('harness not initialized');
    const response = await request(harness.server)
      .post('/api/cases/demo')
      .set('Idempotency-Key', 'cmd-start')
      .send({ demoId: 'car-purchase' });
    return { caseId: asJson<CommandReceipt>(response.body).caseId };
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

  it('returns a downloadable sift-run-<runId>.json bundle of the run', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');
    harness.runtimeEventStore.append(draftEvent('run-1', caseId, 0));
    harness.runtimeEventStore.append(draftEvent('run-1', caseId, 1, { category: 'skill' }));

    const response = await request(harness.server).get('/api/debug/runs/run-1/export');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="sift-run-run-1.json"',
    );

    const body = asJson<{
      runId: string;
      overview: { eventCount: number };
      exportedEventCount: number;
      events: { sequence: number }[];
      filters: Record<string, string>;
    }>(response.body);

    expect(body.runId).toBe('run-1');
    expect(body.overview.eventCount).toBe(2);
    expect(body.exportedEventCount).toBe(2);
    expect(body.events.map((event) => event.sequence)).toEqual([0, 1]);
    expect(body.filters).toEqual({});
  });

  it('exports exactly the events the active filters select, and says which filters produced it', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 0, { category: 'tool', summary: 'Reading listings.' }),
    );
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 1, {
        category: 'intervention',
        name: 'intervention.proceed',
        summary: 'BudgetGuard: tool is excluded from the run tool-call budget.',
      }),
    );

    const response = await request(harness.server).get(
      '/api/debug/runs/run-1/export?category=intervention&q=budgetguard',
    );
    expect(response.status).toBe(200);

    const body = asJson<{
      overview: { eventCount: number };
      exportedEventCount: number;
      events: { sequence: number }[];
      filters: Record<string, string>;
    }>(response.body);

    // The whole run is still described by `overview` -- an export of a
    // filtered view must not silently misreport how big the run was.
    expect(body.overview.eventCount).toBe(2);
    expect(body.exportedEventCount).toBe(1);
    expect(body.events.map((event) => event.sequence)).toEqual([1]);
    expect(body.filters).toEqual({ category: 'intervention', q: 'budgetguard' });
  });

  it('never emits a secret in the exported bundle, and records why it was withheld', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');
    harness.runtimeEventStore.append(
      draftEvent('run-1', caseId, 0, {
        payload: { note: 'token SIFT_TEST_SECRET_CANARY42 pasted by a user' },
        attributes: { authorization: 'Bearer abc.def.ghi' },
      }),
    );

    const response = await request(harness.server).get('/api/debug/runs/run-1/export');
    expect(response.status).toBe(200);

    const raw = response.text;
    expect(raw).not.toContain('SIFT_TEST_SECRET_CANARY42');
    expect(raw).not.toContain('abc.def.ghi');

    const body = asJson<{
      redactionManifest: { eventId: string; sequence: number; path: string; reason: string }[];
    }>(response.body);
    expect(body.redactionManifest.length).toBeGreaterThan(0);
    expect(body.redactionManifest.every((entry) => entry.sequence === 0)).toBe(true);
    expect(body.redactionManifest.map((entry) => entry.reason).join(' ')).toMatch(
      /secret pattern|credential/,
    );
  });

  it('returns 404 for a run that does not exist', async () => {
    harness = await createHttpTestHarness();

    const response = await request(harness.server).get('/api/debug/runs/nope/export');
    expect(response.status).toBe(404);
  });

  it('returns 404 when SIFT_DEBUG_ENABLED is false, like every other debug route', async () => {
    harness = await createHttpTestHarness({ debugEnabled: false });
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.server).get('/api/debug/runs/run-1/export');
    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid filter rather than exporting an unfiltered bundle', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run-1');

    const response = await request(harness.server).get(
      '/api/debug/runs/run-1/export?level=not-a-level',
    );
    expect(response.status).toBe(400);
  });

  it('cannot be used to inject a header through the runId in the download filename', async () => {
    harness = await createHttpTestHarness();
    const { caseId } = await startDemo();
    seedRun(caseId, 'run "1"');

    const response = await request(harness.server).get(
      `/api/debug/runs/${encodeURIComponent('run "1"')}/export`,
    );
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="sift-run-run--1-.json"',
    );
  });
});
