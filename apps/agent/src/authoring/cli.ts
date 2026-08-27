/**
 * `pnpm pax pack:author` -- pack-authoring.md: "The initial authoring entry
 * point is `pnpm pax pack:author`. A graphical Pack Studio, marketplace,
 * arbitrary composition, and multi-tenant publishing are not part of the
 * hackathon build."
 *
 * Judgment call (documented per CLAUDE.md's instruction to make the
 * smallest reasonable call on a genuine spec ambiguity rather than guess
 * silently or over-build): the spec does not say how interactive this entry
 * point must be. A real interactive terminal prompt loop (readline,
 * multi-turn back-and-forth with a live model) is a materially larger,
 * separately-scoped feature -- and an interactive session is inherently hard
 * to make deterministic/testable in CI. This CLI is instead a **real,
 * bounded, scripted session runner**: it reads one JSON "answers" file
 * (`--answers <path>`) carrying the already-decided manifest and scenario
 * files (exactly what a human/model authoring conversation would have
 * converged on), and drives the same six bounded tools
 * (`pack_catalog -> pack_scaffold -> pack_validate -> pack_test -> pack_diff
 * -> [pack_publish]`) a real interactive session would. When `--answers` is
 * omitted, it runs a built-in, fully deterministic demonstration using the
 * real `apartment-hunt` compiler/conformance fixture manifest
 * (`@pax/packs`'s `src/fixtures/manifest.js`) plus four scenario files
 * covering the required success/incomplete_evidence/steering/human_boundary
 * kinds -- so the command is genuinely runnable out of the box, with zero
 * network access, and proves the full pipeline end to end without requiring
 * a hand-authored answers file first.
 *
 * Publication is opt-in and requires an explicit human identifier
 * (`--publish --confirmed-by <name>`) -- the CLI never publishes merely
 * because validation and tests passed; that would defeat `pack_publish`'s
 * own confirmation requirement in spirit even while satisfying it in form.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type PaxConfig, type RawEnv } from '../config.js';
import { PackRegistry } from '@pax/packs';
import { validCatalog } from '@pax/packs/src/fixtures/manifest.js';
import { buildInstalledCapabilityCatalog } from './catalog.js';
import { DEMO_AUTHORING_ANSWERS, type AuthoringAnswers } from './demo-answers.js';
import type { AuthoringToolContext } from './index.js';
import { packCatalog } from './catalog.js';
import { packScaffold } from './scaffold.js';
import { packValidate } from './validate.js';
import { packTest } from './test.js';
import { packDiff } from './diff.js';
import { packPublish, PackPublishRejectedError } from './publish.js';

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export interface CliArgs {
  readonly command: string | undefined;
  readonly draftId: string;
  readonly draftRoot: string;
  readonly answersPath: string | undefined;
  readonly publish: boolean;
  readonly confirmedBy: string | undefined;
}

function argValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
  return {
    command: argv[0],
    draftId: argValue(argv, '--draft-id') ?? 'apartment-hunt',
    draftRoot: argValue(argv, '--draft-root') ?? join('.pax-data', 'pack-drafts'),
    answersPath: argValue(argv, '--answers'),
    publish: argv.includes('--publish'),
    confirmedBy: argValue(argv, '--confirmed-by'),
  };
}

function loadAnswers(answersPath: string | undefined): AuthoringAnswers {
  if (answersPath === undefined) {
    return DEMO_AUTHORING_ANSWERS;
  }
  const raw = readFileSync(answersPath, 'utf8');
  return JSON.parse(raw) as AuthoringAnswers;
}

/**
 * The installed capability catalog this CLI validates authored drafts
 * against. Judgment call: this process has no live application capability
 * registry to query (that lives in the running Express service, out of a
 * standalone CLI's reach), so it unions the same real fixture catalog the
 * compiler/conformance suite already treats as "installed"
 * (`@pax/packs/src/fixtures/manifest.js`'s `validCatalog()`) with whatever
 * this CLI session has itself published. A real production deployment would
 * source this from the live application's own capability registry instead.
 */
