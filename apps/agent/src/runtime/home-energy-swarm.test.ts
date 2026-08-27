import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Clock, IdGenerator } from '@pax/core';
import {
  createCapabilityCatalog,
  compileHomeEnergyGuardianPack,
  HOME_ENERGY_GUARDIAN_MANIFEST,
} from '@pax/packs';
import type { CapabilityCatalog } from '@pax/packs';
import type { ExecutionRequest } from '@pax/contracts';
import { ScriptedModelProvider } from './model-provider.js';
import {
  HOME_ENERGY_SWARM_NODE_IDS,
  executeHomeEnergySwarm,
  PROPOSE_INSPECTION_TOOL_ID,
  type HomeEnergySequentialSpecialistId,
  type HomeEnergySwarmDeps,
  type HomeEnergySwarmNodeId,
  type HomeEnergySwarmResult,
} from './home-energy-swarm.js';
import type { RuntimeEvent } from './event-normalizer.js';
import {
  ANOMALY_CONTEXT,
  PROPOSED_INSPECTION_ROUND2,
  ROUND1_COST_WEIGHT,
  ROUND1_CONSERVATION_WEIGHT,
  ROUND2_COST_WEIGHT,
  ROUND2_CONSERVATION_WEIGHT,
  buildHomeEnergySwarmScriptedProviders,
  setScenarioBeat,
  type HomeEnergyScenarioBeat,
  type HomeEnergySwarmScriptedProviders,
} from './scripted-beats/home-energy-guardian.js';

const FIXED_CLOCK: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function fixedIdGenerator(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

/**
 * A throwaway `AgentSkills` root built at test-run time under the OS temp
 * directory (never under the repo's `apps/agent/skills/`, which this task's
 * file scope forbids modifying): one subdirectory per real
 * `HOME_ENERGY_GUARDIAN_MANIFEST.skills[]` id, each a minimal, real
 * `SKILL.md` (YAML frontmatter `name`/`description` + a body), matching the
 * exact format `@strands-agents/sdk`'s `AgentSkills` loader parses (verified
 * against the installed package's `vended-plugins/skills/skill.js` -- see
 * the dated docs/build-log.md entry for this task). This proves real
 * `AgentSkills` progressive activation end-to-end without touching the
 * shared `apps/agent/skills/` directory, which today only contains the
 * car-purchase pack's five skill directories (plus `decision-synthesis`,
 * whose content is car-purchase-specific) -- authoring the four missing
 * home-energy-guardian-specific skill directories for real is a separate,
 * later content task (recorded in the dated docs/build-log.md entry).
 */
function buildTempSkillsRootDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'pax-energy-skills-'));
  for (const skill of HOME_ENERGY_GUARDIAN_MANIFEST.skills) {
    const skillDir = join(root, skill.id);
    mkdirSync(skillDir);
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      `---\nname: ${skill.id}\ndescription: ${skill.description.replace(/\n/g, ' ')}\n---\n\n# ${skill.id}\n\n${skill.description}\n`,
    );
  }
  return root;
}

const SKILLS_ROOT_DIR = buildTempSkillsRootDir();
afterAll(() => {
  rmSync(SKILLS_ROOT_DIR, { recursive: true, force: true });
});

function energyCatalog(): CapabilityCatalog {
  return createCapabilityCatalog([
    ...HOME_ENERGY_GUARDIAN_MANIFEST.skills.map((skill) => ({
      id: skill.id,
      kind: 'skill' as const,
      version: '1.0.0',
    })),
    ...HOME_ENERGY_GUARDIAN_MANIFEST.specialists.map((specialist) => ({
      id: specialist.id,
      kind: 'specialist' as const,
      version: '1.0.0',
    })),
    ...HOME_ENERGY_GUARDIAN_MANIFEST.tools.map((tool) => ({
      id: tool.id,
      kind: 'tool' as const,
      version: '1.0.0',
    })),
  ]);
}

