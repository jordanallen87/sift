import { z } from 'zod';
import type { BeatWindow } from './cuts.js';
import type { Transcript, TranscriptEvidence, TranscriptWord } from './transcribe.js';

const NonEmptyTextSchema = z.string().trim().min(1);

export const NarrationClaimSchema = z
  .object({
    id: NonEmptyTextSchema,
    /** The beat the phrase must be spoken during; matched against a cut mark's `beat`. */
    beat: z.union([NonEmptyTextSchema, z.number()]).transform(String),
    /** The words that must be heard, e.g. `"95% to 65%"`. */
    phrase: NonEmptyTextSchema,
  })
  .strict();

export type NarrationClaim = z.infer<typeof NarrationClaimSchema>;

export function parseNarrationClaims(value: unknown): NarrationClaim[] {
  return z.array(NarrationClaimSchema).parse(value);
}

export type ClaimStatus =
  /** Spoken, inside the beat it was promised to. */
  | 'satisfied'
  /** Spoken, but while a different beat was on screen — audio describing something not in frame. */
  | 'spoken-outside-beat'
  /** Not in the transcript at all. */
  | 'not-spoken'
  /** Nothing was checked. Never treat this as a pass. */
  | 'unverifiable';

export interface SpokenSpan {
  startSeconds: number;
  endSeconds: number;
  /** The beat actually on screen while the phrase was spoken, if any. */
  beat: string | null;
}

export interface TimeRange {
  startSeconds: number;
  endSeconds: number;
}

export interface ClaimVerification {
  claimId: string;
  beat: string;
  phrase: string;
  status: ClaimStatus;
  detail: string;
  expectedWindows: readonly TimeRange[];
  occurrences: readonly SpokenSpan[];
}

export interface ClaimReport {
  ok: boolean;
  transcriptSource: string | null;
  evidence: TranscriptEvidence | null;
  satisfied: number;
  verifications: readonly ClaimVerification[];
}

/**
 * Speech and script never agree on punctuation or casing, but they do agree on
 * digits, decimal points and percent signs — which is exactly where the
 * expensive claims live ("95% to 65%", "confidence 0.4"). So: lowercase, keep
 * digits/letters/`%`, keep a decimal point only between digits, drop everything
 * else, and compare token sequences rather than raw strings.
 */
