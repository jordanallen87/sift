/**
 * Semantic page-object wrapper over the real right-pane workspace
 * (docs/superpowers/plans/2026-08-26-pax-hackathon-build.md Task 12:
 * "`SiftPage` exposes semantic methods for launch, investigate, ... review
 * proposal, ..., and read case context"). Every method drives the exact
 * same visible controls a real user clicks -- there is no shortcut that
 * bypasses `SiftCommands`/the real HTTP routes.
 *
 * `postCommand`/`getCaseState` below are the WebMCP-equivalent path: they
 * hit the exact same `/api/cases/:caseId/commands/:commandName` route
 * `apps/web/src/api/sift-client.ts` (and therefore every visible control and
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
import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * Real, stable car-purchase fixture candidate ids (`packages/scenarios/src/seeds.ts`), in the same
 * order `CaseState.entities` is actually built in (`CAR_PURCHASE_CANDIDATE_IDS.map(...)` there,
 * confirmed directly) -- unlike Home Energy Guardian's id lists below, this array's declared order
 * already matches the real entity order, so it is safe to index directly (e.g. `[0]`/`[1]`) for
 * `OptionCompareView`'s narrow-layout head-to-head selection (see
 * `HOME_ENERGY_RESPONSE_OPTION_ENTITY_ORDER`'s own comment for why that distinction matters).
 */
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

/** Real, stable Home Energy Guardian fixture response-option entity ids (`packages/scenarios/src/seeds.ts` `buildHomeEnergyResponseOptionEntities`; confirmed directly against the real running app). */
export const HOME_ENERGY_RESPONSE_OPTION_IDS = [
  'change-rate-plan',
  'monitor-one-cycle',
  'request-energy-audit',
  'request-hvac-inspection',
] as const;

/**
 * The real order `CaseState.entities` is built in -- `buildHomeEnergyResponseOptionEntities`
 * (`packages/scenarios/src/seeds.ts`) maps directly over `packages/scenarios/fixtures/energy/
 * response-options.json`'s own declared array order, which is `monitor-one-cycle,
 * change-rate-plan, request-energy-audit, request-hvac-inspection` -- distinct from
 * `HOME_ENERGY_RESPONSE_OPTION_IDS` above (an alphabetized convenience listing, not a claim about
 * entity order). This distinction did not matter before `OptionCompareView` existed: the retired
 * `OptionComparison` table rendered every option as a column regardless of order. It matters now
 * because `OptionCompareView`'s narrow-layout head-to-head selection (`pickHeadToHeadOptions`)
 * renders `options.slice(0, 2)` whenever nothing is focused yet (`docs/decisions/
 * 0004-consumer-workspace-information-architecture.md`'s `WorkspaceViewSwitcher`, always mounted
 * with `layout="narrow"` today) -- a test asserting *which two* options the Compare tab shows by
 * default must use this real entity order, not the alphabetized one above.
 */
export const HOME_ENERGY_RESPONSE_OPTION_ENTITY_ORDER = [
  'monitor-one-cycle',
  'change-rate-plan',
  'request-energy-audit',
  'request-hvac-inspection',
] as const;

/** Real pack-declared criterion ids the proven scenario trajectory reweights (`apps/agent/src/runtime/home-energy-guardian-scenario.ts`). */
export const HOME_ENERGY_CRITERION_IDS = {
  cost: 'energy.cost',
  conservation: 'energy.conservation',
} as const;

/** The one obligation id Home Energy Guardian's round-2 investigation targets (`home-energy-engine.ts`'s `determineHomeEnergyRound`; `home-energy-guardian-scenario.ts`'s own round-2 `requestInvestigation` call). See `postRunRequest` below for why this id must be supplied explicitly for round 2. */
export const HOME_ENERGY_RESPONSE_OPTIONS_OBLIGATION_ID = 'energy.response_options';

/**
 * `docs/decisions/0008-two-mode-product-architecture.md`'s narrow/expanded boundary, mirroring
 * `apps/web/src/hooks/use-width-mode.ts`'s `NARROW_MAX_WIDTH_PX` (and
 * `helpers/layout-assertions.ts`'s own local copy of the same constant): <=480px is pane/WebMCP
 * mode, >480px is the "shopping site" web-app mode. The four configured Playwright projects
 * (`playwright.config.ts`) land exactly on/either side of this boundary (390/430/480 narrow,
 * 1440 expanded), so a plain viewport-width check is a faithful, real-browser equivalent of the
 * app's own `matchMedia` query -- no stubbing needed the way a jsdom component test would.
 */
