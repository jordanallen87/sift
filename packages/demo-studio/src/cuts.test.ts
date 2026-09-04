import { describe, expect, it } from 'vitest';
import { deriveBeatWindows, normalizeCuts, parseCuts } from './cuts.js';
import type { RecordingDefectError } from './errors.js';

/** The shape a recorder writes next to the take. */
const cuts = parseCuts({
  usable: true,
  marks: [
    { t: 0, beat: '1' },
    { t: 18.5, beat: '2', take: 2 },
    { t: 41.25, beat: '3' },
    { t: 66, beat: 4 },
  ],
});

describe('cut marks', () => {
  it('accepts recorder bookkeeping, numeric beat labels, and out-of-order marks', () => {
    const shuffled = parseCuts({
      usable: true,
      marks: [
        { t: 12, beat: 2, selector: '[data-testid="hero"]' },
        { t: 0, beat: 1 },
      ],
    });
    expect(normalizeCuts(shuffled).marks).toEqual([
      { beat: '1', atSeconds: 0 },
      { beat: '2', atSeconds: 12 },
    ]);
    expect(shuffled.marks[0]).toMatchObject({ selector: '[data-testid="hero"]' });
  });

  it('normalizes both spellings of usable', () => {
    expect(normalizeCuts(cuts)).toMatchObject({ usable: true, usableThroughSeconds: undefined });
    const truncated = parseCuts({ usable: 90.5, marks: [{ t: 0, beat: '1' }] });
    expect(normalizeCuts(truncated)).toMatchObject({ usable: true, usableThroughSeconds: 90.5 });
    expect(normalizeCuts(parseCuts({ usable: 0, marks: [{ t: 0, beat: '1' }] }))).toMatchObject({
      usable: false,
    });
  });

  it('rejects a cuts file with no marks', () => {
    expect(() => parseCuts({ usable: true, marks: [] })).toThrow();
  });
});

describe('beat windows', () => {
  it('spans each mark to the next one, and the last mark to the end of the video', () => {
    expect(deriveBeatWindows(cuts, 92.4)).toEqual([
      { beat: '1', index: 0, startSeconds: 0, endSeconds: 18.5 },
      { beat: '2', index: 1, startSeconds: 18.5, endSeconds: 41.25 },
      { beat: '3', index: 2, startSeconds: 41.25, endSeconds: 66 },
      { beat: '4', index: 3, startSeconds: 66, endSeconds: 92.4 },
    ]);
  });

  it('stops at the last usable second when the recorder truncated the take', () => {
    const truncated = parseCuts({
      usable: 70,
      marks: [
        { t: 0, beat: '1' },
        { t: 40, beat: '2' },
      ],
    });
    expect(deriveBeatWindows(truncated, 120)).toEqual([
      { beat: '1', index: 0, startSeconds: 0, endSeconds: 40 },
      { beat: '2', index: 1, startSeconds: 40, endSeconds: 70 },
    ]);
  });

  it('refuses to review a take the recorder already marked unusable', () => {
    const unusable = parseCuts({ usable: false, marks: [{ t: 0, beat: '1' }] });
    try {
      deriveBeatWindows(unusable, 60);
      expect.unreachable('an unusable take must not produce windows');
    } catch (error: unknown) {
      expect((error as RecordingDefectError).code).toBe('unusable-take');
    }
  });

  it('fails when the cuts file does not belong to this render', () => {
    try {
      deriveBeatWindows(cuts, 40);
      expect.unreachable('a mark past the end of the video must fail');
    } catch (error: unknown) {
      expect((error as RecordingDefectError).code).toBe('cuts-do-not-match-video');
      expect((error as Error).message).toMatch(/does not belong to this render/);
    }
  });

  it('fails on duplicated timestamps and on an unknown duration', () => {
    const duplicated = parseCuts({
      usable: true,
      marks: [
        { t: 5, beat: '1' },
        { t: 5, beat: '2' },
      ],
    });
    expect(() => deriveBeatWindows(duplicated, 30)).toThrow(/share a timestamp/);
    expect(() => deriveBeatWindows(cuts, 0)).toThrow(/positive video duration/);
  });
});
