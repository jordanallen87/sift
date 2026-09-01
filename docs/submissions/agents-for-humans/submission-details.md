# Agents for Humans Hackathon — Sift Submission Details

Status: local preparation packet; nothing has been sent to Devpost.  
Official data source: authenticated Devpost MCP responses fetched 2026-08-27 UTC.  
Official pages: [challenge](https://agentsforhumans.devpost.com/) · [rules](https://agentsforhumans.devpost.com/rules) · [resources](https://agentsforhumans.devpost.com/resources)

Release gate: complete the [shared release checklist](../shared-release-checklist.md) and the [exhaustive Agents for Humans requirements checklist](./requirements-checklist.md). The shorter checklist at the end of this packet is only a summary.

## Event snapshot

- Host: Amazon.
- Status at fetch: submissions open.
- Recommended track: **Everyday Agents**.
- Submission window opened: August 10, 2026 at 9:00 a.m. PT.
- Submission deadline: September 14, 2026 at 5:00 p.m. PT / 8:00 p.m. ET (`2026-09-15T00:00:00Z`).
- Judging: September 15 through October 8, 2026.
- Winners scheduled: October 14, 2026.
- No public-voting period was returned.

## Eligibility snapshot

The Devpost eligibility response states:

> Above legal age of majority in country of residence

> Specific countries/territories excluded: Argentina, Australia, Belarus, Brazil, Crimea, Cuba, Donetsk People’s Republic, Hong Kong, Indonesia, Iran Islamic Republic of, Italy, Korea Democratic People's Republic of, Luhansk People’s Republic, Malaysia, Philippines, Quebec, Russia, Singapore, Syrian Arab Republic, Thailand, United Arab Emirates, Vietnam

It also reports all occupations allowed, no company requirement, and no required team. Verify every team member against the full official rules before submission.

## What must be built and submitted

The official brief asks for a new AI agent built with Strands Agents SDK that does real work for people and handles a real task end to end.

Track choices:

- **Everyday Agents:** daily life, home, money, health, errands, and family; the strongest run quietly and surface only for real decisions.
- **Professional Agents:** repetitive, judgment-heavy professional work.
- **Good Neighbor Agents:** work benefiting neighborhoods, nonprofits, schools, libraries, or local groups.

Required deliverables:

- A text description explaining what the project does, who it serves, and how it works.
- A public source repository containing all source, assets, setup instructions, README, and an MIT or Apache license visible in the repository About area.
- A required architecture diagram upload in PDF, PPT, PPTX, PNG, JPG, or JPEG format, maximum 35 MiB.
- A demo video no longer than five minutes that shows the working project and explains the problem, audience, and why it matters.
- An AWS Builder ID.
- A truthful Built With section that clearly names Strands Agents SDK.

A live demo and AgentCore deployment are not required, but the official judging description says either strengthens the Technological Implementation score. Sift should provide both Railway live access and AgentCore deployment/correlation when credentials allow.

## Current official form fields

| ID | Field | Required | Sift answer/status |
| --- | --- | --- | --- |
| `27729` | Submitter Type | Yes | Participant must select Individual, Team of Individuals, or Organization. |
| `27730` | Country of Residence | Yes | Participant supplies the truthful country. |
| `27731` | Organization name | No | Complete only when applicable. |
| `27732` | Competition Track | Yes | Recommended answer: `Everyday Agents`. |
| `27733` | Public code repository URL | Yes | Not yet available; must include README and visible MIT or Apache license. |
| `27734` | Architecture diagram | Yes | Upload final PNG or PDF; do not treat a URL answer as the file upload. |
| `27735` | AWS Builder ID | Yes | Participant must supply. |
| `27736` | Live demo URL | No | Strongly recommended; use verified Railway URL. |
| `28191` | Testing instructions | No | Strongly recommended; provide fixture and live paths. |
| `27737` | Bonus Builder post URL | No | Publish on `builder.aws.com` before the deadline if pursuing bonus points. The current field description contains an apparently unrelated hashtag; verify the live rules before publishing. |

Global Devpost project fields also require a title, tagline, description, built-with list, and public video URL.

## Official judging criteria

| Criterion | Official description | Sift proof to foreground |
| --- | --- | --- |
| Technological Implementation | How thoroughly and skillfully does the project use Strands Agents? Does the code reflect genuine effort and a working, non-trivial implementation? A live demo and/or Amazon Bedrock AgentCore deployment will strengthen this score. | Real AgentSkills, bounded Swarm handoffs, interventions, Context Injector, GoalLoop, sessions/snapshots, OpenTelemetry, scripted deterministic tests, and AgentCore when available. |
| Design | Does the project deliver a complete, coherent product experience and not just a technical proof of concept? | Calm right-pane UI, truthful real-time activity, reviewable evidence, explicit waiting/blocked states, and human confirmation rather than a terminal trace. |
| Potential Impact | Does the project make a credible, specific case for solving a real problem for a real audience, and does the solution actually address that problem based on what's demonstrated? | Home Energy Guardian reduces continuous household vigilance and investigates abnormal bills before interrupting the user. |
| Creativity & Originality | Is this a creative, non-obvious use of Strands Agents and does the team demonstrate genuine understanding of the problem space they're working in? | A supervised adaptive system measures evidence progress, rejects plausible premature answers, and changes agent/skill/tool trajectory under deterministic governance. |
| Presentation | Does the video clearly demonstrate the project working end-to-end? Does the pitch communicate what problem is solved, who it's for, and why it matters? Is the overall presentation easy to follow? | One causal story from anomaly detection through withheld draft, steering, specialist handoff, source challenge, confirmation, persistence, and human action. |

## Prize snapshot

Official total prize pool: $40,000 USD.

| Prize | Winners | Amount each |
| --- | --- | --- |
| Grand Prize | 1 | $10,000 |
| Everyday Agents — Golden Agent | 1 | $5,000 |
| Everyday Agents — Silver Agent | 1 | $3,000 |
| Everyday Agents — Bronze Agent | 1 | $2,000 |
| Professional Agents — Golden/Silver/Bronze | 3 | $5,000 / $3,000 / $2,000 |
| Good Neighbor Agents — Golden/Silver/Bronze | 3 | $5,000 / $3,000 / $2,000 |

The Grand Prize also lists an AWS social feature and a meeting with AWS technical experts. Track prizes list an AWS social feature.

## Recommended Sift positioning

### Title

Sift

### One-line summary

Sift is a supervised adaptive agent system that investigates repetitive household decisions in the background, changes skills and specialists when evidence stalls, and interrupts the person only when judgment or authority is genuinely required.

### Problem

Households repeatedly notice a surprising bill, search one likely cause, and either overreact or accept a plausible explanation too early. A normal assistant can generate advice, but it does not maintain evidence obligations, detect an unproductive investigation, or preserve a safe human decision boundary over time.

### Solution

Home Energy Guardian watches a deterministic bill feed and creates a case only when usage is materially abnormal. A Strands Swarm investigates rate, weather, usage, and household changes. Sift measures evidence progress around the Swarm. It can reject a plausible recommendation, steer a stalled agent, switch skills and specialists, inject new case state, challenge sources, persist through a confirmation pause, and surface one bounded proposal for human review.

The distinguishing claim below is implemented literally rather than asserted. Every recommendation's confidence is a stated function of two measured quantities -- how much of what the household said matters was actually established, and how far the leader leads -- both reported alongside it so the arithmetic can be checked. A factor nobody researched lowers that confidence without ever being counted against an option. A measurement whose sources contradict each other is marked contested, and Sift says when the leader's lead depends on it. Where the Swarm's own favorite is not the option the household's criteria put first, the product states the disagreement in plain words instead of resolving it silently in either direction.

### Why Strands is essential

- AgentSkills progressively load the technique required by the active obligation.
- A real bounded Swarm moves among anomaly, rate, weather, home-systems, source-challenge, and synthesis specialists.
- Interventions use `Guide`, `Confirm`, and `Deny` to redirect work and preserve authority.
- Context Injector supplies current evidence, criteria, case extensions, and remaining budgets on each turn.
- GoalLoop rejects an unsupported early recommendation and provides bounded corrective feedback.
- Sessions and snapshots preserve the execution across a human confirmation and service reconstruction.
- Hooks and OpenTelemetry feed the user activity stream and detailed Runtime Inspector without exposing chain-of-thought.
- AgentCore provides the AWS execution and observability target when deployed.

### Distinguishing claim

Most agents are optimized to finish. Sift is optimized to know when the agent has not earned the right to answer yet.

## Required hero demonstration

The maximum-five-minute video should follow one legible causal chain:

1. **0:00–0:20 — product and problem.** Show the working right-pane Energy case and state that the household should not have to babysit another app.
2. **0:20–0:45 — background trigger.** A 42% anomaly creates the case; the anomaly check reaches E3 without asking the user.
3. **0:45–1:30 — genuine Strands work.** Show rate and weather specialists, AgentSkills activation, tools, evidence, and real-time UI updates.
4. **1:30–2:05 — premature answer rejected.** The model proposes monitoring one cycle; GoalLoop/readiness emits `Draft withheld` because household-change evidence remains unresolved.
5. **2:05–2:45 — steering and switching.** Repeated weather work yields no evidence delta; `RetrySteering` emits `Guide`, the Swarm hands off to `home-systems-analyst`, and `home-event-correlation` activates.
6. **2:45–3:20 — supported revision.** The thermostat event supports the HVAC hypothesis; `source-challenger` verifies the claim; the user or ChatGPT reweights the criterion from lowest immediate cost to long-term waste reduction (a required final assertion), and the recommendation changes to `request-hvac-inspection` after GoalLoop validation.
7. **3:20–3:50 — human boundary and persistence.** `ConsequenceGuard` emits `Confirm`, saves a snapshot, restores after reconstruction, and waits for visible human proposal approval without scheduling anything.
8. **3:50–4:25 — implementation proof.** Show the Runtime Inspector path, state diff, token/latency metadata, AgentCore/CloudWatch correlation when available, and `pnpm verify:release` result.
9. **4:25–4:50 — platform proof.** Briefly show that Car Purchase uses a compiled Graph pack and that a typed case concern can adapt a run without rewriting the pack.
10. **4:50–5:00 — close.** Deliver the distinguishing claim above.

## Testing instructions draft

1. Open the public Railway URL and launch **Investigate my energy bill**.
2. Start the deterministic scenario and observe the anomaly, rate, and weather work update in real time.
3. Verify the first monitoring draft is visibly withheld.
4. Verify repeated/no-progress weather work causes a `Guide` and Swarm handoff to `home-systems-analyst`.
5. Verify the thermostat evidence is source-linked and the recommendation changes after criteria reweighting.
6. At confirmation, verify the session snapshot exists, restart/reconstruct the runtime, and verify restoration without lost case events.
7. Confirm the agent cannot approve or schedule the inspection.
8. Open Runtime Inspector and correlate the visible activity with the Strands/OTEL event.
9. Review `artifacts/verification/latest/report.json` from `pnpm verify:release`.

Replace this draft with the exact public URL, scenario control labels, AgentCore endpoint/correlation instructions, and observed results after deployment.

## Built-with draft

- Strands Agents SDK for TypeScript
- Amazon Bedrock
- Amazon Bedrock AgentCore, only if actually deployed
- OpenTelemetry / AgentCore observability
- TypeScript
- React
- WebMCP
- SQLite / Drizzle
- Playwright
- Railway

## Architecture diagram requirements

The submitted export must visibly distinguish:

- ChatGPT and WebMCP browser interaction;
- Railway web/API gateway and persistent SQLite volume;
- deterministic Sift evidence/readiness/authority engine;
- compiled Decision Pack and case/run plan;
- Strands AgentSkills, Graph/Swarm, interventions, Context Injector, GoalLoop, sessions, and hooks;
- local versus AgentCore execution target;
- OpenTelemetry correlation to Runtime Inspector and optional CloudWatch;
- human-only approval boundary.

## Bonus Builder post

Recommended article angle:

> Agents for Humans: Building an Agent That Knows When Not to Answer

Cover the real Strands trajectory, why deterministic readiness sits outside the model, how steering responds to evidence delta, AgentCore deployment, observability, and what the automated scenario caught during development. Publish before the deadline and verify the current live rule/hashtag instructions.

## Final checklist

- [ ] Confirm registration and eligibility in Devpost.
- [ ] Select `Everyday Agents` in the final form.
- [ ] Add the public repository URL and visible MIT license.
- [ ] Add the AWS Builder ID.
- [ ] Export and upload the required architecture diagram.
- [ ] Add the verified Railway URL.
- [ ] Deploy and verify AgentCore when credentials permit; describe any honest blocker.
- [ ] Record exact setup and deterministic testing instructions.
- [ ] Record a public demo video no longer than five minutes.
- [ ] Show the working product rather than slides or mockups.
- [ ] Name Strands Agents SDK prominently in Built With, description, README, and video.
- [ ] Publish and link the optional Builder post if pursuing bonus points.
- [ ] Run `pnpm verify:release` and link the report from the README.
- [ ] Submit before September 14 at 5:00 p.m. PT.
- [ ] Freeze the submitted repository, live deployment, form, and video after the deadline.
