import { describe, expect, it } from 'vitest';
import type { PublicActivityEventType } from '@sift/contracts';
import { PUBLIC_ACTIVITY_EVENT_TYPES } from '@sift/contracts';
import {
  getActivityLabel,
  STATUS_TONE_META,
  STATUS_TONES,
  type StatusTone,
} from './activity-labels.js';

describe('activity-labels', () => {
  it.each(PUBLIC_ACTIVITY_EVENT_TYPES)(
    'maps every real PublicActivityEventType %s to a safe, non-raw label',
    (type) => {
      const entry = getActivityLabel(type);

      expect(entry.label.length).toBeGreaterThan(0);
      // Never the raw internal type string itself.
      expect(entry.label).not.toBe(type);
      // Never leaking the dotted/underscored internal token shape either.
      expect(entry.label).not.toMatch(/[a-z]+\.[a-z_]+/);
      expect(STATUS_TONES).toContain(entry.tone);
    },
  );

  // Task A6: "every mapping the file declares should be asserted" -- this
  // table pins the EXACT expected label/tone for every real event type, not
  // just the generic safety properties above. A future accidental edit to
  // any single entry (or a copy regression during a later rename) fails
  // here by name, not just by a passing generic shape check.
  interface ExpectedEntry {
    label: string;
    tone: StatusTone;
  }

  const EXPECTED_LABELS: Record<PublicActivityEventType, ExpectedEntry> = {
    // Task A6: "command" is engine vocabulary; a `commandId` itself is
    // "developer view only" (product.md row 186) regardless.
    'command.accepted': { label: 'Update accepted', tone: 'neutral' },
    'run.queued': { label: 'Investigation queued', tone: 'open' },
    'run.started': { label: 'Investigation started', tone: 'active' },
    'run.completed': { label: 'Investigation completed', tone: 'satisfied' },
    'run.failed': { label: 'Investigation failed', tone: 'error' },
    'specialist.started': { label: 'A step in the investigation started', tone: 'active' },
    'specialist.completed': { label: 'A step in the investigation finished', tone: 'satisfied' },
    'skill.activated': { label: 'A new capability activated', tone: 'active' },
    'tool.started': { label: 'Looking something up', tone: 'active' },
    'tool.completed': { label: 'Finished looking something up', tone: 'satisfied' },
    'tool.failed': { label: "Couldn't complete that lookup", tone: 'error' },
    // product.md terminology table, verbatim: `Guide` -> "Agent redirected".
    'intervention.guided': { label: 'Agent redirected', tone: 'active' },
    // product.md terminology table, verbatim: `Confirm` -> "Your approval needed".
    'intervention.confirmation_required': { label: 'Your approval needed', tone: 'ready' },
    // change-set §4: `Evidence` -> "Research/Source/Fact".
    'evidence.accepted': { label: 'Finding accepted', tone: 'satisfied' },
    // The literal change-set §48 example pair: "Research disagrees" <->
    // `evidence.conflicted`.
    'evidence.conflicted': { label: 'Research disagrees', tone: 'blocked' },
    // product.md terminology table, verbatim: `Obligation` -> "Question to resolve".
    'obligation.updated': { label: 'Question to resolve updated', tone: 'open' },
    'recommendation.invalidated': {
      label: 'Current recommendation needs another look',
      tone: 'stale',
    },
    'recommendation.ready': { label: 'Current recommendation ready for decision', tone: 'ready' },
    // Exact required copy (docs/specs/value-proposition.md "Required visible copy").
    'draft.withheld': { label: 'Draft withheld', tone: 'blocked' },
    // product.md terminology table: `Case` -> "Comparison / Decision".
    'case.snapshot': { label: 'Comparison updated', tone: 'neutral' },
  };

  it('this test file itself covers every real PublicActivityEventType (no type silently un-asserted)', () => {
    expect(Object.keys(EXPECTED_LABELS).sort()).toEqual([...PUBLIC_ACTIVITY_EVENT_TYPES].sort());
  });

  it.each(Object.entries(EXPECTED_LABELS) as [PublicActivityEventType, ExpectedEntry][])(
    'maps %s to its exact expected label and tone',
    (type, expected) => {
      const entry = getActivityLabel(type);
      expect(entry.label).toBe(expected.label);
      expect(entry.tone).toBe(expected.tone);
    },
  );

  it('maps the premature-conclusion event to the exact required "Draft withheld" copy', () => {
    // docs/specs/value-proposition.md "Required visible copy".
    expect(getActivityLabel('draft.withheld').label).toBe('Draft withheld');
  });

  it('maps intervention.guided and intervention.confirmation_required to the exact terminology-table labels', () => {
    // docs/specs/product.md "User-facing terminology": Guide -> "Agent
    // redirected", Confirm -> "Your approval needed".
    expect(getActivityLabel('intervention.guided').label).toBe('Agent redirected');
    expect(getActivityLabel('intervention.confirmation_required').label).toBe(
      'Your approval needed',
    );
  });

  it('maps obligation.updated to the "Question to resolve" terminology, never "obligation"', () => {
    const entry = getActivityLabel('obligation.updated');
    expect(entry.label).toMatch(/question to resolve/i);
    expect(entry.label).not.toMatch(/obligation/i);
  });

  // Task A6, the literal change-set §48 example pairing.
  it('maps evidence.conflicted to "Research disagrees" (change-set §48 consumer<->dev pair), never "evidence" or "conflicted"', () => {
    const entry = getActivityLabel('evidence.conflicted');
    expect(entry.label).toBe('Research disagrees');
    expect(entry.label).not.toMatch(/evidence/i);
    expect(entry.label).not.toMatch(/conflicted/i);
  });

  // Task A6: none of the four engine-role words this pass specifically
  // targeted may survive into any label -- "command," "specialist,"
  // "skill," or "tool" are all implementation vocabulary (change-set §4's
  // guiding rule: explain what something means for the decision, not how
  // Sift implemented it), never itself an event's specific actor name
  // (which reaches the reader through `event.summary` instead).
  it.each(['command', 'specialist', 'skill', 'tool'])(
    'never uses the internal role/action word "%s" in any label',
    (word) => {
      for (const type of PUBLIC_ACTIVITY_EVENT_TYPES) {
        expect(getActivityLabel(type).label.toLowerCase()).not.toContain(word);
      }
    },
  );

  // Task A6: "No raw internal id may appear in consumer UI -- no
  // custom.* attribute ids, no commandId, no runId, no pack compiled
  // hash." Structurally true today (`getActivityLabel` is keyed only by
  // `type`, a closed enum, and never interpolates any caller-supplied
  // value into its return), but pinned here as an explicit, real assertion
  // over every real label this table can ever produce, not left implicit.
  it('never leaks a raw internal id (custom.* attribute id, commandId, runId, or a pack compiled hash) in any label', () => {
    const compiledHashPattern = /[0-9a-f]{16,}/i; // a hex id/hash of meaningful length
    for (const type of PUBLIC_ACTIVITY_EVENT_TYPES) {
      const { label } = getActivityLabel(type);
      expect(label).not.toMatch(/custom\./);
      expect(label).not.toMatch(/command ?id/i);
      expect(label).not.toMatch(/run ?id/i);
      expect(label).not.toMatch(compiledHashPattern);
    }
    // Same guarantee for the unrecognized-type fallback and an
    // adversarial-looking input carrying exactly the shapes this test
    // guards against -- `getActivityLabel` must not reflect its own input
    // back out under any circumstance.
    expect(getActivityLabel('custom.some_attribute_id').label).not.toMatch(/custom\./);
    expect(getActivityLabel('commandId-abc123').label).not.toMatch(/command ?id/i);
  });

  it('falls back to a safe generic label for an unrecognized event type instead of the raw string', () => {
    const entry = getActivityLabel('some.future.event.type');
    expect(entry.label).toBe('Activity update');
    expect(entry.label).not.toBe('some.future.event.type');
    expect(entry.tone).toBe('neutral');
  });

  it('falls back safely for an empty string type', () => {
    const entry = getActivityLabel('');
    expect(entry.label).toBe('Activity update');
  });

  it('every status tone has a complete ink/bg/border/icon meta entry', () => {
    for (const tone of STATUS_TONES) {
      const meta = STATUS_TONE_META[tone];
      expect(meta.ink).toMatch(/^var\(--color-/);
      expect(meta.bg).toMatch(/^var\(--color-/);
      expect(meta.border).toMatch(/^var\(--color-/);
      expect(meta.icon.length).toBeGreaterThan(0);
    }
  });
});
