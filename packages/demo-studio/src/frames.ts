import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BeatWindow } from './cuts.js';
import { ExternalToolError } from './errors.js';
import type { ToolRunner } from './tool-runner.js';

export type FrameReason = 'beat-open' | 'beat-dwell';

export interface FrameSelection {
  beat: string;
  /** Index of the beat window this frame was taken from. */
  index: number;
  reason: FrameReason;
  atSeconds: number;
  fileName: string;
}

export interface FramePlanOptions {
  /**
   * How long after a cut the frame is taken. The frame exactly on a cut is
   * usually mid-transition — a fade, a scroll, a half-drawn panel — so it is
   * evidence of nothing. A short settle lands on the composed first look.
   */
  settleSeconds?: number;
  /** Also take the window midpoint: the frame a viewer rests on longest. */
  includeDwellFrames?: boolean;
  /** Below this window length the settle and dwell frames would be near-identical. */
  minDwellWindowSeconds?: number;
}

export const DEFAULT_SETTLE_SECONDS = 0.4;
export const DEFAULT_MIN_DWELL_WINDOW_SECONDS = 2;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Deterministic, filesystem-safe stem so a re-run overwrites rather than accumulates. */
function slug(beat: string): string {
  const cleaned = beat
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' ? 'beat' : cleaned;
}

/**
 * Pure: chooses which frames are worth looking at.
 *
 * An even sample answers "what does the video contain"; this answers "what did
 * the viewer actually see while a specific claim was on the soundtrack", which
 * is the only question a review can act on. Every selected frame is therefore
 * anchored to a beat rather than to a stopwatch.
 */
export function planBeatFrames(
  windows: readonly BeatWindow[],
  options: FramePlanOptions = {},
): FrameSelection[] {
  const settleSeconds = options.settleSeconds ?? DEFAULT_SETTLE_SECONDS;
  const includeDwellFrames = options.includeDwellFrames ?? true;
  const minDwellWindowSeconds = options.minDwellWindowSeconds ?? DEFAULT_MIN_DWELL_WINDOW_SECONDS;

  if (settleSeconds < 0) throw new Error('settleSeconds must not be negative.');

  const selections: FrameSelection[] = [];

  for (const window of windows) {
    const length = window.endSeconds - window.startSeconds;
    const ordinal = String(window.index + 1).padStart(2, '0');
    // A beat shorter than the settle has no composed moment to wait for, so the
    // midpoint is the best available representative of it.
    const openOffset = length <= settleSeconds ? length / 2 : settleSeconds;

    selections.push({
      beat: window.beat,
      index: window.index,
      reason: 'beat-open',
      atSeconds: round(window.startSeconds + openOffset),
      fileName: `${ordinal}-${slug(window.beat)}-open.png`,
    });

    if (includeDwellFrames && length >= minDwellWindowSeconds) {
      selections.push({
        beat: window.beat,
        index: window.index,
        reason: 'beat-dwell',
        atSeconds: round(window.startSeconds + length / 2),
        fileName: `${ordinal}-${slug(window.beat)}-dwell.png`,
      });
    }
  }

  return selections;
}

export interface ExtractedFrame extends FrameSelection {
  filePath: string;
}

export function frameExtractionArgs(
  videoPath: string,
  atSeconds: number,
  filePath: string,
): readonly string[] {
  return [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    // Input seek: fast, and accurate in modern FFmpeg builds.
    '-ss',
    String(atSeconds),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-update',
    '1',
    filePath,
  ];
}

/**
 * I/O edge: writes one PNG per planned frame. Runs sequentially so the output
 * order is stable and a long take does not spawn twenty ffmpeg processes at once.
 */
export async function extractFrames(
  videoPath: string,
  selections: readonly FrameSelection[],
  outputDir: string,
  runner: ToolRunner,
): Promise<ExtractedFrame[]> {
  await mkdir(outputDir, { recursive: true });
  const extracted: ExtractedFrame[] = [];

  for (const selection of selections) {
    const filePath = join(outputDir, selection.fileName);
    const result = await runner.run({
      tool: 'ffmpeg',
      args: frameExtractionArgs(videoPath, selection.atSeconds, filePath),
    });
    if (result.exitCode !== 0) {
      throw new ExternalToolError(
        'ffmpeg',
        `ffmpeg exited ${result.exitCode} extracting ${selection.fileName} at ${selection.atSeconds}s: ${result.stderr.trim() || 'no diagnostics'}`,
      );
    }
    extracted.push({ ...selection, filePath });
  }

  return extracted;
}
