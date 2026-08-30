import { describe, expect, it } from 'vitest';
import type { Clock } from '@sift/core';
import type { CompiledDecisionPack } from '@sift/contracts';
import { compilePack } from './compiler.js';
import { createCapabilityCatalog } from './capability-catalog.js';
import { PACK_CONFORMANCE_CHECK_IDS, runPackConformance } from './conformance.js';
import { validCatalog, validManifest } from './fixtures/manifest.js';

const fixedClock: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function baselinePack(): CompiledDecisionPack {
  return compilePack(validManifest(), validCatalog(), fixedClock);
}

describe('runPackConformance: success', () => {
  it('reports every check passing for a freshly compiled pack against its own catalog', () => {
    const report = runPackConformance(baselinePack(), validCatalog());

    expect(report.passed).toBe(true);
    expect(report.packId).toBe('apartment-hunt');
    expect(report.packVersion).toBe('1.0.0');
    expect(report.compiledHash).toBe(baselinePack().compiledHash);
    expect(report.checks).toHaveLength(PACK_CONFORMANCE_CHECK_IDS.length);
    expect(report.checks.map((check) => check.id).sort()).toEqual(
      [...PACK_CONFORMANCE_CHECK_IDS].sort(),
    );
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });
});

describe('runPackConformance: never throws, reports every check', () => {
  it('returns a report with all six checks failing rather than throwing, for a badly drifted pack', () => {
    const pack = baselinePack();
    const drifted: CompiledDecisionPack = {
      ...pack,
      skills: [{ id: 'uninstalled-skill', description: 'No longer in the catalog.' }],
      orchestration: { ...pack.orchestration, maxConcurrency: undefined },
      tools: [{ ...pack.tools[0]!, requiresApproval: false }],
      extensionPolicy: { ...pack.extensionPolicy, allowCaseCriteria: false },
      presentation: { ...pack.presentation, attributeGroups: [] },
      evaluation: { ...pack.evaluation, requiresNegativeCase: false },
    };

    const report = runPackConformance(drifted, validCatalog());

    expect(report.passed).toBe(false);
    expect(report.checks.every((check) => check.passed === false)).toBe(true);
  });
});

describe('runPackConformance: capability_references_resolve', () => {
  it('fails when the catalog no longer has a capability the pack still references', () => {
    const shrunkCatalog = createCapabilityCatalog([
      { id: 'listing-normalizer', kind: 'skill', version: '1.0.0' },
      { id: 'deal-analyst', kind: 'specialist', version: '1.0.0' },
      // 'calculator' tool removed -- simulates an uninstalled tool.
    ]);

    const report = runPackConformance(baselinePack(), shrunkCatalog);

    const check = report.checks.find((c) => c.id === 'capability_references_resolve');
    expect(check?.passed).toBe(false);
    expect(check?.message).toContain('calculator');
    expect(report.passed).toBe(false);

    const otherChecks = report.checks.filter((c) => c.id !== 'capability_references_resolve');
    expect(otherChecks.every((c) => c.passed)).toBe(true);
  });
});

describe('runPackConformance: orchestration_bounds', () => {
  it('fails when a stored pack no longer satisfies current Graph/Swarm bounds rules', () => {
    const pack = baselinePack();
    const drifted: CompiledDecisionPack = {
      ...pack,
      orchestration: { ...pack.orchestration, maxConcurrency: undefined },
    };

    const report = runPackConformance(drifted, validCatalog());
    const check = report.checks.find((c) => c.id === 'orchestration_bounds');
    expect(check?.passed).toBe(false);
    expect(report.passed).toBe(false);
  });
});

describe('runPackConformance: approval_policies', () => {
  it('fails when a stored pack no longer covers a consequential tool with human approval', () => {
    const pack = baselinePack();
    const drifted: CompiledDecisionPack = {
      ...pack,
      tools: [{ ...pack.tools[0]!, requiresApproval: false }],
    };

    const report = runPackConformance(drifted, validCatalog());
    const check = report.checks.find((c) => c.id === 'approval_policies');
    expect(check?.passed).toBe(false);
    expect(report.passed).toBe(false);
  });
});

describe('runPackConformance: extension_policy', () => {
  it('fails when a stored pack has an incoherent extension policy', () => {
    const pack = baselinePack();
    const drifted: CompiledDecisionPack = {
      ...pack,
      extensionPolicy: { ...pack.extensionPolicy, allowCaseCriteria: false },
    };

    const report = runPackConformance(drifted, validCatalog());
    const check = report.checks.find((c) => c.id === 'extension_policy');
    expect(check?.passed).toBe(false);
    expect(report.passed).toBe(false);
  });
});

describe('runPackConformance: ui_renderability', () => {
  it('fails when a stored pack has an attribute assigned to no presentation group', () => {
    const pack = baselinePack();
    const drifted: CompiledDecisionPack = {
      ...pack,
      presentation: { ...pack.presentation, attributeGroups: [] },
    };

    const report = runPackConformance(drifted, validCatalog());
    const check = report.checks.find((c) => c.id === 'ui_renderability');
    expect(check?.passed).toBe(false);
    expect(report.passed).toBe(false);
  });
});

describe('runPackConformance: negative_scenarios_present', () => {
  it('fails when a stored pack no longer declares a required negative scenario', () => {
    const pack = baselinePack();
    const drifted: CompiledDecisionPack = {
      ...pack,
      evaluation: { ...pack.evaluation, requiresNegativeCase: false },
    };

    const report = runPackConformance(drifted, validCatalog());
    const check = report.checks.find((c) => c.id === 'negative_scenarios_present');
    expect(check?.passed).toBe(false);
    expect(report.passed).toBe(false);
  });
});
