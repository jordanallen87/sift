/**
 * PAX-P28 (docs/specs/README.md): proves the WebMCP tool layer
 * (`register-pax-tools.ts`) behaves correctly when `getActiveCase()` returns
 * a `CaseState` shaped like a REAL catalog-built case
 * (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md) --
 * mostly-partial entity attributes (only the fields a vehicle catalog can
 * actually know: make/model/year/trim/body style/drivetrain/powertrain/
 * combined MPG), generated `option-N` entity ids rather than the
 * deterministic demo's literal `candidate-rav4`/etc. fixture ids, and no
 * recommendation/proposal yet -- rather than the fully-populated, four-
 * fixture-candidate `CaseState` every other `register-pax-tools.test.ts`
 * case builds via `buildFixtureCaseState`'s empty-array defaults or the
 * demo's own seed data. `case-context.ts`'s `buildCaseContextSummary`
 * projects `CaseState` generically with no demo-specific branching
 * (confirmed by reading it), so this is a coverage gap the ADR itself calls
 * out, not new production behavior -- this file adds the missing proof, it
 * does not change `register-pax-tools.ts` or `case-context.ts`.
 *
 * A new file rather than a new `describe` block appended to the existing
 * (already ~900-line) `register-pax-tools.test.ts`, to avoid merge-conflict
 * risk with other concurrent work on that file. Every testing idiom below
 * (the `AnyToolResult`/`invokeTool` wrapper, `setUpWithActiveCase`, the fake
 * `PaxCommands`/`InMemoryModelContextAdapter` construction) is copied
 * verbatim from that file's own conventions rather than inventing a new
 * pattern.
 *
 * Deliberately hand-builds catalog-style `EntityRecord`s instead of
 * importing `@pax/catalog`'s `mapCatalogRecordToOption` -- `apps/agent`'s
 * `catalog-case-integration.test.ts` already proves that real mapping
 * function's output end to end through the real HTTP/store pipeline; this
 * file only needs `CaseState` fixtures *shaped like* that output (partial
 * attributes, generated ids) to exercise the WebMCP projection/dispatch
 * layer in isolation, matching this task's own instruction to hand-construct
 * fixtures here rather than pull catalog mapping logic into the browser
 * test.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  AttributeRecord,
  AttributeValue,
  CaseState,
  Criterion,
  EntityRecord,
} from '@pax/contracts';
import type { PaxCommands } from '../api/pax-client.js';
import {
  buildFakeCommandReceipt,
  buildFakeRunReceipt,
  createFakePaxCommands,
} from '../test/fake-pax-commands.js';
import { buildFixtureCaseState } from '../test/fixtures.js';
import { InMemoryModelContextAdapter } from './adapter.js';
import { registerPaxTools } from './register-pax-tools.js';

interface AnyToolResult<TData = unknown> {
  ok: boolean;
  message: string;
  data?: TData;
  commandId?: string;
  runId?: string;
  caseId?: string;
  sequence?: number;
  ui: { changed: boolean; focusTarget?: string };
  error?: { code: string; retryable: boolean };
}

/** Same explicitly-generic wrapper as `register-pax-tools.test.ts`'s own -- see that file's comment for why a typed helper is used instead of casting `unknown` at each call site. */
async function invokeTool<TData = unknown>(
  adapter: InMemoryModelContextAdapter,
  name: string,
  input: unknown,
): Promise<AnyToolResult<TData>> {
  return adapter.invoke<unknown, AnyToolResult<TData>>(name, input);
}

async function setUpWithActiveCase(
  caseId: string,
  overrides: Partial<PaxCommands> = {},
): Promise<{ adapter: InMemoryModelContextAdapter; commands: PaxCommands }> {
  const adapter = new InMemoryModelContextAdapter();
  const commands = createFakePaxCommands(overrides);
  const handle = await registerPaxTools({
    adapter,
    commands,
    getActiveCase: () => null,
    listPacks: () => [],
  });
  await handle.setActiveCase(caseId);
  return { adapter, commands };
}

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/** A minimal, schema-valid, user-asserted `AttributeRecord` -- the exact shape `CommandService.upsertOption` produces for a catalog-mapped attribute (`origin: 'user'`, `status: 'asserted'`, no `sourceIds`). */
function catalogAttribute(
  definitionId: string,
  label: string,
  value: AttributeValue,
): AttributeRecord {
  return {
    definitionId,
    label,
    value,
    origin: 'user',
    sourceIds: [],
    status: 'asserted',
    updatedAt: FIXED_TIMESTAMP,
  };
}

/**
 * Two catalog-built candidate entities, shaped exactly like real
 * `mapCatalogRecordToOption` output would produce: only make/model/year/
 * trim/body style/drivetrain/powertrain/combined MPG present, generated
 * `option-N` ids (never a `candidate-*` demo fixture id), and every
 * price/mileage/safety/ownership-cost attribute genuinely absent from the
 * `attributes` map -- not set to a placeholder, not zeroed out.
 */
