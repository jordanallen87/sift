# Product Positioning

Status: proposed positioning for review. This document defines the narrative the product and demos should prove; it does not claim that every described capability is implemented.

## Executive answer

Most current WebMCP examples take a recognizable application and give the model typed access to its existing actions and state. Sift starts from a different premise:

> WebMCP can change the application experience itself, not merely add another operator to an existing interface.

Sift should be positioned as a **WebMCP-native adaptive decision experience**. It starts with the outcome a person is trying to reach, then coordinates conversation, direct human interaction, deterministic decision state, specialist investigation, evidence, and a changing visual workspace around that outcome.

The car experience is the concrete product proof. The reusable decision engine and Decision Pack system are the enabling architecture. A library or SDK may eventually be a distribution form, but it is not the strongest current hackathon headline.

One of the strongest visible proofs is divergence within the same domain: “find a car for my family” and “find a work vehicle for my landscaping business” should produce different discovery, decision criteria, candidate sets, views, and investigation plans through the same vehicle-selection pack and engine. This is stronger evidence of an adaptive experience than switching between two hardcoded applications.

## Recommended one-sentence pitch

> Sift turns a complex choice into a shared, adaptive workspace where ChatGPT guides the conversation, specialist agents investigate the unknowns, the interface changes with the decision, and the human remains in control.

## The sharper WebMCP contrast

> Most WebMCP apps teach the model to operate an existing website. Sift uses WebMCP to make the website itself adaptive to the outcome the user is trying to achieve.

This contrast should not dismiss the showcase applications. Their typed actions, shared state, and human-ownership rules are important. The difference is that their primary application structure generally remains fixed, whereas Sift makes orchestration of a long, stateful journey part of the product.

| Conventional WebMCP extension | Sift's target experience |
| --- | --- |
| Begins with an existing application workflow | Begins with the outcome the person wants |
| Adds the model as another application operator | Makes the model the conversational conductor |
| Keeps the full interface largely static | Changes the dominant artifact with the current phase and question |
| Exposes page/domain actions | Exposes decision state, valid next moves, evidence, presentation, and authority boundaries |
| Shares application state | Shares a durable decision record and investigation state |
| Optimizes task or transaction completion | Optimizes a justified human decision |

## What Sift is actually adding

Sift is not a replacement storefront and should not be described as a skin over arbitrary websites. It is a **decision experience layer** that can sit above domain catalogs, services, and evidence sources.

That layer combines:

1. **A conversational control plane** — ChatGPT discovers the active decision capability, elicits the right context, chooses among valid next moves, and explains consequences.
2. **An adaptive shared canvas** — the page presents the brief, options, comparison, investigation, evidence, or recommendation appropriate to the current turn rather than displaying the entire application at once.
3. **A deterministic decision core** — canonical criteria, constraints, coverage, obligations, ownership, invalidation, readiness, and human authority do not live only in model context.
4. **Decision Packs** — domain knowledge defines vocabulary, discovery coverage, evidence expectations, available views, capabilities, and safety boundaries without creating a new product architecture for every domain.
5. **A bounded investigation runtime** — specialist agents, skills, and tools investigate unresolved questions and adapt their method while remaining inside policy and budget limits.
6. **Human judgment controls** — direct actions such as keep, pass, unsure, correct, challenge, and approve supply real preference evidence and preserve consequential authority.

The result is an experience optimized for resolving a specific kind of complex decision, not merely browsing the underlying inventory more efficiently.

## Why the primary pitch should not be “a library”

### What the library framing gets right

- The engine is intended to be reusable across domains.
- Decision Packs separate domain behavior from the common decision lifecycle.
- Reusable contracts for state, views, tools, evidence, and authority are a meaningful technical contribution.
- The adaptive canvas could eventually become an SDK or component system for other WebMCP applications.

### Why it is the wrong headline today

- A library pitch makes developers, portability, packaging, and third-party adoption the primary product proof.
- It shifts attention away from the human problem and the visibly differentiated experience.
- It risks claiming generality before multiple complete pack journeys and extension ergonomics have been proven.
- Hackathon judges can understand and evaluate a working car decision much faster than an abstract framework.

The narrative hierarchy should therefore be:

1. **Product:** Sift, an adaptive decision experience.
2. **Concrete proof:** choosing a car through a conversation-orchestrated, evidence-backed journey.
3. **Reusable architecture:** the decision engine, Decision Packs, adaptive view contract, and bounded runtime.
4. **Future distribution:** SDK/library capabilities after the extension boundary is genuinely proven.

