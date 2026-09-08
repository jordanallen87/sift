#!/usr/bin/env tsx
/**
 * `pnpm test:deployed` (docs/specs/testing.md "Commands and gates"): an
 * opt-in, real-network check against a live Railway deployment. Never part
 * of `pnpm verify`/`pnpm verify:release` (both must run without network
 * access) -- this is additive release evidence, run manually or in a
 * deploy-time CI step, against `SIFT_DEPLOYED_URL`.
 *
 * testing.md's exact required behavior: "It creates a fixture case, records
 * its case/run IDs, confirms inspector availability, triggers a Railway
 * restart or redeploy, and proves the case, events, trace, and SQLite
 * migration ledger persist afterward." Also required, best-effort here:
 * public web health/static assets, CORS from the public web origin,
 * AgentCore `/ping` (skipped with an honest reason when the deployment
 * isn't AgentCore-backed), and a note on WebMCP registration.
 *
 * WebMCP registration is checked properly by `pnpm test:host`, which drives
 * a real WebMCP host (Chrome 152's native `document.modelContext`, over the
 * CDP `WebMCP` domain) against a running instance -- see ADR 0013. This
 * script's header used to say that browser "cannot be driven"; that was
 * true of this script and is no longer true of the repository.
 *
 * Every check is a real HTTP call against a real deployment. No mocks, no
 * fixtures standing in for the network. `railway redeploy` is invoked via
 * the Railway CLI only if it is present and this checkout is linked to a
 * project (`railway status`); otherwise the redeploy-persistence step is
 * reported as skipped with the exact reason, never silently passed.
 */
import { execFileSync } from 'node:child_process';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, status: CheckResult['status'], detail: string): void {
  results.push({ name, status, detail });
  const marker = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP';
  console.log(`[sift] test:deployed [${marker}] ${name} — ${detail}`);
}