const CATALOG_ENTITIES: EntityRecord[] = [
  {
    id: 'option-1',
    kind: 'candidate',
    label: '2025 Toyota Camry LE Hybrid',
    attributes: {
      'car.make': catalogAttribute('car.make', 'Make', { type: 'string', value: 'Toyota' }),
      'car.model': catalogAttribute('car.model', 'Model', { type: 'string', value: 'Camry' }),
      'car.model_year': catalogAttribute('car.model_year', 'Model year', {
        type: 'number',
        value: 2025,
      }),
      'car.trim': catalogAttribute('car.trim', 'Trim', { type: 'string', value: 'LE Hybrid' }),
      'car.body_style': catalogAttribute('car.body_style', 'Body style', {
        type: 'string',
        value: 'Sedan',
      }),
      'car.drivetrain': catalogAttribute('car.drivetrain', 'Drivetrain', {
        type: 'enum',
        value: 'FWD',
      }),
      'car.powertrain': catalogAttribute('car.powertrain', 'Powertrain', {
        type: 'enum',
        value: 'hybrid',
      }),
      'car.combined_fuel_economy_mpg': catalogAttribute(
        'car.combined_fuel_economy_mpg',
        'Combined fuel economy',
        { type: 'number', value: 51, unit: 'mpg' },
      ),
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  },
  {
    id: 'option-2',
    kind: 'candidate',
    label: '2025 Honda CR-V EX-L',
    attributes: {
      'car.make': catalogAttribute('car.make', 'Make', { type: 'string', value: 'Honda' }),
      'car.model': catalogAttribute('car.model', 'Model', { type: 'string', value: 'CR-V' }),
      'car.model_year': catalogAttribute('car.model_year', 'Model year', {
        type: 'number',
        value: 2025,
      }),
      'car.trim': catalogAttribute('car.trim', 'Trim', { type: 'string', value: 'EX-L' }),
      'car.body_style': catalogAttribute('car.body_style', 'Body style', {
        type: 'string',
        value: 'SUV',
      }),
      'car.drivetrain': catalogAttribute('car.drivetrain', 'Drivetrain', {
        type: 'enum',
        value: 'AWD',
      }),
      'car.powertrain': catalogAttribute('car.powertrain', 'Powertrain', {
        type: 'enum',
        value: 'gasoline',
      }),
      'car.combined_fuel_economy_mpg': catalogAttribute(
        'car.combined_fuel_economy_mpg',
        'Combined fuel economy',
        { type: 'number', value: 29, unit: 'mpg' },
      ),
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  },
];

const SAFETY_RELIABILITY_CRITERION: Criterion = {
  id: 'pref.safety_reliability',
  label: 'Safety and reliability',
  kind: 'preference',
  weight: 30,
  direction: 'higher_better',
  origin: 'pack',
  status: 'active',
};

/** A real catalog-built case: partial-attribute entities, generated ids, pack defaults seeded, no investigation has run yet. */
function buildCatalogCaseState(overrides: Partial<CaseState> = {}): CaseState {
  return buildFixtureCaseState({
    id: 'case-catalog-1',
    entities: CATALOG_ENTITIES,
    criteria: [SAFETY_RELIABILITY_CRITERION],
    recommendation: null,
    proposal: null,
    eventSequence: 5,
    ...overrides,
  });
}

describe('WebMCP tool layer against a catalog-built car-purchase case (PAX-P28)', () => {
  describe('pax_get_case_context', () => {
    it('reflects the partial-attribute catalog-built entities honestly: present fields exact, absent fields simply absent', async () => {
      const caseState = buildCatalogCaseState();
      const adapter = new InMemoryModelContextAdapter();
      await registerPaxTools({
        adapter,
        commands: createFakePaxCommands(),
        getActiveCase: () => caseState,
        listPacks: () => [],
      });

      const result = await invokeTool<{ options: EntityRecord[]; recommendation: unknown }>(
        adapter,
        'pax_get_case_context',
        {},
      );

      expect(result.ok).toBe(true);
      expect(result.data?.options).toHaveLength(2);

      const camry = result.data?.options.find((option) => option.id === 'option-1');
      expect(camry).toBeDefined();
      expect(camry?.attributes['car.make']?.value).toEqual({ type: 'string', value: 'Toyota' });
      expect(camry?.attributes['car.model_year']?.value).toEqual({ type: 'number', value: 2025 });
      // Never fabricated: a vehicle catalog cannot know price, mileage, or
      // safety ratings, so these stay genuinely absent from the reported
      // context -- not present with a placeholder/zero value.
      expect(camry?.attributes['car.advertised_price']).toBeUndefined();
      expect(camry?.attributes['car.mileage']).toBeUndefined();
      expect(camry?.attributes['car.crash_safety_rating']).toBeUndefined();

      const crv = result.data?.options.find((option) => option.id === 'option-2');
      expect(crv?.attributes['car.combined_fuel_economy_mpg']?.value).toEqual({
        type: 'number',
        value: 29,
        unit: 'mpg',
      });
      expect(crv?.attributes['car.five_year_ownership_cost']).toBeUndefined();

      // No investigation has run against this catalog-built case yet.
      expect(result.data?.recommendation).toBeNull();
    });
  });

  describe('pax_focus_option', () => {
    it('focuses one of the catalog-built entities by its generated id', async () => {
      const focusOption = vi
        .fn()
        .mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-catalog-1' }));
      const { adapter, commands } = await setUpWithActiveCase('case-catalog-1', {
        focusOption,
      });

      const result = await invokeTool(adapter, 'pax_focus_option', {
        caseId: 'case-catalog-1',
        optionId: 'option-2',
        expectedSequence: 5,
      });

      expect(result.ok).toBe(true);
      expect(result.ui.focusTarget).toBe('option-2');
      expect(commands.focusOption).toHaveBeenCalledWith({
        caseId: 'case-catalog-1',
        optionId: 'option-2',
        expectedSequence: 5,
      });
    });
  });

  describe('pax_upsert_option', () => {
    it('adds a further catalog-style candidate (partial attributes) without error', async () => {
      const receipt = buildFakeCommandReceipt({ caseId: 'case-catalog-1', acceptedSequence: 6 });
      const upsertOption = vi.fn().mockResolvedValue(receipt);
      const { adapter, commands } = await setUpWithActiveCase('case-catalog-1', { upsertOption });

      const input = {
        caseId: 'case-catalog-1',
        expectedSequence: 5,
        option: {
          label: '2025 Mazda CX-5 Preferred',
          kind: 'candidate',
          attributes: [
            { definitionId: 'car.make', value: { type: 'string', value: 'Mazda' } },
            { definitionId: 'car.model', value: { type: 'string', value: 'CX-5' } },
            { definitionId: 'car.model_year', value: { type: 'number', value: 2025 } },
            { definitionId: 'car.drivetrain', value: { type: 'enum', value: 'AWD' } },
            // Deliberately no price/mileage/safety attributes -- a catalog
            // record genuinely does not know them.
          ],
        },
      };

      const result = await invokeTool(adapter, 'pax_upsert_option', input);

      expect(result.ok).toBe(true);
      expect(result.ui.changed).toBe(true);
      expect(commands.upsertOption).toHaveBeenCalledWith(input);
    });
  });

  describe('pax_update_criteria', () => {
    it('reweights a real default criterion against a catalog-built case without error', async () => {
      const receipt = buildFakeCommandReceipt({ caseId: 'case-catalog-1', acceptedSequence: 6 });
      const updateCriteria = vi.fn().mockResolvedValue(receipt);
      const { adapter, commands } = await setUpWithActiveCase('case-catalog-1', { updateCriteria });

      const input = {
        caseId: 'case-catalog-1',
        expectedSequence: 5,
        operations: [
          { op: 'reweight' as const, criterionId: 'pref.safety_reliability', weight: 45 },
        ],
      };

      const result = await invokeTool(adapter, 'pax_update_criteria', input);

      expect(result.ok).toBe(true);
      expect(result.ui.changed).toBe(true);
      expect(commands.updateCriteria).toHaveBeenCalledWith(input);
    });
  });

  describe('pax_define_case_attribute', () => {
    it('defines a custom.* extension against a catalog-built case without error', async () => {
      const receipt = buildFakeCommandReceipt({ caseId: 'case-catalog-1', acceptedSequence: 6 });
      const defineCaseAttribute = vi.fn().mockResolvedValue(receipt);
      const { adapter, commands } = await setUpWithActiveCase('case-catalog-1', {
        defineCaseAttribute,
      });

      const input = {
        caseId: 'case-catalog-1',
        expectedSequence: 5,
        definition: {
          id: 'custom.trunk_space',
          label: 'Trunk space',
          valueType: 'number' as const,
          appliesTo: ['candidate'],
          evidenceExpectation: 'assertion' as const,
          comparison: 'higher_better' as const,
          reason: 'The user explicitly cares about cargo room for this catalog-built shortlist.',
        },
      };

      const result = await invokeTool(adapter, 'pax_define_case_attribute', input);

      expect(result.ok).toBe(true);
      expect(result.ui.changed).toBe(true);
      expect(commands.defineCaseAttribute).toHaveBeenCalledWith(input);
    });
  });

  describe('pax_request_investigation', () => {
    it('succeeds at the acceptance level against a catalog-built case -- the tool call itself never fails synchronously; a later run failure (proven in apps/agent) is engine-side, not a register-pax-tools.ts decision', async () => {
      const runReceipt = buildFakeRunReceipt({
        caseId: 'case-catalog-1',
        acceptedSequence: 5,
        runId: 'run-catalog-1',
      });
      const requestInvestigation = vi.fn().mockResolvedValue(runReceipt);
      const { adapter, commands } = await setUpWithActiveCase('case-catalog-1', {
        requestInvestigation,
      });

      const input = { caseId: 'case-catalog-1', expectedSequence: 5 };
      const result = await invokeTool(adapter, 'pax_request_investigation', input);

      expect(result.ok).toBe(true);
      expect(result.runId).toBe('run-catalog-1');
      expect(result.ui.changed).toBe(true);
      expect(commands.requestInvestigation).toHaveBeenCalledWith(input);
      expect(commands.requestInvestigation).toHaveBeenCalledTimes(1);
    });
  });
});
