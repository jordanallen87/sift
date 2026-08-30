/**
 * Fixture tool: "household-fit matrix"
 * (docs/specs/packs-and-routing.md "Choose Our Next Car Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Given a candidate id, returns known spec-derived household-fit facts
 * (actual cargo dimensions, door opening width, ground clearance, ...) AND
 * the fixture's explicit unknowns (dog-crate compatibility, driving
 * comfort) as genuinely unresolved -- never a fabricated value.
 *
 * Both `knownFacts` and `unknowns` are shaped as `@sift/contracts`
 * `AttributeRecord`s (pack-authoring.md "Typed core with extensible domain
 * data"): a known fact carries `status: 'supported'` and a typed `value`; an
 * unknown carries `status: 'unknown'` and -- per
 * `AttributeRecordSchema`'s own `superRefine` -- *must not* carry a `value`
 * key at all. Reusing the shared schema rather than inventing a parallel
 * "unknown fact" shape means "no fabricated value" is enforced structurally
 * (a value on an `unknown`-status record fails Zod validation, not just a
 * hand-written assertion), and the test below additionally proves the
 * runtime object literally has no `value` property.
 *
 * Evidence-level assignment rule: each known fact comes from one traceable
 * manufacturer specification sheet, so it is tagged `E1` per fact, the same
 * per-source rule as `listing-reader.ts`/`safety-reliability-lookup.ts`. An
 * unknown is not evidence at all -- packs-and-routing.md: "A user concern
 * that cannot be established from available sources becomes a test-drive or
 * household-measurement question instead of an invented score" -- so this
 * tool emits no `ToolEvidenceItem` for it; `unknowns` carries only the
 * question, reason, and resolution path a human/test-drive can answer.
 *
 * `householdDogCrateProfile` is returned alongside the known cargo
 * dimensions so a caller (or a human) can compare them directly; this tool
 * never computes or asserts a fit verdict itself -- that is exactly the
 * `unknown.rear_cargo_crate_compatibility` question the fixture says cannot
 * be derived from specification data alone.
 */
import type { AttributeRecord } from '@sift/contracts';
import { loadFixture, type ExplicitUnknown, type HouseholdFitCandidate } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const HOUSEHOLD_FIT_MATRIX_TOOL_ID = 'household-fit-matrix';

/** An `AttributeRecord` known-fact entry; `origin`/`sourceIds`/`updatedAt` are fixed for every fixture-derived fact so callers can rely on their shape. */
export type KnownHouseholdFitFact = AttributeRecord & {
  status: 'supported';
  value: NonNullable<AttributeRecord['value']>;
};

/** An `AttributeRecord` unknown entry, plus the fixture's question/reason/resolution path. `AttributeRecordSchema` requires `value` to be absent whenever `status === 'unknown'`, so this type never carries one. */
export interface HouseholdFitUnknown extends Omit<
  AttributeRecord,
  'value' | 'status' | 'definitionId' | 'label'
> {
  status: 'unknown';
  id: string;
  definitionId: string;
  label: string;
  question: string;
  reason: string;
  resolutionPath: string;
}

export interface HouseholdFitResult {
  candidateId: string;
  knownFacts: KnownHouseholdFitFact[];
  unknowns: HouseholdFitUnknown[];
  householdDogCrateProfile: {
    crateCount: number;
    eachCrateDimensionsIn: { lengthIn: number; widthIn: number; heightIn: number };
  };
  evidence: ToolEvidenceItem[];
}

export interface HouseholdFitMatrixInput {
  candidateId: string;
  signal?: AbortSignal;
}

type KnownSpecifications = HouseholdFitCandidate['knownSpecifications'];

interface KnownSpecField {
  definitionId: string;
  label: string;
  unit: string;
  read: (specs: KnownSpecifications) => number;
}