function obligationFor(
  id: string,
  overrides: Partial<ExecutionRequest['obligation']> = {},
): ExecutionRequest['obligation'] {
  const declared = HOME_ENERGY_GUARDIAN_MANIFEST.obligations.find((entry) => entry.id === id);
  if (declared === undefined) {
    throw new Error(`test: no obligation "${id}" declared in HOME_ENERGY_GUARDIAN_MANIFEST`);
  }
  return {
    id: declared.id,
    label: declared.label,
    question: declared.question,
    category: declared.category,
    required: declared.required,
    priority: declared.priority,
    requiredEvidenceLevel: declared.requiredEvidenceLevel,
    maxAttempts: declared.maxAttempts,
    acceptedUncertaintyAllowed: declared.acceptedUncertaintyAllowed,
    dependsOn: [...declared.dependsOn],
    preferredSkills: [...declared.preferredSkills],
    preferredSpecialists: [...declared.preferredSpecialists],
    completionRule: { ...declared.completionRule },
    origin: declared.origin,
    status: 'active',
    attemptsUsed: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function criteriaFor(
  costWeight: number,
  conservationWeight: number,
): ExecutionRequest['caseSummary']['criteria'] {
  return [
    {
      id: 'energy.cost',
      label: 'Lowest immediate cost',
      kind: 'preference',
      weight: costWeight,
      direction: 'lower_better',
      origin: 'pack',
      status: 'active',
    },
    {
      id: 'energy.conservation',
      label: 'Long-term waste reduction',
      kind: 'preference',
      weight: conservationWeight,
      direction: 'higher_better',
      origin: 'pack',
      status: 'active',
    },
    {
      id: 'energy.no_emergency_risk',
      label: 'No electrical, gas, fire, or medical-equipment emergency risk',
      kind: 'hard_constraint',
      weight: 0,
      direction: 'qualitative',
      origin: 'pack',
      status: 'active',
    },
  ];
}

function buildExecutionRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    runId: 'run-energy-1',
    caseId: 'case-demo-energy-guardian',
    pack: { id: 'home-energy-guardian', version: '1.0.0', compiledHash: 'a'.repeat(64) },
    obligation: obligationFor('energy.anomaly'),
    caseSummary: {
      caseId: 'case-demo-energy-guardian',
      title: 'Why is my energy bill so high?',
      status: 'investigating',
      criteria: criteriaFor(50, 50),
      optionSummaries: [],
      evidenceCounts: { satisfied: 0, active: 1, blocked: 0, acceptedUncertainty: 0, open: 4 },
    },
    caseExtensions: [],
    availableSkills: HOME_ENERGY_GUARDIAN_MANIFEST.skills.map((skill) => skill.id),
    availableSpecialists: HOME_ENERGY_GUARDIAN_MANIFEST.specialists.map(
      (specialist) => specialist.id,
    ),
    allowedTools: [],
    priorAttempts: [],
    limits: {
      maxAttemptsPerObligation: 2,
      maxToolCallsPerRun: 12,
      maxGraphNodeExecutionsPerRun: 6,
      modelRequestTimeoutMs: 120_000,
      totalRunTimeoutMs: 300_000,
    },
    ...overrides,
  };
}

const SEQUENTIAL_OBLIGATION_IDS: Record<HomeEnergySequentialSpecialistId, string> = {
  'anomaly-investigator': 'energy.anomaly',
  'rate-analyst': 'energy.rate_change',
  'weather-analyst': 'energy.weather',
  'home-systems-analyst': 'energy.household_change',
};

function specialistRequest(nodeId: HomeEnergySequentialSpecialistId): ExecutionRequest {
  const specialist = HOME_ENERGY_GUARDIAN_MANIFEST.specialists.find((entry) => entry.id === nodeId);
  if (specialist === undefined) {
    throw new Error(`test: no specialist "${nodeId}" declared in HOME_ENERGY_GUARDIAN_MANIFEST`);
  }
  return buildExecutionRequest({
    obligation: obligationFor(SEQUENTIAL_OBLIGATION_IDS[nodeId]),
    availableSpecialists: [nodeId],
    allowedTools: [...specialist.allowedTools],
  });
}

interface BuildDepsOptions {
  start?: HomeEnergySwarmNodeId;
  beat?: HomeEnergyScenarioBeat;
  costWeight?: number;
  conservationWeight?: number;
  providers?: HomeEnergySwarmScriptedProviders;
}

