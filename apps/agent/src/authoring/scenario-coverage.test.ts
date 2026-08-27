import { describe, expect, it } from 'vitest';
import {
  AuthoringScenarioFileSchema,
  evaluateScenarioCoverage,
  type AuthoringScenarioFile,
} from './scenario-coverage.js';

function scenario(overrides: Partial<AuthoringScenarioFile> = {}): AuthoringScenarioFile {
  return {
    id: 'apt-success',
    packId: 'apartment-hunt',
    kind: 'success',
    description: 'Every hard constraint is satisfied and a recommendation is ready.',
    steps: [],
    assertions: [],
    ...overrides,
  };
}

describe('AuthoringScenarioFileSchema', () => {
  it('parses a valid scenario file', () => {
    expect(AuthoringScenarioFileSchema.safeParse(scenario()).success).toBe(true);
  });

  it('reuses the real ScenarioAssertionSchema for assertions', () => {
    const parsed = AuthoringScenarioFileSchema.safeParse(
      scenario({
        assertions: [{ kind: 'pack_selected', packId: 'apartment-hunt', reasonIncludes: 'x' }],
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects an unrecognized assertion kind', () => {
    const parsed = AuthoringScenarioFileSchema.safeParse(
      scenario({ assertions: [{ kind: 'not_a_real_kind' } as never] }),
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects an unrecognized scenario kind', () => {
    const parsed = AuthoringScenarioFileSchema.safeParse(
      scenario({ kind: 'not_a_real_kind' as never }),
    );
    expect(parsed.success).toBe(false);
  });
});

describe('evaluateScenarioCoverage', () => {
  it('is not ok with only a success scenario', () => {
    const result = evaluateScenarioCoverage([scenario()]);
    expect(result.ok).toBe(false);
    expect(result.missingKinds).toEqual(['incomplete_evidence', 'steering', 'human_boundary']);
  });

  it('is ok once all four required kinds are present', () => {
    const result = evaluateScenarioCoverage([
      scenario({ id: 'apt-success', kind: 'success' }),
      scenario({ id: 'apt-incomplete', kind: 'incomplete_evidence' }),
      scenario({ id: 'apt-steering', kind: 'steering' }),
      scenario({ id: 'apt-boundary', kind: 'human_boundary' }),
    ]);
    expect(result.ok).toBe(true);
    expect(result.missingKinds).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('is not ok with zero scenarios', () => {
    expect(evaluateScenarioCoverage([]).ok).toBe(false);
  });
});
