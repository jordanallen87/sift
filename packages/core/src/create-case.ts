/**
 * `instantiateCase(pack, seed): CaseState` -- docs/specs/architecture.md
 * "Deterministic core".
 *
 * Builds the real, fully-seeded first `CaseState` for a case pinned to
 * `pack`: its obligations derived from `pack.obligations` (via
 * `deriveObligations`, with no case-extension templates or prior obligations
 * yet -- every obligation starts `open`), its criteria copied from
 * `pack.criteria.defaults`, and its attribute definitions copied from
 * `pack.attributes`. See `reducer.ts`'s header comment for why this does not
 * route through `applyCaseEvent`'s `case.created` handling: the event
 * payload only carries the case's *pack pin*, not the full compiled pack, so
 * it cannot derive any of the above from the event alone.
 *
 * Inferred: `title` is not part of `ScenarioSeedSchema` (`@sift/contracts`
 * `scenario.ts`: `{ demoId, fixtureBundleId, clockIso }` only) and
 * architecture.md's `instantiateCase(pack, seed): CaseState` signature takes
 * no separate title argument. Grounded in `pack.identity.name` (e.g. "Choose
 * Our Next Car") as the case title default -- product.md's demo launcher
 * always starts a fresh case from a pack selection, and nothing in the spec
 * set describes a case ever being renamed after creation.
 *
 * `selection` (`selectedBy`/`reasons`) is likewise not part of the
 * documented 2-argument signature, but `CasePackPin.reasons` (architecture.md
 * "The UI always displays the selected Decision Pack and reasons") has to
 * come from somewhere -- routing (`routePack`) already computed it before
 * this function is ever called, so it is threaded through as an explicit
 * parameter rather than silently hardcoded to `{ selectedBy: 'user', reasons:
 * [] }`, which would be factually wrong for every router-selected case.
 */
import type { CaseState, CompiledDecisionPack } from '@sift/contracts';
import { deriveObligations } from './obligations.js';
import type { Clock, IdGenerator } from './ports.js';

export interface PackSelection {
  selectedBy: 'user' | 'router';
  reasons: string[];
}

export function instantiateCase(
  pack: CompiledDecisionPack,
  selection: PackSelection,
  clock: Clock,
  idGenerator: IdGenerator,
): CaseState {
  const now = clock.now();

  return {
    schemaVersion: '1.0',
    id: idGenerator.next('case'),
    title: pack.identity.name,
    status: 'draft',
    pack: {
      id: pack.identity.id,
      version: pack.identity.version,
      compiledHash: pack.compiledHash,
      selectedBy: selection.selectedBy,
      reasons: selection.reasons,
    },
    attributeDefinitions: [...pack.attributes],
    entities: [],
    criteria: [...pack.criteria.defaults],
    obligations: deriveObligations(pack, [], [], clock),
    caseExtensions: [],
    claims: [],
    sources: [],
    evidenceLinks: [],
    recommendation: null,
    proposal: null,
    activeFocus: null,
    selectedOptionId: null,
    selectedEvidenceId: null,
    eventSequence: 0,
    createdAt: now,
    updatedAt: now,
  };
}
