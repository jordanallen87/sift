import { describe, expect, it } from 'vitest';
import { deriveBeatWindows, parseCuts } from './cuts.js';
import { scriptedTranscript } from './testing.js';
import {
  normalizeSpokenText,
  parseNarrationClaims,
  verifyNarrationClaims,
} from './verify-claims.js';

const windows = deriveBeatWindows(
  parseCuts({
    usable: true,
    marks: [
      { t: 0, beat: '3' },
      { t: 10, beat: '4' },
      { t: 20, beat: '5' },
    ],
  }),
  30,
);

const claims = parseNarrationClaims([
  { id: 'range', beat: '4', phrase: '95% to 65%' },
  { id: 'confidence', beat: 5, phrase: 'confidence 0.4' },
]);

/** Rounds so the fixture's timestamps are the exact decimals the assertions name. */
const at = (base: number, offset: number): number => Math.round((base + offset) * 100) / 100;

/** Words in the order and at the times a transcriber returns them. */
function narration(rangeAt: number) {
  return scriptedTranscript([
    ['Sift', 0.2, 0.6],
    ['narrows', 0.7, 1.2],
    ['the', 1.3, 1.4],
    ['field.', 1.5, 2.0],
    ['It', at(rangeAt, 0), at(rangeAt, 0.2)],
    ['moves', at(rangeAt, 0.3), at(rangeAt, 0.7)],
    ['95%', at(rangeAt, 0.8), at(rangeAt, 1.3)],
    ['to', at(rangeAt, 1.4), at(rangeAt, 1.6)],
    ['65%.', at(rangeAt, 1.7), at(rangeAt, 2.2)],
    ['Confidence', 21.0, 21.6],
    ['0.4,', 21.7, 22.1],
    ['so', 22.2, 22.4],
    ['it', 22.5, 22.6],
    ['asks.', 22.7, 23.2],
  ]);
}

describe('spoken-text normalization', () => {
  it('keeps the figures a claim is made of and discards the punctuation around them', () => {
    expect(normalizeSpokenText('It moves 95% to 65%.')).toBe('it moves 95% to 65%');
    expect(normalizeSpokenText('Confidence 0.4, so it asks.')).toBe('confidence 0.4 so it asks');
    expect(normalizeSpokenText('1,200 findings — reviewed!')).toBe('1200 findings reviewed');
  });
});

