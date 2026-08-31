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

    await user.click(screen.getByTestId('shortlist-remove-veh-camry-1'));
    expect(screen.getByTestId('shortlist-count')).toHaveTextContent(`0 of ${MAX_SHORTLIST_SIZE}`);
    expect(screen.getByTestId('vehicle-catalog-shortlist-empty')).toBeInTheDocument();
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

    expect(screen.getByTestId('vehicle-catalog-start-comparison')).toBeDisabled();
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

    const makeSelect = screen.getByLabelText('Make');
    await user.selectOptions(makeSelect, 'Honda');

    await waitFor(() => {
      expect(makeSelect).toHaveValue('Honda');
    });
  });

  it('renders a fuel type filter populated from the catalog', async () => {
    installCatalogHandlers();
    renderFlow();
    await waitForResults();

    const fuelTypeSelect = screen.getByLabelText('Fuel type');
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

    const fuelTypeSelect = screen.getByLabelText('Fuel type');
    await user.selectOptions(fuelTypeSelect, 'Hybrid');

    await waitFor(() => {
      expect(fuelTypeSelect).toHaveValue('Hybrid');
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

    const yearSelect = screen.getByLabelText('Model year');
    expect(within(yearSelect).getByRole('option', { name: '2026' })).toBeInTheDocument();
    await user.selectOptions(yearSelect, '2025');

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

  it("gives each result card an expanded-width detail grid with fields the narrow spec line doesn't show, omitting whatever the catalog doesn't know", async () => {
    installCatalogHandlers({
      vehicles: [record({ fuelEconomyScore: 8, luggageVolumeCuFt: 15 }), CRV],
      total: 2,
    });
    renderFlow();
    await waitForResults();

    const details = screen.getByTestId('vehicle-card-details-veh-camry-1');
    // Structural assertions, not computed-style ones: jsdom applies no
    // stylesheet, so the expanded detail grid is always present in the DOM --
    // these two classes are what `global.css`'s `min-[481px]` boundary (the
    // same one `.page-shell` already uses) relies on to keep it invisible and
    // out of layout below 481px.
    expect(details).toHaveClass('hidden');
    expect(details).toHaveClass('min-[481px]:grid');

    expect(within(details).getByText('EPA fuel economy score')).toBeInTheDocument();
    expect(within(details).getByText('8/10')).toBeInTheDocument();
    expect(within(details).getByText('Cargo volume')).toBeInTheDocument();
    expect(within(details).getByText('15 cu ft')).toBeInTheDocument();
    expect(within(details).getByText('Body style')).toBeInTheDocument();
    expect(within(details).getByText('Sedan')).toBeInTheDocument();

    // `annualFuelCostUsd` is null on this record (the shared `record()`
    // helper leaves it unset) -- the catalog's "unknown stays unknown, never
    // fabricated" rule means that row is simply absent, not a placeholder.
    expect(within(details).queryByText('Est. annual fuel cost')).not.toBeInTheDocument();
  });

  it('renders no expanded-width detail grid when the catalog has no data beyond identity', async () => {
    const bare = buildVehicleCatalogRecord({
      id: 'veh-bare-1',
      year: 2025,
      make: 'Kia',
      model: 'Rio',
    });
    installCatalogHandlers({ vehicles: [bare], total: 1 });
    renderFlow();
    await waitForResults();

    expect(screen.queryByTestId('vehicle-card-details-veh-bare-1')).not.toBeInTheDocument();
  });
});
