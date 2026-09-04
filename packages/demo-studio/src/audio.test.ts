import { describe, expect, it } from 'vitest';
import {
  audioMeasurementArgs,
  evaluateAudio,
  measureAudio,
  parseLoudness,
  parseSilences,
} from './audio.js';
import { deriveBeatWindows, parseCuts } from './cuts.js';
import { ExternalToolError } from './errors.js';
import { createScriptedToolRunner } from './testing.js';

/** Verbatim shape of ffmpeg 9 stderr for `volumedetect,silencedetect`. */
const stderr = [
  '[Parsed_volumedetect_0 @ 0xb36] n_samples: 6867840',
  '[Parsed_volumedetect_0 @ 0xb36] mean_volume: -24.8 dB',
  '[Parsed_volumedetect_0 @ 0xb36] max_volume: -0.7 dB',
  '[Parsed_volumedetect_0 @ 0xb36] histogram_0db: 4',
  '[Parsed_silencedetect_0 @ 0x9ea] silence_start: 12.5',
  '[Parsed_silencedetect_0 @ 0x9ea] silence_end: 15.1 | silence_duration: 2.6',
  '[Parsed_silencedetect_0 @ 0x9ea] silence_start: 28',
].join('\n');

const cuts = parseCuts({
  usable: true,
  marks: [
    { t: 0, beat: '1' },
    { t: 10, beat: '2' },
    { t: 20, beat: '3' },
  ],
});
const windows = deriveBeatWindows(cuts, 30);

describe('audio measurement parsing', () => {
  it('reads mean and peak levels', () => {
    expect(parseLoudness(stderr)).toEqual({ meanVolumeDb: -24.8, maxVolumeDb: -0.7 });
  });

  it('treats a missing measurement as a tool gap rather than defaulting to zero', () => {
    expect(() => parseLoudness('n_samples: 0')).toThrow(ExternalToolError);
  });

  it('pairs silence runs and closes an unterminated run at the end of the video', () => {
    expect(parseSilences(stderr, 30)).toEqual([
      { startSeconds: 12.5, endSeconds: 15.1, durationSeconds: 2.6 },
      { startSeconds: 28, endSeconds: 30, durationSeconds: 2 },
    ]);
    expect(parseSilences('nothing to report', 30)).toEqual([]);
  });
});

describe('audio verdict', () => {
  it('flags a beat that is silent for longer than the dead-beat threshold', () => {
    const report = evaluateAudio({
      loudness: { meanVolumeDb: -24.8, maxVolumeDb: -0.7 },
      silences: parseSilences(stderr, 30),
      windows,
    });

    expect(report.ok).toBe(false);
    expect(report.clipping).toBe(false);
    expect(report.tooQuiet).toBe(false);
    expect(report.deadBeats).toEqual([
      { beat: '2', index: 1, longestSilenceSeconds: 2.6, silentSeconds: 2.6, silentShare: 0.26 },
      { beat: '3', index: 2, longestSilenceSeconds: 2, silentSeconds: 2, silentShare: 0.2 },
    ]);
    expect(report.issues[0]).toMatch(
      /Beat "2" .* has an unbroken 2\.6s gap, and is silent for 2\.6s in total \(26% of the beat\)/,
    );
  });

  it('does not call a beat dead because narration paused for breath several times', () => {
    // Six 0.7s pauses total 4.2s — far over the 1.5s threshold — but no single
    // gap reaches it. This is what ordinary speech looks like on a 10s beat.
    const breathing = Array.from({ length: 6 }, (_, index) => ({
      startSeconds: 10.5 + index * 1.5,
      endSeconds: 11.2 + index * 1.5,
      durationSeconds: 0.7,
    }));
    const report = evaluateAudio({
      loudness: { meanVolumeDb: -21, maxVolumeDb: -1.1 },
      silences: breathing,
      windows,
    });
    expect(report).toMatchObject({ ok: true, deadBeats: [] });
  });

  it('passes a take with no dead beat, correct level, and no clipping', () => {
    const report = evaluateAudio({
      loudness: { meanVolumeDb: -20, maxVolumeDb: -1.4 },
      silences: [{ startSeconds: 5, endSeconds: 5.8, durationSeconds: 0.8 }],
      windows,
    });
    expect(report).toMatchObject({ ok: true, deadBeats: [], issues: [] });
  });

  it('flags clipping and an under-level mix against configurable thresholds', () => {
    const report = evaluateAudio({
      loudness: { meanVolumeDb: -34, maxVolumeDb: -0.1 },
      silences: [],
      windows,
      thresholds: { deadBeatSeconds: 0.1 },
    });
    expect(report).toMatchObject({ ok: false, clipping: true, tooQuiet: true });
    expect(report.issues).toHaveLength(2);

    const lenient = evaluateAudio({
      loudness: { meanVolumeDb: -34, maxVolumeDb: -0.1 },
      silences: [],
      windows,
      thresholds: { clippingCeilingDb: 0, quietFloorDb: -40 },
    });
    expect(lenient.ok).toBe(true);
  });
});

describe('running the measurement', () => {
  it('asks ffmpeg for both filters in one pass and parses its stderr', async () => {
    const runner = createScriptedToolRunner([{ tool: 'ffmpeg', result: { stderr } }]);
    await expect(
      measureAudio({ videoPath: 'take.mp4', durationSeconds: 30, runner }),
    ).resolves.toMatchObject({ loudness: { meanVolumeDb: -24.8 } });
    expect(runner.invocations[0]?.args).toEqual(audioMeasurementArgs('take.mp4'));
    expect(audioMeasurementArgs('take.mp4', { noiseFloorDb: -40, minSilenceSeconds: 1 })).toContain(
      'volumedetect,silencedetect=noise=-40dB:d=1',
    );
  });

  it('surfaces a non-zero ffmpeg exit rather than reporting silence', async () => {
    const runner = createScriptedToolRunner([
      { tool: 'ffmpeg', result: { exitCode: 1, stderr: 'Stream map 0:a:0 matches no streams' } },
    ]);
    await expect(
      measureAudio({
        videoPath: 'take.mp4',
        durationSeconds: 30,
        runner,
        silenceDetect: { noiseFloorDb: -30 },
      }),
    ).rejects.toBeInstanceOf(ExternalToolError);

    const quiet = createScriptedToolRunner([{ tool: 'ffmpeg', result: { exitCode: 1 } }]);
    await expect(
      measureAudio({ videoPath: 'take.mp4', durationSeconds: 30, runner: quiet }),
    ).rejects.toThrow(/no diagnostics/);
  });
});