function buildDeps(options: BuildDepsOptions = {}): {
  deps: HomeEnergySwarmDeps;
  providers: HomeEnergySwarmScriptedProviders;
} {
  const pack = compileHomeEnergyGuardianPack(energyCatalog(), FIXED_CLOCK);
  const providers = options.providers ?? buildHomeEnergySwarmScriptedProviders();
  setScenarioBeat(providers, options.beat ?? 'round1');

  const specialistRequests = {
    'anomaly-investigator': specialistRequest('anomaly-investigator'),
    'rate-analyst': specialistRequest('rate-analyst'),
    'weather-analyst': specialistRequest('weather-analyst'),
    'home-systems-analyst': specialistRequest('home-systems-analyst'),
  };

  const challengerSpecialist = HOME_ENERGY_GUARDIAN_MANIFEST.specialists.find(
    (entry) => entry.id === 'source-challenger',
  )!;
  const synthesizerSpecialist = HOME_ENERGY_GUARDIAN_MANIFEST.specialists.find(
    (entry) => entry.id === 'decision-synthesizer',
  )!;

  const responseOptionsRequest = buildExecutionRequest({
    obligation: obligationFor('energy.response_options'),
    caseSummary: {
      caseId: 'case-demo-energy-guardian',
      title: 'Why is my energy bill so high?',
      status: 'investigating',
      criteria: criteriaFor(options.costWeight ?? 50, options.conservationWeight ?? 50),
      optionSummaries: [],
      evidenceCounts: { satisfied: 3, active: 1, blocked: 0, acceptedUncertainty: 2, open: 1 },
    },
    availableSpecialists: ['source-challenger', 'decision-synthesizer'],
    allowedTools: [...challengerSpecialist.allowedTools, ...synthesizerSpecialist.allowedTools],
  });

  const deps: HomeEnergySwarmDeps = {
    pack,
    modelFor: (nodeId) => providers[nodeId],
    skillsRootDir: SKILLS_ROOT_DIR,
    clock: FIXED_CLOCK,
    idGenerator: fixedIdGenerator(),
    specialistRequests,
    responseOptionsRequest,
    resolveConfirmation: () => true,
    ...(options.start !== undefined ? { start: options.start } : {}),
  };

  return { deps, providers };
}

function isRuntimeEvent(item: unknown): item is RuntimeEvent {
  return typeof item === 'object' && item !== null && 'sequence' in item;
}

async function drain(
  gen: AsyncGenerator<RuntimeEvent, HomeEnergySwarmResult, undefined>,
): Promise<{ events: RuntimeEvent[]; result: HomeEnergySwarmResult }> {
  const events: RuntimeEvent[] = [];
  let next = await gen.next();
  while (!next.done) {
    if (isRuntimeEvent(next.value)) events.push(next.value);
    next = await gen.next();
  }
  return { events, result: next.value };
}

describe('HOME_ENERGY_SWARM_NODE_IDS', () => {
  it('names exactly the six pack-declared specialists', () => {
    expect([...HOME_ENERGY_SWARM_NODE_IDS].sort()).toEqual(
      [
        'anomaly-investigator',
        'rate-analyst',
        'weather-analyst',
        'home-systems-analyst',
        'source-challenger',
        'decision-synthesizer',
      ].sort(),
    );
  });
});

