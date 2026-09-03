# Reusable Demo Studio and Trace-Backed Run Map

Date: 2026-09-03

Status: proposed for implementation

Scope: reusable demo composition, animated explanatory visuals, and Sift's
Runtime Inspector Run Map

## Decision summary

Build two independent, composable capabilities:

1. a project-agnostic Demo Studio package that extends the proven Praetor
   pipeline with declarative diagrams and timed annotations while continuing to
   use aidemo for browser capture; and
2. a project-agnostic trace projection package that turns arbitrary structured
   events into a small run-map model, with Sift supplying its own mapping and UI.

The video renderer must not understand Sift, WebMCP, Strands, or any hackathon.
The trace projector must not understand Sift event names until a Sift-owned
configuration is supplied. This is the boundary that makes both capabilities
reusable in other projects.

## Positioning hierarchy

The new framing consolidates rather than replaces the language already in the
repository.

### Category

> Sift is an agent-native decision environment for human-agent teams.

### Plain-language product promise

> It is a real-time, source-linked workspace where people and agents share the
> same criteria, evidence, and decision state, while the human keeps final
> authority.

### Technical value proposition

> Sift turns probabilistic model work into a durable, inspectable decision
> process with explicit completion rules and human authority.

### WebMCP expression

> WebMCP turns the browser from a screen an assistant reads into an environment
> it can safely participate in.

The WebMCP demonstration should prove the existing “shared control surface”
claim: ChatGPT reads and changes the same case the person sees, while Sift owns
the resulting computation, evidence, persistence, and authority boundary.

### AWS expression

> Sift is the supervisory environment around a Strands team: it measures
> evidence progress, redirects stalled work, validates proposed conclusions,
> and interrupts the person only when judgment or authority is required.

The existing close remains unchanged:

> Most agents are optimized to finish. Sift is optimized to know when the agent
> has not earned the right to answer yet.

## Goals

- Explain a complex agent system in less than fifteen seconds with an animated
  visual that is generated from text in source control.
- Make actual product footage easier to follow with restrained annotations,
  spotlights, focus moves, and blur.
- Show a real, trace-backed execution map inside Sift rather than relying on a
  static architecture slide for technical proof.
- Keep every render reproducible and every project-specific decision in a
  manifest or adapter.
- Allow other repositories to reuse the renderer and trace projector without
  importing Sift code.
- Preserve the ability to regenerate narration, annotations, diagrams, or the
  final edit without rerecording unaffected footage.

## Non-goals

- Do not fork or recreate aidemo's browser driver, cursor, autozoom, narration,
  caption, or motion-blur features.
- Do not build a general nonlinear video editor.
- Do not build a new telemetry store or change the runtime-event API merely to
  support a prettier view.
- Do not expose chain-of-thought or unredacted event data.
- Do not create a demo-only fake admin console.
- Do not build a full six-view observability suite before the submissions.

## System boundaries

```text
project demo manifest
    |
    +-- capture adapters -------- aidemo / native host / still / terminal
    +-- diagram renderer -------- declarative nodes, edges, reveal steps
    +-- annotation renderer ----- callout / arrow / spotlight / blur / lower-third
    +-- compositor -------------- normalize / overlay / narrate / caption / stitch
    +-- validator --------------- assets / timing / safe areas / hard cap / codecs

runtime events + public activity
    |
    +-- project adapter --------- normalized TraceSignal[]
    +-- generic projector ------- RunMapDefinition + signals -> RunMapModel
    +-- product renderer -------- Sift Run Map tab
```

The two paths meet only in the video: Demo Studio records the real Run Map like
any other product surface. There is no runtime dependency from Sift to the
video package.

## Demo Studio package

### Location and portability

Create `packages/demo-studio` as a private workspace package with no dependency
on any `@sift/*` package. Its public API and CLI must accept ordinary files and
JSON-serializable data. The initial implementation ports the content-independent
parts of:

`/Users/jordanallen/IdeaProjects/praetor/docs/hackathons/all-things-agentic/demo`

The package may later be extracted or published without changing its manifests.
Hackathon-specific directories contain only inputs and generated outputs.

### CLI

```text
demo-studio validate <demo-dir>
demo-studio diagram <demo-dir> [--only <id>]
demo-studio overlays <demo-dir> [--only <segment-id>]
demo-studio compose <demo-dir>
demo-studio render <demo-dir>
```

`render` orchestrates existing inputs; it does not own browser capture. The
runbook invokes aidemo or another capture adapter first, then Demo Studio
validates and composes the resulting clips.

### Master manifest

The existing hackathon `manifest.json` becomes a validated schema rather than
an informal edit list. A segment declares:

- stable id, source type, source asset, start, and target duration;
- narration and caption policy;
- crop and fit behavior;
- zero or more annotations;
- acceptance conditions retained as operator-facing metadata;
- optional transition and audio behavior.

Source types are open-ended strings validated against registered adapters.
The built-ins are `aidemo`, `video`, `still`, `diagram`, and `terminal`.

### Annotation model

