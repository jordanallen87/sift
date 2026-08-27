/**
 * Semantic page-object wrapper over the real right-pane workspace
 * (docs/superpowers/plans/2026-08-26-pax-hackathon-build.md Task 12:
 * "`PaxPage` exposes semantic methods for launch, investigate, ... review
 * proposal, ..., and read case context"). Every method drives the exact
 * same visible controls a real user clicks -- there is no shortcut that
 * bypasses `PaxCommands`/the real HTTP routes.
 *
 * `postCommand`/`getCaseState` below are the WebMCP-equivalent path: they
 * hit the exact same `/api/cases/:caseId/commands/:commandName` route
 * `apps/web/src/api/pax-client.ts` (and therefore every visible control and
 * every WebMCP tool callback) sends every command through
 * (CLAUDE.md "Visible UI controls and WebMCP callbacks use the same command
 * implementation") -- used for the two real product beats that currently
 * have no dedicated visible control (`updateCriteria` -- there is no
 * criteria-editing UI yet, only the WebMCP tool and this same HTTP route)
 * and, in the error-recovery spec, to construct a genuine, deterministic
 * `409 CONFLICT`. Real production browsers without WebMCP support (every
 * stock Chromium, confirmed via `WebMcpStatus`'s `adapter.supported()`
 * check -- see `model-context/adapter.ts`'s own header comment: "No runtime
 * WebMCP polyfill ... is added anywhere in this module or task") cannot
 * register `document.modelContext` tools at all, so this is the honest way
 * to exercise "a key WebMCP call" from Playwright without fabricating
 * browser support that does not exist.
 */
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/** Real, stable car-purchase fixture candidate ids (`packages/scenarios/src/seeds.ts`). */
export const CAR_PURCHASE_CANDIDATE_IDS = [
  'candidate-rav4',
  'candidate-crv',
  'candidate-cx5',
  'candidate-outback',
] as const;

/** Real pack-declared criterion ids the proven scenario trajectory reweights (`apps/agent/src/runtime/car-purchase-scenario.ts`). */
export const CAR_PURCHASE_CRITERION_IDS = {
  drivingComfort: 'pref.driving_comfort',
  ownershipCost: 'pref.ownership_cost',
} as const;

export interface LaunchedCase {
  caseId: string;
}

export interface CustomConcernInput {
  slug: string;
  label: string;
  reason: string;
  valueType?: 'string' | 'number' | 'boolean' | 'enum';
  evidenceExpectation?: 'assertion' | 'verification';
  comparison?: 'none' | 'target' | 'higher_better' | 'lower_better';
}

