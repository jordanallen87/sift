/**
 * Real Strands vended-plugin construction: `AgentSkills` (progressive
 * skill disclosure), `ContextInjector` (current case projection, injected
 * ephemerally before every model call), and the isolated
 * `decision-synthesizer` `Agent` + `GoalLoop` pair.
 *
 * Every plugin here is the genuine `@strands-agents/sdk` class from its own
 * vended-plugin subpath export -- `AgentSkills` from
 * `@strands-agents/sdk/vended-plugins/skills`, `ContextInjector` from
 * `@strands-agents/sdk/vended-plugins/context-injector`, `GoalLoop` from
 * `@strands-agents/sdk/vended-plugins/goal` -- never a local class named
 * after one of these features.
 */
import {
  Agent,
  type BaseModelConfig,
  type InterventionHandler,
  type Message,
  type Model,
  type TextBlock,
  type ToolList,
} from '@strands-agents/sdk';
import { AgentSkills, type AgentSkillsConfig } from '@strands-agents/sdk/vended-plugins/skills';
import { ContextInjector } from '@strands-agents/sdk/vended-plugins/context-injector';
import { GoalLoop, type Validator } from '@strands-agents/sdk/vended-plugins/goal';
import type { ExecutionRequest } from '@sift/contracts';
import {
  hashContent,
  normalizeContextInjection,
  type NormalizerContext,
  type RuntimeEvent,
} from './event-normalizer.js';

// --- AgentSkills ---

/** Points a real `AgentSkills` plugin at `skillsRootDir` (a parent directory of skill subdirectories, each containing `SKILL.md` -- `apps/agent/skills/` for the car-purchase pack's six skills). */
export function buildSkillsPlugin(
  skillsRootDir: string,
  options?: { strict?: boolean; maxResourceFiles?: number },
): AgentSkills {
  const config: AgentSkillsConfig = { skills: [skillsRootDir] };
  if (options?.strict !== undefined) config.strict = options.strict;
  if (options?.maxResourceFiles !== undefined) config.maxResourceFiles = options.maxResourceFiles;
  return new AgentSkills(config);
}

// --- ContextInjector: current case projection ---

/**
 * Compact projection of `ExecutionRequest` fields the Context Injector
 * renders every turn (strands-runtime.md "Context injection"): active
 * obligation and completion rule, evidence inventory, remaining budgets,
 * criteria with origin labels. Agent-proposed case extensions that are
 * still `pending`/`rejected` are explicitly excluded -- only `confirmed`
 * extensions are projected, matching "Agent-proposed case extensions
 * remain explicitly unconfirmed until a human accepts them."
 */
export interface CaseContextProjection {
  activeObligation: {
    id: string;
    question: string;
    category: string;
    status: string;
    requiredEvidenceLevel: string;
  };
  evidenceInventory: ExecutionRequest['caseSummary']['evidenceCounts'];
  remainingBudgets: {
    attemptsRemaining: number;
    toolCallsRemaining: number;
    totalRunTimeoutMs: number;
  };
  criteria: { id: string; label: string; origin: string; weight: number; direction: string }[];
  confirmedExtensions: { id: string; label: string; valueType: string; origin: string }[];
}

export function projectCaseContext(request: ExecutionRequest): CaseContextProjection {
  const attemptsUsed = request.priorAttempts.length;
  return {
    activeObligation: {
      id: request.obligation.id,
      question: request.obligation.question,
      category: request.obligation.category,
      status: request.obligation.status,
      requiredEvidenceLevel: request.obligation.requiredEvidenceLevel,
    },
    evidenceInventory: request.caseSummary.evidenceCounts,
    remainingBudgets: {
      attemptsRemaining: Math.max(0, request.limits.maxAttemptsPerObligation - attemptsUsed),
      toolCallsRemaining: request.limits.maxToolCallsPerRun,
      totalRunTimeoutMs: request.limits.totalRunTimeoutMs,
    },
    criteria: request.caseSummary.criteria.map((criterion) => ({
      id: criterion.id,
      label: criterion.label,
      origin: criterion.origin,
      weight: criterion.weight,
      direction: criterion.direction,
    })),
    confirmedExtensions: request.caseExtensions
      .filter((extension) => extension.confirmation === 'confirmed')
      .map((extension) => ({
        id: extension.id,
        label: extension.label,
        valueType: extension.valueType,
        origin: extension.origin,
      })),
  };
}

/**
 * Renders the projection as the text injected before each model call.
 * Field values ultimately come from `@sift/contracts`-validated `safeString`
 * fields, which already reject HTML-tag-shaped content upstream, so no
 * additional XML escaping is applied here.
 */
