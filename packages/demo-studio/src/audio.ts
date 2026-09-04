import type { BeatWindow } from './cuts.js';
import { ExternalToolError } from './errors.js';
import type { ToolRunner } from './tool-runner.js';

export interface LoudnessSummary {
  meanVolumeDb: number;
  maxVolumeDb: number;
}

export interface SilenceInterval {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

const MEAN_VOLUME = /mean_volume:\s*(-?\d+(?:\.\d+)?) dB/;
const MAX_VOLUME = /max_volume:\s*(-?\d+(?:\.\d+)?) dB/;
const SILENCE_START = /silence_start:\s*(-?\d+(?:\.\d+)?)/;
const SILENCE_END = /silence_end:\s*(-?\d+(?:\.\d+)?)/;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Pure: reads the two numbers `volumedetect` prints to stderr.
 *
 * Missing numbers are an {@link ExternalToolError}, not a default: "we asked
 * ffmpeg to measure the audio and it did not answer" is a gap in the review,
 * and reporting 0 dB there would invent a passing result.
 */
export function parseLoudness(ffmpegStderr: string): LoudnessSummary {
  const mean = MEAN_VOLUME.exec(ffmpegStderr);
  const max = MAX_VOLUME.exec(ffmpegStderr);
  if (mean?.[1] === undefined || max?.[1] === undefined) {
    throw new ExternalToolError(
      'ffmpeg',
      'ffmpeg did not report mean_volume/max_volume; the volumedetect filter produced no measurement.',
    );
  }
  return { meanVolumeDb: Number.parseFloat(mean[1]), maxVolumeDb: Number.parseFloat(max[1]) };
}

/**
 * Pure: pairs `silence_start` / `silence_end` lines into intervals.
 *
 * A run of silence that reaches the end of the file has no `silence_end` line,
 * so it is closed at the video duration. That case is not an edge case — a take
 * whose narration stops early is precisely the dead ending worth catching.
 */
export function parseSilences(
  ffmpegStderr: string,
  durationSeconds: number,
): readonly SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  let openStart: number | undefined;

  const close = (endSeconds: number): void => {
    if (openStart === undefined) return;
    const start = Math.max(0, openStart);
    const end = Math.max(start, endSeconds);
    intervals.push({
      startSeconds: round(start),
      endSeconds: round(end),
      durationSeconds: round(end - start),
    });
    openStart = undefined;
  };

  for (const line of ffmpegStderr.split('\n')) {
    const end = SILENCE_END.exec(line);
    if (end?.[1] !== undefined) {
      close(Number.parseFloat(end[1]));
      continue;
    }
    const start = SILENCE_START.exec(line);
    if (start?.[1] !== undefined) {
      // ffmpeg never nests these, but a truncated log could drop an end line;
      // closing the previous run keeps one lost line from swallowing the rest.
      close(Number.parseFloat(start[1]));
      openStart = Number.parseFloat(start[1]);
    }
  }
  close(durationSeconds);

  return intervals;
}

export interface AudioThresholds {
  /** At or above this peak, the mix is almost certainly clipped. */
  clippingCeilingDb: number;
  /** Below this average, the narration is too quiet against platform loudness norms. */
  quietFloorDb: number;
  /** Silence inside a single beat at or above this length is a dead beat. */
  deadBeatSeconds: number;
}

export const DEFAULT_AUDIO_THRESHOLDS: AudioThresholds = {
  clippingCeilingDb: -0.5,
  quietFloorDb: -30,
  deadBeatSeconds: 1.5,
};

export interface DeadBeat {
  beat: string;
  index: number;
  /** Longest single unbroken silence inside the beat — the figure the flag is based on. */
  longestSilenceSeconds: number;
  /** Every silent second in the beat added together, as context for the gap above. */
  silentSeconds: number;
  /** Fraction of the beat that is silent, so a 2s gap in a 3s beat outranks one in a 30s beat. */
  silentShare: number;
}

export interface AudioReport {
  ok: boolean;
  loudness: LoudnessSummary;
  clipping: boolean;
  tooQuiet: boolean;
  silences: readonly SilenceInterval[];
  deadBeats: readonly DeadBeat[];
  issues: readonly string[];
}

function overlapSeconds(window: BeatWindow, silence: SilenceInterval): number {
  const start = Math.max(window.startSeconds, silence.startSeconds);
  const end = Math.min(window.endSeconds, silence.endSeconds);
  return Math.max(0, end - start);
}

