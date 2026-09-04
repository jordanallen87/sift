import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { VehicleCatalogRecord } from '@sift/catalog/browser';
import { buildVehicleCatalogRecord } from '@sift/catalog/test-support';
import {
  VehicleCatalogFlow,
  MAX_SHORTLIST_SIZE,
  MIN_SHORTLIST_SIZE,
} from './VehicleCatalogFlow.js';
import { AppProviders } from '../app/AppProviders.js';
import { createFakeSiftCommands, buildFakeCommandReceipt } from '../test/fake-sift-commands.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * This file's own defaults for a catalog record, layered over the shared
 * `buildVehicleCatalogRecord` factory rather than spelled out as a literal.
 *
 * The literal version listed all 20 fields the record had at the time, which
 * meant it silently stopped compiling the moment the catalog widened to 83 --
 * and, worse, would have left the 63 new fields as `undefined` rather than
 * `null` at runtime, a distinction the rendering code is entitled to rely on.
 * Delegating keeps this factory to just the fields these tests care about.
 */
function record(overrides: Partial<VehicleCatalogRecord> = {}): VehicleCatalogRecord {
  return buildVehicleCatalogRecord({
    id: 'veh-camry-1',
    year: 2025,
    make: 'Toyota',
    model: 'Camry',
    trim: 'XLE',
    bodyStyle: 'Sedan',
    drivetrain: 'FWD',
    fuelType: 'Hybrid',
    combinedMpg: 47,
    cylinders: 4,
    transmission: 'Automatic (AV-S6)',
    ...overrides,
  });
}

const CAMRY = record();
const CRV = record({
  id: 'veh-crv-1',
  make: 'Honda',
  model: 'CR-V',
  trim: 'EX',
  bodyStyle: 'Compact SUV',
  drivetrain: 'AWD',
  fuelType: 'Gasoline',
  combinedMpg: 30,
});

function installCatalogHandlers(
  overrides: {
    vehicles?: VehicleCatalogRecord[];
    total?: number;
    vehiclesStatus?: number;
  } = {},
) {
  const vehicles = overrides.vehicles ?? [CAMRY, CRV];
  server.use(
    http.get('/api/catalog/makes', () => HttpResponse.json({ makes: ['Honda', 'Toyota'] })),
    http.get('/api/catalog/body-styles', () =>
      HttpResponse.json({ bodyStyles: ['Compact SUV', 'Sedan'] }),
    ),
    // `VehicleCatalogFlow` fetches this alongside makes/body-styles/years on
    // mount (the fuel-type filter), so every test needs a handler here --
    // `setupServer` is configured with `onUnhandledRequest: 'error'`, and an
    // unmatched request fails the test regardless of the component's own
    // `.catch(() => undefined)` degrade-silently handling.
    http.get('/api/catalog/fuel-types', () =>
      HttpResponse.json({ fuelTypes: ['Gasoline', 'Hybrid'] }),
    ),
    http.get('/api/catalog/years', () => HttpResponse.json({ years: [2026, 2025] })),
    http.get('/api/catalog/vehicles', () => {
      if (overrides.vehiclesStatus !== undefined) {
        return new HttpResponse(null, { status: overrides.vehiclesStatus });
      }
      return HttpResponse.json({ records: vehicles, total: overrides.total ?? vehicles.length });
    }),
  );
}

function renderFlow(
  commandOverrides: Parameters<typeof createFakeSiftCommands>[0] = {},
  props = {},
) {
  const commands = createFakeSiftCommands(commandOverrides);
  const utils = render(
    <AppProviders commandsClient={commands}>
      <VehicleCatalogFlow {...props} />
    </AppProviders>,
  );
  return { commands, ...utils };
}

async function waitForResults() {
  await waitFor(() => {
    expect(screen.getByTestId('vehicle-catalog-results-list')).toBeInTheDocument();
  });
}

/**
 * The four facets moved behind a sheet and no longer apply as you change
 * them: the sheet holds a draft and commits it on Apply, so a test that
 * only selects an option is asserting nothing about the search.
 */
async function applyFacet(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
): Promise<void> {
  await user.click(screen.getByTestId('vehicle-filter-open'));
  await user.selectOptions(await screen.findByLabelText(label), value);
  await user.click(screen.getByTestId('vehicle-filter-sheet-apply'));
}

/** The shortlist is a collapsed bar; Radix unmounts its list until expanded. */
async function expandShortlist(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByTestId('shortlist-bar-trigger'));
}