describe('executeHomeEnergySwarm: real Swarm topology (round1 -- happy path + weather steering)', () => {
  it('runs the real six-node Swarm in the exact causal order: anomaly first, then a sequential handoff chain to decision-synthesizer', async () => {
    const { deps } = buildDeps({
      costWeight: ROUND1_COST_WEIGHT,
      conservationWeight: ROUND1_CONSERVATION_WEIGHT,
    });
    const { events, result } = await drain(executeHomeEnergySwarm(deps));

    // Required adaptive moment: "The engine investigates the anomaly in the
    // background before creating a human action" -- anomaly-investigator is
    // genuinely the Swarm's first node.
    expect(result.nodeStartOrder[0]).toBe('anomaly-investigator');
    expect(result.nodeFinishOrder).toEqual([
      'anomaly-investigator',
      'rate-analyst',
      'weather-analyst',
      'home-systems-analyst',
      'source-challenger',
      'decision-synthesizer',
    ]);
    expect(result.multiAgentResult.status).toBe('COMPLETED');
    expect(result.repetitiveHandoffDetected).toBe(false);
    expect(events.length).toBeGreaterThan(0);
  });

  it('hands off in the exact causal chain with real swarm.handoff events (from/to/reason/evidenceDelta)', async () => {
    const { deps } = buildDeps({
      costWeight: ROUND1_COST_WEIGHT,
      conservationWeight: ROUND1_CONSERVATION_WEIGHT,
    });
    const { events, result } = await drain(executeHomeEnergySwarm(deps));

    expect(result.handoffs.map((handoff) => `${handoff.from}->${handoff.to}`)).toEqual([
      'anomaly-investigator->rate-analyst',
      'rate-analyst->weather-analyst',
      'weather-analyst->home-systems-analyst',
      'home-systems-analyst->source-challenger',
      'source-challenger->decision-synthesizer',
    ]);
    for (const handoff of result.handoffs) {
      expect(handoff.evidenceDelta).toBeGreaterThan(0);
    }

    // Required adaptive moment: "Weather explains part but not all of the
    // spike, causing the engine to activate home-event correlation" -- the
    // weather->home-systems-analyst handoff's reason names the unexplained
    // residual.
    const weatherHandoff = result.handoffs.find(
      (handoff) => handoff.from === 'weather-analyst' && handoff.to === 'home-systems-analyst',
    );
    expect(weatherHandoff?.reason).toContain('280');

    const handoffEvents = events.filter(
      (event) => event.category === 'swarm' && event.name === 'swarm.handoff',
    );
    expect(handoffEvents).toHaveLength(5);
  });

  it('repeated no-progress weather-lookup work triggers RetrySteering Guide before the handoff to home-systems-analyst (required steering moment)', async () => {
    const { deps } = buildDeps({
      costWeight: ROUND1_COST_WEIGHT,
      conservationWeight: ROUND1_CONSERVATION_WEIGHT,
    });
    const { events } = await drain(executeHomeEnergySwarm(deps));

    const guideEvent = events.find(
      (event) =>
        event.category === 'intervention' &&
        event.name === 'intervention.guide' &&
        event.agentId === 'weather-analyst' &&
        event.attributes['handler'] === 'RetrySteering',
    );
    expect(guideEvent).toBeDefined();
  });

  it('genuinely wires skills, context injection, and interventions for every non-synthesizer node, and swarm node lifecycle events for every node', async () => {
    const { deps } = buildDeps({
      costWeight: ROUND1_COST_WEIGHT,
      conservationWeight: ROUND1_CONSERVATION_WEIGHT,
    });
    const { events } = await drain(executeHomeEnergySwarm(deps));

    for (const nodeId of [
      'anomaly-investigator',
      'rate-analyst',
      'weather-analyst',
      'home-systems-analyst',
      'source-challenger',
    ] as const) {
      expect(
        events.some((event) => event.category === 'context' && event.agentId === nodeId),
        `expected a context.injected event for node "${nodeId}"`,
      ).toBe(true);
    }
    // source-challenger declares no allowedSkills (home-energy-guardian.ts's
    // manifest, mirroring car-purchase.ts's identical source-challenger
    // treatment: "invoked as its own bounded Swarm agent-tool rather than
    // through ordinary skill activation") -- only the four obligation-owning
    // sequential specialists genuinely activate a skill.
    for (const nodeId of [
      'anomaly-investigator',
      'rate-analyst',
      'weather-analyst',
      'home-systems-analyst',
    ] as const) {
      expect(
        events.some((event) => event.category === 'skill' && event.agentId === nodeId),
        `expected a skill.activated event for node "${nodeId}"`,
      ).toBe(true);
    }
    for (const nodeId of HOME_ENERGY_SWARM_NODE_IDS) {
      expect(
        events.some((event) => event.category === 'intervention' && event.agentId === nodeId),
        `expected an intervention event for node "${nodeId}"`,
      ).toBe(true);
      expect(
        events.some(
          (event) =>
            event.category === 'swarm' &&
            event.name === 'swarm.node_started' &&
            event.agentId === nodeId,
        ),
        `expected a swarm.node_started event for node "${nodeId}"`,
      ).toBe(true);
      expect(
        events.some(
          (event) =>
            event.category === 'swarm' &&
            event.name === 'swarm.node_completed' &&
            event.agentId === nodeId,
        ),
        `expected a swarm.node_completed event for node "${nodeId}"`,
      ).toBe(true);
    }
  });

  it('captures the parsed ExecutionResult-shaped context every node handed off', async () => {
    const { deps } = buildDeps({
      costWeight: ROUND1_COST_WEIGHT,
      conservationWeight: ROUND1_CONSERVATION_WEIGHT,
    });
    const { result } = await drain(executeHomeEnergySwarm(deps));

    expect(result.contexts['anomaly-investigator']).toEqual(ANOMALY_CONTEXT);
    expect(result.contexts['anomaly-investigator']?.suggestedStatus).toBe('satisfied');
    expect(result.contexts['weather-analyst']?.suggestedStatus).toBe('accepted_uncertainty');
  });

  it('cost-heavy criteria (round1) favor the cheapest response option and never propose an inspection', async () => {
    const { deps } = buildDeps({
      costWeight: ROUND1_COST_WEIGHT,
      conservationWeight: ROUND1_CONSERVATION_WEIGHT,
    });
    const { events, result } = await drain(executeHomeEnergySwarm(deps));

    expect(result.decisionSynthesizerText).toContain(
      'Recommend monitoring for one more billing cycle',
    );
    expect(result.proposedInspection).toBeUndefined();
    expect(result.goalLoopResult?.passed).toBe(true);

    const confirmEvent = events.find(
      (event) =>
        event.category === 'intervention' &&
        event.name === 'intervention.confirm' &&
        event.agentId === 'decision-synthesizer',
    );
    expect(confirmEvent).toBeUndefined();
  });
});