function buildCliCatalog(registry: PackRegistry) {
  const installed = buildInstalledCapabilityCatalog(registry);
  const seen = new Set(installed.entries.map((entry) => `${entry.kind}:${entry.id}`));
  const merged = [...installed.entries];
  for (const entry of validCatalog().entries) {
    const key = `${entry.kind}:${entry.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(entry);
    }
  }
  return { entries: merged };
}

export interface RunPackAuthorCliOptions {
  readonly env?: RawEnv;
  readonly io?: CliIo;
  readonly registry?: PackRegistry;
  readonly clock?: { now(): string };
  readonly loadConfigFn?: (env: RawEnv) => PaxConfig;
}

/** Runs `pnpm pax pack:author`, returning the process exit code. Fully dependency-injected (env, stdout/stderr, registry, clock) so it is directly unit-testable without spawning a subprocess or touching real `process.env`. */
export function runPackAuthorCli(
  argv: readonly string[],
  options: RunPackAuthorCliOptions = {},
): number {
  const io = options.io ?? { stdout: console.log, stderr: console.error };
  const args = parseCliArgs(argv);

  if (args.command !== 'pack:author') {
    io.stderr(
      `Unknown pax command "${args.command ?? '(none)'}". The only supported command is "pack:author".`,
    );
    return 1;
  }

  const load = options.loadConfigFn ?? loadConfig;
  const config = load(options.env ?? process.env);
  if (!config.authoringEnabled) {
    io.stderr(
      'Pack authoring is disabled (PAX_AUTHORING_ENABLED=false). Set PAX_AUTHORING_ENABLED=true to ' +
        'run "pnpm pax pack:author" locally. It stays disabled in the public hackathon deployment.',
    );
    return 1;
  }

  const registry = options.registry ?? new PackRegistry();
  const clock = options.clock ?? { now: () => new Date().toISOString() };
  const ctx: AuthoringToolContext = {
    draftRoot: args.draftRoot,
    catalog: buildCliCatalog(registry),
    registry,
    clock,
  };

  const answers = loadAnswers(args.answersPath);

  io.stdout(`[pax pack:author] draft "${args.draftId}" at "${ctx.draftRoot}"`);

  const catalog = packCatalog(ctx.catalog);
  io.stdout(`[pack_catalog] ${catalog.entries.length} installed capability entries.`);

  packScaffold(ctx.draftRoot, {
    draftId: args.draftId,
    files: [
      { relativePath: 'pack.json', content: JSON.stringify(answers.manifest, null, 2) },
      ...(answers.readme !== undefined
        ? [{ relativePath: 'README.md', content: answers.readme }]
        : []),
      ...answers.scenarios.map((scenario) => ({
        relativePath: `scenarios/${scenario.id}.json`,
        content: JSON.stringify(scenario, null, 2),
      })),
    ],
  });
  io.stdout('[pack_scaffold] wrote pack.json, README.md (if provided), and scenario files.');

  const validation = packValidate(ctx.draftRoot, ctx.catalog, ctx.clock, { draftId: args.draftId });
  io.stdout(`[pack_validate] ${validation.ok ? 'PASSED' : 'FAILED'}`);
  for (const issue of validation.issues) {
    io.stdout(`  - [${issue.step}] ${issue.message}`);
  }

  const testResult = packTest(ctx.draftRoot, ctx.catalog, ctx.clock, { draftId: args.draftId });
  io.stdout(`[pack_test] ${testResult.ok ? 'PASSED' : 'FAILED'}`);
  for (const issue of testResult.issues) {
    io.stdout(`  - ${issue}`);
  }

  try {
    const diff = packDiff(ctx.draftRoot, ctx.catalog, ctx.registry, ctx.clock, {
      draftId: args.draftId,
    });
    io.stdout(
      `[pack_diff] installed version: ${diff.installedVersion ?? '(none)'}; ` +
        `compiledHash changed: ${String(diff.compiledHashChanged)}`,
    );
  } catch {
    io.stdout('[pack_diff] draft does not compile cleanly yet; skipped.');
  }

  if (!testResult.ok) {
    io.stderr('[pax pack:author] draft did not pass pack_test; not eligible for publish.');
    return 1;
  }

  if (!args.publish) {
    io.stdout(
      '[pax pack:author] draft is ready. Rerun with --publish --confirmed-by "<your name>" to publish it.',
    );
    return 0;
  }

  if (args.confirmedBy === undefined) {
    io.stderr('[pax pack:author] --publish requires --confirmed-by "<your name>".');
    return 1;
  }

  try {
    const published = packPublish(ctx.draftRoot, ctx.catalog, ctx.registry, ctx.clock, {
      draftId: args.draftId,
      actor: 'human',
      confirmed: true,
      confirmedBy: args.confirmedBy,
    });
    io.stdout(`[pack_publish] published ${published.identity.id}@${published.identity.version}.`);
    return 0;
  } catch (error) {
    if (error instanceof PackPublishRejectedError) {
      io.stderr(`[pack_publish] rejected: ${error.message}`);
      for (const reason of error.reasons) io.stderr(`  - ${reason}`);
      return 1;
    }
    throw error;
  }
}
