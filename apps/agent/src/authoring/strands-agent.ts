/**
 * Wraps the six bounded authoring functions (`./index.js`) as real Strands
 * `Tool`s via the real `tool()` factory (`@strands-agents/sdk`) and builds a
 * real Strands `Agent` carrying a real `AgentSkills` plugin pointed
 * specifically at `apps/agent/skills/pack-authoring` -- never at the shared
 * `apps/agent/skills` parent root the two hero packs' own `AgentSkills`
 * instances use (`apps/agent/src/runtime/plugins.ts`'s `buildSkillsPlugin`,
 * `apps/agent/src/server.ts`).
 *
 * Isolation from normal decision runs (pack-authoring.md: "it is not
 * enabled inside normal decision runs") is real at two independent, load-
 * bearing levels this module controls directly:
 *
 * 1. These six tools are never added to `buildCarPurchaseFixtureTools()` or
 *    any hero-pack specialist's own `allowedTools` -- a hero-pack `Agent`
 *    has no way to *call* `pack_scaffold`/`pack_publish`/etc. regardless of
 *    what it can see, because the tools are simply not present in its own
 *    `Agent({ tools: ... })` configuration. Only THIS module's
 *    `buildPackAuthoringAgent` ever registers them.
 * 2. `AgentSkills({ skills: [PACK_AUTHORING_SKILL_DIR] })` here points at
 *    exactly one skill directory (the specific-directory form
 *    `AgentSkillsConfig.skills` documents, not the parent-root form), so
 *    this module's own construction never widens what any *other* agent's
 *    `AgentSkills` plugin can see.
 *
 * Residual, documented note: `AgentSkillsConfig`'s installed version has no
 * allow/deny filter, and `server.ts` (out of this task's editable scope)
 * points the hero packs' own `AgentSkills` at the shared parent directory
 * `apps/agent/skills`, which -- by `Skill.fromDirectory`'s own documented
 * behavior ("Each subdirectory containing a SKILL.md file is treated as a
 * skill") -- will also enumerate `pack-authoring`'s `name`/`description` as
 * inert metadata in a hero-pack run's system prompt. This is a metadata-
 * visibility leak only, not a functional one: even if a hero-pack model
 * activated it and read its full instructions, none of the six tools those
 * instructions describe exist in that Agent's own tool list (point 1
 * above), so it has no way to actually scaffold, validate, or publish
 * anything during a decision run. Closing the visibility gap fully would
 * require editing `server.ts`/`plugins.ts`, which are out of this task's
 * scope (owned by concurrent work) -- recorded here rather than silently
 * ignored. See `public-deployment.test.ts` for the load-bearing guarantee
 * this module actually proves.
 */
import { fileURLToPath } from 'node:url';
import { Agent, tool, type BaseModelConfig, type Model, type ToolList } from '@strands-agents/sdk';
import { AgentSkills } from '@strands-agents/sdk/vended-plugins/skills';
import {
  packCatalog,
  packDiff,
  packPublish,
  packScaffold,
  packTest,
  packValidate,
  PackCatalogInputSchema,
  PackDiffInputSchema,
  PackPublishInputSchema,
  PackScaffoldInputSchema,
  PackTestInputSchema,
  PackValidateInputSchema,
  type AuthoringToolContext,
} from './index.js';

/** Absolute path to `apps/agent/skills/pack-authoring`, resolved relative to this module rather than `process.cwd()`. */
export const PACK_AUTHORING_SKILL_DIR = fileURLToPath(
  new URL('../../skills/pack-authoring', import.meta.url),
);

export class AuthoringDisabledError extends Error {}

/** The six bounded authoring tools, each a real Strands `Tool` (via `tool()`), closed over one `AuthoringToolContext`. */
export function buildAuthoringTools(ctx: AuthoringToolContext): ToolList {
  return [
    tool({
      name: 'pack_catalog',
      description:
        'Lists installed skills, specialists, tools, UI renderers, and orchestration templates. Read-only.',
      inputSchema: PackCatalogInputSchema,
      callback: (input) => packCatalog(ctx.catalog, input),
    }),
    tool({
      name: 'pack_scaffold',
      description:
        'Creates files only under the selected pack draft directory: pack.json, README.md, ' +
        'skills/<skill-id>/SKILL.md, fixtures/<scenario-id>/*.json, or scenarios/<scenario-id>.json. ' +
        'Rejects any path that resolves outside the draft directory or does not match this layout.',
      inputSchema: PackScaffoldInputSchema,
      callback: (input) => packScaffold(ctx.draftRoot, input),
    }),
    tool({
      name: 'pack_validate',
      description: 'Runs schema, reference, security, and graph/bounds validation on a draft.',
      inputSchema: PackValidateInputSchema,
      callback: (input) => packValidate(ctx.draftRoot, ctx.catalog, ctx.clock, input),
    }),
    tool({
      name: 'pack_test',
      description:
        'Runs deterministic conformance checks and verifies the four required scenario-coverage ' +
        'kinds (success, incomplete_evidence, steering, human_boundary) are present.',
      inputSchema: PackTestInputSchema,
      callback: (input) => packTest(ctx.draftRoot, ctx.catalog, ctx.clock, input),
    }),
    tool({
      name: 'pack_diff',
      description:
        'Compares a draft against any already-installed version of the same pack id. Read-only.',
      inputSchema: PackDiffInputSchema,
      callback: (input) => packDiff(ctx.draftRoot, ctx.catalog, ctx.registry, ctx.clock, input),
    }),
    tool({
      name: 'pack_publish',
      description:
        'Installs a validated draft. Requires actor "human" and confirmed: true. Rejects failing ' +
        'validation, missing negative scenario coverage, an undeclared/unresolved capability, ' +
        'executable content anywhere in the draft, and any request whose actor is not literally "human".',
      inputSchema: PackPublishInputSchema,
      callback: (input) => packPublish(ctx.draftRoot, ctx.catalog, ctx.registry, ctx.clock, input),
    }),
  ];
}

export interface PackAuthoringAgentDeps {
  readonly model: Model<BaseModelConfig> | string;
  readonly ctx: AuthoringToolContext;
  /** From `loadConfig().authoringEnabled` (`apps/agent/src/config.ts`). Threaded explicitly rather than read from `process.env` here, so this stays a pure, directly testable function of its inputs. */
  readonly authoringEnabled: boolean;
}

/**
 * Builds the real `pack-authoring` Strands `Agent`: `AgentSkills` pointed at
 * exactly `PACK_AUTHORING_SKILL_DIR`, plus the six bounded tools. Throws
 * `AuthoringDisabledError` -- refusing to construct the agent at all --
 * when `deps.authoringEnabled` is false, which is `PAX_AUTHORING_ENABLED`'s
 * default (`config.ts`).
 */
export function buildPackAuthoringAgent(deps: PackAuthoringAgentDeps): Agent {
  if (!deps.authoringEnabled) {
    throw new AuthoringDisabledError(
      'Pack authoring is disabled (PAX_AUTHORING_ENABLED=false). Set PAX_AUTHORING_ENABLED=true ' +
        'for local/developer authoring; it stays disabled in the public hackathon deployment.',
    );
  }

  const skillsPlugin = new AgentSkills({ skills: [PACK_AUTHORING_SKILL_DIR] });

  return new Agent({
    id: 'pack-authoring',
    name: 'pack-authoring',
    model: deps.model,
    printer: false,
    plugins: [skillsPlugin],
    tools: buildAuthoringTools(deps.ctx),
  });
}