describe('executeHomeEnergySwarm: criteria reweight changes response-options ranking, and confirms before proposing an inspection (round2)', () => {
  it('conservation-heavy criteria favor the root-cause fix, requiring human confirmation before propose_inspection proceeds', async () => {
    const { deps, providers } = buildDeps({
      start: 'decision-synthesizer',
      beat: 'round2',
      costWeight: ROUND2_COST_WEIGHT,
      conservationWeight: ROUND2_CONSERVATION_WEIGHT,
    });
    const { events, result } = await drain(executeHomeEnergySwarm(deps));

    // Required adaptive moment: "Changing the criterion from lowest
    // immediate cost to long-term waste reduction changes option ranking."
    expect(result.proposedInspection).toEqual(PROPOSED_INSPECTION_ROUND2);
    expect(result.decisionSynthesizerText).toContain('request-hvac-inspection');
    expect(result.goalLoopResult?.passed).toBe(true);

    // Required adaptive moment: "The system asks for confirmation before
    // creating an inspection proposal."
    const confirmEvent = events.find(
      (event) =>
        event.category === 'intervention' &&
        event.name === 'intervention.confirm' &&
        event.agentId === 'decision-synthesizer' &&
        event.attributes['subject'] === PROPOSE_INSPECTION_TOOL_ID,
    );
    expect(confirmEvent).toBeDefined();
    expect(confirmEvent?.attributes['handler']).toBe('ConsequenceGuard');

    // Genuine mechanism proof, not just a hand-scripted final answer: the
    // reweighted criteria (energy.cost weight 20, not 80) really reached the
    // model through decision-synthesizer's system prompt (baked in per
    // buildDecisionSynthesizerSystemPrompt -- see home-energy-swarm.ts's
    // module header, judgment call 4).
    const synthesizerCallLog = providers['decision-synthesizer'].callLog;
    expect(synthesizerCallLog.length).toBeGreaterThan(0);
    const systemPrompt = synthesizerCallLog[0]?.options?.systemPrompt;
    expect(
      typeof systemPrompt === 'string' ? systemPrompt : JSON.stringify(systemPrompt),
    ).toContain(`energy.cost (weight ${ROUND2_COST_WEIGHT}`);
  });

  it('differs from round1: the same pack, different criteria, produces a genuinely different recommendation and a defined vs. undefined inspection proposal', async () => {
    const round1 = buildDeps({
      costWeight: ROUND1_COST_WEIGHT,
      conservationWeight: ROUND1_CONSERVATION_WEIGHT,
    });
    const round2 = buildDeps({
      start: 'decision-synthesizer',
      beat: 'round2',
      costWeight: ROUND2_COST_WEIGHT,
      conservationWeight: ROUND2_CONSERVATION_WEIGHT,
    });

    const { result: result1 } = await drain(executeHomeEnergySwarm(round1.deps));
    const { result: result2 } = await drain(executeHomeEnergySwarm(round2.deps));

    expect(result1.proposedInspection).toBeUndefined();
    expect(result2.proposedInspection).toBeDefined();
    expect(result1.decisionSynthesizerText).not.toBe(result2.decisionSynthesizerText);
  });
});

