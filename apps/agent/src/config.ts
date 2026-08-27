/**
 * Zod-validated Pax service configuration loader.
 *
 * Reads the nine environment variables documented in the repo root
 * `.env.example` (`PAX_EXECUTION_TARGET`, `PAX_DATA_DIR`,
 * `PAX_AUTHORING_ENABLED`, `PAX_DEBUG_ENABLED`, `PAX_DEBUG_PAYLOAD_MODE`,
 * `PAX_DEBUG_RETENTION_DAYS`, `PAX_MODEL_ID`, `AWS_REGION`,
 * `PAX_PUBLIC_ORIGIN`), applies exactly the defaults shown there, and
 * throws one `ConfigError` listing every invalid/missing variable at once.
 *
 * `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS` are documented
 * in `.env.example` as an optional passthrough to Strands's own OTEL setup
 * ("enables an external OTEL exporter without changing Pax's own
 * SQLite-backed event persistence") and are out of this task's explicit
 * variable list; they are not validated here.
 *
 * `PORT` (used by `server.ts` to choose a listen port) is deliberately not
 * part of this schema: it is not documented in `.env.example` as
 * Pax-specific configuration and is instead a standard Node/Railway
 * server-bootstrapping convention (Railway injects `PORT` automatically),
 * handled directly in `server.ts`.
 *
 * Zod is imported the same way `@pax/contracts` does (`import { z } from
 * 'zod'`), pinned to the same `^4.4.3` already installed for that package
 * (see `apps/agent/package.json`).
 */
import { z } from 'zod';

export const EXECUTION_TARGETS = ['local', 'agentcore'] as const;
export type ExecutionTarget = (typeof EXECUTION_TARGETS)[number];

export const DEBUG_PAYLOAD_MODES = ['fixture-full', 'metadata-only'] as const;
export type DebugPayloadMode = (typeof DEBUG_PAYLOAD_MODES)[number];

/** Raw environment shape this loader reads (a subset of `process.env`). */
export interface RawEnv {
  PAX_EXECUTION_TARGET?: string | undefined;
  PAX_DATA_DIR?: string | undefined;
  PAX_AUTHORING_ENABLED?: string | undefined;
  PAX_DEBUG_ENABLED?: string | undefined;
  PAX_DEBUG_PAYLOAD_MODE?: string | undefined;
  PAX_DEBUG_RETENTION_DAYS?: string | undefined;
  PAX_MODEL_ID?: string | undefined;
  AWS_REGION?: string | undefined;
  PAX_PUBLIC_ORIGIN?: string | undefined;
}

export interface PaxConfig {
  executionTarget: ExecutionTarget;
  dataDir: string;
  authoringEnabled: boolean;
  debugEnabled: boolean;
  debugPayloadMode: DebugPayloadMode;
  /** Days of runtime/debug telemetry retained. 1-30 inclusive; docs/specs/debugging-and-observability.md: "cannot exceed 30 in this build." */
  debugRetentionDays: number;
  modelId: string;
  awsRegion: string;
  /** Same-origin (undefined/unset) unless a separate deployed origin is introduced. */
  publicOrigin?: string;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid Pax configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** `''` and `undefined` both mean "not set" for optional string env vars. */
function emptyToUndefined(value: string | undefined): string | undefined {
  return value === '' ? undefined : value;
}

/** Parses a `'true'`/`'false'` env string; any other non-empty value fails validation instead of silently coercing. */
const booleanFromEnvString = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value; // left as-is (a non-boolean string) so z.boolean() reports a clear failure
}, z.boolean());

const integerFromEnvString = (min: number, max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value; // non-numeric strings fail z.number() cleanly
  }, z.number().int().min(min).max(max));

const ConfigSchema = z.object({
  PAX_EXECUTION_TARGET: z.enum(EXECUTION_TARGETS).default('local'),
  PAX_DATA_DIR: z.string().min(1, 'must not be empty').default('.pax-data'),
  PAX_AUTHORING_ENABLED: booleanFromEnvString.default(false),
  PAX_DEBUG_ENABLED: booleanFromEnvString.default(true),
  PAX_DEBUG_PAYLOAD_MODE: z.enum(DEBUG_PAYLOAD_MODES).default('metadata-only'),
  // debugging-and-observability.md: "PAX_DEBUG_RETENTION_DAYS defaults to 7
  // and cannot exceed 30 in this build." The spec states only the ceiling;
  // a floor of 1 is this loader's own judgment call (a non-positive
  // retention window is not a meaningful configuration).
  PAX_DEBUG_RETENTION_DAYS: integerFromEnvString(1, 30).default(7),
  PAX_MODEL_ID: z
    .preprocess(emptyToUndefined, z.string().min(1).optional())
    .default('global.anthropic.claude-sonnet-4-6'),
  AWS_REGION: z.string().min(1, 'must not be empty').default('us-east-1'),
  PAX_PUBLIC_ORIGIN: z.preprocess(emptyToUndefined, z.url().optional()),
});

/**
 * Loads and validates Pax service configuration from a raw env-like object
 * (defaults to `process.env`). Accepts an explicit `env` argument so tests
 * never need to mutate global `process.env` state.
 */
export function loadConfig(env: RawEnv = process.env): PaxConfig {
  const result = ConfigSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join('.') || '(config)';
      const received = 'input' in issue ? String((issue as { input?: unknown }).input) : undefined;
      const receivedSuffix =
        received !== undefined ? ` (received: ${JSON.stringify(received)})` : '';
      return `${path}: ${issue.message}${receivedSuffix}`;
    });
    throw new ConfigError(issues);
  }

  const parsed = result.data;
  const config: PaxConfig = {
    executionTarget: parsed.PAX_EXECUTION_TARGET,
    dataDir: parsed.PAX_DATA_DIR,
    authoringEnabled: parsed.PAX_AUTHORING_ENABLED,
    debugEnabled: parsed.PAX_DEBUG_ENABLED,
    debugPayloadMode: parsed.PAX_DEBUG_PAYLOAD_MODE,
    debugRetentionDays: parsed.PAX_DEBUG_RETENTION_DAYS,
    modelId: parsed.PAX_MODEL_ID ?? 'global.anthropic.claude-sonnet-4-6',
    awsRegion: parsed.AWS_REGION,
  };
  if (parsed.PAX_PUBLIC_ORIGIN !== undefined) {
    config.publicOrigin = parsed.PAX_PUBLIC_ORIGIN;
  }
  return config;
}
