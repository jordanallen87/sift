#!/usr/bin/env tsx
/**
 * `pnpm test:persona` — the persona UX harness.
 *
 * Runs each persona's turns against the **real** stack in process: the real
 * compiled Vehicle Selection pack, the real `CommandService`, the real
 * `RunPlanService`, real SQLite, and the same `@sift/core` derivations the
 * pane renders from. Nothing here is a stand-in for a Sift component.
 *
 * ## The executor answers whatever Sift asks
 *
 * A persona turn says what the *person* would say ("Under about thirty-five
 * thousand"), not which topic id to write or what payload to send. The
 * executor resolves each turn against the case's current state: it asks
 * `deriveNextMoves` what Sift wants next and answers that.
 *
 * This is the design decision that makes the harness worth running. A
 * hard-coded input per turn would still pass if the pack started asking a
 * completely different set of questions — the script would answer the old
 * ones into the void. Answering whatever is actually asked means the
 * landscaping persona diverges from the family persona because the *pack's
 * conditional topics* diverge, not because two scripts differ.
 *
 * ## What this harness cannot see
 *
 * There is no browser here, so accessibility and console/network gates
 * report `not_evaluated` with a reason rather than `pass`. The end-to-end
 * journey supplies that evidence. A green report from this script means
 * "nine gates passed and two were not checked", and it says so.
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaseState, NextMove, Persona, PersonaTurn } from '../packages/contracts/src/index.js';
import {
  deriveDecisionPhase,
  deriveDisplayedCoverage,
  deriveDiscoveryReadiness,
  deriveNextMoves,
  compileDiscoveryTopics,
  type Clock,
  type IdGenerator,
} from '../packages/core/src/index.js';
import { PackRegistry, compileCarPurchasePack } from '../packages/packs/src/index.js';
import { PERSONAS } from '../packages/scenarios/fixtures/personas/index.js';
import {
  runPersona,
  type PersonaTurnExecutor,
  type PersonaTurnObservation,
} from '../packages/scenarios/src/persona-runner.js';
import { summarizeDiagnostics } from '../packages/scenarios/src/persona-diagnostics.js';
import { openDatabase } from '../apps/agent/src/db/connection.js';
import { applyMigrations } from '../apps/agent/src/db/migrate.js';
import { SqliteCaseStore } from '../apps/agent/src/store/sqlite-case-store.js';
import { SqliteActivityStore } from '../apps/agent/src/store/activity-store.js';
import { SqliteRunPlanStore } from '../apps/agent/src/store/run-plan-store.js';
import { CommandService } from '../apps/agent/src/services/command-service.js';
import { RunPlanService } from '../apps/agent/src/services/run-plan-service.js';
import { carPurchaseCapabilityCatalog } from '../apps/agent/src/runtime/car-purchase-scenario.js';

const ARTIFACT_DIR = fileURLToPath(new URL('../artifacts/persona', import.meta.url));

/** Fixed clock and counter ids: two runs of the same persona must produce the same report. */
function deterministicPorts(): { clock: Clock; idGenerator: IdGenerator } {
  let tick = 0;
  return {
    clock: {
      now: () => {
        tick += 1;
        return new Date(Date.UTC(2026, 8, 2, 12, 0, tick)).toISOString();
      },
    },
    idGenerator: (() => {
      let counter = 0;
      return {
        next: (prefix?: string) => {
          counter += 1;
          return `${prefix ?? 'id'}-${String(counter).padStart(4, '0')}`;
        },
      };
    })(),
  };
}

interface Stack {
  readonly caseStore: SqliteCaseStore;
  readonly activityStore: SqliteActivityStore;
  readonly commandService: CommandService;
  readonly runPlanService: RunPlanService;
  readonly registry: PackRegistry;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  cleanup(): void;
}

