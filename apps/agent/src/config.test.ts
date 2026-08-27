import { describe, expect, it } from 'vitest';
import { loadConfig, ConfigError } from './config.js';

// Defaults asserted here are the literal values documented in
// `.env.example` (root of the repo), per this task's instruction to treat
// that file as authoritative for names/defaults.
const DEFAULTS = {
  executionTarget: 'local',
  dataDir: '.pax-data',
  authoringEnabled: false,
  debugEnabled: true,
  debugPayloadMode: 'metadata-only',
  debugRetentionDays: 7,
  modelId: 'global.anthropic.claude-sonnet-4-6',
  awsRegion: 'us-east-1',
  publicOrigin: undefined,
} as const;

describe('loadConfig', () => {
  it('applies every .env.example-documented default when no env vars are set', () => {
    const config = loadConfig({});
    expect(config).toEqual(DEFAULTS);
  });

  it('reads and coerces every supported variable from a raw env-like object', () => {
    const config = loadConfig({
      PAX_EXECUTION_TARGET: 'agentcore',
      PAX_DATA_DIR: '/data',
      PAX_AUTHORING_ENABLED: 'true',
      PAX_DEBUG_ENABLED: 'false',
      PAX_DEBUG_PAYLOAD_MODE: 'fixture-full',
      PAX_DEBUG_RETENTION_DAYS: '14',
      PAX_MODEL_ID: 'global.anthropic.claude-sonnet-4-7',
      AWS_REGION: 'eu-west-1',
      PAX_PUBLIC_ORIGIN: 'https://pax.example.com',
    });

    expect(config).toEqual({
      executionTarget: 'agentcore',
      dataDir: '/data',
      authoringEnabled: true,
      debugEnabled: false,
      debugPayloadMode: 'fixture-full',
      debugRetentionDays: 14,
      modelId: 'global.anthropic.claude-sonnet-4-7',
      awsRegion: 'eu-west-1',
      publicOrigin: 'https://pax.example.com',
    });
  });

  it('treats an empty-string PAX_MODEL_ID as unset and applies the default', () => {
    const config = loadConfig({ PAX_MODEL_ID: '' });
    expect(config.modelId).toBe(DEFAULTS.modelId);
  });

  it('treats an empty-string PAX_PUBLIC_ORIGIN as same-origin (undefined)', () => {
    const config = loadConfig({ PAX_PUBLIC_ORIGIN: '' });
    expect(config.publicOrigin).toBeUndefined();
  });

  it('throws a ConfigError listing every invalid variable at once, not just the first', () => {
    let caught: unknown;
    try {
      loadConfig({
        PAX_EXECUTION_TARGET: 'not-a-target',
        PAX_DEBUG_PAYLOAD_MODE: 'not-a-mode',
        PAX_DEBUG_RETENTION_DAYS: 'not-a-number',
        AWS_REGION: '',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConfigError);
    const message = (caught as ConfigError).message;
    expect(message).toContain('PAX_EXECUTION_TARGET');
    expect(message).toContain('PAX_DEBUG_PAYLOAD_MODE');
    expect(message).toContain('PAX_DEBUG_RETENTION_DAYS');
    expect(message).toContain('AWS_REGION');
  });

  it('rejects a retention-days value above the 30-day cap from debugging-and-observability.md', () => {
    expect(() => loadConfig({ PAX_DEBUG_RETENTION_DAYS: '31' })).toThrow(ConfigError);
  });

  it('rejects an invalid PAX_PUBLIC_ORIGIN that is not a valid URL', () => {
    expect(() => loadConfig({ PAX_PUBLIC_ORIGIN: 'not a url' })).toThrow(ConfigError);
  });

  it('rejects a non-boolean-shaped PAX_AUTHORING_ENABLED value', () => {
    expect(() => loadConfig({ PAX_AUTHORING_ENABLED: 'yes-please' })).toThrow(ConfigError);
  });
});
