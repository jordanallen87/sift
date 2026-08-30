/**
 * PAX-P28 (docs/specs/README.md): a normal, non-demo, catalog-built
 * `car-purchase` case -- created via `POST /api/cases` (`startCase`) plus
 * `POST /api/cases/:caseId/commands/upsertOption` with catalog-mapped,
 * genuinely PARTIAL attribute sets, never `startDemo`'s four fully-populated
 * fixture candidates -- works correctly end to end through the real
 * HTTP/store pipeline (docs/decisions/0003-vehicle-catalog-and-normal-case-
 * creation.md). Every fixture vehicle below is mapped through the one real
 * adaptation boundary, `@sift/catalog`'s `mapCatalogRecordToOption`, exactly
 * as `apps/web`'s catalog/shortlist flow would build its own `upsertOption`
 * calls -- this is a *test* closing a coverage gap the ADR itself calls out
 * ("This task adds tests proving that ... not new production code"), not new
 * production behavior.
 *
 * Deliberately NOT built on `fixtures/http-harness.ts`'s
 * `createHttpTestHarness()`, unlike `cases.test.ts`. That harness registers
 * `fixtures/synthetic-pack.ts`'s synthetic, single-attribute (`car.price`),
 * single-criterion (`price`) `car-purchase` fixture pack -- correct for
 * generic HTTP-contract coverage that never depends on a real pack-specific
 * id, which is all `cases.test.ts` needs -- and wires `RunService` with no
 * `engines` at all, so nothing there ever advances a run past `queued`. This
 * file's own claims are specifically about the REAL `car-purchase` pack
 * (`packages/packs/src/car-purchase.ts`): that catalog-mapped attribute ids
 * (`car.make`/`car.model`/...) round-trip, that a real default criterion id
 * (`pref.safety_reliability`) can be reweighted, and that the live
 * `car-purchase-engine.ts` demo-guard is reachable at all -- none of which
 * `createHttpTestHarness()`'s synthetic pack or unwired `RunService` can
 * prove. `buildRealCarPurchaseHttpHarness` below instead composes the exact
 * same real stack `runtime/car-purchase-engine.test.ts`'s own
 * `buildLiveStack()` already proves the engine against directly (real
 * `compileCarPurchasePack`, real `createCarPurchaseEngine`, real SQLite
 * stores), wired into the real Express `app` via the exported `buildApp` so
 * every assertion here goes through a genuine HTTP request/response cycle
 * via `supertest` -- matching `cases.test.ts`'s own testing pattern, just
 * with the real pack and a real wired engine underneath it.
 */
import request from 'supertest';
import type { Application } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CaseState, CommandReceipt, PublicActivityEvent, RunReceipt } from '@sift/contracts';
import type { Clock, IdGenerator } from '@sift/core';
import { compileCarPurchasePack, PackRegistry } from '@sift/packs';
import { mapCatalogRecordToOption, type VehicleCatalogRecord } from '@sift/catalog';
import { asJson } from '../fixtures/http-types.js';
import { buildApp } from '../app.js';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { CommandService } from '../services/command-service.js';
import { RunService, SqliteRunStore } from '../services/run-service.js';
import { SqliteActivityStore } from '../store/activity-store.js';
import { SqliteCaseStore } from '../store/sqlite-case-store.js';
import { SqliteRuntimeEventStore } from '../store/runtime-event-store.js';
import { createCarPurchaseEngine } from '../runtime/car-purchase-engine.js';
import { carPurchaseCapabilityCatalog } from '../runtime/car-purchase-scenario.js';
import type { RuntimeOverview } from './debug.js';