function buildStack(): Stack {
  const dir = mkdtempSync(join(tmpdir(), 'sift-persona-'));
  const database = openDatabase(dir);
  applyMigrations(database.sqlite);

  const { clock, idGenerator } = deterministicPorts();
  const caseStore = new SqliteCaseStore(database);
  const activityStore = new SqliteActivityStore(database);
  const registry = new PackRegistry();
  registry.register(compileCarPurchasePack(carPurchaseCapabilityCatalog(), clock));

  const runPlanService = new RunPlanService({
    caseStore,
    planStore: new SqliteRunPlanStore(database),
    activityStore,
    registry,
    clock,
    idGenerator,
  });
  const commandService = new CommandService({
    caseStore,
    activityStore,
    registry,
    clock,
    idGenerator,
    runPlanRevisor: runPlanService,
  });

  return {
    caseStore,
    activityStore,
    commandService,
    runPlanService,
    registry,
    clock,
    idGenerator,
    cleanup: () => {
      database.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** The controls a person can genuinely press right now, derived from the real next moves. */
function visibleControlsFor(moves: readonly NextMove[]): string[] {
  return moves.slice(0, 2).map((move) => move.label);
}

/** One line per meaningful change between two snapshots, for the fabricated-progress gate. */
function diffSnapshots(before: CaseState | undefined, after: CaseState | undefined): string[] {
  if (before === undefined || after === undefined) return [];
  const lines: string[] = [];

  const beforeTopics = new Map(
    (before.discovery?.topics ?? []).map((topic) => [topic.topicId, topic]),
  );
  for (const topic of after.discovery?.topics ?? []) {
    const previous = beforeTopics.get(topic.topicId);
    if (previous?.status !== topic.status) {
      lines.push(
        `topic ${topic.topicId} -> ${topic.status} (origin: ${topic.origin})` +
          (topic.importance === undefined ? '' : ` importance ${topic.importance}`),
      );
    }
  }

  const beforeDispositions = new Map(
    (before.discovery?.dispositions ?? []).map((record) => [record.entityId, record.disposition]),
  );
  for (const record of after.discovery?.dispositions ?? []) {
    if (beforeDispositions.get(record.entityId) !== record.disposition) {
      lines.push(`candidate ${record.entityId} -> ${record.disposition}`);
    }
  }

  const beforeEntities = new Set(before.entities.map((entity) => entity.id));
  for (const entity of after.entities) {
    if (!beforeEntities.has(entity.id)) lines.push(`option ${entity.id} added`);
  }

  const beforeObligations = new Set(before.obligations.map((obligation) => obligation.id));
  for (const obligation of after.obligations) {
    if (!beforeObligations.has(obligation.id)) {
      lines.push(`concern ${obligation.id} added`);
    }
  }

  return lines;
}

class RealPersonaExecutor implements PersonaTurnExecutor {
  readonly browserEvidence = false;
  private caseIdValue = '';
  private commandCounter = 0;

  constructor(
    private readonly stack: Stack,
    private readonly persona: Persona,
  ) {}

  caseId(): string {
    return this.caseIdValue;
  }

  knownEntityLabels(): readonly string[] {
    const snapshot = this.snapshot();
    return snapshot === undefined ? [] : snapshot.entities.map((entity) => entity.label);
  }

  private snapshot(): CaseState | undefined {
    return this.caseIdValue === '' ? undefined : this.stack.caseStore.load(this.caseIdValue);
  }

  private nextCommandId(): string {
    this.commandCounter += 1;
    return `persona-${this.persona.id}-${String(this.commandCounter).padStart(3, '0')}`;
  }

  execute(turn: PersonaTurn, index: number): Promise<PersonaTurnObservation> {
    const started = Date.now();
    const before = this.snapshot();
    const activityBefore =
      this.caseIdValue === '' ? 0 : this.stack.activityStore.latestSequence(this.caseIdValue);

    const tools = this.applyTurn(turn, index);

    const after = this.snapshot();
    if (after === undefined) {
      throw new Error(
        `Persona "${this.persona.id}" turn ${String(index)} ("${turn.label}") left no case to observe.`,
      );
    }
    const pack = this.stack.registry.get(after.pack.id, after.pack.version);
    if (pack === undefined) {
      throw new Error(`Pinned pack "${after.pack.id}" is not registered.`);
    }

    const displayedCoverage = deriveDisplayedCoverage(after, pack);
    const moves = deriveNextMoves(after, pack);
    const firstMove = moves[0];
    const plan = this.stack.runPlanService.currentPlan(after.id);
    const events = this.stack.activityStore
      .replayFrom(after.id, activityBefore)
      .map((event) => `${event.type}: ${event.summary}`);

    return Promise.resolve({
      // No `reply`: this harness runs Sift, not ChatGPT, so no turn here
      // produces model-authored prose. An absent field is the honest
      // record; putting the next-move label here would have made the
      // unsupported-claim gate check Sift's own button text.
      chat: {
        ...(turn.utterance !== undefined ? { utterance: turn.utterance } : {}),
      },
      tools,
      sequenceBefore: before?.eventSequence ?? 0,
      sequenceAfter: after.eventSequence,
      stateDiff: diffSnapshots(before, after),
      // The coverage the *pane* would show, not the raw readiness counts:
      // a UX gate can only meaningfully check a claim the person can see.
      coverage: {
        requiredTotal: displayedCoverage.requiredTotal,
        requiredResolved: displayedCoverage.requiredResolved,
      },
      phase: deriveDecisionPhase(after, pack),
      nextMove:
        firstMove === undefined
          ? null
          : { kind: firstMove.kind, label: firstMove.label, humanOnly: firstMove.humanOnly },
      runPlan:
        plan === undefined
          ? null
          : {
              version: plan.version,
              plannedItems: plan.items.filter((item) => item.status === 'planned').length,
              deepItems: plan.items.filter((item) => item.depth === 'deep').length,
              reused: plan.revision?.reusedSignatures.length ?? 0,
              added: plan.revision?.addedSignatures.length ?? 0,
            },
      events,
      view: after.view?.mode ?? 'list',
      ownership: turn.actor === 'agent' ? 'agent' : 'human',
      visibleControls: visibleControlsFor(moves),
      accessibility: { seriousViolations: 0, checked: false },
      consoleErrors: [],
      networkFailures: [],
      latencyMs: Date.now() - started,
      estimatedCostUsd: 0,
    });
  }

  /**
   * Performs the turn and returns the commands it actually ran.
   *
   * Every branch resolves its input from *current* state rather than from
   * the persona: `updateDiscovery` answers whatever topic `deriveNextMoves`
   * is asking about, and `setCandidateDisposition` acts on whichever
   * candidate is still untriaged.
   */
  private applyTurn(turn: PersonaTurn, index: number): string[] {
    if (this.caseIdValue === '') {
      const receipt = this.stack.commandService.startDemo(this.nextCommandId(), {
        demoId: this.persona.demoId,
      });
      if (receipt.status !== 'ok') {
        throw new Error(`startDemo failed for "${this.persona.id}": ${JSON.stringify(receipt)}`);
      }
      this.caseIdValue = receipt.value.caseId;
      if (turn.command === undefined) return ['startDemo'];
    }

    const snapshot = this.snapshot();
    if (snapshot === undefined) throw new Error('no case after startDemo');
    if (turn.command === undefined) return [];

    switch (turn.command) {
      case 'updateDiscovery':
        return this.answerNextTopic(snapshot, turn, index);
      case 'completeBlindSpotReview':
        return this.completeBlindSpots(snapshot);
      case 'setCandidateDisposition':
        return this.triageNextCandidate(snapshot, turn);
      case 'upsertOption':
        return this.addKnownOption(snapshot, turn);
      case 'defineCaseAttribute':
        return this.raiseConcern(snapshot, turn);
      default:
        throw new Error(
          `Persona "${this.persona.id}" turn ${String(index)} names command "${turn.command}", which this executor does not know how to perform.`,
        );
    }
  }

  private answerNextTopic(snapshot: CaseState, turn: PersonaTurn, index: number): string[] {
    const pack = this.requirePack(snapshot);
    const readiness = deriveDiscoveryReadiness(snapshot, pack);
    const topicId = readiness.nextTopicId;
    if (topicId === null) {
      // Nothing left to ask. Not an error: a persona that keeps answering
      // past the end of discovery is telling us discovery got shorter,
      // which the artifact records rather than crashes on.
      return [];
    }
    const receipt = this.stack.commandService.updateDiscovery(this.nextCommandId(), {
      caseId: snapshot.id,
      expectedSequence: snapshot.eventSequence,
      actor: 'human',
      operations: [
        {
          op: 'confirm',
          topicId,
          valueSummary: turn.utterance ?? `Answered on turn ${String(index)}`,
        },
      ],
    });
    if (receipt.status !== 'ok') {
      throw new Error(`updateDiscovery("${topicId}") failed: ${JSON.stringify(receipt)}`);
    }
    return ['updateDiscovery'];
  }

  private completeBlindSpots(snapshot: CaseState): string[] {
    const pack = this.requirePack(snapshot);
    const offered = (pack.discovery?.blindSpots ?? []).map((prompt) => prompt.id);
    if (offered.length === 0) return [];
    const receipt = this.stack.commandService.completeBlindSpotReview(this.nextCommandId(), {
      caseId: snapshot.id,
      expectedSequence: snapshot.eventSequence,
      actor: 'human',
      offeredPromptIds: offered,
      selectedPromptIds: [],
    });
    if (receipt.status !== 'ok') {
      throw new Error(`completeBlindSpotReview failed: ${JSON.stringify(receipt)}`);
    }
    return ['completeBlindSpotReview'];
  }

  private triageNextCandidate(snapshot: CaseState, turn: PersonaTurn): string[] {
    const dispositions = new Map(
      (snapshot.discovery?.dispositions ?? []).map((record) => [
        record.entityId,
        record.disposition,
      ]),
    );
    const target = snapshot.entities.find(
      (entity) =>
        entity.kind === 'candidate' &&
        (dispositions.get(entity.id) ?? 'unreviewed') === 'unreviewed',
    );
    if (target === undefined) return [];

    const disposition = /pass/i.test(turn.label) ? 'pass' : 'keep';
    const receipt = this.stack.commandService.setCandidateDisposition(this.nextCommandId(), {
      caseId: snapshot.id,
      expectedSequence: snapshot.eventSequence,
      actor: 'human',
      entityId: target.id,
      disposition,
    });
    if (receipt.status !== 'ok') {
      throw new Error(`setCandidateDisposition failed: ${JSON.stringify(receipt)}`);
    }
    return ['setCandidateDisposition'];
  }

  private addKnownOption(snapshot: CaseState, turn: PersonaTurn): string[] {
    const receipt = this.stack.commandService.upsertOption(this.nextCommandId(), {
      caseId: snapshot.id,
      optionId: 'known-listing',
      expectedSequence: snapshot.eventSequence,
      option: {
        label: extractOptionLabel(turn.utterance) ?? 'The vehicle they found',
        kind: 'candidate',
        attributes: [],
      },
    });
    if (receipt.status !== 'ok') {
      throw new Error(`upsertOption failed: ${JSON.stringify(receipt)}`);
    }
    return ['upsertOption'];
  }

  private raiseConcern(snapshot: CaseState, turn: PersonaTurn): string[] {
    const receipt = this.stack.commandService.defineCaseAttribute(this.nextCommandId(), {
      caseId: snapshot.id,
      expectedSequence: snapshot.eventSequence,
      definition: {
        id: 'custom.dog_crate_fit',
        label: turn.utterance ?? 'A concern the pack never anticipated',
        valueType: 'boolean',
        appliesTo: ['candidate'],
        evidenceExpectation: 'source',
        comparison: 'constraint',
        reason: 'The person raised a need the pack never anticipated.',
      },
    });
    if (receipt.status !== 'ok') {
      throw new Error(`defineCaseAttribute failed: ${JSON.stringify(receipt)}`);
    }
    return ['defineCaseAttribute'];
  }

  private requirePack(snapshot: CaseState) {
    const pack = this.stack.registry.get(snapshot.pack.id, snapshot.pack.version);
    if (pack === undefined) {
      throw new Error(`Pinned pack "${snapshot.pack.id}" is not registered.`);
    }
    // Touching `compileDiscoveryTopics` here keeps the executor honest about
    // reading the same compiled topic set the pane does.
    compileDiscoveryTopics(snapshot, pack);
    return pack;
  }
}

function extractOptionLabel(utterance: string | undefined): string | undefined {
  if (utterance === undefined) return undefined;
  const match = /\b([A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)*)\b/.exec(
    utterance.replace(/^I am looking at (a|an|the)\s+/i, ''),
  );
  return match?.[1];
}

async function main(): Promise<void> {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  let failures = 0;

  for (const persona of PERSONAS) {
    const stack = buildStack();
    try {
      const report = await runPersona(persona, new RealPersonaExecutor(stack, persona));
      const diagnostics = summarizeDiagnostics(report.scores);

      writeFileSync(
        join(ARTIFACT_DIR, `${persona.id}.json`),
        `${JSON.stringify({ report, diagnostics }, null, 2)}\n`,
        'utf8',
      );

      const failed = report.gates.filter((gate) => gate.outcome === 'fail');
      const notEvaluated = report.gates.filter((gate) => gate.outcome === 'not_evaluated');

      process.stdout.write(
        `\n${persona.id}: ${report.passed ? 'PASS' : 'FAIL'} (${String(report.turns.length)} turns)\n`,
      );
      for (const gate of failed) {
        failures += 1;
        for (const item of gate.findings) {
          process.stdout.write(
            `  ✗ ${gate.gateId} @ turn ${String(item.turnIndex)}: ${item.detail}\n`,
          );
        }
      }
      if (notEvaluated.length > 0) {
        process.stdout.write(
          `  · not evaluated here: ${notEvaluated.map((gate) => gate.gateId).join(', ')}\n`,
        );
      }
      if (!diagnostics.scored) {
        process.stdout.write(`  · ${diagnostics.reason ?? 'unscored'}\n`);
      }
    } finally {
      stack.cleanup();
    }
  }

  process.stdout.write(
    `\nArtifacts written to ${ARTIFACT_DIR}\n${failures === 0 ? 'All hard gates passed.' : `${String(failures)} gate(s) failed.`}\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
