/**
 * Integration suite: real Strands `AgentSkills` activation with a scripted
 * model and a temporary draft root (docs/specs/testing.md "The
 * `pack-authoring` skill integration suite uses the real Strands
 * AgentSkills activation with a scripted model and temporary draft root. It
 * proves catalog, scaffold, validate, test, diff, confirmation, and publish
 * behavior; path traversal, executable manifest content, failing
 * conformance, an agent actor, and public authoring-disabled configuration
 * are rejected.").
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent, JsonBlock, TextBlock, type ToolResultBlock } from '@strands-agents/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PackRegistry } from '@sift/packs';
import { validCatalog, validManifest } from '@sift/packs/src/fixtures/manifest.js';
import { ScriptedModelProvider } from '../runtime/model-provider.js';
import type { AuthoringToolContext } from './index.js';
import { buildInstalledCapabilityCatalog } from './catalog.js';
import { draftDirFor, packScaffold, walkDraftFiles } from './scaffold.js';
import {
  AuthoringDisabledError,
  PACK_AUTHORING_SKILL_DIR,
  buildAuthoringTools,
  buildPackAuthoringAgent,
} from './strands-agent.js';

const FIXED_CLOCK = { now: () => '2026-08-27T00:00:00.000Z' };

let draftRoot: string;
let registry: PackRegistry;
let ctx: AuthoringToolContext;

beforeEach(() => {
  draftRoot = mkdtempSync(join(tmpdir(), 'sift-authoring-agent-'));
  registry = new PackRegistry();
  ctx = {
    draftRoot,
    catalog: buildInstalledCapabilityCatalog(registry),
    registry,
    clock: FIXED_CLOCK,
  };
});

afterEach(() => {
  rmSync(draftRoot, { recursive: true, force: true });
});

/**
 * Every tool result rendered as a plain string, whether the tool returned
 * text (an error message, via the SDK's own `createErrorResult`) or a
 * structured object (every successful bounded-tool result here, wrapped by
 * the SDK as a `JsonBlock`).
 */
function toolResultTexts(agent: Agent): string[] {
  return agent.messages
    .flatMap((message) => message.content)
    .filter((block): block is ToolResultBlock => block.type === 'toolResultBlock')
    .flatMap((block) => block.content)
    .map((block) => {
      if (block instanceof TextBlock) return block.text;
      if (block instanceof JsonBlock) return JSON.stringify(block.json);
      return '';
    });
}

describe('SIFT_AUTHORING_ENABLED gating', () => {
  it('refuses to construct the agent at all when authoring is disabled (the default)', () => {
    expect(() =>
      buildPackAuthoringAgent({
        model: new ScriptedModelProvider({ beats: {} }),
        ctx,
        authoringEnabled: false,
      }),
    ).toThrow(AuthoringDisabledError);
  });

  it('constructs the agent when authoring is explicitly enabled', () => {
    const agent = buildPackAuthoringAgent({
      model: new ScriptedModelProvider({ beats: {} }),
      ctx,
      authoringEnabled: true,
    });
    expect(agent.id).toBe('pack-authoring');
  });
});

describe('real AgentSkills activation', () => {
  it('exposes pack-authoring skill metadata up front and activates the real SKILL.md content on request', async () => {
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'skills', input: { skill_name: 'pack-authoring' } }] },
          { text: 'Activated pack-authoring.' },
        ],
      },
    });
    provider.setBeat('turn');

    const agent = buildPackAuthoringAgent({ model: provider, ctx, authoringEnabled: true });
    const result = await agent.invoke('Help me author a new apartment-listing pack.');
    expect(result.stopReason).toBe('endTurn');

    const firstSystemPrompt = provider.callLog[0]?.options?.systemPrompt;
    const systemPromptText =
      typeof firstSystemPrompt === 'string' ? firstSystemPrompt : JSON.stringify(firstSystemPrompt);
    expect(systemPromptText).toContain('pack-authoring');

    const texts = toolResultTexts(agent);
    expect(texts.some((text) => text.includes('Bounded tools'))).toBe(true);
    expect(texts.some((text) => text.includes('pack_publish'))).toBe(true);
  });

  it('PACK_AUTHORING_SKILL_DIR resolves to the real apps/agent/skills/pack-authoring directory', () => {
    expect(PACK_AUTHORING_SKILL_DIR.endsWith('skills/pack-authoring')).toBe(true);
  });
});

