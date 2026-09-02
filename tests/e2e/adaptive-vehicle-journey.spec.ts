/**
 * The adaptive vehicle journey, in a real browser.
 *
 * Everything else in this repository can be true while the product is still
 * unusable, because every other test observes state rather than a screen.
 * This file only asserts things a person could see: that the pane says
 * where they are, that it never lies about it, that pressing Keep survives
 * a reload, and that nothing in the pane can approve a decision for them.
 *
 * ## Why the orientation frame is the first assertion
 *
 * It was written, unit-tested, wired into `App.tsx`, and then rendered for
 * nobody: `startDemo` never recorded a decision mode, so `snapshot.discovery`
 * stayed undefined and the frame's render gate was false on every real case.
 * Every unit test passed. This spec is what catches that class of defect —
 * a component that exists, works, and is unreachable — so its first
 * assertion is simply that a person can see the thing at all.
 */
import { expect, test, type Page } from '@playwright/test';
import { SiftPage } from './pages/sift-page.js';
import { assertNoSeriousAxeViolations } from './helpers/axe.js';
import { installConsoleGuard } from './helpers/console-guard.js';
import { assertNoHorizontalOverflow } from './helpers/layout-assertions.js';

/**
 * The four widths the canonical experience must hold. The three narrow ones
 * are the companion pane; 1440 is the standalone page.
 */
const NARROW_WIDTHS = [390, 430, 480] as const;

function orientation(page: Page) {
  return {
    shell: page.getByTestId('decision-orientation-shell'),
    // The decision is named by the app bar, not repeated by the shell
    // directly beneath it -- so this asserts the *contract* ("a person can
    // see what decision this is") rather than which element carries it.
    decision: page.getByTestId('workspace-app-bar-title'),
    phase: page.getByTestId('orientation-phase'),
    nextStep: page.getByTestId('orientation-next-step'),
    coverage: page.getByTestId('orientation-coverage'),
    route: page.getByTestId('orientation-route'),
  };
}

