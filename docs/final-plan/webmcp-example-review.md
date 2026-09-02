# WebMCP Example Review

Status: verified research notes as of 2026-09-01. These observations come from the official showcase pages, the live applications, their registered WebMCP tool contracts, and the deployed JavaScript bundles. The showcase does not link public source repositories for these apps, and the deployed bundles do not publish source maps, so implementation observations below are limited to the shipped browser code rather than original source files.

This file is the executive comparison. See [WebMCP Showcase Deep Dive](./webmcp-showcase-deep-dive.md) for the responsive-layout critique, detailed per-app architecture, complete 3D workflow, and the conclusion about whether these products were actually redesigned for ChatGPT pane use.

## Why these five matter

The useful question is not whether these apps have tools. It is how they divide work among the model, the shared browser surface, and the human.

| Example | Shared artifact | Model's primary job | Human's primary job | Most relevant Sift lesson |
| --- | --- | --- | --- | --- |
| [WanderNote](https://developers.openai.com/showcase/wandernote) | Hourly itinerary plus map | Read the full trip state, fill gaps, revise agent suggestions, respond to feedback, focus the map | Set trip context, edit/dismiss suggestions, comment, inspect route, export | Protect human edits and make feedback part of the tool loop. |
| [Sunday Table](https://developers.openai.com/showcase/sunday-table) | Weekly meals, recipes, preferences, groceries | Plan atomically across related objects and maintain derived grocery state | Set preferences, manually edit meals, check groceries, protect personal choices | Treat the app as one canonical state graph, not disconnected screens. |
| [Verdant Market](https://developers.openai.com/showcase/verdant-market) | Searchable catalog and shared cart | Search structured inventory, inspect products, build/revise cart, summarize checkout | Browse normally, inspect products, change quantities, review and complete checkout | Give the agent domain operations, not a duplicate set of navigation clicks; show tool activity. |
| [Margin Editor](https://developers.openai.com/showcase/margin-editor) | Device-local rich-text documents and anchored comment threads | Read/write documents and participate in exact-context comment threads under its own identity | Author and format writing, review comments, continue/resolve discussions | Keep collaboration attached to the artifact and preserve actor identity. |
| [Codex Modeling Studio](https://developers.openai.com/showcase/codex-modeling-studio) | Browser-local 3D scene and rendered views | Discover capabilities, inspect scene state, mutate geometry/materials, render and compare real views | Watch the viewport, steer intent, inspect independently, control camera/projects, undo/redo | A complex app can be agent-operated while the UI remains a legible, directly inspectable canvas. |

## 1. WanderNote

The live app exposes 11 tools:

`get_trip_state`, `set_trip_details`, `list_time_slots`, `add_itinerary_activity`, `update_itinerary_activity`, `remove_itinerary_activity`, `get_traveler_feedback`, `respond_to_traveler_feedback`, `get_itinerary_map`, `set_map_view`, and `export_itinerary_pdf`.

The deployed bundle registers a typed tool array with `modelContext.registerTool`. The important implementation rule is enforced in code and tool descriptions: agent suggestions can be added or edited, but traveler-edited activities are protected. Dismissals and comments become structured feedback that the agent can read and resolve. `set_map_view` is explicitly a presentation operation that synchronizes the visible itinerary without pretending to change the trip itself.

The UI remains useful without the agent: destination/dates/preferences are editable, itinerary items can be edited or removed, days and map stops can be selected, comments can be left, and the itinerary can be exported. The agent handles synthesis and revision across the schedule; the person supplies taste, correction, and final control.

## 2. Sunday Table

The live app exposes 12 tools:

`get_meal_plan`, `list_meal_slots`, `upsert_recipe`, `set_meal`, `plan_week`, `remove_meal`, `get_grocery_list`, `set_grocery_checked`, `remove_ingredient`, `set_food_preferences`, `set_active_week`, and `clear_agent_meals`.

Its strongest pattern is transactional coordination. `plan_week` updates multiple meal slots atomically, recipes feed a derived consolidated grocery list, and grocery progress persists with the week. The code refuses to overwrite human-protected slots or human-authored recipes and provides cleanup operations that remove only agent-created meals.

The model is responsible for cross-object planning and consistency. The human can change meals directly, set visible preferences, inspect recipes, and use the grocery list. The UI repeatedly explains the ownership boundary: the user's edits remain theirs.

## 3. Verdant Market

The deployed bundle defines nine domain tools:

`list_departments`, `search_products`, `browse_department`, `get_product`, `get_cart`, `add_to_cart`, `update_cart_item`, `remove_from_cart`, and `get_checkout_summary`.

This is the simplest division of labor. The model receives structured catalog and cart operations; it does not need tools that imitate every route or button. The human still has a conventional storefront—search, departments, product cards, basket, quantity controls, and checkout preview—and can review exactly what the agent changed.

The bundle emits visible activity toasts when tools fetch product details or change the cart. The official build notes say navigation-only and recipe-specific helpers were removed, which is a useful restraint: expose meaningful domain actions and visible effects rather than toolifying the entire interface.

The live page did not expose its WebMCP registry during this inspection even after a fresh reload, although the official showcase and deployed bundle both contain the nine-tool contract. That discrepancy is itself a reminder that Sift needs a visible connection/readiness state and an automated fresh-load registration test.

## 4. Margin Editor

The live app exposes 10 tools: three read-oriented and seven write-oriented.

`list_documents`, `get_document`, `open_document`, `create_document`, `update_document`, `list_comments`, `add_comment`, `reply_to_comment`, `resolve_comment`, and `reopen_comment`.

The model does not operate a detached chat representation of a document. It reads structured rich text and comment context, opens the same note the human sees, and anchors comments using an exact quote plus semantic context. Ambiguous anchors are rejected rather than attached arbitrarily. Agent comments carry an explicit agent identity, so the model does not impersonate the user.

The human owns normal writing and formatting, selects text, creates comments, reviews agent feedback, and controls discussion resolution. The shared canvas is the document itself; conversation is attached to the relevant artifact and location.

## 5. Codex Modeling Studio

The live studio reports 39 registered tools. The surface is deliberately hierarchical rather than a single oversized instruction payload:

- orientation and discovery: `readInstructionsForCodex`, `status`, `listDocs`, `getDoc`, `capabilities_search`, `capabilities_help`;
- project/reference lifecycle: project create/open/list/active/acquire/delete, reference batch/upload/select/list/delete, export;
- inspection: scene and mesh inspection, rendered capture, and multi-view contact sheets;
- mutation: part/mesh creation, transforms, booleans, curves, features, materials/environment, undo, and redo.

The model can create and refine actual geometry and PBR materials, then inspect real WebGPU renders rather than relying only on its own text description. Several mutations accept an expected scene revision, which gives the tool layer a concurrency/staleness boundary. Render capture and contact-sheet tools create a visual evaluation loop.

The human experience is intentionally viewport-first. The person can orbit, pan, zoom, choose views, inspect scene details, follow tool activity, manage projects, import/export, and undo/redo. The dense modeling API is for the agent; the canvas is for shared observation and steering. This is the clearest evidence that “conversation-led” does not mean “human cannot touch the app.”

## Cross-example requirements for Sift

1. **One shared canonical artifact.** Conversation and direct manipulation must update the same case, not parallel model/UI state.
2. **Read state before mutation.** Sift needs a compact authoritative case/interaction context that tells ChatGPT what is protected, unresolved, valid next, and currently visible.
3. **Enforce actor ownership.** Human-authored or confirmed facts, preferences, shortlist decisions, and approvals cannot be silently overwritten by agent tools.
4. **Separate domain mutation from presentation.** “This matters more” and “show these side by side” are different commands with different state consequences.
5. **Make tool activity visible.** A user and judge should see which meaningful action is happening and what changed without opening raw telemetry.
6. **Use progressive tool guidance for complexity.** A bootstrap/interaction guide plus scoped capability detail is more reliable than one enormous prompt or tool catalog.
7. **Keep direct interaction meaningful.** Quick Pick, corrections, evidence inspection, and approval should collect judgment or exercise authority; routine navigation can remain conversation-led in pane mode.
8. **Preserve orientation while views change.** Sift's opportunity beyond these demos is to make phase, required coverage, current focus, next step, and completion path persistent throughout a genuinely long decision.

## Implication for the hackathon demonstration

The strongest WebMCP demo is not “ChatGPT can click our app.” It is:

1. the user says, “Use Sift to help me choose a car”;
2. ChatGPT discovers Sift, activates the car pack, and reads an authoritative decision context;
3. conversation changes canonical decision state and the pane visibly adapts;
4. the human directly expresses judgment in Quick Pick or comparison view;
5. ChatGPT reads that exact change and adjusts the next question/investigation plan;
6. the developer projection shows the correlated tool, state, plan, capability, and UI effects; and
7. the final decision remains a human-only action.
