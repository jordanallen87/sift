/**
 * The review lane fails in two materially different ways, and collapsing them
 * into one `Error` is how a broken take quietly ships.
 *
 * `ExternalToolError` means Demo Studio could not look: ffmpeg is not
 * installed, ffprobe returned something that is not JSON, the transcription
 * service refused the request. It says nothing at all about the recording, so
 * a caller must never downgrade it to "no problems found".
 *
 * `RecordingDefectError` means Demo Studio did look and the recording itself is
 * wrong: a narrated take with no audio stream, cut marks that belong to a
 * different render, a take the recorder already flagged unusable.
 */

export class ExternalToolError extends Error {
  override readonly name = 'ExternalToolError';
  readonly tool: string;

  constructor(tool: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.tool = tool;
  }
}

export type RecordingDefectCode =
  | 'missing-video-stream'
  | 'missing-audio-stream'
  | 'zero-length-audio'
  | 'unknown-duration'
  | 'unusable-take'
  | 'cuts-do-not-match-video';

export class RecordingDefectError extends Error {
  override readonly name = 'RecordingDefectError';
  readonly code: RecordingDefectCode;

  constructor(code: RecordingDefectCode, message: string) {
    super(message);
    this.code = code;
  }
}
