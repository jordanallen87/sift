import type { AudioReport, AudioThresholds, SilenceDetectOptions } from './audio.js';
import { evaluateAudio, measureAudio } from './audio.js';
import type { BeatWindow, Cuts } from './cuts.js';
import { deriveBeatWindows } from './cuts.js';
import type { ExtractedFrame, FramePlanOptions, FrameSelection } from './frames.js';
import { extractFrames, planBeatFrames } from './frames.js';
import type { VideoProperties } from './probe.js';
import { probeVideo } from './probe.js';
import type { ToolRunner } from './tool-runner.js';
import type { Transcriber, Transcript } from './transcribe.js';
import type { ClaimReport, NarrationClaim } from './verify-claims.js';
import { verifyNarrationClaims } from './verify-claims.js';

export interface ReviewRecordingOptions {
  videoPath: string;
  cuts: Cuts;
  claims: readonly NarrationClaim[];
  runner: ToolRunner;
  /** Omit to run without transcription; the claim checks then report gaps, not passes. */
  transcriber?: Transcriber | undefined;
  /** Set to write the planned frames to disk; omit to plan them without extracting. */
  frameOutputDir?: string | undefined;
  frames?: FramePlanOptions;
  audioThresholds?: Partial<AudioThresholds>;
  silenceDetect?: SilenceDetectOptions;
  claimToleranceSeconds?: number;
}

export interface RecordingReview {
  /** True only when every check ran and every check passed. */
  ok: boolean;
  video: VideoProperties;
  windows: readonly BeatWindow[];
  frames: readonly FrameSelection[];
  extractedFrames: readonly ExtractedFrame[];
  audio: AudioReport;
  claims: ClaimReport;
  /** Checks that could not be run. A gap is never a pass. */
  gaps: readonly string[];
}

/**
 * I/O edge: composes the review lane in the order the checks depend on each
 * other — probe (which fails loudly on a silent take), then beat windows, then
 * frames, audio and narration claims against those windows.
 *
 * `ok` requires an empty `gaps` list as well as passing checks. A run with no
 * transcriber inspected the picture and the audio levels but never compared a
 * spoken word to the screen, and reporting that as a clean review is precisely
 * the failure this package was built to stop.
 */
export async function reviewRecording(options: ReviewRecordingOptions): Promise<RecordingReview> {
  const video = await probeVideo(options.videoPath, options.runner);
  const windows = deriveBeatWindows(options.cuts, video.durationSeconds);

  const frames = planBeatFrames(windows, options.frames ?? {});
  const extractedFrames =
    options.frameOutputDir === undefined
      ? []
      : await extractFrames(options.videoPath, frames, options.frameOutputDir, options.runner);

  const measured = await measureAudio({
    videoPath: options.videoPath,
    durationSeconds: video.durationSeconds,
    runner: options.runner,
    ...(options.silenceDetect === undefined ? {} : { silenceDetect: options.silenceDetect }),
  });
  const audio = evaluateAudio({
    loudness: measured.loudness,
    silences: measured.silences,
    windows,
    ...(options.audioThresholds === undefined ? {} : { thresholds: options.audioThresholds }),
  });

  const gaps: string[] = [];
  let transcript: Transcript | undefined;
  if (options.transcriber === undefined) {
    gaps.push(
      'No transcriber was configured, so no spoken claim was compared against what is on screen.',
    );
  } else {
    transcript = await options.transcriber.transcribe({ mediaPath: options.videoPath });
    if (transcript.evidence === 'generated-narration') {
      gaps.push(
        `Claims were checked against "${transcript.source}", which is the narration that was generated rather than the audio in this file; it cannot prove the mix kept that narration.`,
      );
    }
  }
  if (options.claims.length === 0) {
    gaps.push('No narration claims were declared, so nothing was verified against the script.');
  }

  const claims = verifyNarrationClaims({
    claims: options.claims,
    transcript,
    windows,
    ...(options.claimToleranceSeconds === undefined
      ? {}
      : { toleranceSeconds: options.claimToleranceSeconds }),
  });

  return {
    ok: audio.ok && claims.ok && gaps.length === 0,
    video,
    windows,
    frames,
    extractedFrames,
    audio,
    claims,
    gaps,
  };
}
