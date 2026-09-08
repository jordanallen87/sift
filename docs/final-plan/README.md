# Sift Final Product and Hackathon Plan

Status: final experience and execution plan approved by the user on September 2, 2026. Claude Code is the selected implementation executor; Codex will independently review and retest the result.

## Why this exists

Sift has substantial decision-system, WebMCP, and Strands functionality, but the product does not yet make that functionality understandable to a normal user or unmistakable to a hackathon judge. Existing documents also sometimes describe intended behavior as though it were already implemented.

This plan must close three gaps together:

1. a coherent car-decision journey from a new ChatGPT conversation through a human decision;
2. a truthful, legible demonstration of WebMCP and Strands behavior; and
3. traceability from every product claim to code, tests, visible proof, and submission language.

## Working documents

- [Canonical adaptive decision experience](./final-approved-experience.md) — the approved product thesis, responsibility model, complete vehicle journey, persistent pane composition, demo spine, non-goals, and definition of done. This document wins when older design notes conflict.
- [Canonical hackathon execution plan](./final-hackathon-execution-plan.md) — the sole execution control plane: scope lock, ordered TDD work, release gates, cut rules, exact user inputs, and post-WebMCP AWS decision. This document wins when older plans conflict.
- [Claude Code implementation prompt](./claude-code-implementation-prompt.md) — the copy/paste autonomous execution handoff, precedence rules, safety boundaries, evidence contract, and final reporting requirements.
- [User journey](./user-journey.md) — verified current car flow, its failures, and the emerging target journey.
- [Conversation orchestration](./conversation-orchestration.md) — bootstrap discovery, pack activation, elicitation, next-move rules, and the division between conversation and canvas.
- [WebMCP example review](./webmcp-example-review.md) — code-grounded patterns from five OpenAI showcase apps and the requirements they imply for Sift.
- [WebMCP showcase deep dive](./webmcp-showcase-deep-dive.md) — detailed product, responsive-layout, tool-contract, state-ownership, and implementation analysis, including the agent-first 3D studio.
- [Product positioning](./product-positioning.md) — the proposed category, existing-app contrast, product-versus-library decision, hackathon framing, proof requirements, and claim guardrails.
- [Target car journey](./target-car-journey.md) — the proposed end-to-end ChatGPT, canvas, Strands, and human journey derived from the repository and showcase research.
- [Car conversation and canvas simulation](./car-conversation-simulation.md) — a proposed turn-by-turn no-shortlist journey, discovery coverage, answer-to-state rules, view-director policy, current implementation breaks, and emulator contract.
- [Persona UX evaluation harness](./ux-evaluation-harness.md) — the proposed three-persona browser/conversation harness, hard gates, numerical UX rubric, objective metrics, real-host acceptance layer, and iterative repair loop.
- [Developer and judge experience](./developer-experience.md) — how runs, agents, skills, tools, WebMCP calls, state changes, and evidence should become inspectable.
- [Hackathon strategy](./hackathon-strategy.md) — distinct AWS/Strands and WebMCP pitches, shared product work, and demo implications.
- [WebMCP final delivery and judge-proof plan](./webmcp-final-delivery.md) — official deadline/criteria, proof matrix, three-minute recording spine, strict P0 scope, and release gates.
- [Hackathon scope triage and autonomous-run handoff](./hackathon-scope-triage.md) — car-versus-energy decision, must-ship/cut lists, retained edge cases, discretion policy, and the inputs required before autonomous execution and submission.
- [Adaptive vehicle implementation appendix](./webmcp-final-implementation-plan.md) — earlier code-grounded file notes retained as a technical appendix. It cannot broaden or override the canonical plan.
- [Requirements ledger](./requirements-ledger.md) — the anti-drift record. Nothing becomes “done” without implementation and proof.

## Relationship to existing documentation

This directory does not replace the current specifications yet. It records the redesign that will eventually update or supersede parts of:

- [`docs/specs/product.md`](../specs/product.md)
- [`docs/specs/strands-runtime.md`](../specs/strands-runtime.md)
- [`docs/specs/webmcp.md`](../specs/webmcp.md)
- [`docs/specs/debugging-and-observability.md`](../specs/debugging-and-observability.md)
- [`docs/specs/demos-and-submission.md`](../specs/demos-and-submission.md)
- [`docs/demo/aws-script.md`](../demo/aws-script.md)
- [`docs/demo/webmcp-script.md`](../demo/webmcp-script.md)

The canonical execution plan now identifies the active specification migration checklist. During implementation, each affected specification is updated in the same task as the behavior; parallel contradictory specifications are not an acceptable release state.

## Planning rules

1. **Current, target, and proposed are different labels.** A contract or spec is not evidence that runtime behavior exists.
2. **Every implementation item has visible proof.** Proof may be a user-facing state, Runtime Inspector event, automated test, sanitized run export, or recorded demo beat.
3. **Both hackathon stories use the same product.** The videos may emphasize different capabilities, but they cannot depend on contradictory flows or fabricated states.
4. **The consumer journey leads.** Developer observability explains the product; it does not compensate for an incoherent product.
5. **The seeded demo and a user-created case must be distinguished honestly.** Any remaining fixture-only behavior is labeled in product, docs, and submission copy.
6. **No requirement disappears into prose.** New requests enter the ledger before implementation planning.

## Open inputs and follow-ups

- **Existing discovery engine:** inspect the user's existing discovery engine when its repository/path is provided. Extract reusable stages, coverage rules, next-question logic, answer mappings, completion rules, and evaluations. Do not introduce a second conversational agent that competes with ChatGPT.

## What the canonical pair contains

The canonical experience and execution plan contain:

- the canonical ChatGPT and standalone entry journeys;
- screen/state designs for the car flow;
- the real per-move planning and dynamic-capability architecture;
- Runtime Inspector and judge-facing visualization requirements;
- WebMCP lifecycle and tool-surface changes;
- persistence, telemetry, safety, error, and fallback behavior;
- a sequenced implementation plan with ownership boundaries;
- test and demo acceptance criteria;
- both hackathon narratives and recording spines; and
- a migration map for existing specs, demos, and README claims.