describe('narration claim verification', () => {
  it('passes when each phrase is spoken while its own beat is on screen', () => {
    const report = verifyNarrationClaims({ claims, transcript: narration(12), windows });

    expect(report.ok).toBe(true);
    expect(report.satisfied).toBe(2);
    expect(report.evidence).toBe('recorded-audio');
    expect(report.verifications[0]).toMatchObject({
      claimId: 'range',
      status: 'satisfied',
      expectedWindows: [{ startSeconds: 10, endSeconds: 20 }],
    });
    expect(report.verifications[0]?.detail).toMatch(/Spoken at 12\.80s–14\.20s/);
  });

  it('FAILS when the figures are read out while a different beat is on screen', () => {
    // The take drifted: the "95% to 65%" line now lands in beat 3, so the
    // viewer hears the numbers while looking at a screen that does not show them.
    const report = verifyNarrationClaims({ claims, transcript: narration(3), windows });

    expect(report.ok).toBe(false);
    expect(report.satisfied).toBe(1);
    const failed = report.verifications[0];
    expect(failed).toMatchObject({ claimId: 'range', status: 'spoken-outside-beat' });
    expect(failed?.occurrences).toEqual([{ startSeconds: 3.8, endSeconds: 5.2, beat: '3' }]);
    expect(failed?.detail).toMatch(/spoken at 3\.80s–5\.20s \(beat 3\)/);
    expect(failed?.detail).toMatch(/beat "4" is on screen at 10\.00s–20\.00s/);
    expect(failed?.detail).toMatch(/describes something the viewer cannot see/);
  });

  it('reports a phrase that was never spoken', () => {
    const report = verifyNarrationClaims({
      claims: parseNarrationClaims([{ id: 'missing', beat: '4', phrase: 'ninety five percent' }]),
      transcript: narration(12),
      windows,
    });
    expect(report.verifications[0]).toMatchObject({ status: 'not-spoken', occurrences: [] });
    expect(report.ok).toBe(false);
  });

  it('allows narration to run a little past a cut, but not far past it', () => {
    // The phrase ends 0.2s after beat 4 closes: within tolerance.
    const overrunning = verifyNarrationClaims({
      claims: parseNarrationClaims([{ id: 'range', beat: '4', phrase: '95% to 65%' }]),
      transcript: narration(18),
      windows,
    });
    expect(overrunning.verifications[0]?.status).toBe('satisfied');

    const strict = verifyNarrationClaims({
      claims: parseNarrationClaims([{ id: 'range', beat: '4', phrase: '95% to 65%' }]),
      transcript: narration(18),
      windows,
      toleranceSeconds: 0,
    });
    expect(strict.verifications[0]?.status).toBe('spoken-outside-beat');
  });

  it('reports an unchecked claim as a gap, never as a pass', () => {
    const noTranscript = verifyNarrationClaims({ claims, transcript: undefined, windows });
    expect(noTranscript.ok).toBe(false);
    expect(noTranscript.transcriptSource).toBeNull();
    expect(noTranscript.verifications.map((entry) => entry.status)).toEqual([
      'unverifiable',
      'unverifiable',
    ]);

    const noTimings = verifyNarrationClaims({
      claims,
      transcript: {
        source: 'text-only',
        evidence: 'recorded-audio',
        text: '95% to 65%',
        words: [],
      },
      windows,
    });
    expect(noTimings.verifications[0]?.detail).toMatch(/no word timings/);

    const unknownBeat = verifyNarrationClaims({
      claims: parseNarrationClaims([{ id: 'stray', beat: '9', phrase: '95% to 65%' }]),
      transcript: narration(12),
      windows,
    });
    expect(unknownBeat.verifications[0]).toMatchObject({ status: 'unverifiable' });
    expect(unknownBeat.verifications[0]?.detail).toMatch(/No cut mark is labelled beat "9"/);
  });

  it('accepts a phrase spoken in any window carrying the beat label', () => {
    const repeated = deriveBeatWindows(
      parseCuts({
        usable: true,
        marks: [
          { t: 0, beat: '4' },
          { t: 10, beat: '3' },
          { t: 20, beat: '4' },
        ],
      }),
      30,
    );
    const report = verifyNarrationClaims({
      claims: parseNarrationClaims([{ id: 'range', beat: '4', phrase: '95% to 65%' }]),
      transcript: narration(22),
      windows: repeated,
    });
    expect(report.verifications[0]?.status).toBe('satisfied');
  });

  it('names the absence of a beat when the phrase lands outside every window', () => {
    const report = verifyNarrationClaims({
      claims: parseNarrationClaims([{ id: 'range', beat: '4', phrase: '95% to 65%' }]),
      // Words at 40s+, past the 30s end of the last window, plus a word that
      // normalizes away to nothing.
      transcript: scriptedTranscript([
        ['—', 39.0, 39.1],
        ['95%', 40.0, 40.4],
        ['to', 40.5, 40.7],
        ['65%', 40.8, 41.2],
      ]),
      windows,
    });
    expect(report.verifications[0]?.status).toBe('spoken-outside-beat');
    expect(report.verifications[0]?.occurrences).toEqual([
      { startSeconds: 40, endSeconds: 41.2, beat: null },
    ]);
    expect(report.verifications[0]?.detail).toMatch(/\(beat no beat\)/);
  });

  it('rejects a claim file with unknown fields or a blank phrase', () => {
    expect(() => parseNarrationClaims([{ id: 'a', beat: '1', phrase: 'x', at: 4 }])).toThrow();
    expect(() => parseNarrationClaims([{ id: 'a', beat: '1', phrase: '  ' }])).toThrow();
  });
});
