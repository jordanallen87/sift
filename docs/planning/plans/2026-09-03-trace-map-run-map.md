# Trace Map and Runtime Inspector Run Map Implementation Plan


**Goal:** Add a reusable event-to-run-map projector and a real trace-backed Run Map tab to Sift's Runtime Inspector.

**Architecture:** A dependency-free `@sift/trace-map` package projects normalized signals through a serializable stage definition. Sift owns the adapter from its redacted runtime/activity events and a React renderer that navigates into the existing Timeline.

**Tech Stack:** TypeScript 6, Vitest 4, React 19, Testing Library, existing Sift tokens.

**Spec:** `docs/planning/specs/2026-09-03-demo-studio-run-map-design.md`

## Global Constraints

- `@sift/trace-map` imports no React, Sift contract, Strands, browser, or transport code.
- Projection is deterministic and preserves source signal ids.
- Unknown events stay in Timeline and do not break projection.
- Only already-redacted safe event data reaches the map.
- Color is not the only status signal; reduced motion is honored.

---

### Task 1: Pure trace projection package

**Files:**
- Create: `packages/trace-map/package.json`
- Create: `packages/trace-map/tsconfig.json`
- Create: `packages/trace-map/src/model.ts`
- Create: `packages/trace-map/src/project.ts`
- Create: `packages/trace-map/src/project.test.ts`
- Create: `packages/trace-map/src/index.ts`
- Create: `packages/trace-map/README.md`

**Interfaces:**
- Consumes: `TraceSignal[]` and `RunMapDefinition`.
- Produces: `projectRunMap(definition, signals): RunMapModel`.

- [ ] **Step 1: Write failing projection tests**

Test exact and prefix rule matching, sequence ordering, event-id retention,
guarded/failed/active/completed precedence, and unknown-event tolerance.

- [ ] **Step 2: Verify the test fails because the package is absent**

Run: `pnpm vitest run packages/trace-map/src/project.test.ts`

- [ ] **Step 3: Implement the minimal model and projector**

Use serializable rules:

```ts
interface RunMapRule {
  stageId: string;
  match: { types?: string[]; names?: string[]; namePrefixes?: string[] };
  status?: RunMapStageStatus;
  milestone?: 'summary' | 'name' | { attribute: string };
}
```

Aggregate at most two unique milestones per stage and resolve status with
`failed > guarded > active > completed > neutral`.

- [ ] **Step 4: Run package tests and typecheck**

Run: `pnpm vitest run packages/trace-map/src/project.test.ts && pnpm --filter @sift/trace-map typecheck`

- [ ] **Step 5: Document the public API and extraction boundary**

The README includes a complete definition, signal, projection, and result
example with no Sift vocabulary.

### Task 2: Sift trace adapter and definition

**Files:**
- Create: `apps/web/src/components/runtime-run-map.ts`
- Create: `apps/web/src/components/runtime-run-map.test.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `RuntimeInspectorEvent[]`, `PublicActivityEvent[]`.
- Produces: `buildSiftRunMap(runtimeEvents, activityEvents): RunMapModel` and `SIFT_RUN_MAP_DEFINITION`.

- [ ] **Step 1: Write failing adapter tests**

Prove WebMCP origin is present only for real `safeDetails.origin`, Graph and
Swarm events enter orchestration, skill/tool events enter investigation,
GoalLoop/interventions enter verification, and approval enters authority.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run apps/web/src/components/runtime-run-map.test.ts`

- [ ] **Step 3: Implement normalization and the six-stage definition**

Normalize only safe public fields. Convert runtime category to `type`, preserve
sequence, and assign activity events after runtime sequence while retaining ids.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run apps/web/src/components/runtime-run-map.test.ts`

### Task 3: Accessible Run Map renderer

**Files:**
- Create: `apps/web/src/components/RunMap.tsx`
- Create: `apps/web/src/components/RunMap.test.tsx`

**Interfaces:**
- Consumes: `model: RunMapModel`, `onViewStage(stageId, signalIds)`.
- Produces: responsive, keyboard-accessible stage flow.

- [ ] **Step 1: Write failing component tests**

Assert six ordered stages, textual status, milestone limits, honest empty state,
and a button that returns the selected stage and source ids.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run apps/web/src/components/RunMap.test.tsx`

- [ ] **Step 3: Implement the renderer using existing design tokens**

Use an ordered list, visible status labels, connecting rules, `data-testid`
selectors, and CSS transitions disabled by `prefers-reduced-motion`.

- [ ] **Step 4: Verify GREEN and accessibility**

Run: `pnpm vitest run apps/web/src/components/RunMap.test.tsx`

### Task 4: Runtime Inspector integration

**Files:**
- Modify: `apps/web/src/components/RuntimeInspector.tsx`
- Modify: `apps/web/src/components/RuntimeInspector.test.tsx`
- Modify: `docs/specs/debugging-and-observability.md`
- Modify: `docs/specs/product.md`

**Interfaces:**
- Consumes: the adapter and RunMap component.
- Produces: `Run map | Overview | Timeline | Activity`; stage selection opens Timeline and highlights matching events.

- [ ] **Step 1: Extend tests before the component**

Assert Run Map is the default for a selected run, absent-run developer view
still opens Activity, WebMCP origin is visible, and View events moves to
Timeline with matching items marked `data-stage-focused="true"`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run apps/web/src/components/RuntimeInspector.test.tsx`

- [ ] **Step 3: Add the tab and stage-to-Timeline state**

Preserve existing `focusEventId` behavior. Stage focus is a set of ids and may
highlight more than one item without changing the server filter.

- [ ] **Step 4: Update product and observability docs immediately**

Document data provenance, six stages, navigation, empty behavior, and the fact
that the origin marker is observability rather than authorization.

- [ ] **Step 5: Verify component and package suites**

Run: `pnpm vitest run packages/trace-map/src apps/web/src/components/RunMap.test.tsx apps/web/src/components/runtime-run-map.test.ts apps/web/src/components/RuntimeInspector.test.tsx`

### Task 5: Integration verification

**Files:**
- Modify only if a failing check identifies a defect in files above.

- [ ] **Step 1: Run targeted typechecks**

Run: `pnpm --filter @sift/trace-map typecheck && pnpm --filter @sift/web typecheck`

- [ ] **Step 2: Run formatting and lint checks**

Run: `pnpm prettier --check packages/trace-map apps/web/src/components/RunMap.tsx apps/web/src/components/runtime-run-map.ts apps/web/src/components/RuntimeInspector.tsx && pnpm lint`

- [ ] **Step 3: Run the full unit suite**

Run: `pnpm test:unit`

- [ ] **Step 4: Record verification evidence in the final completion report**

Report exact commands, failures attributable to pre-existing user changes, and
the rollback boundary: remove the Run Map tab and workspace dependency while
leaving the existing inspector untouched.

