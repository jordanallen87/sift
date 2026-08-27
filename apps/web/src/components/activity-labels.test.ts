import { describe, expect, it } from 'vitest';
import { PUBLIC_ACTIVITY_EVENT_TYPES } from '@pax/contracts';
import { getActivityLabel, STATUS_TONE_META, STATUS_TONES } from './activity-labels.js';

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
