# The WebMCP Challenge — Pax Submission Details

Status: local preparation packet; nothing has been sent to Devpost.  
Official data source: authenticated Devpost MCP responses fetched 2026-08-27 UTC.  
Official pages: [challenge](https://webmcp.devpost.com/) · [rules](https://webmcp.devpost.com/rules) · [OpenAI overview](https://openai.com/webmcp-challenge/)

Release gate: complete the [shared release checklist](../shared-release-checklist.md) and the [exhaustive WebMCP requirements checklist](./requirements-checklist.md). The shorter checklist at the end of this packet is only a summary.

## Event snapshot

- Status at fetch: submissions open.
- Submission window opened: August 25, 2026 at 12:00 p.m. PT.
- Submission deadline: September 3, 2026 at 1:00 p.m. PT / 4:00 p.m. ET (`2026-09-03T20:00:00Z`).
- Judging: September 4 through September 21, 2026.
- Winners scheduled: September 23, 2026; organizer notes that timing may change with submission volume.
- No public-voting period was returned.

## Eligibility snapshot

The Devpost eligibility response states:

> Above legal age of majority in country of residence

> Specific countries/territories excluded: Belarus, Brazil, China, Crimea, Cuba, Donetsk People’s Republic, Hong Kong, Iran Islamic Republic of, Korea Democratic People's Republic of, Luhansk People’s Republic, Quebec, Russia, Syrian Arab Republic, Venezuela

It also reports all occupations allowed, no company requirement, and no required team. Verify every team member against the full official rules before submission.

## What must be built and submitted

The official brief asks for a WebMCP-powered web application that explores a web where people and agents interact, collaborate, and create together.

Required deliverables:

- A working live URL accessible in ChatGPT's in-app browser or Google Chrome with WebMCP enabled.
- A text description explaining why the use case fits WebMCP, how it improves the experience, what people and agents can do together that was difficult before, and how WebMCP was implemented.
- A public YouTube demo video under three minutes. It must show the product working and include audio explaining the product and WebMCP use.
- A public GitHub, GitLab, or Bitbucket repository.
- Complete source, assets, setup instructions, and an open-source license visible at the top of the repository page.
- A working `document.modelContext.registerTool(...)` implementation visible in the repository.

The organizer's final checklist says to show the project working in the first 15 seconds, remove setup/loading/dead time, verify the repository in an incognito window, and test the WebMCP tools in ChatGPT's in-app browser or compatible Chrome.

## Current official form fields

| ID | Field | Required | Pax answer/status |
| --- | --- | --- | --- |
| `28249` | Submitter Type | Yes | Participant must select Individual, Team of Individuals, or Organization. |
| `28250` | Country of residence for submitter and team | Yes | Participant must select the truthful country or countries. |
| `28251` | Organization name | No | Complete only if submitting for an organization. |
| `28252` | App Status | Yes | Expected answer: `New`; confirm against the final repository history. |
| `28253` | Existing-app changes during submission period | Conditional | Not applicable if `New`; otherwise document only WebMCP work completed during the official period. |
| `28254` | Judge-accessible live URL | Yes | Not yet available; use the verified Railway URL. |
| `28255` | Testing instructions or credentials | No | Provide concise ChatGPT/Chrome steps even when authentication is unnecessary. |
| `28256` | Public repository URL | Yes | Not yet available; repository must include a visible open-source license. |
| `28257` | Agents or clients used to test WebMCP | Yes | Record only completed tests; target ChatGPT in-app browser and Chrome 149+ with WebMCP enabled. |
| `28258` | AI tools used while building | Yes | Expected: Claude Code, Codex, and the actual model/runtime tools used; verify final list. |
| `28259` | Learning level | Yes | Participant chooses None, Moderate, or Significant. |
| `28260` | Career-reusable AI value | Yes | Participant chooses Yes or No. |

Global Devpost project fields also require a title, tagline, description, built-with list, and public video URL even when they are not repeated in the custom-field response.

## Official judging criteria

| Criterion | Official description | Pax proof to foreground |
| --- | --- | --- |
| WebMCP Leverage | How thoroughly and skillfully does the project use WebMCP? Does the code reflect genuine effort and a working, non-trivial implementation? | Current page selection, shared UI/tool commands, typed custom concern, source intake, active-run correlation, and a visible Strands replan caused by a WebMCP command. |
| Execution | Does the project deliver a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept? | Public Railway deployment, polished right-pane UI, deterministic release suite, replay/reconnect, and tested live WebMCP registration. |
| Potential Impact | Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated? | A household actively comparing real car candidates and dealer offers, with honest test-drive unknowns and human shortlist authority. |
| Creativity & Ambition | How creative and novel is the concept and does the project differ from existing concepts? | WebMCP is a live steering channel into a separate supervised multi-agent system, not a collection of CRUD shortcuts. |

## Prize snapshot

The official Devpost response lists ten winning submissions. Each winner's package includes:

- $3,000 USD from OpenAI plus $500 cash from Netlify;
- one Codex Micro;
- OpenAI swag and one year of ChatGPT Pro for up to three team members;
- Cloudflare, Vercel/Gateway, and Render credits;
- Shopify gear;
- Google AI Ultra subscriptions for team members under the stated sponsor terms.

The Devpost prize record reports a $35,000 aggregate cash value across ten winners. Sponsor credits and non-cash benefits are additional; the official rules control eligibility and fulfillment.

## Recommended Pax positioning

### Title

Pax

### One-line summary

Pax turns a WebMCP-enabled decision workspace into a shared control surface where a person and ChatGPT can redirect a supervised multi-agent investigation without losing evidence, continuity, or human authority.

### Problem

Important everyday comparisons do not fail because a model cannot produce an answer. They fail because assumptions change, evidence conflicts, subjective unknowns get fabricated, and nobody can see which conclusions became stale.

### Solution

In Choose Our Next Car, the user and ChatGPT work against the same live case. ChatGPT reads the selected vehicle, adds or reweights a household concern through structured WebMCP tools, and requests bounded investigation. Pax converts that change into typed case state and evidence obligations. A Strands Graph switches focus and skills, challenges weak sources, recomputes only affected conclusions, and streams every meaningful transition into the right pane. The user alone approves the shortlist.

### Why WebMCP is essential

Without WebMCP, ChatGPT would have to infer page state, ask the user to repeat selected candidates, or manipulate visual controls indirectly. With WebMCP, the page exposes explicit shared attention, typed mutations, source submission, run receipts, and current case context. A spoken preference can therefore redirect an already-running backend investigation and remain visibly synchronized with the page.

### Distinguishing claim

Most WebMCP examples let an agent operate a website. Pax lets a website mediate collaboration among a human, ChatGPT, and a separate supervised agent team.

## Required hero demonstration

The under-three-minute video should put the best material first:

1. **0:00–0:15 — working product immediately.** Show the narrow right-pane case with a selected vehicle and active investigation.
2. **0:15–0:35 — shared attention.** Ask ChatGPT what would have to be true for the selected RAV4 to win; show `pax_get_case_context` read the exact selection, then `pax_request_investigation` fire in the same breath so Beat 4's active Strands investigation has a real cause on screen.
3. **0:35–1:05 — unanticipated concern.** Say that driving comfort is now non-negotiable and two dog crates must fit. Show WebMCP define/reweight the concern and the page add `custom.dog_crate_fit` plus an evidence question.
4. **1:05–1:35 — cross-agent steering.** Show the active Strands trajectory redirect, `household-fit` activate, source challenge occur, and prior recommendation become stale.
5. **1:35–2:05 — honest adaptation.** Show sourced cargo dimensions, explicit unknown comfort/crate fit, test-drive questions, and the revised ranking.
6. **2:05–2:30 — human boundary.** Show that ChatGPT can request revision but cannot approve; approve the shortlist in the visible UI.
7. **2:30–2:50 — proof.** Open one correlated Runtime Inspector event and briefly show the green release evidence.
8. **2:50–3:00 — close.** State the distinguishing claim above and end on the working case.

## Testing instructions draft

1. Open the public URL in ChatGPT's in-app browser. A compatible Chrome build with WebMCP enabled is the fallback.
2. Launch **Choose Our Next Car**.
3. Select a candidate and call `pax_get_case_context`; verify `selectedOptionId` matches the page.
4. Call `pax_define_case_attribute` and `pax_update_criteria`; verify the new concern, case obligation, and unchanged pack hash appear.
5. Call `pax_request_investigation`; observe ordered queued, specialist, skill, tool, evidence, steering, and completion events.
6. Refresh or interrupt the connection; verify state and event replay recover.
7. Confirm no WebMCP approval tool exists and final shortlist approval is available only in the page.

Replace this draft with the exact deployed URL, browser versions, and observed results after live verification.

## Built-with draft

- WebMCP / `document.modelContext`
- TypeScript
- React
- Strands Agents SDK for TypeScript
- Amazon Bedrock
- SQLite / Drizzle
- OpenTelemetry
- Playwright
- Railway
- Amazon Bedrock AgentCore, only if actually deployed

## Final checklist

- [ ] Confirm registration and eligibility in Devpost.
- [ ] Confirm `New` versus `Existing` truthfully.
- [ ] Add the public repository URL and visible MIT license.
- [ ] Add the verified Railway URL.
- [ ] Test every registered tool in ChatGPT's in-app browser.
- [ ] Test the supported Chrome configuration and record its exact version/flag.
- [ ] Record the exact AI tools used and the participant's learning answers.
- [ ] Record a public YouTube video under three minutes with audio.
- [ ] Show working product in the first 15 seconds.
- [ ] Verify the live URL and repository from an incognito window.
- [ ] Run `pnpm verify:release` and link the report from the README.
- [ ] Submit before September 3 at 1:00 p.m. PT.
- [ ] Freeze the submitted repository, live deployment, form, and video during judging.
