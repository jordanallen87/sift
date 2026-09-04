import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExternalToolError } from './errors.js';
import type { SpeechAlignment } from './timing.js';
import {
  createAlignmentTranscriber,
  createElevenLabsTranscriber,
  transcriptFromElevenLabsResponse,
  transcriptFromSpeechAlignments,
} from './transcribe.js';

/** Shape documented at https://elevenlabs.io/docs/api-reference/speech-to-text/convert */
const scribeResponse = {
  language_code: 'en',
  language_probability: 0.98,
  text: 'It moves 95% to 65%.',
  words: [
    { text: 'It', start: 12.0, end: 12.2, type: 'word' },
    { text: ' ', start: 12.2, end: 12.3, type: 'spacing' },
    { text: 'moves', start: 12.3, end: 12.7, type: 'word' },
    { text: '95%', start: 12.8, end: 13.3, type: 'word' },
    { text: 'to', start: 13.4, end: 13.6, type: 'word' },
    // Older responses omit `type` entirely; those entries are still words.
    { text: '65%.', start: 13.7, end: 14.2 },
    { text: '(keyboard)', start: 14.3, end: 14.5, type: 'audio_event' },
  ],
};

function alignmentFor(text: string): SpeechAlignment {
  return {
    characters: Array.from(text),
    character_start_times_seconds: Array.from({ length: text.length }, (_, i) => i / 10),
    character_end_times_seconds: Array.from({ length: text.length }, (_, i) => (i + 1) / 10),
  };
}

describe('ElevenLabs Scribe transcripts', () => {
  it('keeps spoken words and drops spacing and audio-event entries', () => {
    const transcript = transcriptFromElevenLabsResponse(scribeResponse, 'scribe_v2');
    expect(transcript).toMatchObject({
      source: 'elevenlabs:scribe_v2',
      evidence: 'recorded-audio',
      text: 'It moves 95% to 65%.',
    });
    expect(transcript.words.map((word) => word.text)).toEqual(['It', 'moves', '95%', 'to', '65%.']);
    expect(transcript.words[0]).toEqual({ text: 'It', startSeconds: 12, endSeconds: 12.2 });
  });

  it('yields a transcript with no timings when the response carries no words', () => {
    expect(transcriptFromElevenLabsResponse({ text: 'hello' }, 'scribe_v2').words).toEqual([]);
    expect(() => transcriptFromElevenLabsResponse({ words: [] }, 'scribe_v2')).toThrow();
  });

  it('uploads the media and returns word timings', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(scribeResponse), { status: 200 })),
    );
    const transcriber = createElevenLabsTranscriber({
      apiKey: 'test-key-value',
      fetchImpl,
      readMedia: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    });

    const transcript = await transcriber.transcribe({ mediaPath: '/takes/final.mp4' });

    expect(transcript.words).toHaveLength(5);
    expect(transcriber.name).toBe('elevenlabs:scribe_v2');
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['xi-api-key']).toBe('test-key-value');
    const form = init?.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    const file = form.get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe('final.mp4');
    expect((file as Blob).type).toBe('video/mp4');
  });

  it('reads the media from disk and labels an unrecognised container generically', async () => {
    const mediaPath = join(await mkdtemp(join(tmpdir(), 'demo-studio-media-')), 'take.mkv');
    await writeFile(mediaPath, 'not really a video');
    let uploaded: FormData | undefined;
    const transcriber = createElevenLabsTranscriber({
      apiKey: 'test-key-value',
      fetchImpl: (_url, init) => {
        uploaded = init?.body as FormData;
        return Promise.resolve(new Response(JSON.stringify(scribeResponse), { status: 200 }));
      },
    });

    await transcriber.transcribe({ mediaPath });

    const file = uploaded?.get('file');
    expect((file as Blob).type).toBe('application/octet-stream');
    expect(await (file as Blob).text()).toBe('not really a video');
  });

  it('reports a refused request as a tool gap, and refuses to run with no key', async () => {
    const transcriber = createElevenLabsTranscriber({
      apiKey: 'test-key-value',
      modelId: 'scribe_v2',
      fetchImpl: () => Promise.resolve(new Response('quota exceeded', { status: 429 })),
      readMedia: () => Promise.resolve(new Uint8Array()),
    });
    await expect(transcriber.transcribe({ mediaPath: 'take.wav' })).rejects.toThrow(
      /returned 429: quota exceeded/,
    );

    expect(() => createElevenLabsTranscriber({ apiKey: '  ' })).toThrow(ExternalToolError);
  });

  it('still names the failure when the error body cannot be read', async () => {
    const unreadable = {
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('stream closed')),
    } as unknown as Response;
    const transcriber = createElevenLabsTranscriber({
      apiKey: 'test-key-value',
      fetchImpl: () => Promise.resolve(unreadable),
      readMedia: () => Promise.resolve(new Uint8Array()),
    });
    await expect(transcriber.transcribe({ mediaPath: 'take.mp3' })).rejects.toThrow(
      /returned 500: no response body/,
    );
  });
});

describe('transcripts rebuilt from generated narration', () => {
  it('splits aligned characters into timed words and offsets each cue onto the edit timeline', () => {
    const transcript = transcriptFromSpeechAlignments([
      { alignment: alignmentFor('It moves.'), offsetSeconds: 0 },
      { alignment: alignmentFor('Now 65%'), offsetSeconds: 10 },
    ]);

    expect(transcript.words).toEqual([
      { text: 'It', startSeconds: 0, endSeconds: 0.2 },
      { text: 'moves.', startSeconds: 0.3, endSeconds: 0.9 },
      { text: 'Now', startSeconds: 10, endSeconds: 10.3 },
      { text: '65%', startSeconds: 10.4, endSeconds: 10.7 },
    ]);
    // The honesty flag: this describes narration that was generated, not audio
    // that is provably in the file.
    expect(transcript.evidence).toBe('generated-narration');
    expect(transcript.source).toBe('narration-alignment');
  });

  it('rejects a malformed alignment rather than guessing timings', () => {
    expect(() =>
      transcriptFromSpeechAlignments([
        {
          alignment: {
            characters: ['a', 'b'],
            character_start_times_seconds: [0],
            character_end_times_seconds: [0.1, 0.2],
          },
          offsetSeconds: 0,
        },
      ]),
    ).toThrow(/equally sized/);
  });

  it('exposes the alignment transcript through the same port', async () => {
    const transcriber = createAlignmentTranscriber([
      { alignment: alignmentFor('Hello'), offsetSeconds: 0 },
    ]);
    await expect(transcriber.transcribe({ mediaPath: 'ignored.mp4' })).resolves.toMatchObject({
      text: 'Hello',
    });
  });
});
