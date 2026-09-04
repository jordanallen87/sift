import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import { ExternalToolError } from './errors.js';
import type { SpeechAlignment } from './timing.js';

/**
 * Where a transcript came from changes what it can prove, so it travels with
 * the transcript rather than living in a comment.
 *
 * `recorded-audio` was produced by listening to the finished file: it proves
 * what a viewer will actually hear. `generated-narration` was reconstructed
 * from the TTS alignment used to author the take: it proves what was *meant* to
 * be on the soundtrack at each moment, which is enough to catch narration
 * describing something that is not on screen, but it cannot catch a mix that
 * dropped, offset, or muted that narration.
 */
export type TranscriptEvidence = 'recorded-audio' | 'generated-narration';

export interface TranscriptWord {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface Transcript {
  /** Identifies the producer, e.g. `elevenlabs:scribe_v2`. */
  source: string;
  evidence: TranscriptEvidence;
  text: string;
  words: readonly TranscriptWord[];
}

export interface TranscriptionRequest {
  mediaPath: string;
}

/**
 * The transcription port. Nothing in this package's own tests needs a network
 * or an API key: they use the scripted double from `./testing.js`.
 */
export interface Transcriber {
  readonly name: string;
  transcribe(request: TranscriptionRequest): Promise<Transcript>;
}

// --- ElevenLabs Scribe -------------------------------------------------------

/**
 * Chosen because the project already holds an ElevenLabs account for narration
 * TTS (`ELEVENLABS_API_KEY`), the batch endpoint returns per-word timings —
 * which claim verification requires and a plain text transcript cannot give —
 * and it accepts the video file directly, so no separate audio export step is
 * needed. Endpoint and field names follow
 * https://elevenlabs.io/docs/api-reference/speech-to-text/convert.
 */
export const ELEVENLABS_SPEECH_TO_TEXT_ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';
export const DEFAULT_ELEVENLABS_MODEL_ID = 'scribe_v2';

const ElevenLabsWordSchema = z
  .object({
    text: z.string(),
    start: z.number(),
    end: z.number(),
    type: z.string().optional(),
  })
  .passthrough();

export const ElevenLabsTranscriptSchema = z
  .object({
    text: z.string(),
    words: z.array(ElevenLabsWordSchema).optional(),
    language_code: z.string().optional(),
  })
  .passthrough();

/** Pure: validates and narrows one Scribe response into a {@link Transcript}. */
export function transcriptFromElevenLabsResponse(raw: unknown, modelId: string): Transcript {
  const parsed = ElevenLabsTranscriptSchema.parse(raw);
  // Scribe interleaves `spacing` and `audio_event` entries with real words.
  // Only `word` entries carry text a script can be matched against.
  const words = (parsed.words ?? [])
    .filter((word) => (word.type ?? 'word') === 'word')
    .map((word) => ({ text: word.text, startSeconds: word.start, endSeconds: word.end }));
  return { source: `elevenlabs:${modelId}`, evidence: 'recorded-audio', text: parsed.text, words };
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
};

function mimeTypeFor(mediaPath: string): string {
  return MIME_TYPES[extname(mediaPath).toLocaleLowerCase()] ?? 'application/octet-stream';
}

export interface ElevenLabsTranscriberOptions {
  apiKey: string;
  modelId?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  readMedia?: (mediaPath: string) => Promise<Uint8Array<ArrayBuffer>>;
}

/** I/O edge: uploads the media and returns a word-timed transcript. */
export function createElevenLabsTranscriber(options: ElevenLabsTranscriberOptions): Transcriber {
  const modelId = options.modelId ?? DEFAULT_ELEVENLABS_MODEL_ID;
  const endpoint = options.endpoint ?? ELEVENLABS_SPEECH_TO_TEXT_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const readMedia = options.readMedia ?? ((mediaPath: string) => readFile(mediaPath));

  if (options.apiKey.trim() === '') {
    throw new ExternalToolError(
      'elevenlabs',
      'ElevenLabs speech-to-text needs an API key. Set ELEVENLABS_API_KEY, or review with a transcript-free run and accept the reported gap.',
    );
  }

  return {
    name: `elevenlabs:${modelId}`,
    async transcribe({ mediaPath }) {
      const media = await readMedia(mediaPath);
      const form = new FormData();
      form.set('model_id', modelId);
      form.set('file', new Blob([media], { type: mimeTypeFor(mediaPath) }), basename(mediaPath));

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'xi-api-key': options.apiKey },
        body: form,
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 500);
        throw new ExternalToolError(
          'elevenlabs',
          `ElevenLabs speech-to-text returned ${response.status}: ${detail || 'no response body'}`,
        );
      }
      return transcriptFromElevenLabsResponse(await response.json(), modelId);
    },
  };
}

// --- Generated-narration alignment ------------------------------------------

export interface AlignedNarrationCue {
  alignment: SpeechAlignment;
  /** Where this cue starts on the finished edit timeline. */
  offsetSeconds: number;
}

/**
 * Pure: rebuilds a word-timed transcript from the ElevenLabs `with-timestamps`
 * alignment files this repository already writes per narration cue. It makes
 * the whole review lane runnable with no network and no API key, at the cost
 * recorded in {@link TranscriptEvidence}: it describes the narration that was
 * generated, not the audio that ended up in the file.
 */
export function transcriptFromSpeechAlignments(cues: readonly AlignedNarrationCue[]): Transcript {
  const words: TranscriptWord[] = [];

  for (const [cueIndex, cue] of cues.entries()) {
    const { characters, character_start_times_seconds, character_end_times_seconds } =
      cue.alignment;
    if (
      characters.length === 0 ||
      character_start_times_seconds.length !== characters.length ||
      character_end_times_seconds.length !== characters.length
    ) {
      throw new Error(
        `Narration cue ${cueIndex} must contain equally sized, non-empty character and timing arrays.`,
      );
    }

    let text = '';
    let startSeconds = 0;
    let endSeconds = 0;

    const flush = (): void => {
      if (text === '') return;
      words.push({
        text,
        startSeconds: startSeconds + cue.offsetSeconds,
        endSeconds: endSeconds + cue.offsetSeconds,
      });
      text = '';
    };

    for (const [index, character] of characters.entries()) {
      if (/\s/.test(character)) {
        flush();
        continue;
      }
      if (text === '') startSeconds = character_start_times_seconds[index] ?? 0;
      endSeconds = character_end_times_seconds[index] ?? startSeconds;
      text += character;
    }
    flush();
  }

  return {
    source: 'narration-alignment',
    evidence: 'generated-narration',
    text: words.map((word) => word.text).join(' '),
    words,
  };
}

/** Wraps {@link transcriptFromSpeechAlignments} as a {@link Transcriber}; the media path is unused. */
export function createAlignmentTranscriber(cues: readonly AlignedNarrationCue[]): Transcriber {
  const transcript = transcriptFromSpeechAlignments(cues);
  return { name: transcript.source, transcribe: () => Promise.resolve(transcript) };
}
