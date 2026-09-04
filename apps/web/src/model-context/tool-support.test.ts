/**
 * Behavioral tests for `validationFailureEnvelope`'s machine-readable
 * rejection detail (docs/specs/webmcp.md "Tool result envelope").
 *
 * The contract under test is what a REJECTED caller can do next: it must be
 * told which path failed and which rule it broke, so it can repair the call
 * itself instead of the human noticing a silent no-op and relaying the
 * correction in chat. Two things bound that: the message names a small
 * number of problems and says how many it withheld, and it never echoes a
 * received value -- the redaction rule in
 * docs/specs/debugging-and-observability.md applies to model-facing output
 * exactly as it applies to telemetry, and a rejected payload is where a
 * pasted note or price is most likely to be sitting.
 *
 * Real `@sift/contracts` schemas are parsed with genuinely invalid input
 * rather than hand-built `ZodError`s, so these tests fail if the installed
 * zod changes the issue shapes this rendering reads.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DefineCaseAttributeInputSchema } from '@sift/contracts';
import { validationFailureEnvelope } from './tool-support.js';

const GENERIC_MESSAGE = 'Input failed validation against the tool schema.';

// Mirrors the module's own cap deliberately rather than importing it: a
// test that reads the constant it is checking cannot notice the cap being
// changed by accident.
const MAX_REPORTED_ISSUES = 5;

// Shaped to read like a leaked credential to a human while staying well
// under the source scanner's secret heuristics (short, lowercase, kebab) --
// the point is that the renderer never prints an input value, not that this
// particular string is unprintable.
const pastedSecretLookingNote = 'pk-live-not-a-real-key';

const validDefinition = {
  id: 'custom.crateFit',
  label: 'Crate fit',
  valueType: 'enum',
  appliesTo: ['option-outback'],
  allowedValues: ['one crate', 'two crates'],
  orderedValues: ['one crate', 'two crates'],
  evidenceExpectation: 'source',
  comparison: 'higher_better',
  reason: 'The household hauls two dog crates every weekend.',
} as const;

/** Parses genuinely invalid input through a real contract schema, failing loudly if a fixture stops being invalid. */
function rejectionFor(input: unknown): z.ZodError {
  const parsed = DefineCaseAttributeInputSchema.safeParse(input);
  if (parsed.success) {
    throw new Error('Fixture parsed successfully; it must be invalid to produce a rejection.');
  }
  return parsed.error;
}

function messageFor(input: unknown): string {
  return validationFailureEnvelope(rejectionFor(input)).message;
}

/** Counts rendered `path — rule` entries; splitting on `; ` would miscount, since a rule may contain its own semicolon. */
function renderedEntryCount(message: string): number {
  return message.split(' — ').length - 1;
}

