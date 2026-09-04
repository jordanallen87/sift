import { z } from 'zod';
import { ExternalToolError, RecordingDefectError } from './errors.js';
import type { ToolRunner } from './tool-runner.js';

/**
 * ffprobe reports numeric fields inconsistently across containers: `width` is a
 * JSON number, `duration` and `sample_rate` are strings, and any of them can be
 * absent. The schema therefore accepts both spellings and the reader coerces
 * once, so nothing downstream has to think about it.
 */
const NumericSchema = z.union([z.number(), z.string()]);

const StreamSchema = z
  .object({
    codec_type: z.string().optional(),
    codec_name: z.string().optional(),
    width: NumericSchema.optional(),
    height: NumericSchema.optional(),
    r_frame_rate: z.string().optional(),
    avg_frame_rate: z.string().optional(),
    duration: NumericSchema.optional(),
    channels: NumericSchema.optional(),
    sample_rate: NumericSchema.optional(),
  })
  .passthrough();

const FormatSchema = z
  .object({
    duration: NumericSchema.optional(),
    format_name: z.string().optional(),
  })
  .passthrough();

export const ProbeReportSchema = z
  .object({
    streams: z.array(StreamSchema).optional(),
    format: FormatSchema.optional(),
  })
  .passthrough();

export interface AudioTrackProperties {
  codec: string;
  channels: number;
  sampleRateHz: number;
  durationSeconds: number;
}

export interface VideoProperties {
  widthPx: number;
  heightPx: number;
  durationSeconds: number;
  /** Container/timebase rate (`r_frame_rate`) — the rate an edit timeline uses. */
  framesPerSecond: number;
  /** Delivered rate (`avg_frame_rate`); a large gap from `framesPerSecond` means dropped frames. */
  averageFramesPerSecond: number;
  videoCodec: string;
  audio: AudioTrackProperties;
}

function toFiniteNumber(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Rounds to milliseconds so two probes of the same file always compare equal in a report. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** ffprobe expresses frame rates as the rational string `"30/1"` (or `"0/0"` when unknown). */
function parseRational(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const [numerator, denominator] = value.split('/');
  const top = toFiniteNumber(numerator);
  const bottom = denominator === undefined ? 1 : toFiniteNumber(denominator);
  if (top === undefined || bottom === undefined || bottom === 0) return undefined;
  return round(top / bottom);
}

/**
 * Turns one ffprobe JSON report into checked properties. Pure: it never touches
 * the filesystem or spawns anything, so the awkward cases (no audio stream, a
 * zero-length audio stream, an unknown duration) are all directly testable.
 */
export function parseProbeReport(raw: unknown, label = 'the recording'): VideoProperties {
  const report = ProbeReportSchema.parse(raw);
  const streams = report.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');

  if (video === undefined) {
    throw new RecordingDefectError(
      'missing-video-stream',
      `${label} has no video stream; ffprobe reported ${streams.length} stream(s).`,
    );
  }

  // A narrated demo whose audio track never made it into the render plays as a
  // silent video for every judge who opens it. That is the single most
  // expensive defect this lane exists to prevent, so it is fatal, not a warning.
  if (audio === undefined) {
    throw new RecordingDefectError(
      'missing-audio-stream',
      `${label} has no audio stream. A narrated take with no audio track is a silent video.`,
    );
  }

  const containerDuration = toFiniteNumber(report.format?.duration);
  const videoDuration = toFiniteNumber(video.duration) ?? containerDuration;
  const audioDuration = toFiniteNumber(audio.duration) ?? containerDuration;

  if (videoDuration === undefined || videoDuration <= 0) {
    throw new RecordingDefectError(
      'unknown-duration',
      `${label} has no usable duration; ffprobe reported neither a container nor a video-stream duration.`,
    );
  }

  // An audio stream can exist as a header with no samples behind it — for
  // example when a capture tool opened the device but never received audio.
  if (audioDuration === undefined || audioDuration <= 0) {
    throw new RecordingDefectError(
      'zero-length-audio',
      `${label} has an audio stream of zero length; nothing was actually recorded onto it.`,
    );
  }

  const framesPerSecond = parseRational(video.r_frame_rate) ?? parseRational(video.avg_frame_rate);
  if (framesPerSecond === undefined || framesPerSecond <= 0) {
    throw new RecordingDefectError(
      'unknown-duration',
      `${label} has no readable frame rate; ffprobe reported r_frame_rate="${video.r_frame_rate ?? 'none'}".`,
    );
  }

  return {
    widthPx: toFiniteNumber(video.width) ?? 0,
    heightPx: toFiniteNumber(video.height) ?? 0,
    durationSeconds: round(videoDuration),
    framesPerSecond,
    averageFramesPerSecond: parseRational(video.avg_frame_rate) ?? framesPerSecond,
    videoCodec: video.codec_name ?? 'unknown',
    audio: {
      codec: audio.codec_name ?? 'unknown',
      channels: toFiniteNumber(audio.channels) ?? 0,
      sampleRateHz: toFiniteNumber(audio.sample_rate) ?? 0,
      durationSeconds: round(audioDuration),
    },
  };
}

export const FFPROBE_ARGS: readonly string[] = [
  '-v',
  'error',
  '-print_format',
  'json',
  '-show_format',
  '-show_streams',
];

/** I/O edge: runs ffprobe and hands its output to {@link parseProbeReport}. */
export async function probeVideo(videoPath: string, runner: ToolRunner): Promise<VideoProperties> {
  const result = await runner.run({ tool: 'ffprobe', args: [...FFPROBE_ARGS, videoPath] });
  if (result.exitCode !== 0) {
    throw new ExternalToolError(
      'ffprobe',
      `ffprobe exited ${result.exitCode} for "${videoPath}": ${result.stderr.trim() || 'no diagnostics'}`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch (cause: unknown) {
    throw new ExternalToolError(
      'ffprobe',
      `ffprobe did not return JSON for "${videoPath}".`,
      cause,
    );
  }
  return parseProbeReport(raw, `"${videoPath}"`);
}
