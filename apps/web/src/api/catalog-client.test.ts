import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  CatalogClientError,
  fetchCatalogBodyStyles,
  fetchCatalogMakes,
  fetchCatalogYears,
  searchCatalogVehicles,
} from './catalog-client.js';

const BASE_URL = 'http://sift.test';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const RECORD = {
  id: 'veh-1',
  year: 2025,
  make: 'Toyota',
  model: 'Camry',
  trim: null,
  bodyStyle: null,
  drivetrain: null,
  fuelType: null,
  combinedMpg: null,
  cylinders: null,
  transmission: null,
  cityMpg: null,
  highwayMpg: null,
  annualFuelCostUsd: null,
  fiveYearSavingsVsAverageUsd: null,
  fuelEconomyScore: null,
  greenhouseGasScore: null,
  co2GramsPerMile: null,
  engineDisplacementL: null,
  electricRangeMiles: null,
  charge240Hours: null,
  source: { dataset: 'epa-fueleconomy-gov', recordId: '1' },
};

describe('fetchCatalogYears', () => {
  it('returns the parsed years array on success', async () => {
    server.use(
      http.get(`${BASE_URL}/api/catalog/years`, () => HttpResponse.json({ years: [2026, 2025] })),
    );
    const years = await fetchCatalogYears({ baseUrl: BASE_URL });
    expect(years).toEqual([2026, 2025]);
  });

  it('throws CatalogClientError with status 0 when the network request itself fails', async () => {
    server.use(http.get(`${BASE_URL}/api/catalog/years`, () => HttpResponse.error()));
    await expect(fetchCatalogYears({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'CatalogClientError',
      status: 0,
    });
  });

  it('throws CatalogClientError with the real status on a non-ok response', async () => {
    server.use(
      http.get(`${BASE_URL}/api/catalog/years`, () => new HttpResponse(null, { status: 500 })),
    );
    await expect(fetchCatalogYears({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'CatalogClientError',
      status: 500,
    });
  });

  it('throws CatalogClientError when the response does not match the expected contract', async () => {
    server.use(
      http.get(`${BASE_URL}/api/catalog/years`, () => HttpResponse.json({ notYears: [] })),
    );
    await expect(fetchCatalogYears({ baseUrl: BASE_URL })).rejects.toBeInstanceOf(
      CatalogClientError,
    );
  });
});

describe('fetchCatalogMakes', () => {
  it('returns makes, with no year filter by default', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE_URL}/api/catalog/makes`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ makes: ['Honda', 'Toyota'] });
      }),
    );
    const makes = await fetchCatalogMakes({}, { baseUrl: BASE_URL });
    expect(makes).toEqual(['Honda', 'Toyota']);
    expect(capturedUrl).not.toContain('year=');
  });

  it('includes the year query param when given', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE_URL}/api/catalog/makes`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ makes: ['Toyota'] });
      }),
    );
    await fetchCatalogMakes({ year: 2025 }, { baseUrl: BASE_URL });
    expect(capturedUrl).toContain('year=2025');
  });
});

describe('fetchCatalogBodyStyles', () => {
  it('returns the parsed body styles array', async () => {
    server.use(
      http.get(`${BASE_URL}/api/catalog/body-styles`, () =>
        HttpResponse.json({ bodyStyles: ['Sedan', 'SUV'] }),
      ),
    );
    const styles = await fetchCatalogBodyStyles({ baseUrl: BASE_URL });
    expect(styles).toEqual(['Sedan', 'SUV']);
  });
});

describe('searchCatalogVehicles', () => {
  it('returns records and total on success, with no query params when given none', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE_URL}/api/catalog/vehicles`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ records: [RECORD], total: 1 });
      }),
    );
    const result = await searchCatalogVehicles({}, { baseUrl: BASE_URL });
    expect(result).toEqual({ records: [RECORD], total: 1 });
    expect(capturedUrl.endsWith('/api/catalog/vehicles')).toBe(true);
  });

  it('encodes every provided filter as a query param', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE_URL}/api/catalog/vehicles`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ records: [], total: 0 });
      }),
    );
    await searchCatalogVehicles(
      {
        query: 'camry',
        year: 2025,
        make: 'Toyota',
        model: 'Camry',
        bodyStyle: 'Sedan',
        limit: 10,
        offset: 5,
      },
      { baseUrl: BASE_URL },
    );
    const params = new URL(capturedUrl).searchParams;
    expect(params.get('query')).toBe('camry');
    expect(params.get('year')).toBe('2025');
    expect(params.get('make')).toBe('Toyota');
    expect(params.get('model')).toBe('Camry');
    expect(params.get('bodyStyle')).toBe('Sedan');
    expect(params.get('limit')).toBe('10');
    expect(params.get('offset')).toBe('5');
  });

  it('omits an empty query string rather than sending it as a filter', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE_URL}/api/catalog/vehicles`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ records: [], total: 0 });
      }),
    );
    await searchCatalogVehicles({ query: '' }, { baseUrl: BASE_URL });
    expect(new URL(capturedUrl).searchParams.has('query')).toBe(false);
  });

  it('throws CatalogClientError when the response payload does not parse as JSON', async () => {
    server.use(
      http.get(
        `${BASE_URL}/api/catalog/vehicles`,
        () => new HttpResponse('not json', { status: 200 }),
      ),
    );
    await expect(searchCatalogVehicles({}, { baseUrl: BASE_URL })).rejects.toBeInstanceOf(
      CatalogClientError,
    );
  });
});
