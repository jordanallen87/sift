import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_SEARCH_RESULTS, type VehicleCatalogRecord } from '@sift/catalog';
import { asJson } from '../fixtures/http-types.js';
import { createHttpTestHarness, type HttpTestHarness } from '../fixtures/http-harness.js';

describe('GET /api/catalog/*', () => {
  let harness: HttpTestHarness | undefined;

  afterEach(() => {
    harness?.cleanup();
    harness = undefined;
  });

  it('GET /api/catalog/years returns a non-empty descending array', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/catalog/years');

    expect(response.status).toBe(200);
    const body = asJson<{ years: number[] }>(response.body);
    expect(body.years.length).toBeGreaterThan(0);
    for (let i = 1; i < body.years.length; i += 1) {
      expect(body.years[i - 1]).toBeGreaterThan(body.years[i]!);
    }
  });

  it('GET /api/catalog/makes returns makes including Toyota', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/catalog/makes');

    expect(response.status).toBe(200);
    const body = asJson<{ makes: string[] }>(response.body);
    expect(body.makes).toContain('Toyota');
  });

  it('GET /api/catalog/makes?year= filters correctly', async () => {
    harness = createHttpTestHarness();

    const yearsResponse = await request(harness.app).get('/api/catalog/years');
    const { years } = asJson<{ years: number[] }>(yearsResponse.body);
    const year = years[0]!;

    const response = await request(harness.app).get('/api/catalog/makes').query({ year });

    expect(response.status).toBe(200);
    const body = asJson<{ makes: string[] }>(response.body);
    expect(body.makes.length).toBeGreaterThan(0);
  });

  it('GET /api/catalog/models?make=Toyota returns models including Camry', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .get('/api/catalog/models')
      .query({ make: 'Toyota' });

    expect(response.status).toBe(200);
    const body = asJson<{ models: string[] }>(response.body);
    expect(body.models).toContain('Camry');
  });

  it('GET /api/catalog/models without make responds 400', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/catalog/models');

    expect(response.status).toBe(400);
    const body = asJson<{ error: { code: string } }>(response.body);
    expect(body.error.code).toBe('VALIDATION');
  });

  it('GET /api/catalog/body-styles returns a non-empty array', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/catalog/body-styles');

    expect(response.status).toBe(200);
    const body = asJson<{ bodyStyles: string[] }>(response.body);
    expect(body.bodyStyles.length).toBeGreaterThan(0);
  });

  it('GET /api/catalog/vehicles with no params returns a bounded default page with a total', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/catalog/vehicles');

    expect(response.status).toBe(200);
    const body = asJson<{ records: VehicleCatalogRecord[]; total: number }>(response.body);
    expect(body.records.length).toBeGreaterThan(0);
    expect(body.records.length).toBeLessThanOrEqual(MAX_SEARCH_RESULTS);
    expect(body.total).toBeGreaterThan(0);
  });

  it('GET /api/catalog/vehicles?query=camry filters correctly', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .get('/api/catalog/vehicles')
      .query({ query: 'camry' });

    expect(response.status).toBe(200);
    const body = asJson<{ records: VehicleCatalogRecord[]; total: number }>(response.body);
    expect(body.records.length).toBeGreaterThan(0);
    for (const record of body.records) {
      expect(record.model.toLowerCase()).toContain('camry');
    }
  });

  it('GET /api/catalog/vehicles?limit=1000 stays bounded to MAX_SEARCH_RESULTS', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/catalog/vehicles').query({ limit: 1000 });

    expect(response.status).toBe(200);
    const body = asJson<{ records: VehicleCatalogRecord[]; total: number }>(response.body);
    expect(body.records.length).toBeLessThanOrEqual(MAX_SEARCH_RESULTS);
  });

  it('GET /api/catalog/vehicles?limit=notanumber responds 400 VALIDATION', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app)
      .get('/api/catalog/vehicles')
      .query({ limit: 'notanumber' });

    expect(response.status).toBe(400);
    const body = asJson<{ error: { code: string } }>(response.body);
    expect(body.error.code).toBe('VALIDATION');
  });

  it('GET /api/catalog/vehicles/:id returns the exact record for a real id', async () => {
    harness = createHttpTestHarness();

    const listResponse = await request(harness.app).get('/api/catalog/vehicles');
    const { records } = asJson<{ records: VehicleCatalogRecord[]; total: number }>(
      listResponse.body,
    );
    const target = records[0]!;

    const response = await request(harness.app).get(`/api/catalog/vehicles/${target.id}`);

    expect(response.status).toBe(200);
    const body = asJson<VehicleCatalogRecord>(response.body);
    expect(body).toEqual(target);
  });

  it('GET /api/catalog/vehicles/:id for an unknown id responds 404 NOT_FOUND', async () => {
    harness = createHttpTestHarness();

    const response = await request(harness.app).get('/api/catalog/vehicles/not-a-real-id');

    expect(response.status).toBe(404);
    const body = asJson<{ error: { code: string } }>(response.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
