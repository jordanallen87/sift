// --- Authoring: manifest, timing, and generated overlay assets ---------------
export {
  AnnotationSchema,
  DemoManifestSchema,
  DemoSegmentSchema,
  FrameAnchorSchema,
  TITLE_SAFE_MARGIN,
  TimeAnchorSchema,
  parseDemoManifest,
  validateTimeline,
} from './schema.js';
export type { Annotation, DemoManifest, DemoSegment, TimeAnchor } from './schema.js';
export { renderAnnotationDocument } from './render-annotations.js';
export { resolveAnnotationTiming, resolveNarrationAnchor } from './timing.js';
export type {
  ResolvedAnnotationTiming,
  ResolvedNarrationAnchor,
  SpeechAlignment,
} from './timing.js';

// --- Review: what a finished recording actually shows and says ---------------
export { ExternalToolError, RecordingDefectError } from './errors.js';
export type { RecordingDefectCode } from './errors.js';

export { DEFAULT_MAX_BUFFER_BYTES, createProcessToolRunner } from './tool-runner.js';
export type {
  ExecFileLike,
  ProcessToolRunnerOptions,
  ToolInvocation,
  ToolResult,
  ToolRunner,
} from './tool-runner.js';

export { FFPROBE_ARGS, ProbeReportSchema, parseProbeReport, probeVideo } from './probe.js';
export type { AudioTrackProperties, VideoProperties } from './probe.js';

export { CutMarkSchema, CutsSchema, deriveBeatWindows, normalizeCuts, parseCuts } from './cuts.js';
export type { BeatWindow, CutMark, Cuts, NormalizedCuts } from './cuts.js';

export {
  DEFAULT_MIN_DWELL_WINDOW_SECONDS,
  DEFAULT_SETTLE_SECONDS,
  extractFrames,
  frameExtractionArgs,
  planBeatFrames,
} from './frames.js';
export type { ExtractedFrame, FramePlanOptions, FrameReason, FrameSelection } from './frames.js';

export {
  DEFAULT_AUDIO_THRESHOLDS,
  DEFAULT_MIN_SILENCE_SECONDS,
  DEFAULT_NOISE_FLOOR_DB,
  audioMeasurementArgs,
  evaluateAudio,
  measureAudio,
  parseLoudness,
  parseSilences,
} from './audio.js';
export type {
  AudioReport,
  AudioThresholds,
  DeadBeat,
  LoudnessSummary,
  SilenceDetectOptions,
  SilenceInterval,
} from './audio.js';

export {
  DEFAULT_ELEVENLABS_MODEL_ID,
  ELEVENLABS_SPEECH_TO_TEXT_ENDPOINT,
  ElevenLabsTranscriptSchema,
  createAlignmentTranscriber,
  createElevenLabsTranscriber,
  transcriptFromElevenLabsResponse,
  transcriptFromSpeechAlignments,
} from './transcribe.js';
export type {
  AlignedNarrationCue,
  ElevenLabsTranscriberOptions,
  Transcriber,
  Transcript,
  TranscriptEvidence,
  TranscriptWord,
  TranscriptionRequest,
} from './transcribe.js';

export {
  DEFAULT_CLAIM_TOLERANCE_SECONDS,
  NarrationClaimSchema,
  normalizeSpokenText,
  parseNarrationClaims,
  verifyNarrationClaims,
} from './verify-claims.js';
export type {
  ClaimReport,
  ClaimStatus,
  ClaimVerification,
  NarrationClaim,
  SpokenSpan,
  TimeRange,
  VerifyNarrationClaimsInput,
} from './verify-claims.js';

export { reviewRecording } from './review.js';
export type { RecordingReview, ReviewRecordingOptions } from './review.js';

// Test doubles for the FFmpeg and transcription ports, so a consumer's tests
// can run a review with no FFmpeg install, no network, and no API key.
export {
  createScriptedToolRunner,
  createScriptedTranscriber,
  scriptedTranscript,
} from './testing.js';
export type { ScriptedToolResponse, ScriptedToolRunner, ScriptedTranscriber } from './testing.js';