export const NARROW_MAX_WIDTH_PX = 480;

/** `true` at the three canonical narrow/pane-mode viewports, `false` at `desktop-1440`. See `NARROW_MAX_WIDTH_PX`. */
export function isNarrowLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) <= NARROW_MAX_WIDTH_PX;
}

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

/** Issues one real command through the exact HTTP route `SiftCommands`/WebMCP tools use, with a fresh idempotency key. See this file's header comment for why this is the honest way to exercise a "key WebMCP call" from Playwright. */
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

/**
 * Issues a real `POST /api/cases/:caseId/run` request -- the exact same
 * route `SiftCommands.requestInvestigation`/the visible "Request
 * investigation" button (`App.tsx`'s `handleRequestInvestigation`) both call
 * -- with an explicit `obligationId`. This is the honest way to drive Home
 * Energy Guardian's round-2 investigation from Playwright: confirmed
 * directly against the real running app, once round 1 satisfies every one
 * of the pack's obligations, there is no longer any *open* obligation left
 * for the generic, no-argument "Request investigation" click to
 * auto-select -- the real server returns a genuine `400`
 * ("No obligation is available to investigate ... No open obligation
 * remains to select") for that click at that point, and `ReadinessPanel` is
 * purely read-only (no per-obligation "investigate" control anywhere in
 * `apps/web/src/components` to target one explicitly). `obligationId` is a
 * real, documented field of the same `RequestInvestigationInput` contract
 * (`sift-client.ts`) the visible control already uses -- this exercises it
 * directly rather than bypassing it, exactly like this file's other
 * `post*` helpers (see this file's header comment). See
 * `home-energy-guardian-journey.spec.ts`'s header comment for the full
 * reasoning and `SiftPage.waitForRecommendationRationaleContains` below for
 * why this path also cannot be awaited through `LiveRunStatus`.
 */
export async function postRunRequest(
  request: APIRequestContext,
  caseId: string,
  body: Record<string, unknown>,
  commandId: string = randomCommandId('run'),
): Promise<APIResponse> {
  return request.post(`/api/cases/${encodeURIComponent(caseId)}/run`, {
    data: { ...body, caseId },
    headers: { 'Idempotency-Key': commandId },
  });
}

/** Reads the real canonical `CaseState` via `GET /api/cases/:caseId` -- the same route the WebMCP `sift_get_case_context` tool's own case data ultimately mirrors. */
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

export class SiftPage {
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

  /** Clicks the primary "Compare vehicles" launcher action (ADR 0003) and waits for the `VehicleCatalogFlow` shell to become visible -- no case exists yet at this point. */
  async openVehicleCatalog(): Promise<void> {
    await this.page.getByTestId('demo-launcher-compare-vehicles').click();
    await expect(this.page.getByTestId('vehicle-catalog-flow')).toBeVisible();
  }

  /**
   * Adds one catalog search result to the shortlist by its exact
   * `data-testid` vehicle id suffix (e.g. `addVehicleToShortlist('veh-...')`
   * for `vehicle-add-veh-...`). Waits for its results-list card to exist
   * first -- the search results are real, debounced, network-driven state,
   * never a fixed sleep.
   */
  async addVehicleToShortlist(vehicleId: string): Promise<void> {
    const addButton = this.page.getByTestId(`vehicle-add-${vehicleId}`);
    await expect(addButton).toBeVisible();
    await addButton.click();
    await expect(this.page.getByTestId(`shortlist-item-${vehicleId}`)).toBeVisible();
  }

