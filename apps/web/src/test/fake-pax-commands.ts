/**
 * A fully-stubbed `PaxCommands` implementation for component tests. Backs
 * `AppProviders`'s "test-injectable override point" (locked file map:
 * `apps/web/src/app/AppProviders.tsx  Query, event, command, and test
 * providers") so component tests -- and later Playwright tests through the
 * same seam -- can substitute a fake client without hitting the network,
 * instead of mocking `fetch`/MSW for every component test.
 */
import { vi } from 'vitest';
import type { CommandReceipt, RunReceipt } from '@pax/contracts';
import type { PaxCommands } from '../api/pax-client.js';

export function buildFakeCommandReceipt(overrides: Partial<CommandReceipt> = {}): CommandReceipt {
  return {
    commandId: 'cmd-fake-1',
    caseId: 'case-fake-1',
    acceptedSequence: 0,
    ...overrides,
  };
}

export function buildFakeRunReceipt(overrides: Partial<RunReceipt> = {}): RunReceipt {
  return {
    ...buildFakeCommandReceipt(),
    runId: 'run-fake-1',
    ...overrides,
  };
}

/** Every method resolves to a fake receipt by default; pass `overrides` (e.g. `{ startDemo: vi.fn().mockRejectedValue(...) }`) to script a specific test's behavior. */
export function createFakePaxCommands(overrides: Partial<PaxCommands> = {}): PaxCommands {
  const defaultReceipt = buildFakeCommandReceipt();
  const defaultRunReceipt = buildFakeRunReceipt();

  return {
    startDemo: vi.fn().mockResolvedValue(defaultReceipt),
    startCase: vi.fn().mockResolvedValue(defaultReceipt),
    selectPack: vi.fn().mockResolvedValue(defaultReceipt),
    upsertOption: vi.fn().mockResolvedValue(defaultReceipt),
    focusOption: vi.fn().mockResolvedValue(defaultReceipt),
    defineCaseAttribute: vi.fn().mockResolvedValue(defaultReceipt),
    reviewCaseExtension: vi.fn().mockResolvedValue(defaultReceipt),
    focusEvidence: vi.fn().mockResolvedValue(defaultReceipt),
    updateCriteria: vi.fn().mockResolvedValue(defaultReceipt),
    submitSource: vi.fn().mockResolvedValue(defaultReceipt),
    requestInvestigation: vi.fn().mockResolvedValue(defaultRunReceipt),
    reviewProposal: vi.fn().mockResolvedValue(defaultReceipt),
    setEvidenceDisposition: vi.fn().mockResolvedValue(defaultReceipt),
    requestRevision: vi.fn().mockResolvedValue(defaultReceipt),
    ...overrides,
  };
}
