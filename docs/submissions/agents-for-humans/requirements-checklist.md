# Agents for Humans Hackathon — Requirements Checklist

Status: no submission has been sent. Every unchecked required or conditional item is an open release gate. Items labeled optional do not block submission but may affect scoring or bonus eligibility.

Official data was fetched from the authenticated Devpost integration on 2026-08-27 UTC. Recheck the [challenge](https://agentsforhumans.devpost.com/), [rules](https://agentsforhumans.devpost.com/rules), [resources](https://agentsforhumans.devpost.com/resources), and live form before submission. Complete the [shared release checklist](../shared-release-checklist.md) as well.

Deadline: September 14, 2026 at 5:00 p.m. PT / 8:00 p.m. ET (`2026-09-15T00:00:00Z`).

## Eligibility and registration — human verification required

- [ ] The submitter is registered for Agents for Humans.
- [ ] The submitter and every team member are above the legal age of majority in their country of residence.
- [ ] No participant resides in an excluded country or territory listed by the current official rules.
- [ ] The submitter has reviewed the complete official rules, not only the eligibility summary.
- [ ] Submitter type is chosen truthfully as Individual, Team of Individuals, or Organization.
- [ ] Country of residence is entered truthfully.
- [ ] Organization name is supplied only if applicable.
- [ ] Team membership and invitations are complete before submission.
- [ ] The submitter has a valid AWS Builder ID and has personally verified the identifier to enter.

## Project and track qualification

- [ ] Sift is a new AI agent built for this hackathon with Strands Agents SDK.
- [ ] The agent performs a real task for people end to end rather than only answering a prompt.
- [ ] The selected track is `Everyday Agents` unless the final positioning is deliberately changed before submission.
- [ ] Home Energy Guardian fits the selected track through a daily-life/home/family use case.
- [ ] The system can work quietly and surface the user only for a genuine decision or authority boundary.
- [ ] The implementation uses real Strands runtime capabilities rather than naming them only in documentation.

## Required public repository

- [ ] A public source repository URL is supplied.
- [ ] The repository contains all source, assets, setup instructions, and a complete README.
- [ ] An MIT or Apache license is present at the root and visible in the repository About area.
- [ ] Strands Agents SDK is named prominently in README setup, architecture, and Built With content.
- [ ] The repository shows where skills, specialists, interventions, context injection, goal evaluation, sessions, hooks, and telemetry are implemented.
- [ ] A clean clone can install, build, test, and run using the documented commands.
- [ ] Repository visibility and license are verified while signed out.

## Required text description

- [ ] The description states what Sift and Home Energy Guardian do.
- [ ] The description identifies the household audience and the repetitive vigilance problem.
- [ ] The description explains the end-to-end flow from anomaly detection through evidence-backed human proposal.
- [ ] The description explains why a supervised adaptive system is more valuable than a one-shot model answer.
- [ ] The description explains the genuine Strands capabilities used in the demonstrated run.
- [ ] The description clearly distinguishes deterministic governance from model judgment.
- [ ] The description does not claim AgentCore, CloudWatch, live data, or a deployment that was not verified.

## Required architecture diagram

- [ ] A final architecture diagram is exported as PDF, PPT, PPTX, PNG, JPG, or JPEG.
- [ ] The exported file is no larger than 35 MiB.
- [ ] The upload is the actual file, not a URL entered where Devpost expects an upload.
- [ ] The diagram is readable at Devpost preview scale.
- [ ] The diagram distinguishes ChatGPT and WebMCP browser interaction.
- [ ] The diagram distinguishes Railway web/API services and persistent SQLite storage.
- [ ] The diagram distinguishes deterministic Sift evidence, readiness, budget, and authority governance.
- [ ] The diagram distinguishes the compiled Decision Pack and mutable case/run plan.
- [ ] The diagram shows Strands AgentSkills, Graph or Swarm, interventions, Context Injector, GoalLoop, sessions, and hooks.
- [ ] The diagram distinguishes local and AgentCore execution targets only if both exist.
- [ ] The diagram shows OpenTelemetry correlation to Runtime Inspector and CloudWatch only where implemented.
- [ ] The diagram makes the human-only approval boundary visually explicit.
- [ ] The diagram matches the deployed system and final README architecture.

## Required demo video

- [ ] The final video is no longer than five minutes.
- [ ] The video link is publicly viewable while signed out.
- [ ] The video contains clear spoken audio.
- [ ] The video states the problem, intended audience, and why the problem matters.
- [ ] The working product appears immediately rather than beginning with slides.
- [ ] The video shows the complete Energy journey end to end.
- [ ] The video shows a 42% anomaly creating the case without unnecessary user interruption.
- [ ] The video shows genuine specialists, AgentSkills, tools, evidence, and real-time events.
- [ ] The video shows the early monitoring answer being withheld because an evidence obligation is unresolved.
- [ ] The video shows a no-progress condition causing `Guide`, a specialist handoff, and skill switching.
- [ ] The video shows new thermostat evidence changing the supported recommendation.
- [ ] The video shows `Confirm`, persisted session state, runtime reconstruction, and visible human review.
- [ ] The video proves the agent cannot approve or schedule the consequential action.
- [ ] The video shows the Runtime Inspector and correlated telemetry without exposing chain-of-thought.
- [ ] AgentCore and CloudWatch appear in the video only if the deployment and correlation were actually verified.
- [ ] The video briefly connects the Energy hero to the reusable Decision Pack architecture without distracting from the hero journey.
- [ ] Captions, resolution, audio, and duration are checked on the final uploaded file.

## Devpost project fields

- [ ] Global project title is complete and consistent with the repository and video.
- [ ] Global project tagline is complete.
- [ ] Global project description is complete.
- [ ] Global Built With list truthfully and prominently includes Strands Agents SDK.
- [ ] Global public video URL points to the final video no longer than five minutes.
- [ ] Field `27729` — Submitter Type is answered truthfully.
- [ ] Field `27730` — Country of Residence is answered truthfully.
- [ ] Field `27731` — Organization name is completed if applicable.
- [ ] Field `27732` — Competition Track is selected; intended answer is Everyday Agents.
- [ ] Field `27733` — Public code repository URL is the final verified repository.
- [ ] Field `27734` — Architecture diagram is the final allowed-format file under 35 MiB.
- [ ] Field `27735` — AWS Builder ID is supplied and personally verified.
- [ ] Field `27736` — Live demo URL is supplied if the optional Railway deployment is ready and verified.
- [ ] Field `28191` — Testing instructions are supplied if the optional field can help judges reproduce fixture and live paths.
- [ ] Field `27737` — Bonus Builder post URL is supplied only if the optional post is published and compliant.

## Genuine Strands implementation proof

- [ ] The runtime uses Strands Agents SDK for TypeScript in the executed hero path.
- [ ] AgentSkills progressively load the technique needed by the active evidence obligation.
- [ ] The bounded Swarm performs observable handoffs among relevant specialists.
- [ ] `Guide` redirects unproductive work based on a deterministic no-progress signal.
- [ ] `Confirm` pauses at the consequential human boundary and survives restoration.
- [ ] `Deny` blocks prohibited or budget-exceeding actions with a visible reason.
- [ ] Context Injector supplies current case state, evidence, criteria, extensions, and remaining budgets without rewriting the pack.
- [ ] GoalLoop rejects the unsupported early recommendation and provides bounded corrective feedback.
- [ ] Sessions and snapshots restore the run after service reconstruction without duplicate effects or lost events.
- [ ] Hooks publish safe lifecycle events to the activity UI and telemetry pipeline.
- [ ] OpenTelemetry correlates the visible activity, model/tool work, and Runtime Inspector detail.
- [ ] The system exposes safe execution metadata and state diffs without exposing hidden reasoning.
- [ ] Steering policies are testable, bounded, budget-aware, and not dependent on unconstrained model self-report.
- [ ] The recommendation changes because evidence and criteria changed, not because a scripted final string was swapped.

## End-to-end product proof

- [ ] The deterministic bill feed triggers a case only when the anomaly threshold is met.
- [ ] The initial rate and weather work proceeds without asking the user an avoidable question.
- [ ] Evidence obligations and readiness are visible and source-linked.
- [ ] A plausible but premature answer is withheld before it reaches the user as a recommendation.
- [ ] Repeated weather work produces insufficient evidence delta and triggers a bounded redirect.
- [ ] The home-systems specialist activates the appropriate skill and finds the thermostat event.
- [ ] A source-challenge step checks the claim before synthesis.
- [ ] The final proposal distinguishes supported conclusions, unknowns, and next actions.
- [ ] Human confirmation is required before scheduling or another consequential effect.
- [ ] State and event replay remain correct after reconnect and runtime reconstruction.
- [ ] The same architecture can compile and run the Car Purchase pack without changing the core runtime.
- [ ] A typed case extension can add a new concern without changing the immutable pack hash.

## Judging-criteria evidence

### Technological Implementation

- [ ] The repository and video prove non-trivial use of Strands features in the working run.
- [ ] Automated tests causally prove steering, skill switching, handoffs, GoalLoop, persistence, and intervention behavior.
- [ ] The live Railway demo works and strengthens the technical proof, even though it is optional.
- [ ] AgentCore deployment and trace correlation work and are documented if credentials permit; otherwise the submission states the exact limitation.

### Design

- [ ] The narrow right-pane experience is calm, coherent, accessible, and legible throughout the run.
- [ ] Activity summaries reveal meaningful transitions without flooding the user.
- [ ] Waiting, blocked, stale, withheld, confirmation, restored, and failure states have clear UI treatment.
- [ ] The Runtime Inspector provides detailed debugging without becoming the primary consumer experience.

### Potential Impact

- [ ] The submission makes the burden of repeated household bill investigation concrete.
- [ ] The demo proves reduced vigilance by running background evidence gathering before interruption.
- [ ] The final interruption presents one bounded, evidence-backed decision for the household.

### Creativity and Originality

- [ ] The submission explains the unusual goal: earning the right to answer rather than merely finishing quickly.
- [ ] The demo proves supervised adaptation across skills, specialists, evidence, and authority.
- [ ] Decision Packs demonstrate reusable governance without reducing each case to a fixed schema.

### Presentation

- [ ] The video follows one causal story and is understandable without reading the repository first.
- [ ] On-screen text is readable at normal playback size.
- [ ] The narration connects every technical feature to a visible user benefit.
- [ ] The ending restates the distinctive claim and shows the working product.

## Optional scoring and bonus opportunities

- [ ] Optional — the Railway live demo URL is included and verified from an incognito window.
- [ ] Optional — Amazon Bedrock AgentCore hosts the verified Strands execution path.
- [ ] Optional — AgentCore/CloudWatch traces correlate with the Runtime Inspector using a documented run identifier.
- [ ] Optional — a Builder post is published on `builder.aws.com` before the deadline.
- [ ] Optional — the live Devpost rules and field instructions are rechecked for the required Builder post hashtag because the fetched field description appears unrelated.
- [ ] Optional — the final compliant Builder post URL is added to field `27737`.

## Release verification

- [ ] `pnpm test:scenario` passes against the actual Strands-backed Energy hero flow.
- [ ] `pnpm test:e2e` passes the Energy journey at every required narrow right-pane viewport.
- [ ] The Playwright visual stage passes with reviewed screenshots for the complete Energy hero journey.
- [ ] Snapshot reconstruction, idempotency, duplicate effect, and ordered replay tests pass.
- [ ] `pnpm test:submission` validates every machine-checkable Agents for Humans artifact and field.
- [ ] `pnpm verify:release` passes against the final public repository and live URL.
- [ ] Final URLs, commit SHA, Builder ID verification status, diagram path/hash/size, video duration, AgentCore status, and report path are recorded in release metadata.

## Submit and preserve

- [ ] A human compares the final Devpost form with every checkbox above.
- [ ] The submission is completed before September 14, 2026 at 5:00 p.m. PT / 8:00 p.m. ET.
- [ ] Devpost shows the project as submitted rather than saved as a draft.
- [ ] Submission confirmation is saved privately.
- [ ] The submitted repository commit receives an immutable release tag.
- [ ] The repository, live site, form, and video are frozen after the deadline unless the official rules permit a change.