// Mirrors runtime/car-purchase-engine.test.ts's own `SKILLS_ROOT_DIR`/
// `FIXED_CLOCK`/`fixedIdGenerator` exactly -- both files sit two directories
// below `apps/agent` (`src/routes/` here, `src/runtime/` there), so the same
// relative path resolves to the same real `apps/agent/skills` directory.
const SKILLS_ROOT_DIR = fileURLToPath(new URL('../../skills', import.meta.url));
const FIXED_CLOCK: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function fixedIdGenerator(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

function requireSnapshot(receipt: CommandReceipt): CaseState {
  if (receipt.snapshot === undefined) throw new Error('receipt has no snapshot');
  return receipt.snapshot;
}

interface RealCarPurchaseHttpHarness {
  readonly app: Application;
  cleanup(): void;
}

/** The real `car-purchase` pack, the real `CarPurchaseEngine`, and the real Express `app` -- see this file's header comment for why this diverges from `fixtures/http-harness.ts`. */
function buildRealCarPurchaseHttpHarness(): RealCarPurchaseHttpHarness {
  const database: TestDatabase = createTestDatabase();
  applyMigrations(database.sqlite);

  const registry = new PackRegistry();
  const pack = compileCarPurchasePack(carPurchaseCapabilityCatalog(), FIXED_CLOCK);
  registry.register(pack);

  const caseStore = new SqliteCaseStore(database);
  const activityStore = new SqliteActivityStore(database);
  const runStore = new SqliteRunStore(database);
  const runtimeEventStore = new SqliteRuntimeEventStore(database);
  const idGenerator = fixedIdGenerator();

  const engine = createCarPurchaseEngine({
    caseStore,
    activityStore,
    runStore,
    runtimeEventStore,
    registry,
    clock: FIXED_CLOCK,
    idGenerator,
    skillsRootDir: SKILLS_ROOT_DIR,
  });

  const commandService = new CommandService({
    caseStore,
    activityStore,
    registry,
    clock: FIXED_CLOCK,
    idGenerator,
  });
  const runService = new RunService({
    caseStore,
    activityStore,
    runStore,
    clock: FIXED_CLOCK,
    idGenerator,
    engines: { [pack.identity.id]: engine },
  });

  const app = buildApp({
    database,
    caseStore,
    activityStore,
    registry,
    commandService,
    runService,
    runStore,
    runtimeEventStore,
    clock: FIXED_CLOCK,
  });

  return { app, cleanup: () => database.cleanup() };
}

// --- Realistic catalog fixture records (docs/decisions/0003-...: "a bounded,
// curated transform ... selects 44 popular make/model families"). Hand-built
// here rather than loading the real bundled catalog file -- this test only
// needs a few plausible, schema-valid `VehicleCatalogRecord`s, not the whole
// dataset. Deliberately three different shapes: a hybrid sedan, an AWD
// gasoline SUV, and an EV with no known combined MPG (`combinedMpg: null`)
// -- proving `mapCatalogRecordToOption` omits genuinely unknown fields per
// vehicle, not just once for the whole fixture set. ---
const CATALOG_FIXTURES: VehicleCatalogRecord[] = [
  {
    id: 'toyota-camry-2025-le-hybrid',
    year: 2025,
    make: 'Toyota',
    model: 'Camry',
    trim: 'LE Hybrid',
    bodyStyle: 'Sedan',
    drivetrain: 'FWD',
    fuelType: 'Hybrid',
    combinedMpg: 51,
    cylinders: 4,
    transmission: 'Automatic (variable gear ratios)',
    source: { dataset: 'epa-fueleconomy-2025-2026', recordId: 'epa-10234' },
  },
  {
    id: 'honda-crv-2025-exl-awd',
    year: 2025,
    make: 'Honda',
    model: 'CR-V',
    trim: 'EX-L',
    bodyStyle: 'SUV',
    drivetrain: 'AWD',
    fuelType: 'Gasoline',
    combinedMpg: 29,
    cylinders: 4,
    transmission: 'Automatic (CVT)',
    source: { dataset: 'epa-fueleconomy-2025-2026', recordId: 'epa-10567' },
  },
  {
    id: 'chevrolet-bolt-euv-2025-lt',
    year: 2025,
    make: 'Chevrolet',
    model: 'Bolt EUV',
    trim: 'LT',
    bodyStyle: 'Hatchback',
    drivetrain: 'FWD',
    fuelType: 'Electric',
    combinedMpg: null,
    cylinders: null,
    transmission: null,
    source: { dataset: 'epa-fueleconomy-2025-2026', recordId: 'epa-10999' },
  },
];

interface CatalogBuiltCase {
  readonly caseId: string;
  readonly expectedSequence: number;
  readonly mapped: ReturnType<typeof mapCatalogRecordToOption>[];
  readonly startReceipt: CommandReceipt;
}

/**
 * The real, live path a normal (non-demo) user takes: `POST /api/cases` (zero
 * seeded entities) then one `POST .../commands/upsertOption` per shortlisted
 * vehicle, each built from the one real `mapCatalogRecordToOption` adaptation
 * boundary -- exactly what `apps/web`'s catalog/shortlist UI does, just
 * driven over HTTP here instead of from a browser.
 */
async function startCatalogBuiltCase(app: Application): Promise<CatalogBuiltCase> {
  const startResponse = await request(app)
    .post('/api/cases')
    .set('Idempotency-Key', 'cmd-start')
    .send({ packId: 'car-purchase' });
  expect(startResponse.status).toBe(200);
  const startReceipt = asJson<CommandReceipt>(startResponse.body);
  const caseId = startReceipt.caseId;
  let expectedSequence = requireSnapshot(startReceipt).eventSequence;

  const mapped = CATALOG_FIXTURES.map((record) => mapCatalogRecordToOption(record));

  let commandIndex = 0;
  for (const option of mapped) {
    commandIndex += 1;
    const response = await request(app)
      .post(`/api/cases/${caseId}/commands/upsertOption`)
      .set('Idempotency-Key', `cmd-opt-${commandIndex}`)
      .send({
        caseId,
        expectedSequence,
        option: { label: option.label, kind: 'candidate', attributes: option.attributes },
      });
    expect(response.status).toBe(200);
    const receipt = asJson<CommandReceipt>(response.body);
    expectedSequence = receipt.acceptedSequence;
  }

  return { caseId, expectedSequence, mapped, startReceipt };
}

/** Polls the real `GET /api/debug/runs/:runId` route (exactly how a real Runtime Inspector client would) until the run settles into a terminal status. No fixed sleep -- a short poll interval bounded by a generous overall timeout. */
async function waitForRunToSettle(
  app: Application,
  runId: string,
  timeoutMs = 25_000,
): Promise<RuntimeOverview> {
  const start = Date.now();
  for (;;) {
    const response = await request(app).get(`/api/debug/runs/${runId}`);
    expect(response.status).toBe(200);
    const body = asJson<{ overview: RuntimeOverview }>(response.body);
    if (body.overview.status === 'completed' || body.overview.status === 'failed') {
      return body.overview;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForRunToSettle: run "${runId}" did not settle within ${timeoutMs}ms (status: ${body.overview.status})`,
      );
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 15));
  }
}

describe('PAX-P28: a catalog-built car-purchase case works end to end through the real HTTP/store pipeline', () => {
  let harness: RealCarPurchaseHttpHarness | undefined;

  afterEach(() => {
    harness?.cleanup();
    harness = undefined;
  });

  it('persists a catalog-built case: right entities/labels, exactly the catalog-supplied attributes present, everything else honestly absent, pack pinned, no recommendation/proposal yet, pack defaults seeded', async () => {
    harness = buildRealCarPurchaseHttpHarness();
    const { caseId, mapped, startReceipt } = await startCatalogBuiltCase(harness.app);
    const startSnapshot = requireSnapshot(startReceipt);

    const response = await request(harness.app).get(`/api/cases/${caseId}`);
    expect(response.status).toBe(200);
    const snapshot = asJson<CaseState>(response.body);

    // --- entities: right length, right labels, generated (never fixture) ids ---
    expect(snapshot.entities).toHaveLength(mapped.length);
    expect(snapshot.entities.map((entity) => entity.label).sort()).toEqual(
      mapped.map((option) => option.label).sort(),
    );

    for (const option of mapped) {
      const entity = snapshot.entities.find((candidate) => candidate.label === option.label);
      expect(entity).toBeDefined();
      if (entity === undefined) continue;
      expect(entity.kind).toBe('candidate');
      // A real catalog-created candidate's id comes from
      // idGenerator.next('option'), never one of the deterministic demo's
      // literal fixture ids (docs/decisions/0003-... "Decision" §4).
      expect(entity.id).not.toMatch(/^candidate-/);

      // Exactly the attributes the catalog mapping supplied are present,
      // with the exact mapped value -- never fabricated, never altered.
      for (const attribute of option.attributes) {
        const record = entity.attributes[attribute.definitionId];
        expect(record).toBeDefined();
        expect(record?.status).toBe('asserted');
        expect(record?.origin).toBe('user');
        expect(record?.value).toEqual(attribute.value);
      }

      // Attributes a vehicle catalog can never know stay genuinely absent --
      // never fabricated (CLAUDE.md; ADR 0003 "Context" point 1).
      expect(entity.attributes['car.advertised_price']).toBeUndefined();
      expect(entity.attributes['car.mileage']).toBeUndefined();
      expect(entity.attributes['car.crash_safety_rating']).toBeUndefined();
      expect(entity.attributes['car.five_year_ownership_cost']).toBeUndefined();
      expect(entity.attributes['car.driver_assistance_rating']).toBeUndefined();
    }

    // The EV fixture (no known combinedMpg) proves the omission is genuinely
    // per-attribute-per-vehicle, not merely "the fixture set as a whole
    // happens to omit everything".
    const evEntity = snapshot.entities.find((entity) => entity.label.includes('Bolt EUV'));
    expect(evEntity).toBeDefined();
    expect(evEntity?.attributes['car.combined_fuel_economy_mpg']).toBeUndefined();
    expect(evEntity?.attributes['car.make']?.value).toEqual({
      type: 'string',
      value: 'Chevrolet',
    });

    // --- pack pinned exactly as POST /api/cases returned it ---
    expect(snapshot.pack.id).toBe('car-purchase');
    expect(snapshot.pack.version).toBe(startSnapshot.pack.version);
    expect(snapshot.pack.compiledHash).toBe(startSnapshot.pack.compiledHash);

    // --- no investigation has run yet ---
    expect(snapshot.recommendation).toBeNull();
    expect(snapshot.proposal).toBeNull();

    // --- startCase seeded the pack's own defaults, exactly like startDemo ---
    expect(snapshot.criteria.length).toBeGreaterThan(0);
    expect(snapshot.criteria.map((criterion) => criterion.id)).toContain('pref.safety_reliability');
    expect(snapshot.obligations.length).toBeGreaterThan(0);
    expect(snapshot.obligations.map((obligation) => obligation.id)).toContain(
      'car.hard_constraints',
    );
  });

  it('a generic command (updateCriteria, reweighting a real pack default criterion) genuinely applies to a catalog-built case', async () => {
    harness = buildRealCarPurchaseHttpHarness();
    const { caseId, expectedSequence } = await startCatalogBuiltCase(harness.app);

    const before = asJson<CaseState>((await request(harness.app).get(`/api/cases/${caseId}`)).body);
    const original = before.criteria.find(
      (criterion) => criterion.id === 'pref.safety_reliability',
    );
    expect(original).toBeDefined();
    expect(original?.weight).toBe(30);

    const updateResponse = await request(harness.app)
      .post(`/api/cases/${caseId}/commands/updateCriteria`)
      .set('Idempotency-Key', 'cmd-reweight')
      .send({
        caseId,
        expectedSequence,
        operations: [{ op: 'reweight', criterionId: 'pref.safety_reliability', weight: 45 }],
      });
    expect(updateResponse.status).toBe(200);

    const after = asJson<CaseState>((await request(harness.app).get(`/api/cases/${caseId}`)).body);
    const reweighted = after.criteria.find(
      (criterion) => criterion.id === 'pref.safety_reliability',
    );
    expect(reweighted).toBeDefined();
    expect(reweighted?.weight).toBe(45);
    // Every other default criterion is untouched by this one reweight.
    expect(after.criteria.find((criterion) => criterion.id === 'pref.ownership_cost')?.weight).toBe(
      30,
    );
  });

  it('POST .../run against a catalog-built case fails honestly through the demo-guard, reachable end-to-end via the real HTTP run-request path (ADR 0003 "Decision" §4)', async () => {
    harness = buildRealCarPurchaseHttpHarness();
    const { caseId, expectedSequence } = await startCatalogBuiltCase(harness.app);

    const runResponse = await request(harness.app)
      .post(`/api/cases/${caseId}/run`)
      .set('Idempotency-Key', 'cmd-run')
      .send({ caseId, obligationId: 'car.deal_normalization', expectedSequence });
    expect(runResponse.status).toBe(200);
    const runReceipt = asJson<RunReceipt>(runResponse.body);
    const runId = runReceipt.runId;

    // --- The run settles to a real terminal status -- never hangs "queued"
    // or "running" forever, and never crashes the process. ---
    const overview = await waitForRunToSettle(harness.app, runId);
    expect(overview.status).toBe('failed');

    // --- A real, human-readable explanation is visible through the normal
    // real-time activity path (the polling fallback of GET
    // /api/cases/:caseId/events), not a stack trace and not silence. ---
    const pollResponse = await request(harness.app).get(`/api/cases/${caseId}/events?mode=poll`);
    expect(pollResponse.status).toBe(200);
    const poll = asJson<{ snapshot: CaseState; events: PublicActivityEvent[] }>(pollResponse.body);

    const failedEvent = poll.events.find(
      (event) => event.runId === runId && event.type === 'run.failed',
    );
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.summary).toContain('deterministic example case');
    expect(failedEvent?.summary).toContain('vehicles were added directly');

    // --- Never a fabricated recommendation: the case genuinely has none. ---
    expect(poll.snapshot.recommendation).toBeNull();
    expect(poll.snapshot.proposal).toBeNull();

    // --- The scripted graph never actually ran for this run: the guard
    // fires before any specialist/skill work starts. ---
    const eventsForRun = poll.events.filter((event) => event.runId === runId);
    expect(eventsForRun.map((event) => event.type)).toEqual(['run.queued', 'run.failed']);
  });
});