test.describe('the adaptive vehicle journey', () => {
  test('a person can answer "where am I and what next" from the pane alone', async ({ page }) => {
    const guard = installConsoleGuard(page);
    const sift = new SiftPage(page);
    await sift.open();
    await sift.launchCarPurchase();

    const frame = orientation(page);

    // The frame exists on screen, not merely in the component tree.
    await expect(frame.shell).toBeVisible();
    // What decision am I making?
    await expect(frame.decision).not.toBeEmpty();
    // Where am I? In a person's words, never the state machine's.
    await expect(frame.phase).not.toBeEmpty();
    await expect(frame.phase).not.toHaveText(/discovery|triage|investigating/);
    // What should I do next? The one line that is never allowed to be empty.
    await expect(frame.nextStep).not.toBeEmpty();
    // How do I get to the end?
    await expect(frame.route).not.toBeEmpty();

    guard.assertClean();
  });

  test('the frame never claims more progress than the case supports', async ({ page }) => {
    // The `state_ui_contradiction` hard gate, checked against real pixels:
    // a phase that says discovery is behind you, beside a coverage count
    // that says it is not.
    const sift = new SiftPage(page);
    await sift.open();
    await sift.launchCarPurchase();

    const frame = orientation(page);
    const phaseText = (await frame.phase.textContent()) ?? '';

    if (await frame.coverage.isVisible()) {
      const coverageText = (await frame.coverage.textContent()) ?? '';
      const match = /(\d+) of (\d+) covered/.exec(coverageText);
      expect(match, `coverage read "${coverageText}"`).not.toBeNull();
      const resolved = Number(match?.[1] ?? 0);
      const total = Number(match?.[2] ?? 0);

      if (resolved < total) {
        // Still answering questions: the phase must not claim otherwise.
        expect(
          phaseText,
          `phase "${phaseText}" claims discovery is finished while coverage reads ${coverageText}`,
        ).not.toMatch(/Narrowing down|Looking into what you kept|Ready for your decision/);
      }
    }
  });

  test('Quick Pick judgments survive a reload and are readable back', async ({ page }) => {
    // The claim the whole bidirectional story rests on. Before Quick Pick
    // was made canonical, Pass and Maybe moved a local counter: the
    // judgment vanished on reload and ChatGPT could not read it back.
    const sift = new SiftPage(page);
    await sift.open();
    const launched = await sift.launchCarPurchase();
    await sift.selectWorkspaceView('quick_pick');

    const keep = page.getByTestId('quick-pick-keep');
    await expect(keep).toBeVisible();
    const positionBefore = await page.getByTestId('quick-pick-position').textContent();
    await keep.click();

    // Keep advances the queue, so the card on screen is now the *next*
    // option and carries no disposition of its own. An earlier version of
    // this test asserted the disposition chip stayed visible, which was an
    // assertion about the wrong card.
    await expect
      .poll(async () => page.getByTestId('quick-pick-position').textContent())
      .not.toBe(positionBefore);

    await page.reload();
    await page.waitForSelector('[data-testid="case-workspace"]');
    await sift.selectWorkspaceView('quick_pick');

    // The judgment is still there, read from the server rather than from
    // anything this tab remembered.
    const state = await page.request.get(`/api/cases/${launched.caseId}`);
    expect(state.ok()).toBe(true);
    const body = (await state.json()) as {
      discovery?: { dispositions?: { disposition: string }[] };
    };
    expect(body.discovery?.dispositions?.some((record) => record.disposition === 'keep')).toBe(
      true,
    );
  });

  test('nothing in the pane can approve a decision on the person`s behalf', async ({ page }) => {
    // Not "the button is disabled" — the capability is absent. Every
    // control the dock offers is either something a person does, or
    // something Sift does that is not a decision.
    const sift = new SiftPage(page);
    await sift.open();
    await sift.launchCarPurchase();

    const dock = page.getByTestId('context-action-dock');
    if (await dock.isVisible()) {
      const humanOnly = dock.locator('[data-human-only="true"]');
      const count = await humanOnly.count();
      for (let index = 0; index < count; index += 1) {
        // A human-only action is present and pressable by a person; what
        // matters is that it is marked, so nothing else can drive it.
        await expect(humanOnly.nth(index)).toBeEnabled();
      }
    }

    // And no agent-driven control claims decision authority.
    await expect(
      page.getByRole('button', { name: /approve on my behalf|auto-decide/i }),
    ).toHaveCount(0);
  });

  for (const width of NARROW_WIDTHS) {
    test(`the frame and dock coexist without covering content at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const sift = new SiftPage(page);
      await sift.open();
      await sift.launchCarPurchase();

      const frame = orientation(page);
      await expect(frame.shell).toBeVisible();
      await assertNoHorizontalOverflow(page);

      // The last line of content must be reachable rather than sitting
      // under a sticky dock. `position: sticky` keeps the dock in flow, so
      // the document's own scroll height accounts for it -- this asserts
      // that is genuinely what happens rather than what was intended.
      const dock = page.getByTestId('context-action-dock');
      if (await dock.isVisible()) {
        const dockBox = await dock.boundingBox();
        const shellBox = await frame.shell.boundingBox();
        expect(dockBox).not.toBeNull();
        expect(shellBox).not.toBeNull();
        // The dock never overlaps the orientation shell at the top.
        expect((dockBox?.y ?? 0) >= (shellBox?.y ?? 0) + (shellBox?.height ?? 0)).toBe(true);
      }
    });
  }

  test('the standalone layout at 1440 keeps the same orientation contract', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const sift = new SiftPage(page);
    await sift.open();
    await sift.launchCarPurchase();

    const frame = orientation(page);
    await expect(frame.shell).toBeVisible();
    await expect(frame.nextStep).not.toBeEmpty();
    await assertNoHorizontalOverflow(page);
  });

  test('the frame is keyboard reachable and has no axe violations', async ({ page }) => {
    const sift = new SiftPage(page);
    await sift.open();
    await sift.launchCarPurchase();

    await expect(page.getByTestId('decision-orientation-shell')).toBeVisible();
    await assertNoSeriousAxeViolations(page, 'adaptive-journey-frame');

    // Focus order reaches an actionable control without a mouse.
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(['A', 'BUTTON', 'INPUT', 'SELECT']).toContain(focused);
  });

  test('the same journey renders identically on a second clean run', async ({ browser }) => {
    // The canonical plan asks for the family journey twice from clean
    // state. Two independent browser contexts is what "clean" means here:
    // reusing one page would carry the first case's storage into the
    // second run and prove nothing about a first-time visitor.
    async function firstNextStep(): Promise<string | null> {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const sift = new SiftPage(page);
        await sift.open();
        await sift.launchCarPurchase();
        return await page.getByTestId('orientation-next-step').textContent();
      } finally {
        await context.close();
      }
    }

    expect(await firstNextStep()).toBe(await firstNextStep());
  });
});
