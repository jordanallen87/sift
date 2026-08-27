# Agent skills

Each subdirectory here is a real Strands `AgentSkills` skill: a `SKILL.md` file with YAML frontmatter (`name`, `description`) followed by a Markdown instructions body, optionally alongside `scripts/`, `references/`, and `assets/` subdirectories. Strands' `AgentSkills` plugin loads only the `name`/`description` metadata into the agent's system prompt up front (progressive disclosure); the full instructions body is loaded only when the agent activates that specific skill for the obligation at hand. `apps/agent/skills/pack-authoring/SKILL.md` is a separate, developer-mode skill not used in normal decision runs.

## `car-purchase@1.0.0` ("Choose Our Next Car")

Declared by id in `packages/packs/src/car-purchase.ts`.

- **`listing-normalizer`** — Normalizes a raw listing and dealer offer into a comparable true out-the-door price and flags when it diverges materially from the advertised price (the teaser-price case).
- **`deal-analysis`** — Checks a normalized candidate against the household's hard constraints and budget, and invalidates a prior deal score when the normalized terms it relied on change.
- **`ownership-cost`** — Computes an itemized, comparable five-year ownership estimate under shared assumptions applied identically across every candidate.
- **`safety-reliability`** — Gathers source-linked safety and reliability ratings and hands off to `source-challenger` when independent sources materially disagree, instead of picking a side.
- **`household-fit`** — Separates specification-derived facts from genuinely subjective or unverifiable fit questions, which always become an explicit unknown and a test-drive/measurement question rather than a fabricated score.
- **`decision-synthesis`** — Synthesizes the other specialists' evidence into a source-linked shortlist/response-options recommendation, withholding the draft with a visible reason whenever required obligations remain unresolved. Shared verbatim by both packs below (see that skill's own content note).

## `home-energy-guardian@1.0.0` ("Home Energy Guardian")

Declared by id in `packages/packs/src/home-energy-guardian.ts`.

- **`bill-normalizer`** — Computes the weather- and trend-normalized baseline bill/usage for the current billing cycle and flags whether the current bill is materially abnormal relative to it.
- **`rate-plan-analysis`** — Compares the current and prior tariff's fixed and volumetric charges to isolate how much of the bill increase is attributable to the rate change alone, holding usage constant at baseline.
- **`weather-comparison`** — Compares actual and typical heating/cooling degree days to estimate how much of the usage gap weather alone explains, and steers away from repeating the same lookup with no new evidence.
- **`home-event-correlation`** — Correlates the household/appliance event log against the anomalous billing cycle to identify a plausible, honestly-labeled non-weather, non-rate explanation for any remaining usage gap.
- **`decision-synthesis`** — see above; its body describes a source-linked shortlist recommendation from the car-purchase pack's own perspective, which is not a byte-for-byte match to Home Energy Guardian's response-options synthesis wording. Authoring a pack-specific `decision-synthesis` body (or otherwise reconciling the two packs' shared skill id) is a real, deliberately deferred follow-up — recorded in the dated `docs/build-log.md` entry for the task that added the four skills above — not fixed here: `home-energy-guardian`'s `decision-synthesizer` specialist never actually activates this skill via a `skills` tool call in the shipped demo trajectory (it reaches its response-options facts through its own system prompt instead — see `home-energy-swarm.ts`'s module header, judgment call 4), so the mismatch is real but not currently reachable in practice.