function randomCommandId(commandName: string): string {
  return `e2e-${commandName}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Issues one real command through the exact HTTP route `PaxCommands`/WebMCP tools use, with a fresh idempotency key. See this file's header comment for why this is the honest way to exercise a "key WebMCP call" from Playwright. */
export async function postCommand(
  request: APIRequestContext,
  caseId: string,
  commandName: string,
  body: Record<string, unknown>,
  commandId: string = randomCommandId(commandName),
): Promise<APIResponse> {
  return request.post(`/api/cases/${encodeURIComponent(caseId)}/commands/${commandName}`, {
    data: { ...body, caseId },
    headers: { 'Idempotency-Key': commandId },
  });
}

/** Reads the real canonical `CaseState` via `GET /api/cases/:caseId` -- the same route the WebMCP `pax_get_case_context` tool's own case data ultimately mirrors. */
export async function getCaseState(
  request: APIRequestContext,
  caseId: string,
): Promise<Record<string, unknown>> {
  const response = await request.get(`/api/cases/${encodeURIComponent(caseId)}`);
  expect(response.ok(), `GET /api/cases/${caseId} failed with status ${response.status()}`).toBe(
    true,
  );
  return (await response.json()) as Record<string, unknown>;
}

export class PaxPage {
  constructor(readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.getByTestId('demo-launcher')).toBeVisible();
  }

  /** Clicks "Choose our next car" and waits for the real `POST /api/cases/demo` response, returning its `caseId`. */
  async launchCarPurchase(): Promise<LaunchedCase> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().includes('/api/cases/demo') && res.request().method() === 'POST',
      ),
      this.page.getByTestId('demo-launcher-car-purchase').click(),
    ]);
    const body = (await response.json()) as { caseId: string };
    await expect(this.page.getByTestId('case-workspace')).toBeVisible();
    return { caseId: body.caseId };
  }

  /**
   * Clicks "Request investigation" and returns the real `runId` from the
   * successful `POST /api/cases/:caseId/run` response, so a caller can
   * unambiguously wait for *this* run (not a stale "Completed" left over
   * from an earlier one) via `waitForInvestigationCompleted`.
   *
   * Waits specifically for an *ok* response, not merely a matching URL:
   * `App.tsx`'s `handleRequestInvestigation` automatically retries once on
   * a real `409 CONFLICT` (a genuine, expected race in the real-time
   * system -- the browser's SSE-delivered `eventSequence` can be one event
   * behind the server the instant this control is pressed), so the first
   * response on this URL is not always the one that actually carries a
   * `runId`.
   */
  async requestInvestigation(): Promise<{ runId: string }> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) =>
          /\/api\/cases\/[^/]+\/run$/.test(res.url()) &&
          res.request().method() === 'POST' &&
          res.ok(),
      ),
      this.page.getByTestId('request-investigation').click(),
    ]);
    const body = (await response.json()) as { runId: string };
    return { runId: body.runId };
  }

  /**
   * Waits for `LiveRunStatus` to report *this exact* `runId`'s phase as
   * "Completed" -- driven purely by real streamed `PublicActivityEvent`s,
   * never a fixed sleep. Polls both the correlated run id and phase
   * together (rather than the phase alone) so a stale "Completed" left over
   * from a previous run's own correlated card can never satisfy this wait.
   */
  async waitForInvestigationCompleted(runId: string): Promise<void> {
    await expect
      .poll(
        async () => {
          const runIdText = await this.page
            .getByTestId('live-run-status-run-id')
            .textContent()
            .catch(() => null);
          const phaseText = await this.page
            .getByTestId('live-run-status-phase')
            .textContent()
            .catch(() => null);
          return Boolean(runIdText?.includes(runId)) && Boolean(phaseText?.includes('Completed'));
        },
        { timeout: 30_000, message: `run "${runId}" did not reach "Completed" in time` },
      )
      .toBe(true);
  }

  async waitForRecommendationReady(): Promise<void> {
    await expect(this.page.getByTestId('recommendation-card-status')).toContainText(
      'Ready for review',
      {
        timeout: 30_000,
      },
    );
  }

  /** Fills and submits `CustomConcernForm` without asserting the outcome -- used directly by tests that expect a real error (`error-recovery.spec.ts`); `submitCustomConcern` below is the success-asserting convenience wrapper every other spec uses. */
  async fillAndSubmitCustomConcern(input: CustomConcernInput): Promise<void> {
    const form = this.page.getByTestId('custom-concern-form');
    await form.getByLabel('Concern id').fill(input.slug);
    await form.getByLabel('Label', { exact: true }).fill(input.label);
    if (input.valueType) await form.getByLabel('Value type').selectOption(input.valueType);
    if (input.evidenceExpectation) {
      await form.getByLabel('Evidence expectation').selectOption(input.evidenceExpectation);
    }
    if (input.comparison) await form.getByLabel('Comparison').selectOption(input.comparison);
    await form.getByLabel('Why this matters to you').fill(input.reason);
    await form.getByTestId('custom-concern-form-submit').click();
  }

  /** The visible-control equivalent of `pax_define_case_attribute` (`CustomConcernForm.tsx`). A `user`-origin submission is auto-confirmed server-side (`packages/core/src/extensions.ts`), so no separate confirmation step is required afterward. */
  async submitCustomConcern(input: CustomConcernInput): Promise<void> {
    await this.fillAndSubmitCustomConcern(input);
    await expect(
      this.page.getByTestId('custom-concern-form').getByTestId('custom-concern-form-success'),
    ).toBeVisible();
  }

  async approveProposal(): Promise<void> {
    await this.page.getByTestId('approval-card-approve').click();
    await expect(this.page.getByTestId('approval-card-stamp')).toContainText('Approved');
  }
}
