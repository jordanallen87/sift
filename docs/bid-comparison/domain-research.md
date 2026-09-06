# Comparing bids — what actually matters

Reference material for a Sift Decision Pack about choosing between competing bids for a defined job. Researched 2026-09-06; every claim below is sourced, and where the sources disagree or a number is a rule of thumb rather than a rule, this says so.

The one-sentence version of the whole domain: **the cheapest bid is frequently cheapest because it is pricing less work, and the entire skill of the job is finding out whether that is true before you sign.**

---

## 1. The core problem: bids are not comparable as delivered

The industry term for making them comparable is **bid leveling** — "the systematic process of comparing and normalizing subcontractor and supplier bids to ensure accurate apples-to-apples cost comparison," identifying "scope gaps, pricing discrepancies, and qualification differences" so the choice is best *value* rather than lowest *number* ([Beck Technology](https://www.beck-technology.com/blog/what-is-bid-leveling-in-construction), [Procore](https://www.procore.com/library/construction-bid-leveling)).

The load-bearing fact: **not all bids cover the same scope even when they respond to identical specifications.**

The canonical worked example, worth keeping because it makes the stakes concrete: a GC awards a $2M mechanical contract on the low number, then discovers the low bidder excluded $150,000 of ductwork insulation and $75,000 of controls integration — a **$225,000 scope gap** that existed at signing and was invisible in the total ([Beck Technology](https://www.beck-technology.com/blog/what-is-bid-leveling-in-construction)).

### Vocabulary the pack should use correctly

| Term | Meaning |
| --- | --- |
| **Scope gap** | Work the plans require that a bid does not price |
| **Plug number** | A cost the reviewer inserts to cover a missing item, so totals compare fairly |
| **Exclusion** | Work a bidder explicitly says they are *not* doing |
| **Allowance** | A placeholder dollar amount for something not yet specified |
| **Qualification** | A condition attached to the price ("assumes work during normal hours") |

Sources: [Beck Technology](https://www.beck-technology.com/blog/what-is-bid-leveling-in-construction), [ediphi glossary](https://www.ediphi.com/glossary/bid-leveling), [PlanHub](https://planhub.com/resources/construction-bid-leveling-guide/).

**The plug number is the most important concept for Sift.** It is the domain's own name for "we do not know this yet, and we are going to be explicit about it rather than pretend the totals are comparable." That maps exactly onto how the deterministic core already treats an unknown.

---

## 2. Allowances — the most common way a quote is made to look cheap

Allowances exist legitimately: they cover "materials or work items that are not specified at the time of the bid," typically flooring, lighting, plumbing fixtures, appliances, cabinets and countertops ([BuildingAdvisor](https://buildingadvisor.com/project-management/contracts/red-flag-clauses/allowances-in-construction-contracts/)).

They are also the standard mechanism for a misleadingly low total:

> "A contractor who sets suspiciously low allowances can make the overall quote appear cheaper while knowing the homeowner will exceed those allowances once they start shopping. A $500 allowance for a bathroom vanity will not buy much."

What a careful reviewer asks for each allowance:

- identified **by category and dollar amount**, not buried in a lump sum
- explicitly stated whether it includes **sales tax, delivery, fabrication, and installation-related materials**
- a sanity check: *what specific product does this amount actually buy?*

**Pack implication:** an allowance is not a price. Two bids with identical totals are not equivalent if one carries $12,000 of allowances and the other carries $2,000. This is a first-class comparison dimension, not a footnote.

---

## 3. Exclusions — and the tell when there are none

> "The red flag is when a quote has **no exclusions section at all**. That either means the contractor has not thought through the project thoroughly, or they are leaving themselves room to add charges later."

A minimally complete exclusions list covers site conditions, hazardous materials, owner-directed changes, and price-escalation beyond the quote's validity period ([archbuildhunt](https://archbuildhunt.com/construction-quote-red-flags-2026/)).

**Pack implication, and a genuinely counter-intuitive one worth putting on camera:** the *absence* of a section is evidence. A bid with no exclusions should score worse on completeness than one with a frank two-page exclusions list, which is the opposite of how it looks to an untrained reader. This is exactly the kind of judgment the product exists to make legible.

---

## 4. Money structure: deposits and payment schedules

Rules of thumb, and they vary by source and by state law — treat as a band, not a threshold:

- Typical deposit range: **10–33% upfront**
- **Over 50% is a red flag**; one source advises caution above **25%**
- Payments should track "real progress," tied to **measurable milestones**
- Be cautious when a large share of the total is due **before materials are ordered or meaningful work begins**

Sources: [bid-lens deposit guide](https://bid-lens.com/guides/contractor-deposit-guide), [archbuildhunt](https://archbuildhunt.com/construction-quote-red-flags-2026/).

**Pack implication:** cash-flow risk is a scoring dimension independent of price. A bid that is $2,000 cheaper but wants 50% before anything is ordered is not obviously the better deal, and the pack should be able to say so in plain words.

---

## 5. Who you are hiring — verifiable, and usually unverified

These are checkable facts, which makes them good evidence for an agent to gather:

- **License** — verify status independently, and confirm it covers *the type of work*, not merely that a license exists ([NARI](https://remodelingdoneright.nari.org/resources/contractor-checklist), [CSLB lookup](https://contractorsboard.org/california-contractors-state-license-board-license-check/))
- **Insurance** — general liability **and** workers' compensation; ask for proof rather than accepting verbal confirmation. A thorough certificate-of-insurance check confirms the **named insured matches the license exactly**, workers' comp is active, liability limits are adequate, commercial auto covers on-site vehicles, and an **additional-insured endorsement** names the owner ([Custom Home](https://www.customhome.us/blog/certificate-of-insurance-contractor-what-to-check))

The most useful finding in this section, and a strong candidate for the demo's "you did not know to ask this" moment:

> "**Lien waivers, change order clauses, and subcontractor insurance verification are the three contract elements homeowners almost never ask about — yet they're responsible for the majority of post-signing conflicts.**"

- A **mechanic's lien** lets an unpaid subcontractor or supplier put a legal claim on the property — even if the owner already paid the general contractor. The protection is requiring **unconditional lien waivers with every payment**.
- **Change orders**: verbal approval of changes is "the number one source of contractor-homeowner conflict in residential construction."

Sources: [Angi](https://www.angi.com/articles/should-i-sign-contractor-liability-release.htm), [realmhome](https://realmhome.com/blog/contractor-contract-checklist-before-signing), [Stone Development](https://www.stonedevelopmentinc.com/resources/contractor-checklist).

**Pack implication:** these are pack-declared obligations a person would never think to raise. That is the strongest possible argument for a Decision Pack encoding expertise, rather than a chat interface answering only what it is asked.

---

## 6. The comparison dimensions, consolidated

What the pack should weigh, in the order the research supports:

1. **Adjusted total** — the bid plus plug numbers for anything it does not price
2. **Scope completeness** — what is priced, what is excluded, what is silent
3. **Allowance exposure** — how much of the total is a placeholder that will move
4. **Schedule** — start date, duration, and whether it is credible
5. **Credentials** — license covering *this* work, active insurance, named insured matching
6. **Payment risk** — deposit size, milestone structure, money ahead of work
7. **Warranty** — term, what it covers, whether it is written down
8. **Contract protections** — lien waivers, written change-order procedure

Dimensions 1–3 are what makes the numbers comparable at all. Dimensions 5–8 are the ones people skip and later regret.

---

## 7. Deliberately out of scope

- **Plan takeoff** — reading drawings to derive quantities. Real, hard, and a different product.
- **Fair-price estimation** — "is $18,000 reasonable for this bathroom?" needs regional cost data this project does not have, and inventing it would be exactly the sort of confident fabrication the product exists to refuse.
- **Anything implying legal advice.** The pack surfaces that a lien-waiver clause is absent; it does not opine on enforceability.