  /** Clicks "Start comparison" and waits for the real `POST /api/cases` response, returning its `caseId`. The subsequent per-vehicle `upsertOption` calls happen after this resolves; callers that need to wait for the full case body should also wait for `case-workspace`. */
  async startVehicleComparison(): Promise<LaunchedCase> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/cases' && res.request().method() === 'POST',
      ),
      this.page.getByTestId('vehicle-catalog-start-comparison').click(),
    ]);
    const body = (await response.json()) as { caseId: string };
    await expect(this.page.getByTestId('case-workspace')).toBeVisible();
    return { caseId: body.caseId };
  }

  /** Clicks "Investigate my energy bill" and waits for the real `POST /api/cases/demo` response, returning its `caseId`. */
  async launchHomeEnergyGuardian(): Promise<LaunchedCase> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().includes('/api/cases/demo') && res.request().method() === 'POST',
      ),
      this.page.getByTestId('demo-launcher-home-energy-guardian').click(),
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
   * Waits for run `runId` to reach a real terminal "completed" status, then
   * confirms the browser's own live status region reflects it too.
   *
   * This method used to poll `live-run-status-run-id`'s own text content
   * specifically so a stale "Completed" phase left over from a *previous*
   * run (round 1, while this method is really waiting on round 2) could
   * never satisfy the wait. `docs/decisions/
   * 0004-consumer-workspace-information-architecture.md` decision item 3
   * removed that text from the DOM entirely -- `LiveRunStatus.tsx` no longer
   * renders `commandId`/`runId` as visible text at all (both are
   * Developer-view-only content now; see that component's own header
   * comment) -- so there is nothing left to read to disambiguate one run's
   * "Completed" badge from another's by text alone.
   *
   * The honest, unambiguous replacement: `GET /api/debug/runs/:runId`
   * (`apps/agent/src/routes/debug.ts`) is the exact same real HTTP route the
   * Runtime Inspector's own `useRuntimeInspector` hook calls, keyed
   * unambiguously by the real `runId` this method already receives -- no
   * DOM-visible identifier is needed to correlate it correctly, which is a
   * *stronger* correlation guarantee than the removed text ever was, not a
   * weaker stand-in for it. Once the server confirms this exact run reached
   * a terminal state, this also waits for the UI's own `live-run-status-
   * phase` text to catch up to "Completed" -- still a real, observable
   * proof that the browser's live SSE subscription reflects it, not merely
   * that the server-side record does.
   */
  async waitForInvestigationCompleted(runId: string): Promise<void> {
    await expect
      .poll(
        async () => {
          const response = await this.page.request.get(
            `/api/debug/runs/${encodeURIComponent(runId)}`,
          );
          if (!response.ok()) return null;
          const body = (await response.json()) as { overview: { status: string } };
          return body.overview.status;
        },
        { timeout: 30_000, message: `run "${runId}" did not reach "completed" status in time` },
      )
      .toBe('completed');

    await expect(this.page.getByTestId('live-run-status-phase')).toHaveText(/completed/i, {
      timeout: 30_000,
    });
  }

  async waitForRecommendationReady(): Promise<void> {
    await expect(this.page.getByTestId('recommendation-card-status')).toContainText(
      'Ready for review',
      {
        timeout: 30_000,
      },
    );
  }

  /**
   * Waits for `RecommendationCard` to report "Ready for review" again with a
   * rationale containing `expectedSubstring` -- the honest, real,
   * SSE-driven completion signal for an investigation issued through
   * `postRunRequest` rather than a browser click. `waitForInvestigationCompleted`
   * above cannot be used for that case: its final UI-observable check reads
   * `live-run-status-phase`, which reflects `App.tsx`'s `liveRunStatusReceipt`
   * (`lastRunReceipt ?? derivedRunReceipt`) -- `lastRunReceipt` is
   * client-local React state only ever set inside `handleRequestInvestigation`
   * from `commands.requestInvestigation(...).then(...)` (the browser-click
   * path), and it takes priority over `derivedRunReceipt` once set. A run
   * requested directly over HTTP, outside that call (this file's
   * `postRunRequest`), never touches `lastRunReceipt` -- so once an earlier
   * browser-click run has set it once this session, `LiveRunStatus` stays
   * correlated to *that* run's `runId` and never transitions to reflect a
   * later `postRunRequest`-issued run at all (confirmed directly against the
   * real running app). The recommendation card, by contrast, is driven
   * purely from the canonical `CaseState` snapshot streamed over SSE,
   * exactly like the criteria-reweight step every journey spec already
   * exercises -- this is genuinely the same "no click, no reload, reflected
   * live" proof, not a weaker substitute for it.
   */
  async waitForRecommendationRationaleContains(expectedSubstring: string): Promise<void> {
    await expect(this.page.getByTestId('recommendation-card-status')).toContainText(
      'Ready for review',
      { timeout: 30_000 },
    );
    await expect(this.page.getByTestId('recommendation-card-rationale')).toContainText(
      expectedSubstring,
      { timeout: 30_000 },
    );
  }

  /**
   * Opens a closed-by-default `DisclosureSection` row (ADR 0002, round-2
   * design review: "answer-first, everything else one tap away") by its
   * `testId` suffix, e.g. `openDisclosure('add-note')` for `disclosure-add-note`.
   * A no-op if the row is already open (native `<details>` state, checked
   * directly rather than assumed).
   *
   * ADR 0008 (`docs/decisions/0008-two-mode-product-architecture.md`)
   * dismantled the bottom-of-page disclosure stack into differentiated
   * top-of-page chrome: "Manage options" (`disclosure-options`) no longer
   * exists in EITHER layout -- see `openManageOptionsSheet` below -- and
   * "What Sift found" (`disclosure-findings`) no longer exists either -- see
   * `openFindingsSheet` below. `disclosure-decision-profile`,
   * `disclosure-add-note`, and `disclosure-add-concern` survive, but ONLY in
   * pane/narrow mode (<=480px); at expanded (>480px) width the equivalent
   * content moved into a main-column toolbar Sheet with no disclosure
   * counterpart at all. Callers that must work in both layouts use the
   * layout-aware `openDecisionProfile`/`openNotes`/`openAddConcern` helpers
   * below rather than calling this method directly.
   */
  async openDisclosure(testId: string): Promise<void> {
    const details = this.page.getByTestId(`disclosure-${testId}`);
    const isOpen = await details
      .evaluate((el) => (el as HTMLDetailsElement).open)
      .catch(() => false);
    if (!isOpen) {
      await this.page.getByTestId(`disclosure-${testId}-summary`).click();
    }
    await expect(details).toHaveJSProperty('open', true);
  }

  /** The `openDisclosure` counterpart -- closes a `DisclosureSection` row if it is currently open. A no-op otherwise. */
  async closeDisclosure(testId: string): Promise<void> {
    const details = this.page.getByTestId(`disclosure-${testId}`);
    const isOpen = await details
      .evaluate((el) => (el as HTMLDetailsElement).open)
      .catch(() => false);
    if (isOpen) {
      await this.page.getByTestId(`disclosure-${testId}-summary`).click();
    }
    await expect(details).toHaveJSProperty('open', false);
  }

  /**
   * Selects one tab of `WorkspaceViewSwitcher` -- Quick Pick / List / Compare
   * / Board (`docs/decisions/0004-consumer-workspace-information-architecture.md`
   * decision item 5) -- and waits for that tab's own content region to
   * become visible. Unlike `openDisclosure`, this region is always
   * expanded, never a disclosure row; it renders directly below
   * `RecommendationHero` in both layouts (ADR 0008 moved "Manage options"
   * and "What Sift found" into the app bar/alert banner above it, but never
   * touched this switcher's own position).
   */
  async selectWorkspaceView(mode: 'quick_pick' | 'list' | 'compare' | 'board'): Promise<void> {
    await this.page.getByTestId(`workspace-view-tab-${mode}`).click();
    await expect(this.page.getByTestId(`workspace-view-content-${mode}`)).toBeVisible();
  }

  /**
   * Opens a Sheet by clicking its named trigger, unless it is already open.
   * Every Sheet in this app is a real modal dialog (Radix `Dialog`,
   * focus-trapped, with a blocking overlay): once open, its own trigger
   * control usually sits BEHIND that overlay (e.g. `WorkspaceAppBar`'s "Add
   * option" button, or the main-column toolbar buttons `openDecisionProfile`/
   * `openNotes`/`openAddConcern` use), so a plain unconditional `.click()`
   * would fail its own actionability check the second time a caller opens
   * the same Sheet in one test (e.g. `submitCustomConcern`'s retry path in
   * `error-recovery.spec.ts`, called after an earlier `fillAndSubmitCustomConcern`
   * left the Sheet open). Checking first, exactly like `openDisclosure`
   * already does for `<details>`, makes every `open*` method below safe to
   * call repeatedly.
   */
  private async openSheetVia(triggerTestId: string, sheetTestId: string): Promise<void> {
    const sheet = this.page.getByTestId(sheetTestId);
    if (await sheet.isVisible().catch(() => false)) return;
    await this.page.getByTestId(triggerTestId).click();
    await expect(sheet).toBeVisible();
  }

  /** The `openSheetVia` counterpart -- closes a Sheet via its own close control, unless it is already closed. */
  private async closeSheet(sheetTestId: string): Promise<void> {
    const sheet = this.page.getByTestId(sheetTestId);
    if (!(await sheet.isVisible().catch(() => false))) return;
    await this.page.getByTestId('sheet-close').click();
    await expect(sheet).not.toBeVisible();
  }

  /**
   * Opens the "Add option" Sheet (ADR 0008; supersedes the retired "Manage
   * options" disclosure) via `WorkspaceAppBar`'s always-present "Add option"
   * control. Identical in both layouts -- the app bar is global chrome
   * mounted once, above the narrow/expanded split, so unlike
   * `openDecisionProfile`/`openNotes`/`openAddConcern` below this needs no
   * layout branch.
   *
   * Unlike the old inline disclosure, this Sheet is a real modal and is NOT
   * safe to leave open across unrelated steps of a journey (a later click
   * on, say, "Request investigation" would be intercepted by the overlay).
   * Callers open it immediately before the `OptionEditor` content they need
   * and close it again with `closeManageOptionsSheet` before continuing.
   */
  async openManageOptionsSheet(): Promise<void> {
    await this.openSheetVia('workspace-app-bar-add-option', 'workspace-add-option-sheet');
  }

  /** The `openManageOptionsSheet` counterpart -- closes the Sheet via its own close control. */
  async closeManageOptionsSheet(): Promise<void> {
    await this.closeSheet('workspace-add-option-sheet');
  }

  /**
   * Opens the "your priorities" content -- the FULL `DecisionProfileView`
   * (including `personalConcerns`/`missing`/`suggestedQuestions`, which
   * `WorkspaceSidebar`'s own cut-down priorities list excludes) -- and
   * returns a `Locator` scoped to whichever container now holds it, so
   * callers can query inside it (e.g. for a specific `li`) without caring
   * which layout rendered it.
   *
   * Layout-aware (ADR 0008): pane mode (<=480px) keeps the pre-existing
   * `disclosure-decision-profile` row; web-app mode (>480px) has no such
   * disclosure at all -- the same content is reached only through the
   * main-column toolbar's "Your priorities" button, which opens a Sheet.
   */
  async openDecisionProfile(): Promise<Locator> {
    if (isNarrowLayout(this.page)) {
      await this.openDisclosure('decision-profile');
      return this.page.getByTestId('disclosure-decision-profile');
    }
    await this.openSheetVia(
      'workspace-expanded-open-decision-profile',
      'workspace-decision-profile-sheet',
    );
    return this.page.getByTestId('workspace-decision-profile-sheet');
  }

  /** The `openDecisionProfile` counterpart. A no-op in pane mode's disclosure form (matching `closeDisclosure`'s own idempotence) since leaving that row open is harmless there -- only web-app mode's Sheet is a real modal that must be closed before an unrelated control elsewhere on the page can be clicked. */
  async closeDecisionProfile(): Promise<void> {
    if (isNarrowLayout(this.page)) {
      await this.closeDisclosure('decision-profile');
      return;
    }
    await this.closeSheet('workspace-decision-profile-sheet');
  }

  /**
   * Opens the notes region (`CaseNotes` + `AddNoteForm`), layout-aware like
   * `openDecisionProfile` above: the pre-existing `disclosure-add-note` row
   * in pane mode, or the main-column toolbar's "Notes" Sheet
   * (`workspace-notes-sheet`) in web-app mode. `AddNoteForm`'s own
   * `#add-note-form-body`/`add-note-form-submit`/`add-note-form-success` and
   * `CaseNotes`' own `case-notes` are real DOM ids/testids either way (never
   * duplicated -- each layout mounts exactly one copy), so callers can query
   * them globally via `page.getByTestId(...)` once this has opened the
   * region that contains them.
   */
  async openNotes(): Promise<void> {
    if (isNarrowLayout(this.page)) {
      await this.openDisclosure('add-note');
      return;
    }
    await this.openSheetVia('workspace-expanded-open-notes', 'workspace-notes-sheet');
  }

  /** The `openNotes` counterpart -- see `closeDecisionProfile`'s comment for why this is a no-op (rather than an error) in pane mode. */
  async closeNotes(): Promise<void> {
    if (isNarrowLayout(this.page)) {
      await this.closeDisclosure('add-note');
      return;
    }
    await this.closeSheet('workspace-notes-sheet');
  }

  /**
   * Opens the "Add a question" / custom-concern region, layout-aware like
   * `openDecisionProfile`/`openNotes` above: the pre-existing
   * `disclosure-add-concern` row in pane mode (a no-op once an
   * agent-proposed extension is already pending, since that row opens
   * itself in that case -- see `openDisclosure`), or the main-column
   * toolbar's "Add a question" Sheet (`workspace-add-concern-sheet`) in
   * web-app mode, which has no such self-opening behavior of its own (there
   * is no narrow-style disclosure to auto-open in that layout at all) but is
   * always safe to open explicitly regardless of pending-extension state.
   */
  async openAddConcern(): Promise<void> {
    if (isNarrowLayout(this.page)) {
      await this.openDisclosure('add-concern');
      return;
    }
    await this.openSheetVia('workspace-expanded-open-add-concern', 'workspace-add-concern-sheet');
  }

  /** The `openAddConcern` counterpart -- see `closeDecisionProfile`'s comment for why this is a no-op (rather than an error) in pane mode. */
  async closeAddConcern(): Promise<void> {
    if (isNarrowLayout(this.page)) {
      await this.closeDisclosure('add-concern');
      return;
    }
    await this.closeSheet('workspace-add-concern-sheet');
  }

  /** Opens the "What Sift found" review Sheet via `WorkspaceAppBar`'s always-present "Findings" control (ADR 0008; supersedes the retired "What Sift found" disclosure trigger row). Identical in both layouts, like `openManageOptionsSheet` above. */
  async openFindingsSheet(): Promise<void> {
    await this.openSheetVia('workspace-app-bar-findings', 'findings-sheet');
  }

  /** Fills and submits `CustomConcernForm` without asserting the outcome -- used directly by tests that expect a real error (`error-recovery.spec.ts`); `submitCustomConcern` below is the success-asserting convenience wrapper every other spec uses. Opens the layout-appropriate "Add a question" region first via `openAddConcern` (ADR 0008). */
  async fillAndSubmitCustomConcern(input: CustomConcernInput): Promise<void> {
    await this.openAddConcern();
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

  /**
   * The visible-control equivalent of `sift_define_case_attribute`
   * (`CustomConcernForm.tsx`). A `user`-origin submission is auto-confirmed
   * server-side (`packages/core/src/extensions.ts`), so no separate
   * confirmation step is required afterward.
   *
   * Two real, ordered waits, not one -- observed once flaking under
   * full-suite 8-worker parallelism (`vehicle-catalog-journey` at
   * `right-pane-390`, standalone and full-suite re-runs both green
   * afterward: genuine contention, not a logic race). `CustomConcernForm`'s
   * `success` state (read from `custom-concern-form-success`) is set only
   * inside `commands.defineCaseAttribute(...).then(...)`, i.e. strictly
   * after `POST /api/cases/:caseId/commands/defineCaseAttribute`
   * (`api/sift-client.ts`) resolves -- and, once set, stays visible (no
   * auto-hide/timeout clears it; confirmed by reading the component) until
   * a later submission. So the real risk under contention is not the
   * banner disappearing before Playwright observes it -- it is the whole
   * request-to-render chain (server round trip + React commit) taking
   * longer than a short default assertion timeout. `responsePromise` is
   * armed *before* `fillAndSubmitCustomConcern` performs the click (so it
   * cannot miss a response that lands before it would otherwise start
   * listening) and awaited first: a real, bounded wait on the literal
   * network completion of the command this banner depends on, giving a
   * precise "the server never answered in time" failure instead of a
   * generic "the banner never appeared" one when the server side is what is
   * actually slow under load. The banner visibility check itself keeps its
   * full assertion (exact `data-testid`, still required to appear) with a
   * longer bound to match -- neither wait replaces or weakens the other.
   */
  async submitCustomConcern(input: CustomConcernInput): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/commands/defineCaseAttribute') &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 30_000 },
    );
    await this.fillAndSubmitCustomConcern(input);
    await responsePromise;
    await expect(
      this.page.getByTestId('custom-concern-form').getByTestId('custom-concern-form-success'),
    ).toBeVisible({ timeout: 30_000 });
  }

  async approveProposal(): Promise<void> {
    await this.page.getByTestId('approval-card-approve').click();
    await expect(this.page.getByTestId('approval-card-stamp')).toContainText('Approved');
  }
}