export function renderCaseContextText(projection: CaseContextProjection): string {
  const lines: string[] = ['<sift_case_context>'];
  const obligation = projection.activeObligation;
  lines.push(
    `<active_obligation id="${obligation.id}" status="${obligation.status}" required_evidence_level="${obligation.requiredEvidenceLevel}" category="${obligation.category}">${obligation.question}</active_obligation>`,
  );
  const evidence = projection.evidenceInventory;
  lines.push(
    `<evidence_inventory satisfied="${evidence.satisfied}" active="${evidence.active}" blocked="${evidence.blocked}" accepted_uncertainty="${evidence.acceptedUncertainty}" open="${evidence.open}" />`,
  );
  const budgets = projection.remainingBudgets;
  lines.push(
    `<remaining_budgets attempts_remaining="${budgets.attemptsRemaining}" tool_calls_remaining="${budgets.toolCallsRemaining}" total_run_timeout_ms="${budgets.totalRunTimeoutMs}" />`,
  );
  lines.push('<criteria>');
  for (const criterion of projection.criteria) {
    lines.push(
      `<criterion id="${criterion.id}" origin="${criterion.origin}" weight="${criterion.weight}" direction="${criterion.direction}">${criterion.label}</criterion>`,
    );
  }
  lines.push('</criteria>');
  lines.push('<confirmed_extensions>');
  for (const extension of projection.confirmedExtensions) {
    lines.push(
      `<extension id="${extension.id}" value_type="${extension.valueType}" origin="${extension.origin}">${extension.label}</extension>`,
    );
  }
  lines.push('</confirmed_extensions>');
  lines.push('</sift_case_context>');
  return lines.join('\n');
}

export interface ContextInjectorDeps {
  ctx: NormalizerContext;
  sequence: () => number;
  emit: (event: RuntimeEvent) => void;
}

/**
 * Builds a real `ContextInjector` whose `renderContent` projects the given
 * `ExecutionRequest` (not the SDK's own conversation-derived
 * `InjectionContext` -- Sift's context is case-state-driven, not
 * conversation-state-driven) and emits a normalized `context.injected`
 * event carrying only field names and a content hash, never the rendered
 * text itself.
 */
export function buildContextInjector(
  request: ExecutionRequest,
  deps: ContextInjectorDeps,
): ContextInjector {
  return new ContextInjector({
    name: 'sift:context-injector',
    trigger: 'everyTurn',
    renderContent: () => {
      const projection = projectCaseContext(request);
      const rendered = renderCaseContextText(projection);
      const fields = Object.keys(projection);
      const contentHash = hashContent(rendered);
      deps.emit(normalizeContextInjection({ fields, contentHash }, deps.ctx, deps.sequence()));
      return Promise.resolve(rendered);
    },
  });
}

// --- Isolated decision-synthesizer Agent + GoalLoop ---

function extractResponseText(response: Message): string {
  return response.content
    .filter((block): block is TextBlock => block.type === 'textBlock')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Documented placeholder `ExecutionResult`-artifact validator for
 * `decision-synthesizer`'s `GoalLoop`. strands-runtime.md's full validation
 * rules ("checks source linkage, resolved required obligations or accepted
 * uncertainty, allowed confidence, separation of fact and hypothesis, and
 * absence of forbidden effects") depend on the compiled pack and current
 * case state, which the car-purchase Graph-building task owns. This pass
 * proves the *mechanism* -- a real, isolated `Agent` + `GoalLoop` wired
 * with a callable `Validator` that genuinely rejects and re-prompts -- with
 * an honestly-scoped check: the response must be non-empty and cite at
 * least one `source-`-shaped id.
 */
export const STUB_RECOMMENDATION_VALIDATOR: Validator = (response: Message) => {
  const text = extractResponseText(response);
  if (text.trim().length === 0) {
    return {
      passed: false,
      feedback: 'The recommendation must include text explaining the decision.',
    };
  }
  if (!/\bsource-[a-z0-9-]+\b/i.test(text)) {
    return {
      passed: false,
      feedback: 'The recommendation must cite at least one source id (e.g. "source-...").',
    };
  }
  return { passed: true };
};

/**
 * `decision-synthesizer` must be its own distinct `Agent` instance carrying
 * its own `GoalLoop` (strands-runtime.md "GoalLoop output validation":
 * "only one `GoalLoop` is supported per agent" and "`decision-synthesizer`
 * is therefore constructed as its own distinct `Agent` instance ... not
 * shared with the orchestrator"). Deliberately accepts no `sessionManager`
 * parameter: "Only the orchestrator receives a session manager; nested
 * graph agents do not create independent session managers"
 * (strands-runtime.md "Sessions and snapshots").
 */
export interface DecisionSynthesizerConfig {
  model: Model<BaseModelConfig> | string;
  systemPrompt: string;
  tools?: ToolList;
  validator: Validator;
  /** Defaults to `2` -- strands-runtime.md "GoalLoop output validation": "`maxAttempts` is two." */
  maxAttempts?: number;
  interventions?: InterventionHandler[];
}

export interface DecisionSynthesizerBuild {
  agent: Agent;
  goalLoop: GoalLoop;
}

export function buildDecisionSynthesizerAgent(
  config: DecisionSynthesizerConfig,
): DecisionSynthesizerBuild {
  const goalLoop = new GoalLoop({
    goal: config.validator,
    maxAttempts: config.maxAttempts ?? 2,
    name: 'sift:decision-synthesizer-goal',
  });
  const agent = new Agent({
    id: 'decision-synthesizer',
    name: 'decision-synthesizer',
    model: config.model,
    printer: false,
    systemPrompt: config.systemPrompt,
    plugins: [goalLoop],
    ...(config.tools !== undefined ? { tools: config.tools } : {}),
    ...(config.interventions !== undefined ? { interventions: config.interventions } : {}),
  });
  return { agent, goalLoop };
}
