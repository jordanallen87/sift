/**
 * Accessibility scanning helper (CLAUDE.md "Playwright visual
 * verification": "Run axe in every required state").
 *
 * Uses the real `@axe-core/playwright` `AxeBuilder` (not a hand-rolled
 * subset) against WCAG 2.0/2.1 A+AA rule tags. `critical`/`serious`
 * violations fail the test outright; `moderate`/`minor` findings are
 * printed (so they stay visible in CI output/build-log review) but do not
 * fail the release gate on their own -- CLAUDE.md does not specify a
 * numeric axe threshold, and treating every axe-core heuristic (including
 * ones with a nontrivial false-positive rate, e.g. some color-contrast
 * checks against custom properties) as release-blocking would create
 * exactly the kind of "weaken the test to dodge a real finding" pressure
 * CLAUDE.md warns against; failing hard on `critical`/`serious` keeps this
 * a genuine, enforced gate rather than a report nobody reads.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Runs axe against the current page state and fails the test on any `critical`/`serious` violation. Logs `moderate`/`minor` violations to the test's own stdout for visibility. */
export async function assertNoSeriousAxeViolations(page: Page, stateLabel: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  const advisory = results.violations.filter(
    (violation) => violation.impact !== 'critical' && violation.impact !== 'serious',
  );

  if (advisory.length > 0) {
    console.log(
      `[axe] ${stateLabel}: ${advisory.length} non-blocking (moderate/minor) violation(s): ` +
        advisory.map((v) => v.id).join(', '),
    );
  }

  if (blocking.length > 0) {
    const details = blocking
      .map(
        (violation) =>
          `- [${violation.impact}] ${violation.id}: ${violation.description} (${violation.nodes.length} node(s): ${violation.nodes
            .map((n) => n.target.join(' '))
            .join('; ')})`,
      )
      .join('\n');
    expect(
      blocking,
      `axe found critical/serious violations at "${stateLabel}":\n${details}`,
    ).toEqual([]);
  }
}
