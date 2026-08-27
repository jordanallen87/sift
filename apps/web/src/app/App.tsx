/**
 * The route-free launcher/workspace shell (locked file map:
 * `apps/web/src/app/App.tsx  Route-free launcher/workspace shell`).
 *
 * product.md's "Primary experience" describes one page, not a multi-page
 * site: "The page contains a seeded demo launcher and the active case
 * workspace." There is no router -- `App` is a plain state machine with
 * exactly two branches: `DemoLauncher` when no case exists yet, and the
 * case workspace once `startDemo` has returned a receipt.
 *
 * Scope note for this Task 9 pass (see this task's brief and
 * docs/build-log.md's entry for the full reasoning): the post-launch branch
 * below is intentionally a single, clearly-labeled placeholder region, NOT
 * `CaseHeader` wired to live data. `CaseHeader` exists and is fully built
 * and tested this same pass (`../components/CaseHeader.tsx`), but it is a
 * pure props-driven component with no data source of its own yet -- wiring
 * it (plus the other six workspace regions) to real streamed `CaseState`
 * is explicitly later work (Task 10's `use-case-events.ts` and beyond).
 * Rendering `CaseHeader` here now with synthesized/partial data would
 * blur that boundary and risk conflicting with that task's real data
 * wiring.
 */
import { useCallback, useState } from 'react';
import type { CommandReceipt } from '@pax/contracts';
import { DemoLauncher } from '../components/DemoLauncher.js';

export function App() {
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  const handleDemoStarted = useCallback((receipt: CommandReceipt) => {
    setActiveCaseId(receipt.caseId);
  }, []);

  if (activeCaseId === null) {
    return <DemoLauncher onDemoStarted={handleDemoStarted} />;
  }

  return (
    <div data-testid="case-workspace" className="flex min-h-screen flex-col">
      {/*
        Slot for the seven workspace regions in product.md's "Workspace
        layout" order (case header, current focus, readiness, evidence and
        comparison, activity, recommendation and approval, Runtime
        Inspector). Each later task replaces this single placeholder body
        with its real region component(s), in that order.
      */}
      <div
        data-testid="case-workspace-body"
        className="flex flex-1 items-center justify-center p-[var(--space-4)] text-[var(--color-ink-secondary)]"
      >
        Case {activeCaseId} is starting. The full case workspace ships in a later build task.
      </div>
    </div>
  );
}
