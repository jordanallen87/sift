import { describe, expect, it } from 'vitest';
import { parseDemoManifest } from './schema.js';
import { renderAnnotationDocument } from './render-annotations.js';

const manifest = parseDemoManifest({
  schemaVersion: 1,
  project: 'Example',
  hardCapSeconds: 30,
  canvas: { width: 1920, height: 1080, fps: 30 },
  segments: [
    {
      id: 'proof',
      startSeconds: 0,
      targetSeconds: 10,
      sourceType: 'video',
      source: 'proof.mov',
      annotations: [
        {
          id: 'focus',
          kind: 'spotlight',
          start: { seconds: 1 },
          end: { seconds: 3 },
          anchor: { kind: 'frame', x: 0.2, y: 0.3, width: 0.25, height: 0.1 },
        },
        {
          id: 'label',
          kind: 'callout',
          text: '<Shared state>',
          start: { seconds: 2 },
          end: { seconds: 5 },
          anchor: { kind: 'frame', x: 0.4, y: 0.4, width: 0.2, height: 0.1 },
        },
      ],
    },
  ],
});

describe('renderAnnotationDocument', () => {
  it('renders deterministic, escaped layers with normalized geometry and timing', () => {
    const document = renderAnnotationDocument(manifest, 'proof');

    expect(document).toContain('data-annotation-id="focus"');
    expect(document).toContain('--x:20%');
    expect(document).toContain('--start:1s');
    expect(document).toContain('&lt;Shared state&gt;');
    expect(document).not.toContain('<Shared state>');
  });

  it('retains unresolved narration anchors for a later alignment pass', () => {
    const withPhrase = parseDemoManifest({
      ...manifest,
      segments: [
        {
          ...manifest.segments[0],
          annotations: [
            {
              id: 'phrase',
              kind: 'blur',
              start: { phrase: 'agent configures' },
              end: { seconds: 4 },
              anchor: { kind: 'frame', x: 0.2, y: 0.3, width: 0.25, height: 0.1 },
            },
          ],
        },
      ],
    });

    expect(renderAnnotationDocument(withPhrase, 'proof')).toContain(
      'data-start-anchor="phrase:agent configures"',
    );
  });

  it('fails when a requested segment does not exist', () => {
    expect(() => renderAnnotationDocument(manifest, 'missing')).toThrow('Unknown segment');
  });
});