describe('buildAuthoringTools — full catalog -> scaffold -> validate -> test -> diff -> publish trajectory', () => {
  function fullManifest() {
    return validManifest({
      evaluation: {
        scenarioIds: ['apt-success', 'apt-incomplete', 'apt-steering', 'apt-boundary'],
        requiresNegativeCase: true,
      },
    });
  }

  function scenarioFile(id: string, kind: string) {
    return JSON.stringify({
      id,
      packId: 'apartment-hunt',
      kind,
      description: 'x',
      steps: [],
      assertions: [],
    });
  }

  it('drives a real Agent through catalog, scaffold, validate, test, diff, and a confirmed human publish', async () => {
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'pack_catalog', input: {} }] },
          {
            toolCalls: [
              {
                name: 'pack_scaffold',
                input: {
                  draftId: 'apartment-hunt',
                  files: [
                    { relativePath: 'pack.json', content: JSON.stringify(fullManifest()) },
                    {
                      relativePath: 'scenarios/apt-success.json',
                      content: scenarioFile('apt-success', 'success'),
                    },
                    {
                      relativePath: 'scenarios/apt-incomplete.json',
                      content: scenarioFile('apt-incomplete', 'incomplete_evidence'),
                    },
                    {
                      relativePath: 'scenarios/apt-steering.json',
                      content: scenarioFile('apt-steering', 'steering'),
                    },
                    {
                      relativePath: 'scenarios/apt-boundary.json',
                      content: scenarioFile('apt-boundary', 'human_boundary'),
                    },
                  ],
                },
              },
            ],
          },
          { toolCalls: [{ name: 'pack_validate', input: { draftId: 'apartment-hunt' } }] },
          { toolCalls: [{ name: 'pack_test', input: { draftId: 'apartment-hunt' } }] },
          { toolCalls: [{ name: 'pack_diff', input: { draftId: 'apartment-hunt' } }] },
          {
            toolCalls: [
              {
                name: 'pack_publish',
                input: {
                  draftId: 'apartment-hunt',
                  actor: 'human',
                  confirmed: true,
                  confirmedBy: 'pack-author@example.com',
                },
              },
            ],
          },
          { text: 'Published apartment-hunt@1.0.0.' },
        ],
      },
    });
    provider.setBeat('turn');

    const ctxWithRealCatalog: AuthoringToolContext = {
      ...ctx,
      catalog: validCatalog(),
    };
    const tools = buildAuthoringTools(ctxWithRealCatalog);
    const agent = new Agent({ model: provider, tools, printer: false });
    const result = await agent.invoke('Author the apartment-hunt pack end to end and publish it.');
    expect(result.stopReason).toBe('endTurn');

    expect(registry.list()).toHaveLength(1);
    expect(registry.get('apartment-hunt', '1.0.0')).toBeDefined();

    const texts = toolResultTexts(agent);
    expect(texts.some((text) => text.includes('listing-normalizer'))).toBe(true); // pack_catalog result
  });

  it('rejects a scaffold path-traversal attempt through the real tool boundary, and writes nothing', async () => {
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          {
            toolCalls: [
              {
                name: 'pack_scaffold',
                input: {
                  draftId: 'apartment-hunt',
                  files: [{ relativePath: '../../../../etc/passwd', content: 'pwned' }],
                },
              },
            ],
          },
          { text: 'done' },
        ],
      },
    });
    provider.setBeat('turn');
    const tools = buildAuthoringTools(ctx);
    const agent = new Agent({ model: provider, tools, printer: false });
    await agent.invoke('Scaffold outside the draft root.');

    // `../../../../etc/passwd` also fails the bundle-shape allowlist (it
    // matches none of pack.json/README.md/skills//SKILL.md/fixtures//json/
    // scenarios/.json), so that is the specific message the real tool
    // boundary reports here -- see scaffold.ts's module comment: for every
    // one of the five fixed-depth bundle-shape patterns, no string that
    // matches the allowlist can ever resolve outside the draft directory,
    // so the allowlist check is reached (and reported) first. The
    // independent path-resolution containment check is still proven
    // directly (with a bundle-shape-matching relative path smuggling `..`
    // segments) in scaffold.test.ts.
    const texts = toolResultTexts(agent);
    expect(texts.some((text) => text.includes('does not match the pack bundle file layout'))).toBe(
      true,
    );
    expect(walkDraftFiles(draftDirFor(draftRoot, 'apartment-hunt'))).toEqual([]);
  });

  it('rejects publish for an agent actor through the real tool boundary, and registers nothing', async () => {
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [{ relativePath: 'pack.json', content: JSON.stringify(validManifest()) }],
    });
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          {
            toolCalls: [
              {
                name: 'pack_publish',
                input: {
                  draftId: 'apartment-hunt',
                  actor: 'agent',
                  confirmed: true,
                  confirmedBy: 'itself',
                },
              },
            ],
          },
          { text: 'done' },
        ],
      },
    });
    provider.setBeat('turn');
    const ctxWithRealCatalog: AuthoringToolContext = { ...ctx, catalog: validCatalog() };
    const tools = buildAuthoringTools(ctxWithRealCatalog);
    const agent = new Agent({ model: provider, tools, printer: false });
    await agent.invoke('Try to self-publish.');

    expect(registry.list()).toEqual([]);
    const texts = toolResultTexts(agent);
    expect(texts.some((text) => text.includes('Only a human actor may publish'))).toBe(true);
  });

  it('rejects publish for a draft that fails conformance (missing scenario coverage), and registers nothing', async () => {
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [
        {
          relativePath: 'pack.json',
          content: JSON.stringify(
            validManifest({
              evaluation: { scenarioIds: ['apt-success'], requiresNegativeCase: true },
            }),
          ),
        },
        {
          relativePath: 'scenarios/apt-success.json',
          content: scenarioFile('apt-success', 'success'),
        },
      ],
    });
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          {
            toolCalls: [
              {
                name: 'pack_publish',
                input: {
                  draftId: 'apartment-hunt',
                  actor: 'human',
                  confirmed: true,
                  confirmedBy: 'x',
                },
              },
            ],
          },
          { text: 'done' },
        ],
      },
    });
    provider.setBeat('turn');
    const ctxWithRealCatalog: AuthoringToolContext = { ...ctx, catalog: validCatalog() };
    const tools = buildAuthoringTools(ctxWithRealCatalog);
    const agent = new Agent({ model: provider, tools, printer: false });
    await agent.invoke('Publish an incomplete draft.');

    expect(registry.list()).toEqual([]);
  });

  it('rejects publish for executable content in the draft, and registers nothing', async () => {
    packScaffold(draftRoot, {
      draftId: 'apartment-hunt',
      files: [
        { relativePath: 'pack.json', content: JSON.stringify(fullManifest()) },
        { relativePath: 'README.md', content: '<script>alert(1)</script>' },
        {
          relativePath: 'scenarios/apt-success.json',
          content: scenarioFile('apt-success', 'success'),
        },
        {
          relativePath: 'scenarios/apt-incomplete.json',
          content: scenarioFile('apt-incomplete', 'incomplete_evidence'),
        },
        {
          relativePath: 'scenarios/apt-steering.json',
          content: scenarioFile('apt-steering', 'steering'),
        },
        {
          relativePath: 'scenarios/apt-boundary.json',
          content: scenarioFile('apt-boundary', 'human_boundary'),
        },
      ],
    });
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          {
            toolCalls: [
              {
                name: 'pack_publish',
                input: {
                  draftId: 'apartment-hunt',
                  actor: 'human',
                  confirmed: true,
                  confirmedBy: 'x',
                },
              },
            ],
          },
          { text: 'done' },
        ],
      },
    });
    provider.setBeat('turn');
    const ctxWithRealCatalog: AuthoringToolContext = { ...ctx, catalog: validCatalog() };
    const tools = buildAuthoringTools(ctxWithRealCatalog);
    const agent = new Agent({ model: provider, tools, printer: false });
    await agent.invoke('Publish a draft with a script tag in it.');

    expect(registry.list()).toEqual([]);
  });
});

describe('public authoring-disabled configuration', () => {
  it('is refused before any tool ever runs, regardless of what the model requests', () => {
    expect(() =>
      buildPackAuthoringAgent({
        model: new ScriptedModelProvider({
          beats: { turn: [{ toolCalls: [{ name: 'pack_publish', input: {} }] }] },
        }),
        ctx,
        authoringEnabled: false,
      }),
    ).toThrow(AuthoringDisabledError);
    // No agent was ever constructed, so no tool call could ever have run.
    expect(registry.list()).toEqual([]);
  });
});
