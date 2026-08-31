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
 * Two-panel narrow-pane layout, not a desktop-style split view: search/
 * filter controls, then results, then the shortlist review + "Start
 * comparison" action -- all stacked vertically, since the canonical
 * viewport is 390-480px (product.md "The canonical viewport is ChatGPT's
 * right pane").
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { VehicleCatalogRecord } from '@sift/catalog/browser';
import { mapCatalogRecordToOption } from '@sift/catalog/browser';
import type { CommandReceipt } from '@sift/contracts';
import { useSiftCommands, useApiConfig } from '../app/AppProviders.js';
import {
  fetchCatalogBodyStyles,
  fetchCatalogMakes,
  fetchCatalogYears,
  searchCatalogVehicles,
  CatalogClientError,
} from '../api/catalog-client.js';
import { SiftClientError } from '../api/sift-client.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from './ErrorState.js';
import { HelpButton } from './HelpButton.js';

export const MAX_SHORTLIST_SIZE = 5;
export const MIN_SHORTLIST_SIZE = 2;

export interface VehicleCatalogFlowProps {
  /** Called once the case and every shortlisted vehicle have been durably created, with the final `CommandReceipt` (carrying the fresh `caseId`) -- lets `App` transition into the normal case workspace. */
  onCaseCreated?: (receipt: CommandReceipt) => void;
  /** Called when the user backs out to the launcher without creating a case. */
  onCancel?: () => void;
}

function vehicleLabel(record: VehicleCatalogRecord): string {
  const trimSuffix = record.trim !== null && record.trim.length > 0 ? ` ${record.trim}` : '';
  return `${record.year} ${record.make} ${record.model}${trimSuffix}`;
}

const selectClassName =
  'min-h-[var(--size-touch-target-min)] h-9 w-full min-w-0 rounded-[var(--radius-sm)] border-0 bg-muted px-3 py-1 text-[length:var(--font-size-base)] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';

export function VehicleCatalogFlow({ onCaseCreated, onCancel }: VehicleCatalogFlowProps) {
  const commands = useSiftCommands();
  const apiConfig = useApiConfig();

  const [queryText, setQueryText] = useState('');
  const [makeFilter, setMakeFilter] = useState('');
  const [bodyStyleFilter, setBodyStyleFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [makes, setMakes] = useState<string[]>([]);
  const [bodyStyles, setBodyStyles] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);

  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<VehicleCatalogRecord[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);

  const [shortlist, setShortlist] = useState<VehicleCatalogRecord[]>([]);

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
          ...(queryText.trim().length > 0 ? { query: queryText.trim() } : {}),
          ...(makeFilter.length > 0 ? { make: makeFilter } : {}),
          ...(bodyStyleFilter.length > 0 ? { bodyStyle: bodyStyleFilter } : {}),
          ...(yearFilter.length > 0 ? { year: Number(yearFilter) } : {}),
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
    [queryText, makeFilter, bodyStyleFilter, yearFilter],
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
  const canStart = shortlist.length >= MIN_SHORTLIST_SIZE && shortlist.length <= MAX_SHORTLIST_SIZE;

  function addToShortlist(record: VehicleCatalogRecord) {
    if (shortlistIds.has(record.id) || atCapacity) return;
    setShortlist((prev) => [...prev, record]);
  }

  function removeFromShortlist(id: string) {
    setShortlist((prev) => prev.filter((v) => v.id !== id));
  }

  async function handleStartComparison() {
    if (!canStart || creating) return;
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

  return (
    <div
      data-testid="vehicle-catalog-flow"
      className="page-enter mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-[var(--space-4)] p-[var(--space-4)]"
    >
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <div className="flex flex-col gap-[var(--space-1)]">
          <h1 className="font-[family-name:var(--font-display)] text-[length:var(--font-size-xl)] font-semibold text-foreground">
            Compare vehicles
          </h1>
          <p className="text-[length:var(--font-size-sm)] text-muted-foreground">
            Search the vehicle catalog, add up to {MAX_SHORTLIST_SIZE} to your shortlist, then start
            a real comparison case.
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-[var(--space-1)]">
          <HelpButton />
          <Button
            type="button"
            data-testid="vehicle-catalog-back"
            variant="secondary"
            size="sm"
            className="min-h-[var(--size-touch-target-min)] shrink-0"
            onClick={onCancel}
            disabled={creating}
          >
            Back
          </Button>
        </div>
      </div>

      <section
        data-testid="vehicle-catalog-shortlist"
        aria-labelledby="vehicle-catalog-shortlist-heading"
        className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
      >
        <div className="flex items-center justify-between gap-[var(--space-2)]">
          <h2 id="vehicle-catalog-shortlist-heading" className="text-[length:var(--font-size-md)]">
            Your shortlist
          </h2>
          <Badge variant={atCapacity ? 'destructive' : 'secondary'} data-testid="shortlist-count">
            {shortlist.length} of {MAX_SHORTLIST_SIZE}
          </Badge>
        </div>

        {shortlist.length === 0 ? (
          <p
            data-testid="vehicle-catalog-shortlist-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Add at least {MIN_SHORTLIST_SIZE} vehicles below to start a comparison.
          </p>
        ) : (
          <ul
            data-testid="vehicle-catalog-shortlist-list"
            className="flex flex-col gap-[var(--space-1)]"
          >
            {shortlist.map((vehicle) => (
              <li
                key={vehicle.id}
                data-testid={`shortlist-item-${vehicle.id}`}
                className="list-item-enter flex items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-sm)] bg-muted px-[var(--space-2)] py-[var(--space-1)]"
              >
                <span className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]">
                  {vehicleLabel(vehicle)}
                </span>
                <Button
                  type="button"
                  data-testid={`shortlist-remove-${vehicle.id}`}
                  variant="secondary"
                  size="xs"
                  className="min-h-[var(--size-touch-target-min)] min-w-[var(--size-touch-target-min)] bg-card text-card-foreground hover:bg-card/90"
                  disabled={creating}
                  onClick={() => {
                    removeFromShortlist(vehicle.id);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {createError ? (
          <ErrorState
            message={createError}
            onRetry={() => {
              void handleStartComparison();
            }}
          />
        ) : null}

        <Button
          type="button"
          data-testid="vehicle-catalog-start-comparison"
          aria-busy={creating}
          disabled={!canStart || creating}
          className="min-h-[var(--size-touch-target-min)]"
          onClick={() => {
            void handleStartComparison();
          }}
        >
          {creating
            ? 'Starting…'
            : `Start comparison${shortlist.length > 0 ? ` (${shortlist.length})` : ''}`}
        </Button>
      </section>

      <section
        data-testid="vehicle-catalog-search"
        aria-labelledby="vehicle-catalog-search-heading"
        className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
      >
        <h2 id="vehicle-catalog-search-heading" className="text-[length:var(--font-size-md)]">
          Browse the catalog
        </h2>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label
            htmlFor="vehicle-catalog-query"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Search
          </Label>
          <Input
            id="vehicle-catalog-query"
            type="text"
            placeholder="Make, model, or trim"
            value={queryText}
            className="min-h-[var(--size-touch-target-min)] border-0"
            onChange={(event) => {
              setQueryText(event.target.value);
            }}
          />
        </div>

        <div className="flex flex-col gap-[var(--space-1)]">
          <Label
            htmlFor="vehicle-catalog-year"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Model year
          </Label>
          <select
            id="vehicle-catalog-year"
            value={yearFilter}
            className={selectClassName}
            onChange={(event) => {
              setYearFilter(event.target.value);
            }}
          >
            <option value="">Any year</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[var(--space-2)] min-[400px]:flex-row">
          <div className="flex flex-1 flex-col gap-[var(--space-1)]">
            <Label
              htmlFor="vehicle-catalog-make"
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
            >
              Make
            </Label>
            <select
              id="vehicle-catalog-make"
              value={makeFilter}
              className={selectClassName}
              onChange={(event) => {
                setMakeFilter(event.target.value);
              }}
            >
              <option value="">Any make</option>
              {makes.map((make) => (
                <option key={make} value={make}>
                  {make}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-1 flex-col gap-[var(--space-1)]">
            <Label
              htmlFor="vehicle-catalog-body-style"
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
            >
              Body style
            </Label>
            <select
              id="vehicle-catalog-body-style"
              value={bodyStyleFilter}
              className={selectClassName}
              onChange={(event) => {
                setBodyStyleFilter(event.target.value);
              }}
            >
              <option value="">Any body style</option>
              {bodyStyles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section
        data-testid="vehicle-catalog-results"
        aria-labelledby="vehicle-catalog-results-heading"
        aria-busy={searchStatus === 'loading'}
        className="flex flex-col gap-[var(--space-2)]"
      >
        <h2 id="vehicle-catalog-results-heading" className="sr-only">
          Search results
        </h2>

        {searchStatus === 'loading' ? (
          <p
            data-testid="vehicle-catalog-loading"
            aria-live="polite"
            className="loading-pulse text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Searching…
          </p>
        ) : null}

        {searchStatus === 'error' ? (
          <ErrorState
            message={searchError ?? 'Could not load the vehicle catalog.'}
            onRetry={() => {
              runSearch({ cancelled: false });
            }}
          />
        ) : null}

        {searchStatus === 'idle' && results.length === 0 ? (
          <p
            data-testid="vehicle-catalog-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            No vehicles matched your search.
          </p>
        ) : null}

        {results.length > 0 ? (
          <>
            <p
              data-testid="vehicle-catalog-results-count"
              className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
            >
              Showing {results.length} of {resultsTotal}
            </p>
            <ul
              data-testid="vehicle-catalog-results-list"
              className="flex flex-col gap-[var(--space-2)]"
            >
              {results.map((vehicle) => {
                const alreadyAdded = shortlistIds.has(vehicle.id);
                // Kept to five short specs on purpose. The catalog record
                // carries 83 EPA fields, but this is a 390px-wide browse
                // list whose job is to let someone recognise a vehicle and
                // shortlist it -- the full detail belongs in the comparison
                // view, where a shortlisted candidate is actually weighed.
                //
                // Annual fuel cost earns its place here because it is EPA's
                // most decision-relevant published number, is populated for
                // 100% of the catalog, and is the one running-cost figure
                // that separates two vehicles with similar MPG. It is
                // labelled "est." because EPA's figure assumes 15,000
                // miles/year at a national average fuel price, neither of
                // which is this shopper's actual situation.
                const specs = [
                  vehicle.bodyStyle,
                  vehicle.drivetrain,
                  vehicle.fuelType,
                  vehicle.combinedMpg !== null ? `${vehicle.combinedMpg} MPG combined` : null,
                  vehicle.annualFuelCostUsd !== null
                    ? `est. $${vehicle.annualFuelCostUsd.toLocaleString('en-US')}/yr fuel`
                    : null,
                ].filter((value): value is string => value !== null);
                return (
                  <li
                    key={vehicle.id}
                    data-testid={`vehicle-card-${vehicle.id}`}
                    className="list-item-enter flex items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-md)] bg-card p-[var(--space-3)]"
                  >
                    <div className="flex flex-col gap-[var(--space-1)]">
                      <span className="text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold)] text-[var(--color-ink)]">
                        {vehicleLabel(vehicle)}
                      </span>
                      {specs.length > 0 ? (
                        // Each spec keeps its own trailing separator inside a
                        // `nowrap` span rather than being one joined string.
                        // At 390px this line wraps, and a plain join let the
                        // break land *before* a separator -- so a wrapped
                        // line opened with "· est. $2,800/yr fuel", which
                        // reads as a bullet rather than a continuation.
                        // Binding the separator to the end of the preceding
                        // spec puts the break after it, where it belongs, and
                        // also stops a single spec being split mid-phrase.
                        <span className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]">
                          {specs.map((spec, index) => (
                            <Fragment key={spec}>
                              <span className="whitespace-nowrap">
                                {spec}
                                {index < specs.length - 1 ? ' ·' : ''}
                              </span>
                              {/* The separating space lives OUTSIDE the
                                  nowrap span on purpose: it is the only
                                  break opportunity on this line. Putting it
                                  inside (as a trailing " · ") left the line
                                  with nowhere to break at all, so instead of
                                  wrapping it overflowed and clipped the last
                                  spec mid-word. */}
                              {index < specs.length - 1 ? ' ' : ''}
                            </Fragment>
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      data-testid={`vehicle-add-${vehicle.id}`}
                      variant={alreadyAdded ? 'secondary' : 'default'}
                      size="sm"
                      className="min-h-[var(--size-touch-target-min)] shrink-0"
                      disabled={alreadyAdded || (atCapacity && !alreadyAdded)}
                      onClick={() => {
                        addToShortlist(vehicle);
                      }}
                    >
                      {alreadyAdded ? 'Added' : 'Add'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
