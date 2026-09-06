# Bid comparison — a third Decision Pack

Working directory for a pack about choosing between competing bids for one job. Started 2026-09-06, nine days before the Agents for Humans deadline (September 14, 2026, 5:00 p.m. PT).

**Status: research and design. No code written yet. No decision made to build.**

## The idea in one line

You get three quotes for the same job. One is cheaper. Is it a better deal, or is it just pricing less work?

## Why this pack

- Almost everyone has personally been in this situation, so the demo needs no setup.
- The domain's hardest problem — **bids are not comparable as delivered** — is exactly what this engine is built for: obligations, explicit unknowns, and a recommendation that has to be *earned* before it is offered.
- The evidence genuinely conflicts, rather than conflict being engineered into a fixture.
- The consequential action is awarding a contract, which no agent should ever do.

## Read in this order

1. [`domain-research.md`](./domain-research.md) — what actually matters when comparing bids, sourced. Scope gaps, plug numbers, allowances, exclusions, deposits, credentials, lien waivers.
2. [`prior-art.md`](./prior-art.md) — what already exists, **including a correction to the original pitch**. AI bid leveling is a real, competitive market for commercial GCs and is called "table stakes" in 2026. The unserved end is the homeowner and the small trade shop.
3. [`strands-feature-map.md`](./strands-feature-map.md) — where every advanced Strands capability lands here versus Home Energy Guardian, including the two places this pack is honestly **weaker**.

## The three findings that should drive the decision

**1. The novelty is not extraction.** Reading three PDFs and building a comparison table is a solved, commoditised product. What no incumbent does is *refuse to rank* until the comparison is fair. That is this engine's actual differentiator and it survives contact with the competition.

**2. The two packs are not competing for one slot — each fits a different track by
construction.** From the track text verbatim: Everyday wants agents that "run quietly in the
background and only ping you when there's a real decision to make"; Professional wants an
agent that "makes someone dramatically better at the work they already do, professionals,
makers, creators, **small-business owners**... repetitive, judgment-heavy tasks that eat
their day."

Energy's strongest property — a case that opens itself from a bill feed — is the Everyday
sentence almost word for word. The bid pack's only real weakness, having no background
trigger, is measured against that same sentence and **disappears entirely** against a track
that never asks for one. Meanwhile "small-business owners" names precisely the segment the
bid-leveling incumbents do not serve.

So the decision is not "is the bid pack good enough." It is **which pairing is stronger**:
energy into a track it fits by definition but which is likely the most crowded, or bids into
a thinner track whose description names the exact underserved user and asks for nothing this
pack lacks.

**2b. Either framing works from one pack.** The same pack serves both framings, the way `car-purchase` already serves `family-novice` and `landscaping-owner`:

- homeowner comparing three quotes → **Everyday** (daily life, home, money) — unserved problem, busier track
- contractor levelling sub bids → **Professional** (repetitive, judgment-heavy) — thinner track, but a domain with AI incumbents a judge may recognise

Build once, decide the framing at recording time.

**3. Nothing is lost on the Strands rubric, and five things improve.** See the feature map. The GoalLoop rejection in particular stops being "the model forgot a citation" and becomes "these bids are not comparable, so ranking them would be a lie."

## Explicitly not being abandoned

**Home Energy Guardian stays.** It is finished, verified, and it carries one thing this pack structurally cannot: a case that opens itself, with no human asking. That is the strongest available evidence for "works quietly and surfaces you only for a real decision," and it keeps its place as the versatility beat.

## Open questions before any code

- Homeowner or contractor as the primary fixture voice?
- Which job? It needs enough line items for a real scope gap while staying legible in a five-minute video — a bathroom remodel, a roof replacement, and an HVAC replacement are the leading candidates.
- Does this become the hero (new video required) or a second demo shown briefly?