describe('executeHomeEnergySwarm: intervention integrity', () => {
  it('denies a tool call outside a specialist node declared allowlist before it ever executes', async () => {
    const { deps } = buildDeps({
      costWeight: ROUND1_COST_WEIGHT,
      conservationWeight: ROUND1_CONSERVATION_WEIGHT,
    });
    // Redirect anomaly-investigator's scripted turn to attempt a tool it was
    // never granted (household-event-lookup is not in anomaly-investigator's
    // allowedTools: ['bill-reader', 'usage-history-query', 'calculator']).
    const provider = new ScriptedModelProvider({
      beats: {
        round1: [
          { toolCalls: [{ name: 'household-event-lookup', input: {} }] },
          {
            toolCalls: [
              {
                name: 'strands_structured_output',
                input: {
                  agentId: 'rate-analyst',
                  message: 'Confirmed the anomaly per source-energy-calculator-anomaly.',
                  context: ANOMALY_CONTEXT,
                },
              },
            ],
          },
        ],
      },
    });
    provider.setBeat('round1');
    const patchedModelFor: HomeEnergySwarmDeps['modelFor'] = (nodeId) =>
      nodeId === 'anomaly-investigator' ? provider : deps.modelFor(nodeId);

    const { events } = await drain(executeHomeEnergySwarm({ ...deps, modelFor: patchedModelFor }));
    const denyEvent = events.find(
      (event) =>
        event.category === 'intervention' &&
        event.name === 'intervention.deny' &&
        event.agentId === 'anomaly-investigator',
    );
    expect(denyEvent).toBeDefined();
  });

  it('rejects a decision-synthesizer draft with no source citation, then accepts a corrected retry (GoalLoop maxAttempts: 2)', async () => {
    const { deps } = buildDeps({ start: 'decision-synthesizer', beat: 'round1' });
    const provider = new ScriptedModelProvider({
      beats: {
        round1: [
          {
            toolCalls: [
              { name: 'strands_structured_output', input: { message: 'Monitor for now.' } },
            ],
          },
          {
            toolCalls: [
              {
                name: 'strands_structured_output',
                input: {
                  message:
                    'Recommend monitor-one-cycle per source-current-bill-household-demo-energy-01.',
                },
              },
            ],
          },
        ],
      },
    });
    provider.setBeat('round1');
    const patchedModelFor: HomeEnergySwarmDeps['modelFor'] = (nodeId) =>
      nodeId === 'decision-synthesizer' ? provider : deps.modelFor(nodeId);

    const { events, result } = await drain(
      executeHomeEnergySwarm({ ...deps, modelFor: patchedModelFor }),
    );

    expect(result.goalLoopResult?.passed).toBe(true);
    expect(result.goalLoopResult?.attempts).toHaveLength(2);
    expect(result.goalLoopResult?.attempts[0]?.passed).toBe(false);
    expect(result.goalLoopResult?.attempts[1]?.passed).toBe(true);

    const failedEvent = events.find(
      (event) => event.category === 'goal' && event.name === 'goal.validation_failed',
    );
    expect(failedEvent).toBeDefined();
    const passedEvent = events.find(
      (event) => event.category === 'goal' && event.name === 'goal.validated',
    );
    expect(passedEvent).toBeDefined();
  });
});