/**
 * Pure: turns raw measurements into a verdict, attributing every silence to the
 * beat it lands in. A total silence figure is not actionable; "beat 4 is silent
 * for 2.1 of its 3.0 seconds" tells the operator which take to redo.
 *
 * The flag is the longest *unbroken* gap, not the beat's total silence.
 * Ordinary narration pauses for breath every few seconds, so on a real
 * twenty-second beat the cumulative figure runs to several seconds and would
 * mark every healthy beat dead. One continuous gap is the thing a viewer
 * actually experiences as the audio having stopped.
 */
export function evaluateAudio(input: {
  loudness: LoudnessSummary;
  silences: readonly SilenceInterval[];
  windows: readonly BeatWindow[];
  thresholds?: Partial<AudioThresholds>;
}): AudioReport {
  const thresholds: AudioThresholds = { ...DEFAULT_AUDIO_THRESHOLDS, ...input.thresholds };
  const clipping = input.loudness.maxVolumeDb >= thresholds.clippingCeilingDb;
  const tooQuiet = input.loudness.meanVolumeDb < thresholds.quietFloorDb;

  const deadBeats: DeadBeat[] = [];
  for (const window of input.windows) {
    const length = window.endSeconds - window.startSeconds;
    const overlaps = input.silences.map((silence) => overlapSeconds(window, silence));
    const longestSilenceSeconds = overlaps.reduce((longest, span) => Math.max(longest, span), 0);
    const silentSeconds = overlaps.reduce((total, span) => total + span, 0);
    if (longestSilenceSeconds >= thresholds.deadBeatSeconds) {
      deadBeats.push({
        beat: window.beat,
        index: window.index,
        longestSilenceSeconds: round(longestSilenceSeconds),
        silentSeconds: round(silentSeconds),
        silentShare: length > 0 ? round(silentSeconds / length) : 1,
      });
    }
  }

  const issues: string[] = [];
  if (clipping) {
    issues.push(
      `Peak level ${input.loudness.maxVolumeDb} dB is at or above the ${thresholds.clippingCeilingDb} dB ceiling; the mix is likely clipped.`,
    );
  }
  if (tooQuiet) {
    issues.push(
      `Mean level ${input.loudness.meanVolumeDb} dB is below the ${thresholds.quietFloorDb} dB floor; the narration is too quiet.`,
    );
  }
  for (const deadBeat of deadBeats) {
    issues.push(
      `Beat "${deadBeat.beat}" (window ${deadBeat.index}) has an unbroken ${deadBeat.longestSilenceSeconds}s gap, and is silent for ${deadBeat.silentSeconds}s in total (${Math.round(deadBeat.silentShare * 100)}% of the beat).`,
    );
  }

  return {
    ok: issues.length === 0,
    loudness: input.loudness,
    clipping,
    tooQuiet,
    silences: input.silences,
    deadBeats,
    issues,
  };
}

export interface SilenceDetectOptions {
  /** Level below which ffmpeg counts a sample as silent. */
  noiseFloorDb?: number;
  /** Shortest run ffmpeg reports; below this, ordinary speech pauses become noise. */
  minSilenceSeconds?: number;
}

export const DEFAULT_NOISE_FLOOR_DB = -35;
export const DEFAULT_MIN_SILENCE_SECONDS = 0.6;

export function audioMeasurementArgs(
  videoPath: string,
  options: SilenceDetectOptions = {},
): readonly string[] {
  const noiseFloorDb = options.noiseFloorDb ?? DEFAULT_NOISE_FLOOR_DB;
  const minSilenceSeconds = options.minSilenceSeconds ?? DEFAULT_MIN_SILENCE_SECONDS;
  return [
    '-nostdin',
    '-hide_banner',
    '-nostats',
    '-i',
    videoPath,
    '-map',
    '0:a:0',
    '-af',
    `volumedetect,silencedetect=noise=${noiseFloorDb}dB:d=${minSilenceSeconds}`,
    '-f',
    'null',
    '-',
  ];
}

/** I/O edge: one ffmpeg pass produces both measurements; the parsing above stays pure. */
export async function measureAudio(input: {
  videoPath: string;
  durationSeconds: number;
  runner: ToolRunner;
  silenceDetect?: SilenceDetectOptions;
}): Promise<{ loudness: LoudnessSummary; silences: readonly SilenceInterval[] }> {
  const result = await input.runner.run({
    tool: 'ffmpeg',
    args: audioMeasurementArgs(input.videoPath, input.silenceDetect ?? {}),
  });
  if (result.exitCode !== 0) {
    throw new ExternalToolError(
      'ffmpeg',
      `ffmpeg exited ${result.exitCode} measuring audio for "${input.videoPath}": ${result.stderr.trim() || 'no diagnostics'}`,
    );
  }
  return {
    loudness: parseLoudness(result.stderr),
    silences: parseSilences(result.stderr, input.durationSeconds),
  };
}