## The user problem

Complex decisions fail in two common interfaces:

- A conventional site gives the person filters, tables, reviews, and comparison tools but assumes they know which questions matter, how to use the tools, and when the analysis is sufficient.
- A general chat can explain and brainstorm but lacks durable domain state, deterministic coverage, shared visual artifacts, bounded evidence rules, and explicit authority boundaries.

Sift combines the strengths of both. The person can speak naturally, the model can guide and orchestrate, the application can enforce and remember, specialist agents can investigate, and the human can directly inspect and decide.

## Category language

Use these terms consistently:

- **Primary category:** adaptive decision experience.
- **Technical category:** WebMCP-native decision workspace or decision experience engine.
- **Interaction model:** conversation-orchestrated, not chat-only.
- **Visible page:** shared adaptive canvas or companion canvas.
- **Domain extension:** Decision Pack.
- **Runtime:** bounded specialist investigation.

Avoid leading with:

- “AI shopping assistant,” which sounds like search plus recommendations;
- “chatbot for decisions,” which erases the canonical application and direct human interaction;
- “WebMCP wrapper,” which understates the interaction architecture;
- “universal decision-making library,” which is broader than the current proof; or
- “autonomous decision maker,” which contradicts the human authority boundary.

## WebMCP submission framing

### Problem

Adding WebMCP to an existing app lets a model use that app, but it does not automatically create an experience designed for human-model collaboration across a complex, multi-stage outcome.

### Insight

Once the model can safely read and change canonical browser state, the interface no longer has to behave like a static destination. Conversation can conduct the journey while the browser becomes a purpose-built visual and interactive artifact for the current moment.

### Claim

Sift demonstrates WebMCP as an interaction architecture: bidirectional shared state, phase-aware view orchestration, durable human input, explicit presentation-versus-meaning boundaries, and human-only approval.

### Required visible proof

1. A natural opening message activates the correct Decision Pack and case.
2. A conversational answer changes canonical decision state and the visible canvas.
3. A direct human action in the canvas is read correctly on the next model turn.
4. The model changes the view without accidentally changing what matters to the decision.
5. A new concern changes obligations, investigation, and visible progress.
6. The recommendation is tied to evidence and remains subject to human approval.

## AWS submission framing

### Problem

Complex decisions require more than one general-purpose agent call. The system must decide what remains unknown, select bounded expertise, gather and challenge evidence, adapt when findings change the plan, and stop at human judgment boundaries.

### Claim

Sift turns the unresolved parts of a human decision into a validated investigation plan executed by bounded Strands specialists, with capability selection, evidence lineage, adaptation, and readiness made visible.

### Shared product story

The AWS agents are not a second demo bolted underneath the WebMCP interface. They perform the investigation that the shared decision state says is necessary. The WebMCP canvas shows the human-facing consequence of that same execution.

## Suggested opening narration

> Most WebMCP demos start with an existing website and make it operable by a model. We asked a different question: what if model access allowed us to redesign the entire experience around the outcome the person wants? Sift is a WebMCP-native decision workspace. ChatGPT conducts the conversation, the interface adapts to the current decision stage, specialist agents investigate what the user should not have to know how to analyze, and the human keeps final authority.

## Claim guardrails

The final submission must distinguish vision from shipped proof:

- Do not call Sift a general-purpose library until an external extension surface and more than one complete pack journey are demonstrated.
- Do not claim arbitrary websites can be transformed automatically; Sift operates through explicit domain integrations and Decision Packs.
- Do not say Sift searches live local car inventory or finds purchasable cars under a budget unless a real inventory integration and listing-level candidate path are present. The current bundled catalog is model/specification data, not dealer inventory.
- Do not claim the interface is dynamically orchestrated until phase-aware view selection is implemented and demonstrated.
- Do not call catalog matching an evidence-backed recommendation.
- Do not imply that ChatGPT, WebMCP, or Strands can exercise human approval.
- Do not claim adaptive specialist planning while the live path remains scripted; label fixtures and deterministic providers honestly.

## Positioning decisions for review

The current recommendation is to approve these choices:

1. Lead with the user product, not the library.
2. Name the category **adaptive decision experience**.
3. Describe Sift technically as a **WebMCP-native decision workspace/engine**.
4. Make “the interface adapts to the decision” the primary WebMCP novelty.
5. Present Decision Packs and reusable contracts as the architecture that makes the product extensible.
6. Use the same car journey for both hackathons, changing which part of the shared system receives emphasis.
