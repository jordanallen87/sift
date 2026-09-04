# Reusable Demo Studio Implementation Plan


**Goal:** Turn the proven one-off demo pipeline into a reusable package with validated manifests, animated architecture flows, timed annotations, and deterministic composition inputs.

**Architecture:** `@sift/demo-studio` is a Sift-independent Node package. It validates a portable manifest, renders diagrams and annotation layers as HTML assets, and emits a deterministic FFmpeg edit plan; aidemo remains the browser capture engine.

**Tech Stack:** TypeScript 6, Zod 4, Vitest 4, HTML/CSS/SVG, FFmpeg/ffprobe, aidemo v0.8.0.

**Spec:** `docs/planning/specs/2026-09-03-demo-studio-run-map-design.md`

## Global Constraints

- No import from `@sift/*`, React, Strands, WebMCP, or a hackathon package.
- Never overwrite an approved take; generated assets live below `generated/` or `output/`.
- Coordinates are normalized; validation enforces the title-safe area and duration cap.
- Browser capture remains delegated to aidemo or a registered external adapter.
- Existing zoom, cursor, caption, and motion-blur capabilities are not reimplemented.

---

### Task 1: Portable manifest schema and validator

**Files:**
- Create: `packages/demo-studio/package.json`
- Create: `packages/demo-studio/tsconfig.json`
- Create: `packages/demo-studio/src/schema.ts`
- Create: `packages/demo-studio/src/schema.test.ts`
- Create: `packages/demo-studio/src/validate.ts`
- Create: `packages/demo-studio/src/index.ts`

**Interfaces:**
- Produces: `DemoManifestSchema`, `DiagramSchema`, `parseDemoManifest(value)`, and `validateTimeline(manifest)`.

- [ ] **Step 1: Write failing schema and timeline tests**

Cover five annotation primitives, normalized bounds, missing source adapter,
overlapping/noncontiguous segments, annotation ranges, safe margins, and cap
overflow.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run packages/demo-studio/src/schema.test.ts`

- [ ] **Step 3: Implement the minimal Zod schemas and semantic validator**

Return all semantic errors in one result so a late render is not blocked one
problem at a time.

- [ ] **Step 4: Verify GREEN and typecheck**

Run: `pnpm vitest run packages/demo-studio/src/schema.test.ts && pnpm --filter @sift/demo-studio typecheck`

### Task 2: Annotation and architecture HTML renderers

**Files:**
- Create: `packages/demo-studio/src/render-annotations.ts`
- Create: `packages/demo-studio/src/render-annotations.test.ts`
- Create: `packages/demo-studio/src/render-diagram.ts`
- Create: `packages/demo-studio/src/render-diagram.test.ts`

**Interfaces:**
- Produces: `renderAnnotationDocument(manifest, segmentId): string` and `renderDiagramDocument(diagram): string`.

- [ ] **Step 1: Write failing output tests**

Assert escaped text, deterministic markup, one layer per annotation, normalized
geometry, animation timing variables, reduced-motion behavior, diagram edge
endpoint validation, and timed reveal steps.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run packages/demo-studio/src/render-annotations.test.ts packages/demo-studio/src/render-diagram.test.ts`

- [ ] **Step 3: Implement standalone documents with no remote assets**

Use CSS/SVG only. Each output has a transparent canvas, deterministic ids, and
query parameter `?t=<seconds>` support that freezes the presentation at a
specific time for frame extraction.

- [ ] **Step 4: Verify GREEN**

Run the two targeted test files and Prettier.

### Task 3: CLI and FFmpeg edit plan

**Files:**
- Create: `packages/demo-studio/src/cli.ts`
- Create: `packages/demo-studio/src/edit-plan.ts`
- Create: `packages/demo-studio/src/edit-plan.test.ts`
- Create: `packages/demo-studio/bin/demo-studio.mjs`
- Create: `packages/demo-studio/README.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Commands: `demo-studio validate`, `diagram`, `overlays`, `compose-plan`.
- Produces: validated HTML assets and `generated/edit-plan.json` containing normalized FFmpeg operations.

- [ ] **Step 1: Write failing edit-plan tests**

Assert trim/pad decisions, per-segment annotation inputs, narration assets,
transition offsets, and final duration.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run packages/demo-studio/src/edit-plan.test.ts`

- [ ] **Step 3: Implement edit-plan generation and CLI dispatch**

The CLI uses atomic temporary files plus rename for generated text assets. It
never mutates recordings or narration inputs.

- [ ] **Step 4: Verify GREEN and exercise help/validation**

Run: `pnpm demo:studio --help` and validate the two hackathon directories.

- [ ] **Step 5: Document how another repository consumes the package**

Include workspace, Git dependency, and copied-package examples plus the adapter
contract. State that `compose-plan` is deterministic input to the proven FFmpeg
runner and does not claim to replace aidemo capture.

### Task 4: Convert both hackathon packages

**Files:**
- Modify: `docs/hackathons/demo-tooling/README.md`
- Modify: `docs/hackathons/webmcp/demo/manifest.json`
- Modify: `docs/hackathons/webmcp/demo/README.md`
- Create: `docs/hackathons/webmcp/demo/diagrams/shared-decision-environment.json`
- Modify: `docs/hackathons/webmcp/demo/generated/storyboard.json`
- Modify: `docs/hackathons/agents-for-humans/demo/manifest.json`
- Modify: `docs/hackathons/agents-for-humans/demo/README.md`
- Create: `docs/hackathons/agents-for-humans/demo/diagrams/supervised-agent-environment.json`
- Modify: `docs/hackathons/agents-for-humans/demo/generated/storyboard.json`
- Modify: `docs/submissions/webmcp/submission-details.md`
- Modify: `docs/submissions/agents-for-humans/submission-details.md`

**Interfaces:**
- Consumes: validated Demo Studio schemas.
- Produces: renderable manifests with one early diagram, timed annotations, Run Map proof, zoom, cursor, and motion blur.

- [ ] **Step 1: Add diagram definitions and annotations to WebMCP**

Use the approved 2:58 timeline and at most one six-word callout at once.

- [ ] **Step 2: Validate WebMCP**

Run: `pnpm demo:studio validate docs/hackathons/webmcp/demo`

- [ ] **Step 3: Convert AWS around the Run Map**

Keep the required separate architecture upload, shorten the in-video diagram,
and preserve all honesty constraints around GoalLoop and AgentCore.

- [ ] **Step 4: Validate AWS**

Run: `pnpm demo:studio validate docs/hackathons/agents-for-humans/demo`

- [ ] **Step 5: Update positioning and runbooks**

Apply the category/product/technical hierarchy verbatim and document every
generation command.

### Task 5: Verification

**Files:**
- Modify only if checks identify defects in files above.

- [ ] **Step 1: Run package tests and typechecks**

Run: `pnpm vitest run packages/demo-studio/src && pnpm --filter @sift/demo-studio typecheck`

- [ ] **Step 2: Run both production validators and generate HTML/edit plans**

Run `validate`, `diagram`, `overlays`, and `compose-plan` for each demo.

- [ ] **Step 3: Run formatting and lint**

Run: `pnpm format:check && pnpm lint`

- [ ] **Step 4: Record the completion report and storylines**

Report reusable interfaces, generated assets, exact verification commands,
known capture prerequisites, rollback boundaries, and the complete spoken/visual
storyline for both videos.
