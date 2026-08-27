/**
 * Provider composition root (locked file map:
 * `apps/web/src/app/AppProviders.tsx  Query, event, command, and test
 * providers`).
 *
 * This Task 9 pass wires the piece the rest of the app needs immediately:
 * a single shared `PaxCommands` client, reachable from any descendant via
 * `usePaxCommands()`, with a `commandsClient` override prop so component
 * tests (and later Playwright tests through the same seam) can substitute
 * a fake client without hitting the network (CLAUDE.md "Non-negotiable
 * product truths": "Visible UI controls and WebMCP callbacks use the same
 * command implementation" -- every control below this provider resolves the
 * exact same instance).
 *
 * The event stream (SSE) and query-cache providers the file map's
 * description also names are wired in Task 10
 * (`docs/superpowers/plans/2026-08-26-pax-hackathon-build.md`: "Browser
 * commands, streaming state, and imperative WebMCP" -- `use-case-events.ts`
 * and friends), once there is live case data for them to project. Adding an
 * event/query provider now with nothing yet consuming it would be
 * speculative plumbing this pass explicitly excludes.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createPaxClient, type PaxCommands } from '../api/pax-client.js';

const PaxCommandsContext = createContext<PaxCommands | null>(null);

export interface AppProvidersProps {
  children: ReactNode;
  /** Test-injectable override -- substitutes a fake `PaxCommands` implementation without hitting the network. Defaults to the real same-origin HTTP client. */
  commandsClient?: PaxCommands;
}

export function AppProviders({ children, commandsClient }: AppProvidersProps) {
  const client = useMemo(() => commandsClient ?? createPaxClient(), [commandsClient]);

  return <PaxCommandsContext.Provider value={client}>{children}</PaxCommandsContext.Provider>;
}

/** The shared `PaxCommands` client every visible control and, later, every WebMCP tool callback sends commands through. Throws if called outside `<AppProviders>`. */
export function usePaxCommands(): PaxCommands {
  const client = useContext(PaxCommandsContext);
  if (client === null) {
    throw new Error('usePaxCommands must be called within <AppProviders>.');
  }
  return client;
}
