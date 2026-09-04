import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveBeatWindows, parseCuts } from './cuts.js';
import { ExternalToolError } from './errors.js';
import { extractFrames, planBeatFrames } from './frames.js';
import { createScriptedToolRunner } from './testing.js';

const cuts = parseCuts({
  usable: true,
  marks: [
    { t: 0, beat: '1' },
    { t: 18.5, beat: '2' },
    { t: 41.25, beat: 'camera' },
    { t: 42, beat: '4' },
  ],
});
const windows = deriveBeatWindows(cuts, 66);

describe('beat-aligned frame selection', () => {
  it('takes a settled frame at each beat plus the dwell frame in the middle of it', () => {
    expect(planBeatFrames(windows)).toEqual([
      { beat: '1', index: 0, reason: 'beat-open', atSeconds: 0.4, fileName: '01-1-open.png' },
      { beat: '1', index: 0, reason: 'beat-dwell', atSeconds: 9.25, fileName: '01-1-dwell.png' },
      { beat: '2', index: 1, reason: 'beat-open', atSeconds: 18.9, fileName: '02-2-open.png' },
      { beat: '2', index: 1, reason: 'beat-dwell', atSeconds: 29.875, fileName: '02-2-dwell.png' },
      // A 0.75s beat is shorter than the dwell minimum, so it yields one frame.
      {
        beat: 'camera',
        index: 2,
        reason: 'beat-open',
        atSeconds: 41.65,
        fileName: '03-camera-open.png',
      },
      { beat: '4', index: 3, reason: 'beat-open', atSeconds: 42.4, fileName: '04-4-open.png' },
      { beat: '4', index: 3, reason: 'beat-dwell', atSeconds: 54, fileName: '04-4-dwell.png' },
    ]);
  });

  it('never samples past the beat it belongs to, however short the beat is', () => {
    for (const frame of planBeatFrames(windows, { settleSeconds: 5 })) {
      const window = windows[frame.index];
      expect(window).toBeDefined();
      expect(frame.atSeconds).toBeGreaterThanOrEqual(window?.startSeconds ?? 0);
      expect(frame.atSeconds).toBeLessThan(window?.endSeconds ?? 0);
    }
  });

  it('honours settle, dwell, and minimum-window options', () => {
    expect(planBeatFrames(windows, { includeDwellFrames: false })).toHaveLength(4);
    expect(planBeatFrames(windows, { settleSeconds: 1.5 })[0]?.atSeconds).toBe(1.5);
    expect(
      planBeatFrames(windows, { minDwellWindowSeconds: 0.5, settleSeconds: 0.1 }),
    ).toHaveLength(8);
    expect(() => planBeatFrames(windows, { settleSeconds: -1 })).toThrow(/must not be negative/);
  });

  it('keeps a usable file name for a beat label made only of punctuation', () => {
    const punctuation = deriveBeatWindows(
      parseCuts({ usable: true, marks: [{ t: 0, beat: '—' }] }),
      10,
    );
    expect(planBeatFrames(punctuation, { includeDwellFrames: false })[0]?.fileName).toBe(
      '01-beat-open.png',
    );
  });
});

describe('frame extraction', () => {
  it('asks ffmpeg for exactly one frame at each planned timestamp', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'demo-studio-frames-'));
    const runner = createScriptedToolRunner([{ tool: 'ffmpeg', result: {} }]);
    const selections = planBeatFrames(windows, { includeDwellFrames: false });

    const extracted = await extractFrames('take.mp4', selections, outputDir, runner);

    expect(extracted.map((frame) => frame.filePath)).toEqual(
      selections.map((selection) => join(outputDir, selection.fileName)),
    );
    expect(runner.invocations).toHaveLength(4);
    expect(runner.invocations[0]?.args).toEqual([
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      '0.4',
      '-i',
      'take.mp4',
      '-frames:v',
      '1',
      '-update',
      '1',
      join(outputDir, '01-1-open.png'),
    ]);
  });

  it('reports an ffmpeg failure instead of returning a frame that was never written', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'demo-studio-frames-'));
    const runner = createScriptedToolRunner([
      { tool: 'ffmpeg', result: { exitCode: 1, stderr: 'Output file is empty' } },
    ]);
    await expect(
      extractFrames('take.mp4', planBeatFrames(windows), outputDir, runner),
    ).rejects.toBeInstanceOf(ExternalToolError);

    const silentFailure = createScriptedToolRunner([{ tool: 'ffmpeg', result: { exitCode: 1 } }]);
    await expect(
      extractFrames('take.mp4', planBeatFrames(windows), outputDir, silentFailure),
    ).rejects.toThrow(/no diagnostics/);
  });
});