describe('validationFailureEnvelope', () => {
  it('returns the original generic sentence when called with no argument', () => {
    expect(validationFailureEnvelope()).toEqual({
      ok: false,
      message: GENERIC_MESSAGE,
      ui: { changed: false },
      error: { code: 'VALIDATION', retryable: false },
    });
  });

  it('uses a caller-supplied string verbatim', () => {
    const envelope = validationFailureEnvelope('expectedSequence must be a number.');

    expect(envelope.message).toBe('expectedSequence must be a number.');
    expect(envelope.ok).toBe(false);
    expect(envelope.ui).toEqual({ changed: false });
    expect(envelope.error).toEqual({ code: 'VALIDATION', retryable: false });
  });

  it('keeps the VALIDATION error code, non-retryability, and unchanged UI when given a ZodError', () => {
    const parsed = DefineCaseAttributeInputSchema.safeParse({ caseId: 'case-1' });
    if (parsed.success) throw new Error('Fixture must be invalid.');

    // Called exactly the way a tool callback calls it, so this also proves
    // `safeParse(...).error` is assignable to the published signature.
    const envelope = validationFailureEnvelope(parsed.error);

    expect(envelope.ok).toBe(false);
    expect(envelope.ui).toEqual({ changed: false });
    expect(envelope.error).toEqual({ code: 'VALIDATION', retryable: false });
    expect(envelope.data).toBeUndefined();
  });

  it('names the failing path and the rule for each issue in a real contract rejection', () => {
    const message = messageFor({
      caseId: 'case-1',
      definition: { ...validDefinition, orderedValues: ['one crate'] },
    });

    expect(message).not.toBe(GENERIC_MESSAGE);
    expect(message.startsWith('Input failed validation against the tool schema: ')).toBe(true);
    // An absent required property reads as `Required`, not as zod's
    // "expected number, received undefined" phrasing.
    expect(message).toContain('expectedSequence — Required');
    // The rule text a caller actually needs, authored by the schema itself.
    expect(message).toContain(
      'definition.orderedValues — orderedValues must place every allowed grade on the scale; these have no position: two crates',
    );
    expect(message.endsWith('.')).toBe(true);
  });

  it('renders nested and array paths in the notation the caller sent them in', () => {
    const message = messageFor({
      caseId: 'case-1',
      expectedSequence: 3,
      definition: validDefinition,
      values: [
        { optionId: 'option-outback', status: 'unknown' },
        { optionId: 'option-forester', status: 'observed', value: 'two crates' },
      ],
    });

    expect(message).toContain(
      'values[0].reason — an unknown value must state why it could not be established',
    );
    expect(message).toContain('values[1].value —');
    expect(message).toContain('values[1].status —');
  });

  it('reports a wrong type as an expectation rather than as the value received', () => {
    const message = messageFor({
      caseId: 'case-1',
      expectedSequence: 3,
      definition: { ...validDefinition, appliesTo: pastedSecretLookingNote },
    });

    expect(message).toContain('definition.appliesTo — Invalid input: expected array');
    expect(message).not.toContain(pastedSecretLookingNote);
  });

  it('names an unrecognized property so a caller can tell a typo from an invented field', () => {
    const message = messageFor({
      caseId: 'case-1',
      expectedSequence: 3,
      definition: { ...validDefinition, orderdValues: ['one crate'] },
    });

    expect(message).toContain(
      'definition.orderdValues — Unrecognized property, which this tool does not accept',
    );
  });

  describe('bounding the message', () => {
    const manyProblems = {
      caseId: 5,
      expectedSequence: 'three',
      definition: {
        id: 1,
        label: 2,
        valueType: 'nope',
        appliesTo: 'nope',
        evidenceExpectation: 'nope',
        comparison: 'nope',
        reason: 4,
      },
      values: 'nope',
    };

    it('names at most five problems and counts the ones it withheld', () => {
      const error = rejectionFor(manyProblems);
      expect(error.issues.length).toBeGreaterThan(MAX_REPORTED_ISSUES + 1);

      const message = validationFailureEnvelope(error).message;

      expect(renderedEntryCount(message)).toBe(MAX_REPORTED_ISSUES);
      expect(message).toContain(
        `${error.issues.length - MAX_REPORTED_ISSUES} further issues not shown`,
      );
    });

    it('keeps the outermost issues, which are the ones whose repair removes the rest', () => {
      const message = validationFailureEnvelope(rejectionFor(manyProblems)).message;

      expect(message).toContain('caseId —');
      expect(message).toContain('expectedSequence —');
    });

    it('says nothing about omissions when every issue fits', () => {
      const message = messageFor({ caseId: 'case-1', definition: validDefinition });

      expect(message).not.toContain('not shown');
    });

    it('counts a single withheld issue in the singular', () => {
      const sixRequiredFields = z.object({
        a: z.string(),
        b: z.string(),
        c: z.string(),
        d: z.string(),
        e: z.string(),
        f: z.string(),
      });
      const parsed = sixRequiredFields.safeParse({});
      if (parsed.success) throw new Error('Fixture must be invalid.');

      const message = validationFailureEnvelope(parsed.error).message;

      expect(renderedEntryCount(message)).toBe(MAX_REPORTED_ISSUES);
      expect(message).toContain('1 further issue not shown');
    });
  });

  describe('never echoing a received value', () => {
    it('withholds a value that failed a type check', () => {
      const message = messageFor({
        caseId: 'case-1',
        expectedSequence: 3,
        definition: { ...validDefinition, label: { note: pastedSecretLookingNote } },
      });

      expect(message).toContain('definition.label —');
      expect(message).not.toContain(pastedSecretLookingNote);
    });

    it('withholds a value that failed an enum check while still listing the allowed options', () => {
      const message = messageFor({
        caseId: 'case-1',
        expectedSequence: 3,
        definition: { ...validDefinition, comparison: pastedSecretLookingNote },
      });

      expect(message).toContain('definition.comparison —');
      expect(message).toContain('higher_better');
      expect(message).not.toContain(pastedSecretLookingNote);
    });

    it('withholds a value that broke a length bound', () => {
      const message = messageFor({
        caseId: 'case-1',
        expectedSequence: 3,
        definition: { ...validDefinition, unit: `${pastedSecretLookingNote}`.repeat(20) },
      });

      expect(message).toContain('definition.unit —');
      expect(message).not.toContain(pastedSecretLookingNote);
    });

    it('withholds a value carried on an unrecognized key whose name is not identifier-shaped', () => {
      const message = messageFor({
        caseId: 'case-1',
        expectedSequence: 3,
        definition: validDefinition,
        [pastedSecretLookingNote]: 'anything',
      });

      expect(message).toContain('<redacted key> — Unrecognized property');
      expect(message).not.toContain(pastedSecretLookingNote);
    });

    it('withholds a record key that is not identifier-shaped, since a path segment can come from the input too', () => {
      const readings = z.object({ readings: z.record(z.string(), z.number()) }).strict();
      const parsed = readings.safeParse({ readings: { [pastedSecretLookingNote]: 'nope' } });
      if (parsed.success) throw new Error('Fixture must be invalid.');

      const message = validationFailureEnvelope(parsed.error).message;

      expect(message).toContain('readings.<redacted key> —');
      expect(message).not.toContain(pastedSecretLookingNote);
    });

    it('still prints an identifier-shaped record key, which is a location rather than a payload', () => {
      const readings = z.object({ readings: z.record(z.string(), z.number()) }).strict();
      const parsed = readings.safeParse({ readings: { cabinDepthMm: 'nope' } });
      if (parsed.success) throw new Error('Fixture must be invalid.');

      const message = validationFailureEnvelope(parsed.error).message;

      expect(message).toContain('readings.cabinDepthMm —');
    });
  });

  describe('rendering rules this module owns rather than delegating to zod', () => {
    it('replaces zod\'s bare "Invalid input" for a failed union with the field and what went wrong', () => {
      const schema = z.object({ payload: z.union([z.string(), z.number()]) });
      const parsed = schema.safeParse({ payload: { nested: true } });
      if (parsed.success) throw new Error('Fixture must be invalid.');

      const message = validationFailureEnvelope(parsed.error).message;

      expect(message).toContain('payload — Did not match any of the shapes this field accepts');
    });

    it('names the payload as a whole when an issue has no path', () => {
      const parsed = z.object({ a: z.string() }).safeParse('not an object');
      if (parsed.success) throw new Error('Fixture must be invalid.');

      const message = validationFailureEnvelope(parsed.error).message;

      expect(message).toContain('(root) — Invalid input: expected object');
    });

    it('falls back to the generic sentence when a rejection carries no issues at all', () => {
      const empty = new z.ZodError([]);

      expect(validationFailureEnvelope(empty).message).toBe(GENERIC_MESSAGE);
    });

    it("does not let a rule's own trailing punctuation collide with the separators", () => {
      const schema = z.object({ note: z.string().min(1, 'note must not be blank.') });
      const parsed = schema.safeParse({ note: '' });
      if (parsed.success) throw new Error('Fixture must be invalid.');

      const message = validationFailureEnvelope(parsed.error).message;

      expect(message).toBe(
        'Input failed validation against the tool schema: note — note must not be blank.',
      );
    });
  });
});
