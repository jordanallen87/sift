# WebMCP Showcase Deep Dive

Status: verified research and design critique as of 2026-09-01. This is a research artifact, not an approved Sift implementation specification.

## Research method and evidence boundary

This review used four evidence layers:

1. the [official OpenAI WebMCP showcase](https://developers.openai.com/showcase?view=webmcp-apps) and each project's description/build notes;
2. the live hosted applications and their registered WebMCP descriptors;
3. the applications at both normal browser width and a 430-by-900 narrow pane viewport; and
4. the deployed JavaScript/CSS implementation, including the readable 3D studio modules.

WanderNote, Sunday Table, Verdant Market, and Margin Editor ship compiled bundles without public source maps or linked repositories. Their tool arrays, registration code, validation, state transitions, and visible UI can still be inspected, but original source structure cannot be reconstructed with certainty. Codex Modeling Studio exposes readable modules, so its implementation can be analyzed more deeply.

No tool that would mutate an application's data was invoked. The only WebMCP calls made during research were read-only 3D instruction, documentation, and status calls.

## Bottom-line critique

The product owner's hypothesis is substantially correct:

> Most current showcase applications begin with a recognizable website or web-application archetype and add typed agent access to its existing domain state.

WanderNote is still an itinerary builder. Sunday Table is still a weekly meal planner. Verdant Market is still a grocery storefront. Margin is still a document editor. Their responsive versions are narrower versions of those products; they do not become turn-specific visualization companions orchestrated primarily by the ChatGPT conversation.

That does not make their WebMCP work superficial. Three changes are materially deeper than “add chat”:

- the model operates structured domain actions rather than clicking arbitrary UI;
- human and agent changes share one canonical artifact; and
- several apps enforce ownership boundaries so agent tools cannot silently overwrite human work.

The limitation is interaction architecture. In the first four examples, the agent is largely an additional operator of a self-contained application. The UI remains responsible for presenting the whole application at once. None solves a long, branching, multi-phase journey where the page must continuously answer: where am I, what has been covered, what is unresolved, what is happening now, and what gets me to completion?

Codex Modeling Studio is the meaningful exception. It calls its own mode `agent-first-observer`, gives the agent the authoring interface, turns the visible page into a full-bleed observation/steering viewport, and derives status from actual tool invocations and committed revisions. Its narrow layout genuinely removes secondary application chrome to protect the shared visual artifact.

Sift should therefore combine two families of lessons:

- from WanderNote/Sunday Table: shared canonical state, protected human edits, structured feedback, and derived cross-object consistency;
- from Modeling Studio: an agent-oriented capability system, an event-derived companion canvas, progressive tool disclosure, and a narrow layout designed for collaboration rather than miniaturized app navigation.

Sift should not copy Modeling Studio's passive-human rule. A 3D author can reasonably say “make this object” and observe. A consequential decision requires the human to supply preferences, make tradeoffs, correct assumptions, inspect evidence, and retain final authority throughout.

## Comparative interaction architecture

| Question | WanderNote | Sunday Table | Verdant Market | Margin Editor | Modeling Studio |
| --- | --- | --- | --- | --- | --- |
| Primary product shape | Itinerary and map | Meal calendar and groceries | Storefront and cart | Rich-text editor | Agent-operated 3D viewport |
| Conversation changes page state | Yes, through tools | Yes, through tools | Yes, through tools | Yes, through tools | Yes, through tools |
| Page reorganizes by conversation stage | No | No | No | No | Partly; viewport and activity follow operations |
| Human edits protected | Explicit activity protection | Explicit meal/recipe protection | Shared cart, no actor protection model | Actor identity for comments; document writes are allowed | Existing work preservation and revision ownership |
| Presentation-only tools | Map focus | Week selection | Mostly route/UI state is omitted from tools | Open document | Transient camera guide and focus/render tools |
| Visible agent activity | Connection/tool modal | Connection/tool modal | Activity toasts | Agent tools and comments | Live operation, revision, status, history, recovery |
| Narrow-pane redesign | Responsive single-column itinerary | Compressed meal grid | Mobile storefront | Rails hidden around editor | Full-bleed viewport with compact observer cockpit |
| Human's role | Edit, comment, inspect | Edit, choose, shop | Browse, review, checkout | Author and discuss | Observe, steer, inspect, control camera/download |

## WanderNote

### Product and state model

[WanderNote](https://developers.openai.com/showcase/wandernote) maintains a destination, inclusive dates, traveler preferences, an optional Notion source, hourly activities, map state, traveler edits, dismissals, and comments. The agent can read the full state and work inside empty or agent-owned slots.

Its 11 registered tools divide into:

- state: `get_trip_state`, `list_time_slots`, `get_traveler_feedback`, `get_itinerary_map`;
- mutation: `set_trip_details`, `add_itinerary_activity`, `update_itinerary_activity`, `remove_itinerary_activity`, `respond_to_traveler_feedback`;
- presentation: `set_map_view`; and
- output: `export_itinerary_pdf`.

The bundle registers the descriptor array through `document.modelContext` with a `navigator.modelContext` fallback and retains a local invocation shim for demonstration. Tool implementations and descriptions enforce a meaningful actor boundary: the agent may edit its own suggestions, but traveler-edited activities are protected. A dismissal or comment is not merely local UI state; it enters the feedback collection the agent reads and resolves.

### Human/model division

The model performs schedule synthesis across days and hours, turns context into specific activities, maintains map coordinates, and revises suggestions from feedback. The human establishes the trip, directly edits or removes activities, dismisses suggestions, comments, navigates days and map pins, and exports.

### Responsive critique

At 430px, WanderNote becomes a polished single-column travel app. Destination, dates, preference chips, Notion context, agent invitation, notes, itinerary, and map remain vertically stacked. It is usable, but the page still presents its application in application order. It does not know which part ChatGPT is discussing or reduce itself to the one artifact relevant to the current turn.

The “See agent tools” modal is primarily a developer explanation: it lists all 11 descriptors, connection status, and an invocation example. The consumer-facing ownership line—“Your edits are protected”—is strong. The tool catalog itself is not a substitute for journey orientation.

### Sift lesson

Adopt the protected-human-state contract and structured feedback loop. Do not adopt the “entire product in one long narrow page” information architecture.

## Sunday Table

### Product and state model

[Sunday Table](https://developers.openai.com/showcase/sunday-table) connects 14 weekly meal slots, recipes, preferences, grocery derivation, grocery completion, and week-specific persistence.

Its 12 tools are:

- state: `get_meal_plan`, `list_meal_slots`, `get_grocery_list`;
- recipe/meal planning: `upsert_recipe`, `set_meal`, `plan_week`, `remove_meal`, `clear_agent_meals`;
- grocery operations: `set_grocery_checked`, `remove_ingredient`;
- preferences: `set_food_preferences`; and
- temporal presentation/state: `set_active_week`.

`plan_week` is notable because it validates and changes multiple meal slots atomically. The grocery list is derived from scheduled recipes rather than manually kept in sync by conversation. Cleanup removes unused agent content while preserving human-owned content.

### Human/model division

The model handles cross-object consistency: it can create recipes, schedule a coherent week, merge grocery quantities, honor preferences, and remove only the content it owns. The human changes preferences, directly edits meals, browses recipes, and checks groceries during real use.

Human-added or human-edited meals and human-authored recipes are protected inside tool validation. This is stronger than asking the model to “be careful.”

### Responsive critique

At 430px, the side navigation collapses into a horizontal top row, but the weekly planner remains a dense multi-column calendar with very small meal cards. Groceries and recipes follow below. The design is a compressed version of a desktop meal planner, not a ChatGPT companion view.

Its help modal again lists the technical tool surface and emphasizes “Your choices stay yours.” That is useful trust communication, but it does not guide a user through an agent-led planning conversation.

### Sift lesson

Use deterministic, atomic domain operations for related case changes. A criteria update, shortlist change, obligation update, and invalidation consequence should be one validated transition when they logically belong together. Derived state should update automatically instead of relying on the model to keep multiple UI panels consistent.

## Verdant Market

### Product and tool model

[Verdant Market](https://developers.openai.com/showcase/verdant-market) is intentionally conventional: 110 products, departments, product pages, cart, and checkout preview.

The deployed bundle defines nine tools:

`list_departments`, `search_products`, `browse_department`, `get_product`, `get_cart`, `add_to_cart`, `update_cart_item`, `remove_from_cart`, and `get_checkout_summary`.

The official build notes say recipe-specific helpers and navigation-only tools were removed. That is a good API-design choice. The agent gets grocery-domain operations; it does not receive one tool per page or button.

### Human/model division

The model searches and filters structured inventory, inspects product records, and assembles a cart. The human can perform the same shopping journey conventionally, inspect the exact shared cart, adjust quantities, and control checkout.

The application displays activity toasts when a tool fetches product details or changes the cart. This makes agent action visible at the consumer layer without requiring a developer console.

### Responsive and reliability critique

At 430px, Verdant Market is an attractive standard mobile storefront: search bar, hero promotion, departments, product grid, cart, and checkout. Nothing in the narrow layout suggests that ChatGPT is the primary interaction surface.

During this review, its live page did not expose WebMCP tools after fresh navigation/reload, although the official showcase states that nine tools exist and the deployed bundle contains their descriptors and registration call. Whether transient or environmental, this demonstrates why connection/readiness cannot be implicit. A showcase app should visibly distinguish unsupported browser, registration pending, registered, stale, and failed states and verify the fresh-load tool surface automatically.

### Sift lesson

Expose domain operations and visible effects, not UI-click replicas. Add a compact consumer activity surface. Treat deployed fresh-load registration as an acceptance requirement.

## Margin Editor

### Product and state model

[Margin Editor](https://developers.openai.com/showcase/margin-editor) stores rich-text documents and comment threads locally in the browser.

Its 10 tools are:

`list_documents`, `get_document`, `open_document`, `create_document`, `update_document`, `list_comments`, `add_comment`, `reply_to_comment`, `resolve_comment`, and `reopen_comment`.

Document tools accept stable structured content rather than scraping rendered text. Comment creation requires an exact quote and can use occurrence, prefix, and suffix context. Ambiguous quotes are rejected instead of arbitrarily attached. Agent comments record an agent identity.

### Human/model division

The human writes and formats directly, selects text, opens comments, replies, and resolves discussions. The model reads and writes the same documents and participates in those threads without impersonating the user.

### Responsive critique

At 430px, document and comment rails collapse and the editor becomes the dominant surface. This is a good responsive editor, but still an editor. The page does not turn into a turn-specific review surface or show a persistent collaboration phase.

### Sift lesson

Attach explanations, questions, and discussion to exact case artifacts. A recommendation reason should link to the exact criterion, claim, source, and obligation it concerns. Actor identity and provenance should remain visible.

## Codex Modeling Studio: detailed analysis

### It is genuinely designed for the agent

[Codex Modeling Studio](https://developers.openai.com/showcase/codex-modeling-studio) is described as a web-native 3D suite designed for Codex. Its live instructions are more explicit:

- operating mode: `agent-first-observer`;
- agent role: author the requested model, inspect it, refine it, and export it;
- observer policy: do not ask the human to perform scene editing; the visible scene, revision, activity, and explicit download are observer feedback.

The readable UI module describes itself as a “passive, agent-first observation cockpit.” This is not a conventional 3D editor with a chatbot added. It deliberately omits a dense manual modeling UI.

### Browser-local architecture

The entry module assembles:

- a WebAssembly/WebGPU modeling kernel;
- a canonical scene store;
- geometry compute and modeling services;
- reference-image, model-import, material-authoring, capture, export, and device-local persistence services;
- a public WebMCP registrar and tool catalog; and
- an observer-oriented UI driven by the same runtime.

Projects, references, models, textures, and exports remain browser-local. The page owns actual scene revisions, undo/redo, render frames, and artifact bytes.

### Progressive tool surface

At the inspected load, the UI and browser reported 39 registered tools, while `readInstructionsForCodex` described a much larger internal catalog spanning projects, references, import, modeling, materials, scene, inspection, export, and feedback.

The public catalog source explains the mechanism:

- it preflights the host-injected descriptor payload against a 65,536-byte budget;
- it prioritizes a complete useful direct modeling loop;
- it orders remaining direct exposure by tool family;
- it exposes `capabilities_search` and `capabilities_help` for discovery; and
- it routes tools that do not fit directly through `action_read` or `action_mutate`, preserving read/write/destructive classification.

This is progressive disclosure at the tool layer. The agent can begin with a bounded useful surface, discover a capability by intent, read its exact schema, and invoke it without forcing every descriptor into the browser's initial catalog.

### Agent workflow

The instruction tool defines a complete quality loop:

1. inspect existing project/scene when needed;
2. use genuine references when available;
3. import and inspect real GLB/glTF when relevant;
4. shape coarse editable form and silhouette;
5. refine topology and connected surfaces;
6. apply or author real PBR materials;
7. compose lighting and camera;
8. capture at least three distinct WebGPU viewpoints for complex work;
9. critique actual renders and continue editing while defects remain; and
10. prepare genuine export bytes only when requested.

Completion is a stateful quality gate, not “the model called enough tools.” A complex asset cannot be marked production-ready while a real rendered view shows a weak silhouette, disconnected/floating geometry, fake openings, bad materials, or other visible defects.

Several mutation tools accept an expected revision. This prevents an operation planned against stale scene state from silently overwriting newer work. Undo/redo and explicit project-writer ownership give experimentation and concurrency defined boundaries.

### Human/model control boundary

The agent performs authoring. The human:

- states and revises intent conversationally;
- watches the actual object change;
- orbits, pans, zooms, and selects view presets;
- opens scene details and project controls;
- imports or explicitly downloads artifacts; and
- can inspect activity, revision, errors, and recovery.

`camera_guide` is a particularly strong interaction design. The agent may transiently move the human's visible viewport to show relevant work, but that movement does not change scene revision, undo history, autosave, or persisted camera state. It immediately yields when the human orbits, pans, zooms, or opts out. A different tool, `camera_set`, is required for a persistent authored camera change.

That is the same distinction Sift needs between “show me this comparison” and “make this factor matter to my decision.”

### Event-derived observer UI

The UI does not fabricate a progress story. Actual invocation events and scene revisions drive:

- current operation and transaction state;
- tool-call count and revision summary;
- activity history;
- scene-delta summaries;
- error/unknown-outcome and renderer-recovery states; and
- explicit pending downloads.

Before the first call it says no agent is attached and waits for the first browser-local operation. This is a truthful empty state, not simulated progress.

### Narrow layout

At 430px the viewport occupies almost the whole page. The top bar reduces to project/save/import/export essentials. A compact observer strip floats near the bottom, camera presets remain directly available, and scene details collapse into disclosure. CSS intentionally hides brand text, verbose connection status, material strips, context detail, and agent-progress text as width decreases.

This is a true mode adaptation: protect the shared artifact, retain human steering, remove secondary chrome.

### What Sift should and should not copy

Copy:

- progressive capability search/help and host-budget-aware tool exposure;
- state-first, revision-aware mutations;
- actual-event-derived consumer activity;
- a narrow mode whose body is the currently relevant shared artifact;
- transient presentation control that yields to the human; and
- explicit quality/completion criteria that require real evidence.

Do not copy:

- a passive human who only observes;
- an agent-only authoring model for preferences or judgment;
- an enormous domain-specific instruction payload on every turn; or
- completion criteria that the model can declare without deterministic case validation.

## Broader showcase survey

The official WebMCP gallery currently includes 10 applications: Modeling Studio, Margin Editor, Crossword Desk, Fieldwork // 12, WanderNote, Webroom, Sunday Table, Cubecade, Paperie, and Verdant Market.

The broader set reinforces two clusters:

1. **Existing product archetype plus shared agent operation:** itinerary, meal planner, store, editor, crossword, beat machine, photo editor, card designer, and puzzle.
2. **Agent-first visual instrument:** Modeling Studio is the clearest example, with Webroom/Paperie likely adjacent visual-authoring cases.

None of the reviewed decision-adjacent examples demonstrates a full multi-phase elicitation, evidence, investigation, recommendation, and human-approval lifecycle. That is Sift's opportunity: not merely another shared app, but a stateful decision companion whose interface changes with the reasoning journey.

## Design conclusions for Sift

### The right product category

Sift should not be positioned as a comparison website with ChatGPT access. It should be a **conversation-orchestrated decision workspace**:

- conversation determines the next useful move;
- the pack/core constrains and validates possible moves;
- the canvas renders the persistent artifact needed for the current move;
- direct interaction supplies human judgment or exercises authority;
- Strands investigates bounded questions; and
- deterministic state decides coverage, evidence validity, readiness, invalidation, and what remains unresolved.

### The right two-mode design

Expanded standalone mode may look like a complete decision web application and support direct exploration.

Narrow ChatGPT mode must not simply compress that application. It should show:

- a compact persistent orientation shell;
- one dominant turn-relevant artifact;
- a minimal consumer activity signal;
- direct actions that matter now; and
- optional developer detail behind disclosure.

The modes share canonical case state and components, but use different information architecture.

### The right WebMCP surface

Sift should expose:

- a tiny global lifecycle surface before a case exists;
- one compact active-case interaction context containing phase, coverage, protected state, valid next moves, current view, and recommended capability lookups;
- detailed case, pack, evidence, catalog, and runtime data on demand;
- direct high-frequency tools for the current pack/stage; and
- searchable/help-based access to the rest of the bounded pack capability catalog when browser host limits or model context make full direct exposure unhelpful.

### The right human boundary

Human-authored and human-confirmed constraints, preferences, option dispositions, corrections, and decisions must have explicit origin/ownership and cannot be silently overwritten. Agent-proposed state may be revised by the agent. Presentation focus may be changed freely but must yield to direct human navigation.

### The right proof for the hackathon

The demo should make three layers visible without confusing them:

1. consumer: phase, current question, meaningful progress, and what changed;
2. WebMCP: the conversation and page manipulating one canonical decision through typed operations; and
3. AWS/Strands: the plan, specialists, skills, tools, evidence, validation, and human boundary behind investigation.

The interface itself should carry that proof. Narration should explain what a judge can already see.
