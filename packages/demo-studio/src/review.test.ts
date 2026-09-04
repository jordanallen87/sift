import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCuts } from './cuts.js';
import { reviewRecording } from './review.js';
import {
  createScriptedToolRunner,
  createScriptedTranscriber,
  scriptedTranscript,
} from './testing.js';
import type { ScriptedToolResponse } from './testing.js';
import { parseNarrationClaims } from './verify-claims.js';

const probeOutput = JSON.stringify({
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 860, height: 1800, r_frame_rate: '30/1' },
    { codec_type: 'audio', codec_name: 'aac', channels: 1, sample_rate: '44100' },
  ],
  format: { duration: '30.0' },
});

const cleanAudio = [
  '[Parsed_volumedetect_0 @ 0x1] mean_volume: -21.4 dB',
  '[Parsed_volumedetect_0 @ 0x1] max_volume: -1.2 dB',
].join('\n');

const cuts = parseCuts({
  usable: true,
  marks: [
    { t: 0, beat: '3' },
    { t: 10, beat: '4' },
    { t: 20, beat: '5' },
  ],
});

const claims = parseNarrationClaims([{ id: 'range', beat: '4', phrase: '95% to 65%' }]);

function transcriptWithRangeAt(start: number) {
  return scriptedTranscript([
    ['It', start, start + 0.2],
    ['moves', start + 0.3, start + 0.7],
    ['95%', start + 1, start + 1.4],
    ['to', start + 1.5, start + 1.7],
    ['65%.', start + 1.8, start + 2.2],
  ]);
}

function runner(overrides: readonly ScriptedToolResponse[] = []) {
  return createScriptedToolRunner([
    ...overrides,
    { tool: 'ffprobe', result: { stdout: probeOutput } },
    { tool: 'ffmpeg', argsInclude: 'volumedetect', result: { stderr: cleanAudio } },
    { tool: 'ffmpeg', result: {} },
  ]);
}

describe('reviewing a finished recording end to end', () => {
  it('passes only when every check ran and every check passed', async () => {
    const review = await reviewRecording({
      videoPath: 'take.mp4',
      cuts,
      claims,
      runner: runner(),
      transcriber: createScriptedTranscriber(transcriptWithRangeAt(12)),
    });

    expect(review.ok).toBe(true);
    expect(review.gaps).toEqual([]);
    expect(review.video).toMatchObject({ widthPx: 860, durationSeconds: 30 });
    expect(review.windows).toHaveLength(3);
    expect(review.frames.map((frame) => frame.fileName)).toEqual([
      '01-3-open.png',
      '01-3-dwell.png',
      '02-4-open.png',
      '02-4-dwell.png',
      '03-5-open.png',
      '03-5-dwell.png',
    ]);
    expect(review.extractedFrames).toEqual([]);
    expect(review.claims.satisfied).toBe(1);
  });

  it('fails the review when narration reads a figure over the wrong beat', async () => {
    const review = await reviewRecording({
      videoPath: 'take.mp4',
      cuts,
      claims,
      runner: runner(),
      transcriber: createScriptedTranscriber(transcriptWithRangeAt(2)),
    });

    expect(review.ok).toBe(false);
    expect(review.audio.ok).toBe(true);
    expect(review.claims.verifications[0]?.status).toBe('spoken-outside-beat');
  });

  it('records an unverified claim as a gap rather than a pass', async () => {
    const review = await reviewRecording({ videoPath: 'take.mp4', cuts, claims, runner: runner() });

    expect(review.ok).toBe(false);
    expect(review.claims.verifications[0]?.status).toBe('unverifiable');
    expect(review.gaps).toEqual([
      'No transcriber was configured, so no spoken claim was compared against what is on screen.',
    ]);
  });

  it('records the weaker evidence when the transcript came from generated narration', async () => {
    const review = await reviewRecording({
      videoPath: 'take.mp4',
      cuts,
      claims: [],
      runner: runner(),
      transcriber: createScriptedTranscriber(
        scriptedTranscript([['hello', 0, 1]], {
          source: 'narration-alignment',
          evidence: 'generated-narration',
        }),
      ),
    });

    expect(review.ok).toBe(false);
    expect(review.gaps).toEqual([
      'Claims were checked against "narration-alignment", which is the narration that was generated rather than the audio in this file; it cannot prove the mix kept that narration.',
      'No narration claims were declared, so nothing was verified against the script.',
    ]);
  });

  it('extracts the planned frames and forwards the audio and claim options', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'demo-studio-review-'));
    const transcriber = createScriptedTranscriber(transcriptWithRangeAt(12));
    const scripted = runner();

    const review = await reviewRecording({
      videoPath: 'take.mp4',
      cuts,
      claims,
      runner: scripted,
      transcriber,
      frameOutputDir: outputDir,
      frames: { includeDwellFrames: false },
      audioThresholds: { quietFloorDb: -10 },
      silenceDetect: { noiseFloorDb: -45 },
      claimToleranceSeconds: 0,
    });

    expect(review.extractedFrames.map((frame) => frame.filePath)).toEqual([
      join(outputDir, '01-3-open.png'),
      join(outputDir, '02-4-open.png'),
      join(outputDir, '03-5-open.png'),
    ]);
    expect(transcriber.requestedPaths).toEqual(['take.mp4']);
    // The tightened floor now fails the same -21.4 dB mix that passed above.
    expect(review.audio.tooQuiet).toBe(true);
    expect(review.ok).toBe(false);
    const audioCall = scripted.invocations.find((invocation) =>
      invocation.args.some((arg) => arg.includes('silencedetect')),
    );
    expect(audioCall?.args.join(' ')).toContain('noise=-45dB');
  });
});
