import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { StartCaseInput, StartDemoInput } from '@pax/contracts';
import { createPaxClient, PaxClientError } from './pax-client.js';

const BASE_URL = 'http://pax.test';

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

const baseReceipt = {
  commandId: 'cmd-1',
  caseId: 'case-1',
  acceptedSequence: 1,
};

describe('createPaxClient', () => {
  it('posts startDemo to /api/cases/demo and returns a validated CommandReceipt', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE_URL}/api/cases/demo`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(baseReceipt);
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const receipt = await client.startDemo({ demoId: 'car-purchase' });

    expect(receipt).toEqual(baseReceipt);
    expect(capturedBody).toMatchObject({ demoId: 'car-purchase' });
  });

  it('rejects an invalid demoId locally, without making a network request', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases/demo`, () => {
        throw new Error('startDemo must not reach the network with invalid input');
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const invalidInput = { demoId: 'not-a-real-demo' } as unknown as StartDemoInput;

    await expect(client.startDemo(invalidInput)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('posts startCase to /api/cases and returns a validated CommandReceipt', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE_URL}/api/cases`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(baseReceipt);
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const receipt = await client.startCase({ packId: 'car-purchase' });

    expect(receipt).toEqual(baseReceipt);
    expect(capturedBody).toMatchObject({ packId: 'car-purchase' });
  });

  it('rejects an invalid startCase input locally, without making a network request', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases`, () => {
        throw new Error('startCase must not reach the network with invalid input');
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const invalidInput = {} as unknown as StartCaseInput;

    await expect(client.startCase(invalidInput)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('posts requestInvestigation to /api/cases/:caseId/run and returns a RunReceipt', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases/case-1/run`, () =>
        HttpResponse.json({ ...baseReceipt, runId: 'run-1' }),
      ),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const receipt = await client.requestInvestigation({ caseId: 'case-1', expectedSequence: 1 });

    expect(receipt.runId).toBe('run-1');
  });

  it.each([
    ['selectPack', { caseId: 'case-1', packId: 'car-purchase', expectedSequence: 1 }],
    ['focusOption', { caseId: 'case-1', optionId: 'opt-1', expectedSequence: 1 }],
    ['focusEvidence', { caseId: 'case-1', evidenceId: 'ev-1', expectedSequence: 1 }],
    [
      'updateCriteria',
      {
        caseId: 'case-1',
        expectedSequence: 1,
        operations: [{ op: 'reweight', criterionId: 'crit-1', weight: 50 }],
      },
    ],
    [
      'reviewProposal',
      {
        caseId: 'case-1',
        proposalId: 'prop-1',
        actor: 'human',
        decision: 'approve',
        expectedSequence: 1,
      },
    ],
    [
      'setEvidenceDisposition',
      {
        caseId: 'case-1',
        evidenceId: 'ev-1',
        disposition: 'excluded',
        reason: 'duplicate of another source',
        expectedSequence: 1,
      },
    ],
    [
      'requestRevision',
      {
        caseId: 'case-1',
        proposalId: 'prop-1',
        instructions: 'reweight comfort',
        expectedSequence: 1,
      },
    ],
  ] as const)('posts %s to the generic per-case command endpoint', async (methodName, input) => {
    server.use(
      http.post(`${BASE_URL}/api/cases/case-1/commands/${methodName}`, () =>
        HttpResponse.json(baseReceipt),
      ),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const method = client[methodName] as (value: typeof input) => Promise<unknown>;
    const receipt = await method(input);

    expect(receipt).toEqual(baseReceipt);
  });

  it('throws a PaxClientError carrying the parsed error code and status on a non-OK response', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases/case-1/commands/selectPack`, () =>
        HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'stale sequence', retryable: true } },
          { status: 409 },
        ),
      ),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });

    await expect(
      client.selectPack({ caseId: 'case-1', packId: 'car-purchase', expectedSequence: 0 }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      retryable: true,
    });
  });

  it('falls back to a generic PaxClientError when a non-OK response body does not match the error contract', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases/case-1/commands/selectPack`, () =>
        HttpResponse.text('internal server error', { status: 500 }),
      ),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });

    await expect(
      client.selectPack({ caseId: 'case-1', packId: 'car-purchase', expectedSequence: 0 }),
    ).rejects.toMatchObject({
      status: 500,
      retryable: true,
      code: undefined,
    });
  });

  it('rejects with a PaxClientError when the server returns a malformed receipt', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases/demo`, () => HttpResponse.json({ not: 'a receipt' })),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });

    await expect(client.startDemo({ demoId: 'car-purchase' })).rejects.toBeInstanceOf(
      PaxClientError,
    );
  });

  it('sends a fresh client-generated command id header on every call', async () => {
    const seenIds: string[] = [];
    server.use(
      http.post(`${BASE_URL}/api/cases/demo`, ({ request }) => {
        seenIds.push(request.headers.get('x-pax-command-id') ?? '');
        return HttpResponse.json(baseReceipt);
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    await client.startDemo({ demoId: 'car-purchase' });
    await client.startDemo({ demoId: 'car-purchase' });

    expect(seenIds).toHaveLength(2);
    expect(seenIds[0]).toBeTruthy();
    expect(new Set(seenIds).size).toBe(2);
  });

  it('honors an explicit commandId override on both the header and Idempotency-Key', async () => {
    let seenCommandId: string | null = null;
    let seenIdempotencyKey: string | null = null;
    server.use(
      http.post(`${BASE_URL}/api/cases/demo`, ({ request }) => {
        seenCommandId = request.headers.get('x-pax-command-id');
        seenIdempotencyKey = request.headers.get('idempotency-key');
        return HttpResponse.json(baseReceipt);
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    await client.startDemo({ demoId: 'car-purchase' }, { commandId: 'tool-call-42' });

    expect(seenCommandId).toBe('tool-call-42');
    expect(seenIdempotencyKey).toBe('tool-call-42');
  });

  it('rejects with an UNAVAILABLE/retryable PaxClientError when the signal is already aborted', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases/demo`, () => {
        throw new Error('an already-aborted request must never reach the network');
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.startDemo({ demoId: 'car-purchase' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
  });

  it('rejects with an UNAVAILABLE/retryable PaxClientError when the signal aborts mid-request', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases/demo`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(baseReceipt);
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const controller = new AbortController();
    const pending = client.startDemo({ demoId: 'car-purchase' }, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
  });

  it('forwards the signal so a genericCommand call can also be aborted', async () => {
    server.use(
      http.post(`${BASE_URL}/api/cases/case-1/commands/focusOption`, () => {
        throw new Error('an already-aborted request must never reach the network');
      }),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.focusOption(
        { caseId: 'case-1', optionId: 'candidate-rav4', expectedSequence: 0 },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
  });

  it('propagates a non-abort fetch failure as-is rather than mislabeling it UNAVAILABLE', async () => {
    const client = createPaxClient({
      baseUrl: BASE_URL,
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });

    await expect(client.startDemo({ demoId: 'car-purchase' })).rejects.toThrow('Failed to fetch');
  });

  it('parses a real 409 conflict body into code/actualSequence/snapshot rather than a generic failure', async () => {
    const snapshot = {
      schemaVersion: '1.0' as const,
      id: 'case-1',
      title: 'Choose our next family car',
      status: 'investigating' as const,
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: 'a'.repeat(64),
        selectedBy: 'user' as const,
        reasons: ['User selected this Decision Pack'],
      },
      attributeDefinitions: [],
      entities: [],
      criteria: [],
      obligations: [],
      caseExtensions: [],
      claims: [],
      sources: [],
      evidenceLinks: [],
      recommendation: null,
      proposal: null,
      activeFocus: null,
      selectedOptionId: null,
      selectedEvidenceId: null,
      eventSequence: 4,
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:05:00.000Z',
    };
    server.use(
      http.post(`${BASE_URL}/api/cases/case-1/commands/focusOption`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'Expected sequence 1 does not match the current sequence 4.',
              retryable: true,
              expectedSequence: 1,
              actualSequence: 4,
            },
            snapshot,
          },
          { status: 409 },
        ),
      ),
    );

    const client = createPaxClient({ baseUrl: BASE_URL });

    await expect(
      client.focusOption({ caseId: 'case-1', optionId: 'candidate-rav4', expectedSequence: 1 }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      retryable: true,
      details: {
        expectedSequence: 1,
        actualSequence: 4,
        snapshot,
      },
    });
  });
});
