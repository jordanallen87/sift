import type { Annotation, TimeAnchor } from './schema.js';

/**
 * The timing payload returned by ElevenLabs' speech-with-timestamps endpoint.
 * The shape is intentionally provider-neutral so an alignment produced by a
 * different TTS service can use the same renderer.
 */
export interface SpeechAlignment {
  characters: readonly string[];
  character_start_times_seconds: readonly number[];
  character_end_times_seconds: readonly number[];
}

export interface ResolvedNarrationAnchor {
  startSeconds: number;
  endSeconds: number;
}

export interface ResolvedAnnotationTiming extends ResolvedNarrationAnchor {
  startFrame: number;
  endFrame: number;
}

function validateAlignment(alignment: SpeechAlignment): void {
  const count = alignment.characters.length;
  if (
    count === 0 ||
    alignment.character_start_times_seconds.length !== count ||
    alignment.character_end_times_seconds.length !== count
  ) {
    throw new Error('Narration alignment must contain equally sized character and timing arrays.');
  }
}

function normalizedText(text: string): string {
  return text.toLocaleLowerCase();
}

function boundaryAt(
  alignment: SpeechAlignment,
  startIndex: number,
  endExclusive: number,
): ResolvedNarrationAnchor {
  const start = alignment.character_start_times_seconds[startIndex];
  const end = alignment.character_end_times_seconds[endExclusive - 1];
  if (start === undefined || end === undefined) {
    throw new Error('Narration alignment did not include timing for the requested text.');
  }
  return { startSeconds: start, endSeconds: end };
}

function resolveSearch(
  anchor: Extract<TimeAnchor, { phrase: string }> | Extract<TimeAnchor, { word: string }>,
  alignment: SpeechAlignment,
): ResolvedNarrationAnchor {
  const transcript = alignment.characters.join('');
  const needle = 'phrase' in anchor ? anchor.phrase : anchor.word;
  const normalizedTranscript = normalizedText(transcript);
  const normalizedNeedle = normalizedText(needle);
  const wantedOccurrence = 'word' in anchor ? (anchor.occurrence ?? 1) : 1;
  let searchFrom = 0;
  let foundAt = -1;

  for (let occurrence = 0; occurrence < wantedOccurrence; occurrence += 1) {
    foundAt = normalizedTranscript.indexOf(normalizedNeedle, searchFrom);
    if (foundAt < 0) {
      const label = 'phrase' in anchor ? 'phrase' : 'word';
      throw new Error(
        `Narration alignment could not find ${label} "${needle}" (occurrence ${wantedOccurrence}).`,
      );
    }
    searchFrom = foundAt + normalizedNeedle.length;
  }
  return boundaryAt(alignment, foundAt, foundAt + normalizedNeedle.length);
}

/** Resolves a static seconds anchor or a word/phrase anchor using generated narration alignment. */
export function resolveNarrationAnchor(
  anchor: TimeAnchor,
  alignment: SpeechAlignment,
): ResolvedNarrationAnchor {
  if ('seconds' in anchor) return { startSeconds: anchor.seconds, endSeconds: anchor.seconds };
  validateAlignment(alignment);
  return resolveSearch(anchor, alignment);
}

/**
 * Resolves one annotation into seconds and composition-relative frames. Frame
 * boundaries are rounded so generated overlays and captions share the exact
 * same 30fps (or manifest-specified) edit timeline.
 */
export function resolveAnnotationTiming(
  annotation: Annotation,
  alignment: SpeechAlignment,
  fps: number,
): ResolvedAnnotationTiming {
  if (!Number.isInteger(fps) || fps <= 0) {
    throw new Error('Frames per second must be a positive integer.');
  }
  const start = resolveNarrationAnchor(annotation.start, alignment).startSeconds;
  const end = resolveNarrationAnchor(annotation.end, alignment).endSeconds;
  if (end < start) throw new Error(`Annotation "${annotation.id}" ends before it starts.`);
  return {
    startSeconds: start,
    endSeconds: end,
    startFrame: Math.round(start * fps),
    endFrame: Math.round(end * fps),
  };
}