The first version supports five primitives:

| Primitive | Purpose |
| --- | --- |
| `callout` | Short label connected to a target |
| `arrow` | Directional relationship without a label |
| `spotlight` | Dim the frame except for the target |
| `blur` | Obscure a target region for privacy or distraction control |
| `lowerThird` | Title, identity, or concise thesis not anchored to UI |

Every annotation declares an id, relative start/end time within its segment,
enter/exit motion, visual theme token, and anchor. Text callouts are limited by
validation to a configurable word count; the default is six words.

Anchors use normalized coordinates so they survive resolution changes:

```json
{
  "kind": "frame",
  "x": 0.62,
  "y": 0.18,
  "width": 0.24,
  "height": 0.10
}
```

The schema reserves `selector` and `track` anchors. A selector adapter may
resolve a DOM selector to normalized bounds during capture, while a track is a
time-sampled series of bounds for moving targets. Version one must implement
frame anchors and the data format for tracks; selector capture is optional if
it jeopardizes the submission schedule.

Annotations are rendered as transparent HTML/PNG frame sequences and applied
with FFmpeg overlays. This keeps typography and arrows deterministic without
patching aidemo. Annotation rendering must honor a title-safe margin and reject
targets that fall outside the frame.

### Animated diagrams

Add a declarative `architecture-flow` template rather than a free-form drawing
tool. Its input contains nodes, edges, groups, and timed reveal/highlight steps.
It renders an HTML animation at the target canvas size and records it to a clip.
Additional templates register behind the same interface later.

The WebMCP diagram contains one central `Decision case` with four participants:
Human, ChatGPT/WebMCP, Sift, and the supervised Strands team. Reveal order:

1. Human and ChatGPT share the visible case.
2. A typed WebMCP command changes criteria or case schema.
3. Sift invalidates affected state.
4. Strands investigates and returns evidence.
5. Sift recomputes and exposes the trace.
6. Approval returns only to the human.

The diagram lasts 12–14 seconds. It provides vocabulary; it does not attempt to
teach every component.

### Existing aidemo capabilities

The storyboards should enable aidemo's existing `zoom`, `motionBlur`, and
compose-time `cursor` settings. Explicit `focus` actions identify important UI
regions. Demo Studio annotations sit above the aidemo output and must not
duplicate its cursor or captions.

## Generic trace projection

### Package

Create `packages/trace-map` as a pure TypeScript package with no React, Sift,
Strands, or transport dependency.

It exports:

- `TraceSignal`: the small normalized event shape;
- `RunMapDefinition`: stages, edges, and declarative matching rules;
- `projectRunMap(definition, signals)`: deterministic projection;
- `RunMapModel`: stage status, counts, milestones, and source signal ids.

The package does not fetch events and does not render UI.

### Input normalization

Each consuming project adapts its own event sources to `TraceSignal`:

```ts
interface TraceSignal {
  id: string;
  sequence: number;
  timestamp: string;
  type: string;
  name: string;
  phase?: string;
  status?: 'pending' | 'active' | 'completed' | 'blocked' | 'failed';
  actor?: string;
  origin?: string;
  summary: string;
  parentId?: string;
  attributes?: Record<string, unknown>;
}
```

Sift will normalize both `RuntimeDebugEvent` and relevant
`PublicActivityEvent` records. The adapter must pass only already-redacted safe
attributes.

### Projection configuration

`RunMapDefinition` is declarative and serializable. It defines ordered stages,
optional edges, exact/prefix matching rules, label templates, and aggregation
keys. Unknown signals remain accessible in Timeline but do not break the map.

Sift's initial stages are:

1. **Request** — human or WebMCP command origin;
2. **Orchestration** — Graph/Swarm specialist routing and handoffs;
3. **Investigation** — AgentSkills, tools, and evidence-producing work;
4. **Verification** — interventions, source challenge, GoalLoop, readiness;
5. **Decision state** — invalidation, scoring, recommendation, persistence;
6. **Authority** — confirmation and human approval.

Stages aggregate events but retain their source ids. Selecting a stage filters
or highlights the existing Timeline; it never creates a parallel truth source.

## Sift Runtime Inspector Run Map

### User experience

Add **Run map** as the first tab when a run is selected:

```text
Run map | Overview | Timeline | Activity
```

At wide widths, stages render as a left-to-right flow. At right-pane widths,
the same stages stack vertically. Each stage shows:

- status and event count;
- up to two meaningful milestones;
- actor or origin when available;
- an honest empty state when the run did not exercise that stage.

Selecting a stage opens Timeline with the corresponding source event ids
highlighted. A “View events” action is keyboard reachable and uses the existing
Timeline rather than a new event-detail implementation.

For WebMCP-originated commands, the Request stage displays a visible `WebMCP`
origin marker only when `safeDetails.origin === 'webmcp'` exists. This marker
is observability, never authorization.

### Visual semantics

