# Prior art — and an honest correction

Researched 2026-09-06. This file exists to stop us claiming a green field that is not one, and to locate the gap that genuinely is empty.

---

## The correction

When this idea was first proposed in conversation, the pitch included "essentially nothing exists." **That is false for commercial general contractors, and it is false specifically about AI.**

As of 2026 there is a real, competitive market in AI bid leveling:

| Tool | What it does |
| --- | --- |
| [MeltPlan / Melt Bid](https://www.meltplan.com/blogs/best-bid-leveling-software-for-general-contractors-2026-comparison) | AI-native preconstruction; compares sub proposals side by side, catches missing scope, identifies exclusions and qualifications, exports to Excel |
| [Struvia](https://struvia.co/blog/best-construction-bidding-software-2026) | Plan takeoff, sub outreach from a 2,000+ subcontractor network, quotes arrive already in a leveled comparison view |
| [Buildr](https://buildr.com/blog/ai-bid-leveling/) | AI bid leveling guide and product for GCs |
| [Procore](https://www.procore.com/library/construction-bid-leveling) | Bid leveling inside the dominant construction management platform |
| [Arctis AI](https://arctisai.com/en/resources/bid-leveling-software-construction-2026), [PlanHub](https://planhub.com/resources/construction-bid-leveling-guide/), [ediphi](https://www.ediphi.com/glossary/bid-leveling), [Buildxact](https://www.buildxact.com/us/blog/what-is-the-process-of-bid-leveling/), [Archdesk](https://archdesk.com/blog/guide-to-subcontractor-bid-leveling) | Further entrants and category guides |

One source puts it plainly: AI-powered bid leveling is now considered **"table stakes for competitive preconstruction teams."**

What those tools do, in their own words: read proposals, extract pricing and scope, identify exclusions, flag missing scope, and organize bids into a side-by-side comparison — "a structured first pass they can verify and adjust."

**So "an AI that reads three bids and finds the scope gaps" is not a novel product.** We should never say it is.

---

## Where the gap actually is

Every product above targets the same customer: **mid-size to large commercial general contractors**, inside preconstruction workflows, priced accordingly, and assuming plan sets, ITB lists, trade packages and Excel.

Nobody is serving:

- **the homeowner** with three quotes for a bathroom, a roof, or an HVAC replacement
- **the two-to-ten-person trade shop** that cannot justify a preconstruction platform
- **anyone doing this once or twice a year**, who has no workflow to slot software into

That end of the market has spreadsheets, gut feel, and the advice articles cited in [`domain-research.md`](./domain-research.md) — which exist in such volume precisely because the problem is unsolved for those people.

This matters for track selection, and it cuts against the earlier assumption:

- **Professional framing** (contractor levels sub bids) → the thinner *track*, but the domain has AI incumbents a judge may well know by name.
- **Everyday framing** (homeowner compares three quotes) → the busier *track*, but a genuinely unserved problem that needs no explanation.

---

## What is actually different about the Sift approach

Not extraction. Not the side-by-side table. Both are commodity.

The difference is **what the system does when the comparison is not yet fair.** Every tool above produces a comparison and leaves the judgment to you — that is their explicit design, and "verify and adjust" is the pitch. Sift's engine can instead:

1. **Refuse to rank.** The synthesis obligation stays open while a material scope gap is unresolved. GoalLoop rejects a draft that ranks on raw totals, and the person sees *"I can't rank these yet, and here's exactly why."*
2. **Hold an unknown as an unknown.** The domain's own word for this is a **plug number**; the engine already models explicit unknowns and blocks readiness on them rather than defaulting to zero.
3. **Encode the questions nobody asks.** Lien waivers, change-order procedure, named-insured matching — pack-declared obligations, not things the user has to think to ask.
4. **Score deterministically and re-rank on the person's own weights.** The model never ranks; shifting weight off price re-orders the board with no model call.
5. **Never award.** Recommending is the agent's job, awarding is the person's, and the boundary is structural rather than a setting.

**The honest positioning:** the market has tools that tell you what the bids say. This is a tool that tells you when you are not yet in a position to choose — and what it would take to get there.

That claim survives the incumbents, and it is true of the engine that already exists.