// One AttributeRecord per known specification field in
// household-fit.json's `knownSpecifications` object, excluding the
// non-numeric `source` provenance string (surfaced separately, in each
// fact's `sourceIds`-adjacent summary, not as its own attribute record).
// `read` is colocated with each field's metadata (rather than kept in a
// parallel lookup table keyed by `definitionId`) so the two can never drift
// out of sync with each other.
const KNOWN_SPEC_FIELDS: KnownSpecField[] = [
  {
    definitionId: 'car.cargo_width_between_wheel_wells_in',
    label: 'Cargo width between wheel wells',
    unit: 'in',
    read: (specs) => specs.cargoWidthBetweenWheelWellsIn,
  },
  {
    definitionId: 'car.cargo_length_seat_to_liftgate_in',
    label: 'Cargo length, seat to liftgate',
    unit: 'in',
    read: (specs) => specs.cargoLengthSeatToLiftgateIn,
  },
  {
    definitionId: 'car.cargo_height_floor_to_ceiling_in',
    label: 'Cargo height, floor to ceiling',
    unit: 'in',
    read: (specs) => specs.cargoHeightFloorToCeilingIn,
  },
  {
    definitionId: 'car.rear_door_opening_width_in',
    label: 'Rear door opening width',
    unit: 'in',
    read: (specs) => specs.rearDoorOpeningWidthIn,
  },
  {
    definitionId: 'car.second_row_legroom_in',
    label: 'Second-row legroom',
    unit: 'in',
    read: (specs) => specs.secondRowLegroomIn,
  },
  {
    definitionId: 'car.cargo_volume_behind_second_row_cu_ft',
    label: 'Cargo volume behind second row',
    unit: 'cu ft',
    read: (specs) => specs.cargoVolumeBehindSecondRowCuFt,
  },
  {
    definitionId: 'car.ground_clearance_in',
    label: 'Ground clearance',
    unit: 'in',
    read: (specs) => specs.groundClearanceIn,
  },
];

function householdFitSourceId(candidateId: string): string {
  return `source-household-fit-${candidateId}`;
}

function toKnownFact(
  field: KnownSpecField,
  numericValue: number,
  sourceId: string,
  updatedAt: string,
): KnownHouseholdFitFact {
  return {
    definitionId: field.definitionId,
    label: field.label,
    value: { type: 'number', value: numericValue, unit: field.unit },
    origin: 'pack',
    sourceIds: [sourceId],
    status: 'supported',
    updatedAt,
  };
}

function toUnknown(unknown: ExplicitUnknown): HouseholdFitUnknown {
  return {
    id: unknown.id,
    definitionId: unknown.id,
    label: unknown.question,
    origin: 'pack',
    sourceIds: [],
    status: 'unknown',
    updatedAt: FIXED_UPDATED_AT,
    question: unknown.question,
    reason: unknown.reason,
    resolutionPath: unknown.resolutionPath,
  };
}

// household-fit.json is static fixture content with no per-record
// timestamp of its own; every record derived from it therefore shares one
// fixed, deterministic `updatedAt` rather than reaching for `Date.now()`
// (architecture.md: "All timestamps in deterministic tests come from an
// injected `Clock`" -- this tool has nothing to inject a live clock into,
// since it reads a fixed fixture file, so a fixed constant is the
// equivalent choice here).
const FIXED_UPDATED_AT = '2026-08-15T00:00:00.000Z';

export function lookupHouseholdFit(input: HouseholdFitMatrixInput): ToolResult<HouseholdFitResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(HOUSEHOLD_FIT_MATRIX_TOOL_ID);
  }

  const fixture = loadFixture('household-fit');
  const candidate = fixture.candidates[input.candidateId];

  if (isAborted(input.signal)) {
    return cancelledResult(HOUSEHOLD_FIT_MATRIX_TOOL_ID);
  }

  if (!candidate) {
    return notFoundResult(
      HOUSEHOLD_FIT_MATRIX_TOOL_ID,
      input.candidateId,
      `no household-fit data for candidate "${input.candidateId}"`,
    );
  }

  const sourceId = householdFitSourceId(input.candidateId);
  const knownFacts: KnownHouseholdFitFact[] = [];
  const evidence: ToolEvidenceItem[] = [];

  for (const field of KNOWN_SPEC_FIELDS) {
    const numericValue = field.read(candidate.knownSpecifications);
    knownFacts.push(toKnownFact(field, numericValue, sourceId, FIXED_UPDATED_AT));
    evidence.push({
      sourceId,
      level: 'E1',
      verdict: 'pass',
      summary: `${field.label}: ${numericValue} ${field.unit} (${candidate.knownSpecifications.source}).`,
    });
  }

  const unknowns = candidate.explicitUnknowns.map(toUnknown);

  return okResult(HOUSEHOLD_FIT_MATRIX_TOOL_ID, {
    candidateId: input.candidateId,
    knownFacts,
    unknowns,
    householdDogCrateProfile: {
      crateCount: fixture.householdDogCrateProfile.crateCount,
      eachCrateDimensionsIn: { ...fixture.householdDogCrateProfile.eachCrateDimensionsIn },
    },
    evidence,
  });
}