describe('VehicleCatalogFlow', () => {
  it('loads and renders search results from the catalog routes', async () => {
    installCatalogHandlers();
    renderFlow();
    await waitForResults();

    expect(screen.getByTestId('vehicle-card-veh-camry-1')).toHaveTextContent(
      '2025 Toyota Camry XLE',
    );
    expect(screen.getByTestId('vehicle-card-veh-crv-1')).toHaveTextContent('2025 Honda CR-V EX');
  });

  it('shows a loading state before results arrive', () => {
    installCatalogHandlers();
    renderFlow();
    expect(screen.getByTestId('vehicle-catalog-loading')).toBeInTheDocument();
  });

  it('shows an empty state when the search returns no matches', async () => {
    installCatalogHandlers({ vehicles: [], total: 0 });
    renderFlow();

    await waitFor(() => {
      expect(screen.getByTestId('vehicle-catalog-empty')).toBeInTheDocument();
    });
  });

  it('shows a recoverable error and allows retry when the search fails', async () => {
    installCatalogHandlers({ vehiclesStatus: 500 });
    renderFlow();

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });

    installCatalogHandlers();
    await userEvent.setup().click(screen.getByTestId('error-state-retry'));
    await waitForResults();
  });

  it('adds a vehicle to the shortlist, preventing duplicates and enforcing the max size', async () => {
    installCatalogHandlers();
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-add-veh-camry-1'));
    expect(screen.getByTestId('shortlist-count')).toHaveTextContent(`1 of ${MAX_SHORTLIST_SIZE}`);
    expect(screen.getByTestId('vehicle-add-veh-camry-1')).toBeDisabled();
    expect(screen.getByTestId('vehicle-add-veh-camry-1')).toHaveTextContent('Added');

    await expandShortlist(user);
    await user.click(screen.getByTestId('shortlist-remove-veh-camry-1'));

    // An empty shortlist retires the whole bar rather than leaving an empty
    // one pinned over the list, so "empty" is the bar's absence.
    expect(screen.queryByTestId('vehicle-catalog-shortlist')).toBeNull();
    expect(screen.getByTestId('vehicle-add-veh-camry-1')).toBeEnabled();
  });

  it('disables further Add buttons once the shortlist reaches its maximum size', async () => {
    const many = Array.from({ length: MAX_SHORTLIST_SIZE + 1 }, (_, i) =>
      record({ id: `veh-${i}`, model: `Model${i}` }),
    );
    installCatalogHandlers({ vehicles: many, total: many.length });
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    for (let i = 0; i < MAX_SHORTLIST_SIZE; i += 1) {
      await user.click(screen.getByTestId(`vehicle-add-veh-${i}`));
    }
    expect(screen.getByTestId('shortlist-count')).toHaveTextContent(
      `${MAX_SHORTLIST_SIZE} of ${MAX_SHORTLIST_SIZE}`,
    );
    expect(screen.getByTestId(`vehicle-add-veh-${MAX_SHORTLIST_SIZE}`)).toBeDisabled();
  });

  it('keeps "Start comparison" disabled below the minimum shortlist size', async () => {
    installCatalogHandlers();
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    // With nothing shortlisted there is no bar at all, so there is nothing
    // to press; one vehicle raises the bar with its action still unavailable.
    expect(screen.queryByTestId('vehicle-catalog-start-comparison')).toBeNull();
    await user.click(screen.getByTestId('vehicle-add-veh-camry-1'));
    expect(screen.getByTestId('vehicle-catalog-start-comparison')).toBeDisabled();
    expect(MIN_SHORTLIST_SIZE).toBeGreaterThan(1);
  });

  it('creates a case via startCase then one upsertOption per shortlisted vehicle, in order', async () => {
    installCatalogHandlers();
    const startCase = vi
      .fn()
      .mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-new-1', acceptedSequence: 2 }));
    const upsertCalls: unknown[] = [];
    const upsertOption = vi.fn().mockImplementation((input: unknown) => {
      upsertCalls.push(input);
      return Promise.resolve(
        buildFakeCommandReceipt({
          caseId: 'case-new-1',
          acceptedSequence: 2 + upsertCalls.length,
        }),
      );
    });
    const onCaseCreated = vi.fn();
    const user = userEvent.setup();
    renderFlow({ startCase, upsertOption }, { onCaseCreated });
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-add-veh-camry-1'));
    await user.click(screen.getByTestId('vehicle-add-veh-crv-1'));
    await user.click(screen.getByTestId('vehicle-catalog-start-comparison'));

    await waitFor(() => {
      expect(onCaseCreated).toHaveBeenCalledTimes(1);
    });

    expect(startCase).toHaveBeenCalledWith({ packId: 'car-purchase' });
    expect(upsertOption).toHaveBeenCalledTimes(2);
    expect(upsertCalls[0]).toMatchObject({
      caseId: 'case-new-1',
      expectedSequence: 2,
      option: { kind: 'candidate', label: '2025 Toyota Camry XLE' },
    });
    expect(upsertCalls[1]).toMatchObject({
      caseId: 'case-new-1',
      expectedSequence: 3,
      option: { kind: 'candidate', label: '2025 Honda CR-V EX' },
    });
  });

  it('never fabricates catalog-unknown attributes in the mapped option', async () => {
    installCatalogHandlers();
    const upsertOption = vi
      .fn()
      .mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-new-1' }));
    const user = userEvent.setup();
    renderFlow(
      {
        startCase: vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-new-1' })),
        upsertOption,
      },
      {},
    );
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-add-veh-camry-1'));
    await user.click(screen.getByTestId('vehicle-add-veh-crv-1'));
    await user.click(screen.getByTestId('vehicle-catalog-start-comparison'));

    await waitFor(() => {
      expect(upsertOption).toHaveBeenCalledTimes(2);
    });
    const firstCallInput = upsertOption.mock.calls[0]?.[0] as {
      option: { attributes: { definitionId: string }[] };
    };
    const definitionIds = firstCallInput.option.attributes.map((a) => a.definitionId);
    expect(definitionIds).not.toContain('car.advertised_price');
    expect(definitionIds).not.toContain('car.crash_safety_rating');
    expect(definitionIds).toContain('car.make');
  });

  it('shows a recoverable error and allows retry when startCase fails', async () => {
    installCatalogHandlers();
    const startCase = vi.fn().mockRejectedValueOnce(new Error('case creation failed'));
    const user = userEvent.setup();
    renderFlow({ startCase });
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-add-veh-camry-1'));
    await user.click(screen.getByTestId('vehicle-add-veh-crv-1'));
    await user.click(screen.getByTestId('vehicle-catalog-start-comparison'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/case creation failed/i);
  });

  it('calls onCancel when Back is clicked', async () => {
    installCatalogHandlers();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderFlow({}, { onCancel });
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-catalog-back'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('filters by make', async () => {
    installCatalogHandlers();
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    await applyFacet(user, 'Make', 'Honda');

    await waitFor(() => {
      expect(screen.getByTestId('vehicle-filter-chips')).toHaveTextContent('Honda');
    });
  });

  it('renders a fuel type filter populated from the catalog', async () => {
    installCatalogHandlers();
    renderFlow();
    await waitForResults();

    await userEvent.setup().click(screen.getByTestId('vehicle-filter-open'));
    const fuelTypeSelect = await screen.findByLabelText('Fuel type');
    expect(
      within(fuelTypeSelect).getByRole('option', { name: 'Any fuel type' }),
    ).toBeInTheDocument();
    expect(within(fuelTypeSelect).getByRole('option', { name: 'Hybrid' })).toBeInTheDocument();
    expect(within(fuelTypeSelect).getByRole('option', { name: 'Gasoline' })).toBeInTheDocument();
  });

  it('filters by fuel type, including it in the search request', async () => {
    let capturedUrl = '';
    installCatalogHandlers();
    server.use(
      http.get('/api/catalog/vehicles', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ records: [CAMRY], total: 1 });
      }),
    );
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    await applyFacet(user, 'Fuel type', 'Hybrid');

    await waitFor(() => {
      expect(new URL(capturedUrl, 'http://localhost').searchParams.get('fuelType')).toBe('Hybrid');
    });
  });

  it('loads and filters by model year', async () => {
    let capturedUrl = '';
    installCatalogHandlers();
    server.use(
      http.get('/api/catalog/vehicles', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ records: [CAMRY, CRV], total: 2 });
      }),
    );
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-filter-open'));
    const yearSelect = await screen.findByLabelText('Model year');
    expect(within(yearSelect).getByRole('option', { name: '2026' })).toBeInTheDocument();
    await user.selectOptions(yearSelect, '2025');
    await user.click(screen.getByTestId('vehicle-filter-sheet-apply'));

    await waitFor(() => {
      expect(new URL(capturedUrl, 'http://localhost').searchParams.get('year')).toBe('2025');
    });
  });

  it('has no axe violations once results are loaded', async () => {
    installCatalogHandlers();
    const { container } = renderFlow();
    await waitForResults();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    installCatalogHandlers();
    const commands = createFakeSiftCommands();
    const { overflowRisks } = renderAtNarrowWidth(
      <AppProviders commandsClient={commands}>
        <VehicleCatalogFlow />
      </AppProviders>,
    );
    expect(overflowRisks).toEqual([]);
  });

  it('shows the shortlist item label matching the results card label', async () => {
    installCatalogHandlers();
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-add-veh-camry-1'));
    await expandShortlist(user);
    const shortlistItem = screen.getByTestId('shortlist-item-veh-camry-1');
    expect(within(shortlistItem).getByText('2025 Toyota Camry XLE')).toBeInTheDocument();
  });

  it('renders results in the shared `.option-grid` layout, which collapses to one column at narrow width on its own', async () => {
    installCatalogHandlers();
    renderFlow();
    await waitForResults();

    // No separate narrow-width rule is asserted here on purpose: `.option-grid`
    // (global.css) is a single class that is one column at narrow width and a
    // multi-column grid at expanded width by itself, so the list markup is
    // identical for both -- there is nothing narrow-specific left to test.
    expect(screen.getByTestId('vehicle-catalog-results-list')).toHaveClass('option-grid');
  });

  it('opens a full spec sheet from a row, with fields the browse line has no room for', async () => {
    // These fields used to sit in a grid under every card at expanded width,
    // which made the list longest exactly where more of the list should fit.
    // They are the same facts; the surface changed.
    installCatalogHandlers({
      vehicles: [record({ fuelEconomyScore: 8, luggageVolumeCuFt: 15 }), CRV],
      total: 2,
    });
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-details-veh-camry-1'));
    const sheet = await screen.findByTestId('vehicle-detail-sheet');

    expect(within(sheet).getByText('EPA fuel economy score')).toBeInTheDocument();
    expect(within(sheet).getByText('8/10')).toBeInTheDocument();
    expect(within(sheet).getByText('Cargo volume')).toBeInTheDocument();
    expect(within(sheet).getByText('15 cu ft')).toBeInTheDocument();
    expect(within(sheet).getByText('Body style')).toBeInTheDocument();
    expect(within(sheet).getByText('Sedan')).toBeInTheDocument();

    // `annualFuelCostUsd` is null on this record (the shared `record()`
    // helper leaves it unset) -- the catalog's "unknown stays unknown, never
    // fabricated" rule means that row is simply absent, not a placeholder.
    expect(within(sheet).queryByText('Est. annual fuel cost')).not.toBeInTheDocument();
  });

  it('keeps the browse row terse, leaving the long tail to the spec sheet', async () => {
    installCatalogHandlers({
      vehicles: [record({ fuelEconomyScore: 8, luggageVolumeCuFt: 15 })],
      total: 1,
    });
    renderFlow();
    await waitForResults();

    const card = screen.getByTestId('vehicle-card-veh-camry-1');
    expect(within(card).queryByText('EPA fuel economy score')).not.toBeInTheDocument();
    expect(within(card).queryByText('Cargo volume')).not.toBeInTheDocument();
  });

  it('shows a record with nothing beyond identity without inventing rows for it', async () => {
    const bare = buildVehicleCatalogRecord({
      id: 'veh-bare-1',
      year: 2025,
      make: 'Kia',
      model: 'Rio',
    });
    installCatalogHandlers({ vehicles: [bare], total: 1 });
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    await user.click(screen.getByTestId('vehicle-details-veh-bare-1'));
    const sheet = await screen.findByTestId('vehicle-detail-sheet');
    expect(within(sheet).queryByText('Cargo volume')).not.toBeInTheDocument();
    expect(within(sheet).queryByText('EPA fuel economy score')).not.toBeInTheDocument();
    // Identity still resolves, so the sheet is usable rather than blank.
    expect(within(sheet).getByText(/2025 Kia Rio/)).toBeInTheDocument();
  });

  it('paginates the catalog instead of stranding the reader on the first 20', async () => {
    let capturedUrl = '';
    installCatalogHandlers();
    server.use(
      http.get('/api/catalog/vehicles', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ records: [CAMRY, CRV], total: 853 });
      }),
    );
    const user = userEvent.setup();
    renderFlow();
    await waitForResults();

    await user.click(screen.getByTestId('catalog-pagination-next'));

    await waitFor(() => {
      const params = new URL(capturedUrl, 'http://localhost').searchParams;
      expect(params.get('offset')).toBe('20');
      expect(params.get('limit')).toBe('20');
    });
  });

});
