/**
 * Provider composition root (locked file map:
 * `apps/web/src/app/AppProviders.tsx  Query, event, command, and test
 * providers`).
 *
 * A single shared `SiftCommands` client, reachable from any descendant via
 * `useSiftCommands()`, with a `commandsClient` override prop so component
 * tests (and later Playwright tests through the same seam) can substitute
 * a fake client without hitting the network (CLAUDE.md "Non-negotiable
 * product truths": "Visible UI controls and WebMCP callbacks use the same
 * command implementation" -- every control below this provider resolves the
 * exact same instance).
 *
 * This pass (Task 10, `use-case-events.ts` and the full live `App.tsx`
 * wiring) adds the two remaining test-injection seams the rest of the live
 * workspace needs: `caseEventsConfig` (the same `baseUrl`/`fetchImpl`/
 * `createEventSource` overrides `useCaseEvents` itself accepts, plus reused
 * by the plain `GET /api/packs` fetch backing the WebMCP `sift_list_packs`
 * tool and `OptionCompareView`'s presentation metadata) and `webMcpAdapter`
 * (defaults to the real `BrowserModelContextAdapter`; tests substitute
 * `InMemoryModelContextAdapter`). Both follow the exact same pattern as
 * `commandsClient` above: a plain optional override prop, not a new kind of
 * plumbing.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createSiftClient, type SiftCommands } from '../api/sift-client.js';
import { BrowserModelContextAdapter, type ModelContextAdapter } from '../model-context/adapter.js';
import type { CreateEventSource } from '../hooks/use-case-events.js';

const SiftCommandsContext = createContext<SiftCommands | null>(null);

/** Same-origin API config shared by `useCaseEvents` and the plain `GET /api/packs` fetch -- every field optional so a caller (or test) only overrides what it needs to. */
export interface ApiConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  createEventSource?: CreateEventSource;
}

const ApiConfigContext = createContext<ApiConfig>({});
const WebMcpAdapterContext = createContext<ModelContextAdapter | null>(null);

export interface AppProvidersProps {
  children: ReactNode;
  /** Test-injectable override -- substitutes a fake `SiftCommands` implementation without hitting the network. Defaults to the real same-origin HTTP client. */
  commandsClient?: SiftCommands;
  /** Test-injectable overrides for the live case-event stream and packs fetch. Defaults to same-origin `fetch`/`EventSource`. */
  caseEventsConfig?: ApiConfig;
  /** Test-injectable `ModelContextAdapter` override. Defaults to the real `BrowserModelContextAdapter`. */
  webMcpAdapter?: ModelContextAdapter;
}

export function AppProviders({
  children,
  commandsClient,
  caseEventsConfig,
  webMcpAdapter,
}: AppProvidersProps) {
  const client = useMemo(() => commandsClient ?? createSiftClient(), [commandsClient]);
  const apiConfig = useMemo(() => caseEventsConfig ?? {}, [caseEventsConfig]);
  const adapter = useMemo(() => webMcpAdapter ?? new BrowserModelContextAdapter(), [webMcpAdapter]);

  return (
    <SiftCommandsContext.Provider value={client}>
      <ApiConfigContext.Provider value={apiConfig}>
        <WebMcpAdapterContext.Provider value={adapter}>{children}</WebMcpAdapterContext.Provider>
      </ApiConfigContext.Provider>
    </SiftCommandsContext.Provider>
  );
}

/** The shared `SiftCommands` client every visible control and, later, every WebMCP tool callback sends commands through. Throws if called outside `<AppProviders>`. */
export function useSiftCommands(): SiftCommands {
  const client = useContext(SiftCommandsContext);
  if (client === null) {
    throw new Error('useSiftCommands must be called within <AppProviders>.');
  }
  return client;
}

/** The shared same-origin API config (`baseUrl`/`fetchImpl`/`createEventSource`) `App.tsx` passes to `useCaseEvents` and its own `GET /api/packs` fetch. Safe to call outside `<AppProviders>` -- resolves to `{}` (every field defaults inside its consumer), matching how a top-level `main.tsx` mount with no explicit overrides behaves. */
export function useApiConfig(): ApiConfig {
  return useContext(ApiConfigContext);
}

/** The shared `ModelContextAdapter` WebMCP tool registration uses. Throws if called outside `<AppProviders>`, matching `useSiftCommands()`. */
export function useWebMcpAdapter(): ModelContextAdapter {
  const adapter = useContext(WebMcpAdapterContext);
  if (adapter === null) {
    throw new Error('useWebMcpAdapter must be called within <AppProviders>.');
  }
  return adapter;
}

/**
 * Whether a WebMCP host is actually present, for copy that must not promise
 * assistant interaction a browser cannot deliver (`HowSiftWorks`, and
 * through it the first-run guide and the Help sheet).
 *
 * Deliberately NON-throwing outside `<AppProviders>`, unlike
 * `useWebMcpAdapter()` above: this is read by presentational content that
 * several component tests render bare, and "no provider" is
 * indistinguishable, for copy purposes, from "no WebMCP host" -- both mean
 * an assistant cannot reach this page, which is exactly what the
 * unsupported copy says. It calls the SAME real `adapter.supported()` check
 * `WebMcpStatus` does (`model-context/adapter.ts`), never a second
 * re-implemented feature detect, so the guide and the footer status strip
 * can never disagree about the host.
 */
export function useWebMcpSupported(): boolean {
  const adapter = useContext(WebMcpAdapterContext);
  return adapter?.supported() ?? false;
}
