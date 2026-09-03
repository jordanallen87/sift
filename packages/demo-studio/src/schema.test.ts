import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDemoManifest, validateTimeline } from './schema.js';

const validManifest = {
  schemaVersion: 1,
  project: 'Example',
  hardCapSeconds: 180,
  canvas: { width: 1920, height: 1080, fps: 30 },
  segments: [
    {
      id: 'open',
      startSeconds: 0,
      targetSeconds: 10,
      sourceType: 'browser',
      source: 'recordings/open.mov',
      narration: 'One concise promise.',
      annotations: [
        {
          id: 'claim',
          kind: 'callout',
          text: 'Shared state',
          start: { phrase: 'concise promise' },
          end: { seconds: 8 },
          anchor: { kind: 'frame', x: 0.2, y: 0.2, width: 0.3, height: 0.1 },
        },
      ],
    },
    {
      id: 'proof',
      startSeconds: 10,
      targetSeconds: 15,
      sourceType: 'video',
      source: 'recordings/proof.mov',
      narration: 'Then show the proof.',
    },
  ],
};

describe('DemoManifestSchema and timeline validation', () => {
  it('parses a narration-led manifest with a phrase-anchored annotation', () => {
    const parsed = parseDemoManifest(validManifest);

    expect(parsed.segments[0]?.annotations?.[0]?.start).toEqual({ phrase: 'concise promise' });
    expect(validateTimeline(parsed)).toEqual([]);
  });

  it('accepts the existing WebMCP edit list while it is migrated incrementally', () => {
    const manifestPath = fileURLToPath(
      new URL('../../../docs/hackathons/webmcp/demo/manifest.json', import.meta.url),
    );

    expect(() => parseDemoManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))).not.toThrow();
  });

  it('reports every semantic issue together', () => {
    const parsed = parseDemoManifest({
      ...validManifest,
      hardCapSeconds: 20,
      segments: [
        validManifest.segments[0],
        {
          ...validManifest.segments[1],
          startSeconds: 9,
          targetSeconds: 15,
          annotations: [
            {
              id: 'unsafe',
              kind: 'spotlight',
              start: { seconds: 7 },
              end: { seconds: 5 },
              anchor: { kind: 'frame', x: 0, y: 0, width: 0.4, height: 0.3 },
            },
          ],
        },
      ],
    });

    expect(validateTimeline(parsed)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('overlaps'),
        expect.stringContaining('exceeds the hard cap'),
        expect.stringContaining('ends before it starts'),
        expect.stringContaining('outside the title-safe area'),
      ]),
    );
  });
});