export function normalizeSpokenText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/[^a-z0-9%.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

interface Token {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

/**
 * One transcript word can normalize to several tokens (`"ninety-five"` becomes
 * `ninety five`) or to none (a standalone comma). Split words inherit the whole
 * word's span: the resulting phrase boundaries are a few tens of milliseconds
 * wide at worst, far inside any beat window.
 */
function tokenize(words: readonly TranscriptWord[]): Token[] {
  const tokens: Token[] = [];
  for (const word of words) {
    const normalized = normalizeSpokenText(word.text);
    if (normalized === '') continue;
    for (const text of normalized.split(' ')) {
      tokens.push({ text, startSeconds: word.startSeconds, endSeconds: word.endSeconds });
    }
  }
  return tokens;
}

function findOccurrences(tokens: readonly Token[], needle: readonly string[]): TimeRange[] {
  const spans: TimeRange[] = [];
  if (needle.length === 0) return spans;

  for (let start = 0; start + needle.length <= tokens.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (tokens[start + offset]?.text !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const first = tokens[start];
    const last = tokens[start + needle.length - 1];
    if (first === undefined || last === undefined) continue;
    spans.push({ startSeconds: first.startSeconds, endSeconds: last.endSeconds });
  }
  return spans;
}

function windowContaining(windows: readonly BeatWindow[], span: TimeRange): BeatWindow | undefined {
  const midpoint = (span.startSeconds + span.endSeconds) / 2;
  return windows.find((window) => midpoint >= window.startSeconds && midpoint < window.endSeconds);
}

function isInside(span: TimeRange, window: BeatWindow, toleranceSeconds: number): boolean {
  return (
    span.startSeconds >= window.startSeconds - toleranceSeconds &&
    span.endSeconds <= window.endSeconds + toleranceSeconds
  );
}

function formatSeconds(value: number): string {
  return `${value.toFixed(2)}s`;
}

function formatRanges(ranges: readonly TimeRange[]): string {
  return ranges
    .map((range) => `${formatSeconds(range.startSeconds)}–${formatSeconds(range.endSeconds)}`)
    .join(', ');
}

export interface VerifyNarrationClaimsInput {
  claims: readonly NarrationClaim[];
  /** Absent when transcription was unavailable — every claim then reports a gap. */
  transcript?: Transcript | undefined;
  windows: readonly BeatWindow[];
  /**
   * Slack at each beat boundary. Narration routinely runs a fraction of a
   * second past a cut without the viewer perceiving a mismatch; anything larger
   * than this is the defect being hunted, not a rounding artifact.
   */
  toleranceSeconds?: number;
}

export const DEFAULT_CLAIM_TOLERANCE_SECONDS = 0.35;

/**
 * Pure: the check this whole lane exists for — does the soundtrack say what the
 * script promised, while the screen shows the beat the script promised it
 * against?
 *
 * Every outcome that is not a verified match is named. A claim whose beat has
 * no cut mark, or a transcript with no word timings, reports `unverifiable`
 * rather than quietly passing: an unchecked claim is a gap in the review, and
 * calling it a pass is how the defect ships.
 */
export function verifyNarrationClaims(input: VerifyNarrationClaimsInput): ClaimReport {
  const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_CLAIM_TOLERANCE_SECONDS;
  const transcript = input.transcript;
  const tokens = transcript === undefined ? [] : tokenize(transcript.words);

  const verifications = input.claims.map<ClaimVerification>((claim) => {
    const expectedWindows = input.windows.filter((window) => window.beat === claim.beat);
    const base = {
      claimId: claim.id,
      beat: claim.beat,
      phrase: claim.phrase,
      expectedWindows: expectedWindows.map((window) => ({
        startSeconds: window.startSeconds,
        endSeconds: window.endSeconds,
      })),
    };

    if (transcript === undefined) {
      return {
        ...base,
        status: 'unverifiable',
        detail: 'No transcript was available, so this claim was not checked.',
        occurrences: [],
      };
    }
    if (transcript.words.length === 0) {
      return {
        ...base,
        status: 'unverifiable',
        detail: `Transcript "${transcript.source}" has no word timings, so a phrase cannot be placed on the timeline.`,
        occurrences: [],
      };
    }
    if (expectedWindows.length === 0) {
      return {
        ...base,
        status: 'unverifiable',
        detail: `No cut mark is labelled beat "${claim.beat}", so there is no window to check the phrase against.`,
        occurrences: [],
      };
    }

    const needle = normalizeSpokenText(claim.phrase)
      .split(' ')
      .filter((token) => token !== '');
    const spans = findOccurrences(tokens, needle);
    const occurrences: SpokenSpan[] = spans.map((span) => ({
      startSeconds: span.startSeconds,
      endSeconds: span.endSeconds,
      beat: windowContaining(input.windows, span)?.beat ?? null,
    }));

    if (spans.length === 0) {
      return {
        ...base,
        status: 'not-spoken',
        detail: `The phrase "${claim.phrase}" is never spoken in transcript "${transcript.source}".`,
        occurrences,
      };
    }

    const matched = spans.find((span) =>
      expectedWindows.some((window) => isInside(span, window, toleranceSeconds)),
    );
    if (matched !== undefined) {
      return {
        ...base,
        status: 'satisfied',
        detail: `Spoken at ${formatSeconds(matched.startSeconds)}–${formatSeconds(matched.endSeconds)}, inside beat "${claim.beat}".`,
        occurrences,
      };
    }

    const heardIn = occurrences
      .map((occurrence) => occurrence.beat ?? 'no beat')
      .filter((beat, index, all) => all.indexOf(beat) === index)
      .join(', ');
    return {
      ...base,
      status: 'spoken-outside-beat',
      detail: `The phrase "${claim.phrase}" is spoken at ${formatRanges(spans)} (beat ${heardIn}) but beat "${claim.beat}" is on screen at ${formatRanges(base.expectedWindows)}. The narration describes something the viewer cannot see.`,
      occurrences,
    };
  });

  return {
    ok: verifications.every((verification) => verification.status === 'satisfied'),
    transcriptSource: transcript?.source ?? null,
    evidence: transcript?.evidence ?? null,
    satisfied: verifications.filter((verification) => verification.status === 'satisfied').length,
    verifications,
  };
}
