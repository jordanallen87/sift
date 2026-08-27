/**
 * The built-in, fully deterministic demonstration answer set `pnpm pax
 * pack:author` runs when no `--answers <path>` is given (see `cli.ts`'s
 * module comment for the judgment call this implements). Grounded in the
 * real `apartment-hunt` compiler/conformance fixture manifest
 * (`@pax/packs`'s `src/fixtures/manifest.js`), which is exactly the
 * "compact `apartment-hunt` authoring fixture" pack-authoring.md's
 * "Hackathon proof" section names -- not a separately invented demo pack.
 */
import { validManifest } from '@pax/packs/src/fixtures/manifest.js';
import type { DecisionPackManifest } from '@pax/contracts';
import type { AuthoringScenarioFile } from './scenario-coverage.js';

export interface AuthoringAnswers {
  readonly manifest: DecisionPackManifest;
  readonly scenarios: readonly AuthoringScenarioFile[];
  readonly readme?: string;
}

const SCENARIOS: AuthoringScenarioFile[] = [
  {
    id: 'apt-success',
    packId: 'apartment-hunt',
    kind: 'success',
    description:
      'Every candidate unit is normalized, the hard budget constraint is checked, and a recommendation is ready.',
    steps: [],
    assertions: [],
  },
  {
    id: 'apt-incomplete',
    packId: 'apartment-hunt',
    kind: 'incomplete_evidence',
    description:
      'The pet-sensory fit concern has no installed source to verify it and remains an explicit unknown rather than a fabricated value.',
    steps: [],
    assertions: [],
  },
  {
    id: 'apt-steering',
    packId: 'apartment-hunt',
    kind: 'steering',
    description:
      'A specialist proposes a plausible-looking rent figure without a source; the case steers it back toward a sourced claim instead of accepting it.',
    steps: [],
    assertions: [],
  },
  {
    id: 'apt-boundary',
    packId: 'apartment-hunt',
    kind: 'human_boundary',
    description:
      'A specialist drafts a recommendation; only a human reviewer, never the model, may approve it.',
    steps: [],
    assertions: [],
  },
];

export const DEMO_AUTHORING_ANSWERS: AuthoringAnswers = {
  manifest: validManifest({
    evaluation: {
      scenarioIds: SCENARIOS.map((scenario) => scenario.id),
      requiresNegativeCase: true,
    },
  }),
  scenarios: SCENARIOS,
  readme:
    '# Apartment Hunt\n\nA compact Decision Pack demonstrating an unanticipated `custom.pet_sensory_fit` ' +
    'concern round-tripping through the pack-authoring pipeline. See docs/specs/pack-authoring.md.\n',
};
