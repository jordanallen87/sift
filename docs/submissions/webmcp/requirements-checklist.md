# The WebMCP Challenge — Requirements Checklist

Status: no submission has been sent. Every unchecked required or conditional item is an open release gate.

Official data was fetched from the authenticated Devpost integration on 2026-08-27 UTC. Recheck the [challenge](https://webmcp.devpost.com/), [rules](https://webmcp.devpost.com/rules), and live form before submission. Complete the [shared release checklist](../shared-release-checklist.md) as well.

Deadline: September 3, 2026 at 1:00 p.m. PT / 4:00 p.m. ET (`2026-09-03T20:00:00Z`).

## Eligibility and registration — human verification required

- [ ] The submitter is registered for The WebMCP Challenge.
- [ ] The submitter and every team member are above the legal age of majority in their country of residence.
- [ ] No participant resides in an excluded country or territory listed by the current official rules.
- [ ] The submitter has reviewed the complete official rules, not only the eligibility summary.
- [ ] Submitter type is chosen truthfully as Individual, Team of Individuals, or Organization.
- [ ] Country or countries of residence are entered truthfully.
- [ ] Organization name is supplied only if applicable.
- [ ] Team membership and invitations are complete before submission.

## Application qualification

- [ ] Pax is submitted as `New` only if the final repository history supports that answer.
- [ ] If Pax is submitted as `Existing`, the form precisely describes meaningful WebMCP work completed during the official submission period beginning August 25, 2026 at 12:00 p.m. PT.
- [ ] The submitted implementation is a working web application, not a concept, mockup, or video-only prototype.
- [ ] The use case demonstrates people and agents interacting, collaborating, or creating together through the live web application.
- [ ] The public implementation contains a real `document.modelContext.registerTool(...)` integration.
- [ ] Every claimed WebMCP tool is registered by the deployed page and has a bounded, typed contract.
- [ ] The page works in ChatGPT's in-app browser or a compatible Google Chrome configuration with WebMCP enabled.

## Required live application

- [ ] A judge-accessible public live URL is available.
- [ ] The URL loads without private-network access, local setup, or participant credentials.
- [ ] Any unavoidable credentials or setup steps are supplied in the testing instructions.
- [ ] The deployed URL maps to the final public repository commit.
- [ ] The live right-pane UI is usable at the target ChatGPT browser-pane width.
- [ ] The live demo can be reset to a deterministic starting state.
- [ ] The URL and full hero flow are verified in an incognito window.

## Required public repository

- [ ] A public GitHub, GitLab, or Bitbucket URL is supplied.
- [ ] The repository includes complete source, assets, setup instructions, and run instructions.
- [ ] An open-source license is present at the repository root and visible at the top of the repository page.
- [ ] The repository visibly contains the WebMCP registration and tool implementations.
- [ ] The README explains how to enable and test WebMCP in each supported client.
- [ ] A clean clone can install, build, test, and run using the documented commands.
- [ ] Repository visibility and license are verified while signed out.

## Required text description

- [ ] The description states what Pax does and who it serves.
- [ ] The description explains why the car-purchase use case fits WebMCP.
- [ ] The description explains how WebMCP improves the experience compared with ordinary chat or visual browser automation.
- [ ] The description explains what the person and agent can do together that was difficult before.
- [ ] The description explains how WebMCP is implemented in the deployed page.
- [ ] The description names the shared-attention, typed-mutation, source-intake, investigation-request, and run-correlation capabilities actually demonstrated.
- [ ] The description does not claim an untested client, integration, or deployment.

## Required public demo video

- [ ] The video is published publicly on YouTube.
- [ ] The final runtime is strictly under three minutes.
- [ ] The video includes clear spoken audio explaining Pax and its use of WebMCP.
- [ ] The working deployed product appears within the first 15 seconds.
- [ ] The video shows live WebMCP-driven interaction rather than only direct UI clicks.
- [ ] The video removes setup, loading, dead time, and irrelevant architecture detail.
- [ ] The video shows the selected vehicle shared with ChatGPT.
- [ ] The video shows a previously unspecified household concern added or reweighted through WebMCP.
- [ ] The video shows that command redirecting an active Strands investigation.
- [ ] The video shows the visible case state, evidence obligations, and recommendation changing causally.
- [ ] The video shows an honest unknown and a test-drive question rather than fabricated subjective evidence.
- [ ] The video proves that final shortlist approval remains human-only.
- [ ] The video briefly shows correlated Runtime Inspector or automated verification evidence.
- [ ] The public YouTube link, audio, captions, resolution, and playback are verified while signed out.

## Devpost project fields

- [ ] Global project title is complete and consistent with the repository and video.
- [ ] Global project tagline is complete.
- [ ] Global project description is complete.
- [ ] Global Built With list is truthful and complete.
- [ ] Global public video URL points to the final under-three-minute YouTube video.
- [ ] Field `28249` — Submitter Type is answered truthfully.
- [ ] Field `28250` — Country of residence for the submitter and team is answered truthfully.
- [ ] Field `28251` — Organization name is completed if applicable.
- [ ] Field `28252` — App Status is answered truthfully as New or Existing.
- [ ] Field `28253` — Existing-app changes are described if and only if required by the App Status answer.
- [ ] Field `28254` — Judge-accessible live URL is the final verified deployment.
- [ ] Field `28255` — Testing instructions or credentials are supplied when useful, even though optional.
- [ ] Field `28256` — Public repository URL is the final verified repository.
- [ ] Field `28257` — Agents or clients used to test WebMCP lists only completed tests and exact versions/configurations.
- [ ] Field `28258` — AI tools used while building lists only tools actually used.
- [ ] Field `28259` — Learning level is selected personally as None, Moderate, or Significant.
- [ ] Field `28260` — Career-reusable AI value is selected personally as Yes or No.

## WebMCP functionality proof

- [ ] `pax_get_case_context` returns the exact current page selection and case identity.
- [ ] Criteria and custom concerns can be added through typed WebMCP commands without changing the immutable pack hash.
- [ ] `pax_request_investigation` creates or redirects bounded work and returns a correlated receipt.
- [ ] Duplicate, stale, unauthorized, and malformed WebMCP commands are rejected deterministically.
- [ ] A WebMCP command can steer an already-active backend run and the causal transition is visible in real time.
- [ ] Page UI actions and WebMCP commands converge on the same command/state model.
- [ ] Refresh or connection interruption restores current state and ordered event replay.
- [ ] No registered WebMCP tool can approve the final shortlist or bypass the visible human authority boundary.
- [ ] Tool descriptions reveal only the minimum required case context and do not expose chain-of-thought or secrets.
- [ ] All registered tools pass automated contract and end-to-end tests.

## Judging-criteria evidence

### WebMCP Leverage

- [ ] The demo proves non-trivial use of shared page context, typed commands, and cross-system steering.
- [ ] The repository makes the WebMCP implementation easy for judges to find and understand.
- [ ] The submission explains why direct chat, DOM inference, or ordinary API calls do not provide the same shared-control experience.

### Execution

- [ ] The live product completes the hero journey coherently from selection through human approval.
- [ ] The right-pane UI, real-time events, reconnect behavior, debugging view, and deterministic release suite work in production.
- [ ] Judge testing instructions are short, exact, and reproducible.

### Potential Impact

- [ ] The submission identifies a credible household actively comparing real vehicle candidates and dealer information.
- [ ] The demonstrated workflow addresses changing preferences, conflicting evidence, and subjective unknowns.
- [ ] The outcome is an evidence-backed shortlist and next-action plan rather than generic purchasing advice.

### Creativity and Ambition

- [ ] The submission clearly distinguishes Pax from CRUD tool wrappers and browser macros.
- [ ] The demo proves that WebMCP is a live steering channel into a supervised multi-agent system.
- [ ] The human, ChatGPT, page, and Strands runtime each have a distinct, necessary role.

## Browser and release verification

- [ ] Every registered tool is tested end to end in ChatGPT's in-app browser; if access prevents this, the limitation is stated exactly.
- [ ] Every registered tool is tested in the supported Chrome configuration and the exact version/flag is recorded.
- [ ] `pnpm test:contract` passes the WebMCP tool and authority-boundary contracts against the production-compatible build.
- [ ] `pnpm test:e2e` passes the WebMCP journey at every required narrow right-pane viewport.
- [ ] The Playwright visual stage passes with reviewed screenshots for the complete WebMCP hero journey.
- [ ] `pnpm test:submission` validates every machine-checkable WebMCP artifact and field.
- [ ] `pnpm verify:release` passes against the final public repository and live URL.
- [ ] Final URLs, commit SHA, test clients, browser versions, video duration, and report path are recorded in release metadata.

## Submit and preserve

- [ ] A human compares the final Devpost form with every checkbox above.
- [ ] The submission is completed before September 3, 2026 at 1:00 p.m. PT / 4:00 p.m. ET.
- [ ] Devpost shows the project as submitted rather than saved as a draft.
- [ ] Submission confirmation is saved privately.
- [ ] The submitted repository commit receives an immutable release tag.
- [ ] The repository, live site, form, and video are frozen during judging unless the official rules permit a change.
