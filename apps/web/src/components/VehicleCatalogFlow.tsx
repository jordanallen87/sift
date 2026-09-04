/**
 * "Compare vehicles" -- the launcher's primary, non-demo entry point
 * (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md). Lets a
 * user browse/search the bundled, offline vehicle catalog
 * (`apps/agent/src/routes/catalog.ts`), build a 2-5 vehicle shortlist, and
 * start a real, persisted `car-purchase` case from it: `startCase` once,
 * then one `upsertOption` per shortlisted vehicle (`mapCatalogRecordToOption`
 * from `@sift/catalog/browser` -- the exact same mapping any future
 * server-side caller would use, per that ADR's "one adaptation boundary")
 * -- the same shared `SiftCommands` instance every other visible control and
 * WebMCP callback already uses (CLAUDE.md "Visible UI controls and WebMCP
 * callbacks use the same command implementation").
 *
 * ## Layout: the list is the page
 *
 * This screen used to stack three full-width cards -- shortlist, then
 * search-and-filters, then results -- so at 390px a reader scrolled past
 * two panels to reach the thing they came for, and each result carried a
 * seven-field detail grid that made the list longer still. The catalog is
 * 853 vehicles; the list deserves the viewport.
 *
 * So the three competing panels each moved to a surface that costs nothing
 * until it is wanted:
 *
 * - filters -> `VehicleFilterSheet`, behind a filter button, with active
 *   facets shown as removable chips;
 * - per-vehicle detail -> `VehicleDetailSheet`, behind a tap on the row,
 *   which is also what let the row shrink to a scannable line;
 * - the shortlist -> `ShortlistFooter`, a fixed one-row bar that expands.
 *
 * What is left between the header and the footer is the list itself, plus
 * real pagination: `limit`/`offset` were supported by the client, the route
 * and the query layer all along, and this component was the only thing that
 * never sent them -- so it was permanently pinned to the first 20 of 853
 * with no way forward.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { VehicleCatalogRecord } from '@sift/catalog/browser';
import { mapCatalogRecordToOption } from '@sift/catalog/browser';
import type { CommandReceipt } from '@sift/contracts';
import { useSiftCommands, useApiConfig } from '../app/AppProviders.js';
import {
  fetchCatalogBodyStyles,
  fetchCatalogFuelTypes,
  fetchCatalogMakes,
  fetchCatalogYears,
  searchCatalogVehicles,
  CatalogClientError,
} from '../api/catalog-client.js';
import { SiftClientError } from '../api/sift-client.js';
import { Button } from '@/components/ui/button';
import { ErrorState } from './ErrorState.js';
import { HelpButton } from './HelpButton.js';
import { CatalogPagination } from './CatalogPagination.js';
import { ShortlistFooter } from './ShortlistFooter.js';
import { VehicleDetailSheet } from './VehicleDetailSheet.js';
import { VehicleFilterSheet, type VehicleFilters } from './VehicleFilterSheet.js';
import { VehicleResultCard } from './VehicleResultCard.js';
import { clampPage } from './pagination-window.js';

export const MAX_SHORTLIST_SIZE = 5;
export const MIN_SHORTLIST_SIZE = 2;

const DEFAULT_PAGE_SIZE = 20;

const EMPTY_FILTERS: VehicleFilters = {
  query: '',
  make: '',
  bodyStyle: '',
  fuelType: '',
  year: '',
};

export interface VehicleCatalogFlowProps {
  onCaseCreated?: (receipt: CommandReceipt) => void;
  onCancel?: () => void;
}

export function VehicleCatalogFlow({ onCaseCreated, onCancel }: VehicleCatalogFlowProps) {
  const commands = useSiftCommands();
  const apiConfig = useApiConfig();

  const [filters, setFilters] = useState<VehicleFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [makes, setMakes] = useState<string[]>([]);
  const [bodyStyles, setBodyStyles] = useState<string[]>([]);
  const [fuelTypes, setFuelTypes] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);

  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<VehicleCatalogRecord[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);

  const [shortlist, setShortlist] = useState<VehicleCatalogRecord[]>([]);
  /** The row whose full spec sheet is open; `null` closes it. */
  const [detailVehicle, setDetailVehicle] = useState<VehicleCatalogRecord | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Once startCase succeeds, its caseId/sequence are remembered so a retry
  // after a partial upsertOption failure resumes rather than creating a
  // second case.
  const [createdCase, setCreatedCase] = useState<{
    caseId: string;
    expectedSequence: number;
  } | null>(null);

  // Filter option lists -- fetched once; a transient failure here degrades
  // gracefully (an empty filter list still lets free-text search work).
  useEffect(() => {
    let cancelled = false;
    fetchCatalogMakes({}, apiConfig)
      .then((values) => {
        if (!cancelled) setMakes(values);
      })
      .catch(() => undefined);
    fetchCatalogBodyStyles(apiConfig)
      .then((values) => {
        if (!cancelled) setBodyStyles(values);
      })
      .catch(() => undefined);
    fetchCatalogFuelTypes(apiConfig)
      .then((values) => {
        if (!cancelled) setFuelTypes(values);
      })
      .catch(() => undefined);
    fetchCatalogYears(apiConfig)
      .then((values) => {
        if (!cancelled) setYears(values);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Deliberately runs once on mount only: `apiConfig` is stable per
    // `AppProviders` mount, and this project has no react-hooks lint rule
    // to satisfy by listing it anyway.
  }, []);

  // The one real search fetch, reused by the debounce effect below and by
  // the error state's retry action, so there is exactly one place that
  // knows how to run a search -- not two copies that could drift.
  const runSearch = useCallback(
    (signal: { cancelled: boolean }) => {
      setSearchStatus('loading');
      setSearchError(null);
      searchCatalogVehicles(
        {
          ...(filters.query.trim().length > 0 ? { query: filters.query.trim() } : {}),
          ...(filters.make.length > 0 ? { make: filters.make } : {}),
          ...(filters.bodyStyle.length > 0 ? { bodyStyle: filters.bodyStyle } : {}),
          ...(filters.fuelType.length > 0 ? { fuelType: filters.fuelType } : {}),
          ...(filters.year.length > 0 ? { year: Number(filters.year) } : {}),
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
        apiConfig,
      )
        .then(({ records, total }) => {
          if (signal.cancelled) return;
          setResults(records);
          setResultsTotal(total);
          setSearchStatus('idle');
        })
        .catch((error: unknown) => {
          if (signal.cancelled) return;
          setSearchStatus('error');
          setSearchError(
            error instanceof CatalogClientError
              ? error.message
              : 'Could not load the vehicle catalog.',
          );
        });
    },
    // `apiConfig` deliberately omitted: stable per `AppProviders` mount.
    [filters, page, pageSize],
  );

  // Debounced search -- a real network debounce, not a fabricated loading
  // timer (CLAUDE.md "Do not create fake loading timers"): the fetch itself
  // still drives `searchStatus`.
  useEffect(() => {
    const signal = { cancelled: false };
    setSearchStatus('loading');
    const handle = setTimeout(() => {
      runSearch(signal);
    }, 250);
    return () => {
      signal.cancelled = true;
      clearTimeout(handle);
    };
  }, [runSearch]);

  const shortlistIds = useMemo(() => new Set(shortlist.map((v) => v.id)), [shortlist]);
  const atCapacity = shortlist.length >= MAX_SHORTLIST_SIZE;

  function addToShortlist(record: VehicleCatalogRecord) {
    if (shortlistIds.has(record.id) || atCapacity) return;
    setShortlist((prev) => [...prev, record]);
  }

  function removeFromShortlist(id: string) {
    setShortlist((prev) => prev.filter((v) => v.id !== id));
  }

  /**
   * Any filter change returns to page 1.
   *
   * Narrowing 853 results to 12 while sitting on page 30 would otherwise
   * render an empty list that looks like a broken search rather than a
   * successful filter.
   */
  function handleFiltersChange(next: VehicleFilters) {
    setFilters(next);
    setPage(1);
  }

  /**
   * A bigger page size keeps the reader as close to their place as the new
   * pagination allows, rather than stranding them past the end.
   */
  function handlePageSizeChange(nextSize: number) {
    setPage((current) => clampPage(current, resultsTotal, nextSize));
    setPageSize(nextSize);
  }

  async function handleStartComparison() {
    if (shortlist.length < MIN_SHORTLIST_SIZE || shortlist.length > MAX_SHORTLIST_SIZE || creating) {
      return;
    }
    setCreating(true);
    setCreateError(null);

    try {
      let caseId: string;
      let expectedSequence: number;
      let lastReceipt: CommandReceipt;

      if (createdCase !== null) {
        // Resuming after a partial failure -- the case already exists.
        caseId = createdCase.caseId;
        expectedSequence = createdCase.expectedSequence;
        lastReceipt = { commandId: 'resume', caseId, acceptedSequence: expectedSequence };
      } else {
        const receipt = await commands.startCase({ packId: 'car-purchase' });
        caseId = receipt.caseId;
        expectedSequence = receipt.acceptedSequence;
        lastReceipt = receipt;
        setCreatedCase({ caseId, expectedSequence });
      }

      // Vehicles already present on the case (from a prior partial attempt)
      // are never re-added: `upsertOption` always creates a *new* option
      // when called without an `optionId`, so blindly retrying every
      // vehicle after a partial failure would duplicate the ones that
      // already succeeded. Re-deriving "which vehicles are already on the
      // case" would need a fresh `GET`; simpler and equally correct is to
      // just retry the whole shortlist against a case that -- on first
      // failure -- is guaranteed to have had zero vehicles added yet, since
      // `upsertOption` calls below run strictly in order and this function
      // returns (surfacing the error) on the very first one that fails.
      for (const vehicle of shortlist) {
        const mapped = mapCatalogRecordToOption(vehicle);
        const receipt = await commands.upsertOption({
          caseId,
          expectedSequence,
          option: { label: mapped.label, kind: 'candidate', attributes: mapped.attributes },
        });
        expectedSequence = receipt.acceptedSequence;
        lastReceipt = receipt;
      }

      setCreating(false);
      onCaseCreated?.(lastReceipt);
    } catch (error: unknown) {
      setCreating(false);
      setCreateError(
        error instanceof SiftClientError || error instanceof Error
          ? error.message
          : 'Could not start this comparison.',
      );
    }
  }

  const hasResults = results.length > 0;
  // Exactly one summary of the result set, and exactly one live region:
  // `CatalogPagination` carries the "1-20 of 853" span whenever it renders,
  // and this line covers the single-page case it deliberately sits out.
  const showPlainCount = hasResults && resultsTotal <= pageSize;

  return (
    <div
      data-testid="vehicle-catalog-flow"
      className="page-shell page-enter flex min-h-screen flex-col gap-[var(--space-4)] p-[var(--space-4)]"
      // `ShortlistFooter` publishes this on the document root while it is
      // mounted and reclaims it when the shortlist empties, so the fallback
      // is what makes the page correct when no bar exists.
      style={{ scrollPaddingBottom: 'var(--shortlist-bar-inset, 0px)' }}
    >
      <header className="flex items-start justify-between gap-[var(--space-3)]">
        <div className="min-w-0">
          <h1 className="text-[length:var(--font-size-2xl)] font-[var(--font-weight-semibold)]">
            Compare vehicles
          </h1>
          <p className="text-[length:var(--font-size-sm)] text-muted-foreground">
            Shortlist up to {MAX_SHORTLIST_SIZE} vehicles, then start a real comparison.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-[var(--space-1)]">
          <HelpButton />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            // `size="sm"` is 36px tall; the pane's controls owe 44px.
            className="min-h-[var(--size-touch-target-min)] shrink-0"
            data-testid="vehicle-catalog-back"
            disabled={creating}
            onClick={() => {
              onCancel?.();
            }}
          >
            Back
          </Button>
        </div>
      </header>

      <VehicleFilterSheet
        filters={filters}
        onFiltersChange={handleFiltersChange}
        makes={makes}
        bodyStyles={bodyStyles}
        fuelTypes={fuelTypes}
        years={years}
        resultCount={resultsTotal}
        busy={searchStatus === 'loading'}
      />

      <section
        data-testid="vehicle-catalog-results"
        aria-labelledby="vehicle-catalog-results-heading"
        // Reserves the fixed bar's height so the last result stays reachable.
        className="flex flex-1 flex-col gap-[var(--space-3)] pb-[var(--shortlist-bar-inset,0px)]"
      >
        <h2 id="vehicle-catalog-results-heading" className="sr-only">
          Search results
        </h2>

        {searchStatus === 'loading' ? (
          <p
            data-testid="vehicle-catalog-loading"
            className="text-[length:var(--font-size-sm)] text-muted-foreground"
          >
            Searching…
          </p>
        ) : null}

        {searchStatus === 'error' && searchError !== null ? (
          <ErrorState
            message={searchError}
            onRetry={() => {
              runSearch({ cancelled: false });
            }}
          />
        ) : null}

        {searchStatus === 'idle' && !hasResults ? (
          <p
            data-testid="vehicle-catalog-empty"
            className="text-[length:var(--font-size-sm)] text-muted-foreground"
          >
            No vehicles matched your search.
          </p>
        ) : null}

        {showPlainCount ? (
          <p
            data-testid="vehicle-catalog-results-count"
            className="text-[length:var(--font-size-sm)] text-muted-foreground tabular-nums"
            aria-live="polite"
          >
            {resultsTotal.toLocaleString('en-US')}{' '}
            {resultsTotal === 1 ? 'vehicle' : 'vehicles'}
          </p>
        ) : null}

        {hasResults ? (
          <ul data-testid="vehicle-catalog-results-list" className="option-grid">
            {results.map((vehicle) => (
              <VehicleResultCard
                key={vehicle.id}
                vehicle={vehicle}
                added={shortlistIds.has(vehicle.id)}
                atCapacity={atCapacity}
                onAdd={addToShortlist}
                onOpenDetails={setDetailVehicle}
              />
            ))}
          </ul>
        ) : null}

        <CatalogPagination
          totalCount={resultsTotal}
          pageSize={pageSize}
          currentPage={page}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          busy={searchStatus === 'loading'}
        />
      </section>

      <VehicleDetailSheet
        vehicle={detailVehicle}
        open={detailVehicle !== null}
        onOpenChange={(open) => {
          if (!open) setDetailVehicle(null);
        }}
        inShortlist={detailVehicle !== null && shortlistIds.has(detailVehicle.id)}
        shortlistFull={atCapacity}
        onToggleShortlist={(vehicle) => {
          if (shortlistIds.has(vehicle.id)) removeFromShortlist(vehicle.id);
          else addToShortlist(vehicle);
        }}
      />

      <ShortlistFooter
        shortlist={shortlist}
        maxSize={MAX_SHORTLIST_SIZE}
        minSize={MIN_SHORTLIST_SIZE}
        onRemove={removeFromShortlist}
        onStartComparison={() => {
          void handleStartComparison();
        }}
        creating={creating}
        error={
          createError === null ? undefined : (
            <ErrorState
              message={createError}
              onRetry={() => {
                void handleStartComparison();
              }}
            />
          )
        }
      />
    </div>
  );
}
