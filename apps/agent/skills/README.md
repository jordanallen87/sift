# Agent skills

Each subdirectory here is a real Strands `AgentSkills` skill: a `SKILL.md` file with YAML frontmatter (`name`, `description`) followed by a Markdown instructions body, optionally alongside `scripts/`, `references/`, and `assets/` subdirectories. Strands' `AgentSkills` plugin loads only the `name`/`description` metadata into the agent's system prompt up front (progressive disclosure); the full instructions body is loaded only when the agent activates that specific skill for the obligation at hand. The six skills below belong to the `car-purchase@1.0.0` Decision Pack ("Choose Our Next Car") and are declared by id in its manifest (`packages/packs/src/car-purchase.ts`); `apps/agent/skills/pack-authoring/SKILL.md` is a separate, developer-mode skill not used in normal decision runs.

- **`listing-normalizer`** — Normalizes a raw listing and dealer offer into a comparable true out-the-door price and flags when it diverges materially from the advertised price (the teaser-price case).
- **`deal-analysis`** — Checks a normalized candidate against the household's hard constraints and budget, and invalidates a prior deal score when the normalized terms it relied on change.
- **`ownership-cost`** — Computes an itemized, comparable five-year ownership estimate under shared assumptions applied identically across every candidate.
- **`safety-reliability`** — Gathers source-linked safety and reliability ratings and hands off to `source-challenger` when independent sources materially disagree, instead of picking a side.
- **`household-fit`** — Separates specification-derived facts from genuinely subjective or unverifiable fit questions, which always become an explicit unknown and a test-drive/measurement question rather than a fabricated score.
- **`decision-synthesis`** — Synthesizes the other specialists' evidence into a source-linked shortlist recommendation, withholding the draft with a visible reason whenever required obligations remain unresolved.
