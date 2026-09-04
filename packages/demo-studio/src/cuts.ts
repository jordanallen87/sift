import { z } from 'zod';
import { RecordingDefectError } from './errors.js';

const BeatLabelSchema = z.union([z.string().trim().min(1), z.number()]).transform(String);

export const CutMarkSchema = z
  .object({
    t: z.number().min(0),
    beat: BeatLabelSchema,
  })
  // Recorders attach their own bookkeeping to a mark (take number, selector,
  // retry count). Demo Studio owns `t` and `beat` and leaves the rest intact.
  .passthrough();

export const CutsSchema = z
  .object({
    marks: z.array(CutMarkSchema).min(1),
    /**
     * Recorders spell `usable` two ways: a boolean "this take is worth
     * reviewing", or the last second still worth reviewing (everything after it
     * is a fumbled retake left in the file). Both answer the same question, so
     * both are accepted and normalized rather than forcing a recorder change.
     */
    usable: z.union([z.boolean(), z.number().min(0)]),
  })
  .passthrough();

export type CutMark = z.infer<typeof CutMarkSchema>;
export type Cuts = z.infer<typeof CutsSchema>;

export function parseCuts(value: unknown): Cuts {
  return CutsSchema.parse(value);
}

export interface NormalizedCuts {
  usable: boolean;
  /** Present only when the recorder expressed `usable` as a timestamp. */
  usableThroughSeconds: number | undefined;
  marks: readonly { beat: string; atSeconds: number }[];
}

/** Pure: collapses the two `usable` spellings and puts marks in playback order. */
export function normalizeCuts(cuts: Cuts): NormalizedCuts {
  const marks = [...cuts.marks]
    .map((mark) => ({ beat: mark.beat, atSeconds: mark.t }))
    .sort((left, right) => left.atSeconds - right.atSeconds);

  if (typeof cuts.usable === 'boolean') {
    return { usable: cuts.usable, usableThroughSeconds: undefined, marks };
  }
  return { usable: cuts.usable > 0, usableThroughSeconds: cuts.usable, marks };
}

export interface BeatWindow {
  beat: string;
  /** Position in cut order. A beat label may legitimately recur across takes. */
  index: number;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Pure: turns cut marks into the half-open windows every other review step
 * addresses — which frame belongs to which beat, which silence lands in which
 * beat, which beat a spoken phrase had to fall inside.
 *
 * A mark past the end of the video is treated as a hard defect rather than
 * clamped. It means the cuts file and the render disagree, and reviewing beat 5
 * of one take against beat 5 of another is exactly the kind of quiet mismatch
 * that ships a video recorded against the wrong build.
 */
export function deriveBeatWindows(cuts: Cuts, durationSeconds: number): BeatWindow[] {
  const normalized = normalizeCuts(cuts);

  if (!normalized.usable) {
    throw new RecordingDefectError(
      'unusable-take',
      'The recorder marked this take unusable; re-record before reviewing it.',
    );
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RecordingDefectError(
      'unknown-duration',
      'Beat windows need a positive video duration; probe the recording first.',
    );
  }

  const reviewableEnd = Math.min(
    durationSeconds,
    normalized.usableThroughSeconds ?? durationSeconds,
  );
  const windows: BeatWindow[] = [];

  for (const [index, mark] of normalized.marks.entries()) {
    if (mark.atSeconds >= reviewableEnd) {
      throw new RecordingDefectError(
        'cuts-do-not-match-video',
        `Cut mark for beat "${mark.beat}" at ${mark.atSeconds}s falls outside the ${reviewableEnd}s of reviewable video. The cuts file does not belong to this render.`,
      );
    }
    const endSeconds = normalized.marks[index + 1]?.atSeconds ?? reviewableEnd;
    if (endSeconds <= mark.atSeconds) {
      throw new RecordingDefectError(
        'cuts-do-not-match-video',
        `Beat "${mark.beat}" at ${mark.atSeconds}s has no duration; two cut marks share a timestamp.`,
      );
    }
    windows.push({ beat: mark.beat, index, startSeconds: mark.atSeconds, endSeconds });
  }

  return windows;
}
