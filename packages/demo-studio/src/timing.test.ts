import { describe, expect, it } from 'vitest';
import { resolveAnnotationTiming, resolveNarrationAnchor } from './timing.js';
import type { Annotation } from './schema.js';

const transcript = 'ChatGPT configures the workspace.';
const alignment = {
  characters: Array.from(transcript),
  character_start_times_seconds: Array.from(
    { length: transcript.length },
    (_, index) => index / 10,
  ),
  character_end_times_seconds: Array.from(
    { length: transcript.length },
    (_, index) => (index + 1) / 10,
  ),
};

describe('narration timing', () => {
  it('resolves phrase and repeated-word anchors to exact speech boundaries', () => {
    expect(resolveNarrationAnchor({ phrase: 'configures the workspace' }, alignment)).toEqual({
      startSeconds: 0.8,
      endSeconds: 3.2,
    });
    expect(resolveNarrationAnchor({ word: 'the', occurrence: 1 }, alignment)).toEqual({
      startSeconds: 1.9,
      endSeconds: 2.2,
    });
  });

  it('converts aligned annotation timing to inclusive frame ranges', () => {
    const annotation: Annotation = {
      id: 'workspace',
      kind: 'spotlight',
      start: { phrase: 'configures the workspace' },
      end: { seconds: 3.4 },
      anchor: { kind: 'frame', x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
    };

    expect(resolveAnnotationTiming(annotation, alignment, 30)).toEqual({
      startSeconds: 0.8,
      endSeconds: 3.4,
      startFrame: 24,
      endFrame: 102,
    });
  });

  it('fails explicitly when narration copy no longer contains an anchor phrase', () => {
    expect(() => resolveNarrationAnchor({ phrase: 'missing phrase' }, alignment)).toThrow(
      'could not find phrase',
    );
  });
});