- Neutral: no matching event.
- Active: a start event lacks a terminal counterpart.
- Complete: the stage contains successful terminal evidence.
- Guarded: a confirmation, guide, deny, accepted uncertainty, or withheld
  result occurred; this is visually distinct from failure.
- Failed: a real error or failed terminal event occurred.

The map uses Sift's existing status tokens and readable text labels. Color is
never the only status signal. Animation is limited to a brief stage transition
and connecting-line progress; reduced-motion users receive an instantaneous
state change.

### Data and security

- Use the existing debug route and already-redacted response.
- Do not add raw prompts, model reasoning, credentials, or unredacted payloads.
- Do not infer a successful stage from elapsed time.
- Preserve unknown event types in Timeline.
- If debug routes are disabled, the existing 404 behavior remains unchanged.

## Revised demo structure

### WebMCP, target 2:58

| Time | Material |
| --- | --- |
| 0:00–0:10 | Working product and category statement |
| 0:10–0:24 | Animated shared-decision-environment diagram |
| 0:24–0:55 | Shared focus, context, and deterministic ranking |
| 0:55–1:25 | Reweight and unanticipated concern |
| 1:25–2:05 | Strands investigation, revised state, honest unknown |
| 2:05–2:25 | Human-only approval |
| 2:25–2:52 | Run Map to Timeline proof, including WebMCP origin |
| 2:52–2:58 | Close over the actual product |

The separate problem and closing slides are removed. The diagram is the only
full-frame explanatory visual.

Recommended annotations are `WebMCP origin`, `Recommendation invalidated`,
`Typed concern`, `Real Strands work`, `Still unknown`, and `Human only`. Never
show more than one callout at once.

### Agents for Humans, target below 4:40

Open on the anomaly, show the same category diagram adapted to a background
watcher and Strands Swarm, then use the Run Map throughout the technical proof.
The required standalone architecture export remains a separate submission
asset, but the video no longer needs a long static architecture slide.

## Failure handling

- Manifest validation fails before rendering on missing assets, overlapping or
  out-of-order segments, out-of-frame anchors, unreadable annotation timing,
  or hard-cap overflow.
- Unknown source adapters fail with the registered adapter names.
- A missing diagram node or edge endpoint is a schema error.
- Unknown trace signals are ignored by the map projection and remain in the
  raw Timeline.
- An annotation render failure preserves source recordings and previously
  generated narration.
- No command deletes or overwrites an approved take; new output is written to a
  versioned build directory before promotion.

## Testing strategy

### Demo Studio

- Schema tests for valid and invalid manifests, annotations, and diagrams.
- Golden-frame tests for every annotation primitive at 1920x1080 and 1280x720.
- Timing tests for relative cue offsets, transitions, and hard-cap enforcement.
- FFprobe integration test for output duration, H.264 video, AAC audio, and
  caption presence.
- A tiny fixture project proving the package renders without any Sift imports.

### Trace Map

- Unit tests for rule matching, aggregation, ordering, stage status, unknown
  events, and deterministic output.
- Fixture tests using both car Graph events and energy Swarm events.
- Tests proving redacted attributes are passed through unchanged and no hidden
  value is introduced.

### Runtime Inspector

- Component tests for Run Map tab selection, narrow/wide layout semantics,
  empty stages, keyboard navigation, reduced motion, and stage-to-Timeline
  navigation.
- End-to-end proof that a WebMCP-originated command displays the origin marker
  and opens its real Timeline events.
- Visual snapshots at 390, 430, 480, 820, and 1440 widths.

## Docs to update

### Reusable tooling

- [ ] `packages/demo-studio/README.md` — manifest, adapters, CLI, annotations,
  diagrams, rerender workflow, and extraction/publishing guidance.
- [ ] `docs/hackathons/demo-tooling/README.md` — replace the conceptual
  extension notes with the implemented package workflow.
- [ ] JSON Schema files — document every stable manifest and diagram field.

### Product and observability

- [ ] `docs/specs/debugging-and-observability.md` — Run Map behavior, event
  projection, security boundary, and navigation.
- [ ] `docs/specs/product.md` — Run Map as a developer-view region.
- [ ] Public APIs in `packages/trace-map` — TSDoc and usage example.
- [ ] `RuntimeInspector` module documentation — update the tab and scope notes.

### Demonstrations and submissions

- [ ] Both hackathon demo manifests — new timing, diagram, Run Map, and
  annotation cues.
- [ ] Both demo READMEs — capture and rerender instructions.
- [ ] WebMCP and AWS submission positioning — apply the positioning hierarchy
  without discarding the existing competition-specific proof.

## Rollout order

1. Implement and test `packages/trace-map` with Sift fixture events.
2. Add the Sift adapter and Run Map tab, then verify real trace navigation.
3. Port the reusable compositor into `packages/demo-studio`.
4. Add diagram and annotation primitives with validation.
5. Revise both manifests and render low-resolution proof cuts.
6. Record the final deployed product and render submission masters.

This order puts the product proof first. If time constrains the video tooling,
aidemo can still record the improved Run Map and simple FFmpeg overlays can
cover the six planned callouts.
