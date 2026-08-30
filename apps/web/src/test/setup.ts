/**
 * Global Vitest setup for `@sift/web` component tests (docs/specs/testing.md
 * "Component tests": "React Testing Library verifies every visible state
 * ... axe checks run on the launcher, active workspace, pending
 * confirmation, error, and decided states.").
 *
 * Registers jest-dom's DOM matchers (`toBeInTheDocument`, `toBeDisabled`,
 * ...) and jest-axe's `toHaveNoViolations` matcher against Vitest's own
 * `expect`, so every `*.test.tsx` file gets both without a per-file import.
 * `jest-axe` is framework-agnostic (it only formats a returned axe-core
 * results object into a matcher) and works identically under Vitest.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// `@testing-library/react`'s own automatic-cleanup registration only fires
// when it detects a *global* `afterEach` (e.g. Jest, or Vitest with
// `test.globals: true`). This repo's Vitest configs deliberately do not set
// `globals: true` (every existing package test file explicitly imports
// `describe`/`it`/`expect` from 'vitest' -- see e.g.
// packages/contracts/src/commands.test.ts), so cleanup is registered
// explicitly here instead: without it, every test after the first in a
// file would render into a still-populated `document.body`, and
// `screen.getByRole(...)` queries would start matching multiple elements.
afterEach(() => {
  cleanup();
});