async function main(): Promise<void> {
  const baseUrl = process.env['SIFT_DEPLOYED_URL'];
  if (baseUrl === undefined || baseUrl.trim() === '') {
    console.error(
      '[sift] test:deployed: SIFT_DEPLOYED_URL is not set. This is an opt-in check against a ' +
        'real, already-deployed instance (docs/specs/testing.md) -- set it to the deployed ' +
        'origin (e.g. https://pax-hackathon-production.up.railway.app) and rerun.',
    );
    process.exit(1);
  }
  const url = baseUrl.replace(/\/+$/, '');

  // --- Health and static assets ---
  const health = await fetch(`${url}/health`);
  const healthBody = (await health.json().catch(() => null)) as {
    database?: { connected?: boolean };
  } | null;
  if (health.ok && healthBody?.database?.connected === true) {
    record('health', 'pass', `200, database.connected=true`);
  } else {
    record('health', 'fail', `status=${health.status}, body=${JSON.stringify(healthBody)}`);
  }

  const root = await fetch(`${url}/`);
  const contentType = root.headers.get('content-type') ?? '';
  if (root.ok && contentType.includes('text/html')) {
    record('static-assets', 'pass', `GET / -> ${root.status}, ${contentType}`);
  } else {
    record('static-assets', 'fail', `GET / -> ${root.status}, ${contentType}`);
  }

  const notFound = await fetch(`${url}/this-route-does-not-exist`);
  if (notFound.status === 404) {
    record('spa-no-catchall', 'pass', 'unknown route correctly returns 404, not a fake 200');
  } else {
    record('spa-no-catchall', 'fail', `unknown route returned ${notFound.status}, expected 404`);
  }

  // --- Fixture case + investigation run, recording case/run IDs ---
  const commandId = (name: string): string => `test-deployed-${name}-${crypto.randomUUID()}`;

  const demoResponse = await fetch(`${url}/api/cases/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId('start-demo') },
    body: JSON.stringify({ demoId: 'car-purchase' }),
  });
  const demoBody = (await demoResponse.json()) as {
    snapshot?: { id: string; eventSequence: number; entities: unknown[] };
  };
  const caseId = demoBody.snapshot?.id;
  if (demoResponse.ok && caseId !== undefined && (demoBody.snapshot?.entities.length ?? 0) === 4) {
    record('fixture-case', 'pass', `caseId=${caseId}, 4 seeded candidates`);
  } else {
    record(
      'fixture-case',
      'fail',
      `status=${demoResponse.status}, body=${JSON.stringify(demoBody)}`,
    );
    printSummaryAndExit();
    return;
  }
  let sequence = demoBody.snapshot?.eventSequence ?? 0;

  const focusResponse = await fetch(`${url}/api/cases/${caseId}/commands/focusOption`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId('focus') },
    body: JSON.stringify({ caseId, optionId: 'candidate-rav4', expectedSequence: sequence }),
  });
  const focusBody = (await focusResponse.json()) as { snapshot?: { eventSequence: number } };
  sequence = focusBody.snapshot?.eventSequence ?? sequence;

  const runResponse = await fetch(`${url}/api/cases/${caseId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId('run') },
    body: JSON.stringify({
      caseId,
      expectedSequence: sequence,
      obligationId: 'car.deal_normalization',
    }),
  });
  const runBody = (await runResponse.json()) as { runId?: string };
  const runId = runBody.runId;
  if (runResponse.ok && runId !== undefined) {
    record('investigation-run', 'pass', `caseId=${caseId}, runId=${runId}`);
  } else {
    record(
      'investigation-run',
      'fail',
      `status=${runResponse.status}, body=${JSON.stringify(runBody)}`,
    );
    printSummaryAndExit();
    return;
  }

  // --- Runtime Inspector availability ---
  const inspectorBefore = await pollDebugRun(url, runId);
  if (inspectorBefore !== null && inspectorBefore.eventCount > 0) {
    record(
      'inspector-availability',
      'pass',
      `runId=${runId}, eventCount=${inspectorBefore.eventCount}, traceId=${inspectorBefore.traceId}`,
    );
  } else {
    record(
      'inspector-availability',
      'fail',
      `no runtime_events found for runId=${runId} after polling`,
    );
  }

  // --- CORS from the public web origin (same-origin deployment: a
  // cross-origin preflight against a foreign Origin should NOT be allowed,
  // since architecture.md's "Deployment" makes the browser app and API
  // same-origin by design and SIFT_PUBLIC_ORIGIN is unset in this
  // deployment -- proving that is the honest CORS check here). ---
  const corsProbe = await fetch(`${url}/health`, {
    headers: { Origin: 'https://an-unrelated-origin.example' },
  });
  const acao = corsProbe.headers.get('access-control-allow-origin');
  if (acao === null) {
    record(
      'cors',
      'pass',
      'no Access-Control-Allow-Origin for an unrelated origin (same-origin deployment)',
    );
  } else {
    record('cors', 'fail', `unexpected Access-Control-Allow-Origin: ${acao}`);
  }

  // --- AgentCore /ping and /invocations (routes/agentcore.ts) --- the
  // routes themselves are always real and live regardless of
  // SIFT_EXECUTION_TARGET (that flag only decides whether Strands execution
  // is proxied to a deployed Bedrock AgentCore runtime, per config.ts and
  // strands-runtime.md's "Models and configuration"; the HTTP transport is
  // real either way). testing.md's test:deployed spec wants "one AgentCore
  // invocation per hero pack" — the second one below creates its own fresh
  // home-energy-guardian case for exactly that.
  const pingResponse = await fetch(`${url}/ping`).catch(() => null);
  if (pingResponse?.ok === true) {
    record('agentcore-ping', 'pass', `${url}/ping -> ${pingResponse.status}`);
  } else {
    record('agentcore-ping', 'fail', `status=${pingResponse?.status ?? 'no response'}`);
  }

  const carPurchaseInvocation = await fetch(`${url}/invocations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId }),
  });
  const carPurchaseInvocationBody = (await carPurchaseInvocation.json().catch(() => null)) as {
    status?: string;
  } | null;
  if (carPurchaseInvocation.ok && carPurchaseInvocationBody?.status === 'success') {
    record(
      'agentcore-invocations-car-purchase',
      'pass',
      `${url}/invocations -> 200, caseId=${caseId}`,
    );
  } else {
    record(
      'agentcore-invocations-car-purchase',
      'fail',
      `status=${carPurchaseInvocation.status}, body=${JSON.stringify(carPurchaseInvocationBody)}`,
    );
  }

  const energyDemoResponse = await fetch(`${url}/api/cases/demo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': commandId('start-energy-demo'),
    },
    body: JSON.stringify({ demoId: 'home-energy-guardian' }),
  });
  const energyDemoBody = (await energyDemoResponse.json().catch(() => null)) as {
    snapshot?: { id: string };
  } | null;
  const energyCaseId = energyDemoBody?.snapshot?.id;
  if (energyDemoResponse.ok && energyCaseId !== undefined) {
    const energyInvocation = await fetch(`${url}/invocations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId: energyCaseId }),
    });
    const energyInvocationBody = (await energyInvocation.json().catch(() => null)) as {
      status?: string;
    } | null;
    if (energyInvocation.ok && energyInvocationBody?.status === 'success') {
      record(
        'agentcore-invocations-home-energy-guardian',
        'pass',
        `${url}/invocations -> 200, caseId=${energyCaseId}`,
      );
    } else {
      record(
        'agentcore-invocations-home-energy-guardian',
        'fail',
        `status=${energyInvocation.status}, body=${JSON.stringify(energyInvocationBody)}`,
      );
    }
  } else {
    record(
      'agentcore-invocations-home-energy-guardian',
      'fail',
      `could not create a home-energy-guardian fixture case: status=${energyDemoResponse.status}`,
    );
  }

  // --- WebMCP registration in a compatible client ---
  record(
    'webmcp-client-registration',
    'skip',
    'requires a real WebMCP-enabled browser (ChatGPT in-app browser or a flagged Chrome build) this script cannot drive; ' +
      'per testing.md, record one manual host smoke test with timestamp, deployed URL, tool names discovered, and outcome',
  );

  // --- Restart/redeploy persistence proof ---
  const redeployOutcome = await attemptRedeployAndVerify(
    url,
    caseId,
    runId,
    inspectorBefore?.eventCount ?? null,
  );
  results.push(redeployOutcome);
  const marker =
    redeployOutcome.status === 'pass'
      ? 'PASS'
      : redeployOutcome.status === 'fail'
        ? 'FAIL'
        : 'SKIP';
  console.log(
    `[sift] test:deployed [${marker}] ${redeployOutcome.name} — ${redeployOutcome.detail}`,
  );

  printSummaryAndExit();
}

interface DebugOverview {
  eventCount: number;
  traceId: string;
  status: string;
}

async function pollDebugRun(
  url: string,
  runId: string,
  attempts = 15,
): Promise<DebugOverview | null> {
  for (let i = 0; i < attempts; i += 1) {
    const response = await fetch(`${url}/api/debug/runs/${runId}`);
    if (response.ok) {
      const body = (await response.json()) as { overview?: DebugOverview };
      if (body.overview?.status === 'completed') {
        return body.overview;
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  return null;
}

function railwayLinked(): boolean {
  try {
    execFileSync('railway', ['status', '--json'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

async function attemptRedeployAndVerify(
  url: string,
  caseId: string,
  runId: string,
  eventCountBefore: number | null,
): Promise<CheckResult> {
  if (!railwayLinked()) {
    return {
      name: 'redeploy-persistence',
      status: 'skip',
      detail:
        'no linked `railway` CLI context in this checkout — run from the deployed project directory with the Railway CLI authenticated to exercise this step',
    };
  }

  try {
    execFileSync('railway', ['redeploy', '-y', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    return {
      name: 'redeploy-persistence',
      status: 'fail',
      detail: `railway redeploy failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Poll health until the new deployment is live again.
  let healthy = false;
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        healthy = true;
        break;
      }
    } catch {
      // Between the old container stopping and the new one binding, the
      // connection can be refused outright — keep polling.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));
  }
  if (!healthy) {
    return {
      name: 'redeploy-persistence',
      status: 'fail',
      detail: 'service did not become healthy again after redeploy',
    };
  }

  const caseAfter = await fetch(`${url}/api/cases/${caseId}`);
  const caseBodyAfter = (await caseAfter.json().catch(() => null)) as {
    id?: string;
    entities?: unknown[];
  } | null;
  const caseSurvived =
    caseAfter.ok && caseBodyAfter?.id === caseId && (caseBodyAfter.entities?.length ?? 0) === 4;

  const debugAfter = await fetch(`${url}/api/debug/runs/${runId}`);
  const debugBodyAfter = (await debugAfter.json().catch(() => null)) as {
    overview?: DebugOverview;
  } | null;
  const eventsSurvived =
    debugAfter.ok &&
    debugBodyAfter?.overview?.eventCount !== undefined &&
    (eventCountBefore === null || debugBodyAfter.overview.eventCount === eventCountBefore);

  if (caseSurvived && eventsSurvived) {
    return {
      name: 'redeploy-persistence',
      status: 'pass',
      detail: `case ${caseId} and run ${runId}'s ${debugBodyAfter?.overview?.eventCount} runtime_events survived a real redeploy`,
    };
  }
  return {
    name: 'redeploy-persistence',
    status: 'fail',
    detail: `case survived=${caseSurvived}, events survived=${eventsSurvived} (before=${eventCountBefore}, after=${debugBodyAfter?.overview?.eventCount})`,
  };
}

function printSummaryAndExit(): void {
  const failed = results.filter((r) => r.status === 'fail');
  const passed = results.filter((r) => r.status === 'pass');
  const skipped = results.filter((r) => r.status === 'skip');
  console.log(
    `\n[sift] test:deployed: ${failed.length === 0 ? 'PASSED' : 'FAILED'} ` +
      `(${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed)`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
