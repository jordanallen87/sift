# Sift Shared Hackathon Release Checklist

Status: no submission has been sent. Every unchecked item is an open release gate unless it is explicitly labeled optional.

Use this checklist once for the shared Sift release, then complete the competition-specific checklist for each Devpost submission:

- [The WebMCP Challenge requirements](./webmcp/requirements-checklist.md)
- [Agents for Humans requirements](./agents-for-humans/requirements-checklist.md)

The official rules and live Devpost forms prevail if they change. Refresh both competition packets immediately before submission.

## How to verify this checklist

- [ ] Assign one release owner who has authority to make both submissions.
- [ ] Record every machine-verifiable result in `docs/submissions/release-metadata.json`.
- [ ] Record the final release commit SHA and UTC verification time.
- [ ] Require `pnpm verify:release` to fail when a machine-verifiable required value or artifact is absent.
- [ ] Keep personal, legal, eligibility, learning, and attestation answers human-verified; automation must never invent or silently check them.
- [ ] Save the final verification report at `artifacts/verification/latest/report.json`.
- [ ] Preserve screenshots, traces, and videos needed to reproduce every claim made in either submission.

## Human eligibility and authority

- [ ] The submitter has registered for both competitions through the correct Devpost account.
- [ ] The submitter has read the current official rules for both competitions.
- [ ] Every participant is above the legal age of majority in their country of residence.
- [ ] Every participant's country and territory are eligible for each competition entered.
- [ ] Team membership, organization status, and country answers are truthful and consistent across the form and project page.
- [ ] Every team invitation is accepted before submission.
- [ ] The submitter has authority to publish the source, assets, data, screenshots, trademarks, and demo footage.
- [ ] No confidential, personal, licensed, or third-party material is published without permission.

## Product truth and scope

- [ ] The deployed product is functional and is not represented by mockups, prerecorded UI, or unsupported claims.
- [ ] Fixture-mode behavior is visibly distinguishable from live integrations.
- [ ] Claims about ChatGPT, Chrome, WebMCP, Strands, AWS, AgentCore, Railway, and observability match completed tests.
- [ ] Any unavailable integration or credential blocker is described honestly.
- [ ] Human-only actions cannot be performed through WebMCP, model tools, hidden APIs, or replayed commands.
- [ ] The public demo does not expose secrets, private data, chain-of-thought, unsafe internal prompts, or credentials.

## Public repository

- [ ] The final repository is public and accessible without authentication in an incognito window.
- [ ] The repository default branch points at the intended release commit.
- [ ] A permitted open-source license is visible at the top level and in the repository About area when supported.
- [ ] The README includes product purpose, audience, screenshots, architecture, setup, environment variables, run commands, test commands, deployment, limitations, and troubleshooting links.
- [ ] All source and required assets are committed; no local-only file is required for judge setup.
- [ ] `.env.example` documents every supported environment variable without real credentials.
- [ ] Dependency lockfiles are committed and installation is reproducible.
- [ ] Repository history and documentation support every `New` or `Existing` application claim.
- [ ] Secret scanning passes on the final commit and relevant history.
- [ ] All repository links work from the rendered public README.

## Public deployment

- [ ] The Railway production deployment is healthy at the final release commit.
- [ ] The public URL is reachable without organizer-specific authentication.
- [ ] The right-pane layout works at the exact viewport used in the demo and supported browser tests.
- [ ] A fresh user can launch both deterministic demo scenarios.
- [ ] Real-time events stream in order and reconnect/replay restores the visible state.
- [ ] Persistent state survives the expected Railway service restart path.
- [ ] Error, blocked, waiting, and recovery states are understandable to a judge.
- [ ] The deployed build displays a nonintrusive release identifier that maps to the final commit.
- [ ] The live URL passes an incognito smoke test after the last deployment.
- [ ] A real-host acceptance session has been run and recorded in [`webmcp/host-acceptance.md`](./webmcp/host-acceptance.md). Until then that file states plainly that it has not, and step 8 of its script — a host attempting to confirm a shortlist — is a release blocker if it ever succeeds.

## Automated verification

- [ ] Unit, contract, integration, and end-to-end suites pass from a clean install.
- [ ] Playwright verifies both hero journeys against deterministic fixtures.
- [ ] Playwright verifies the narrow right-pane layout at every supported viewport.
- [ ] Playwright captures and compares required visual evidence with no unexplained differences.
- [ ] WebMCP conformance tests exercise every registered tool and prove the human-only approval boundary.
- [ ] Strands scenario tests prove steering, skill activation, specialist handoff, draft withholding, confirmation, persistence, and observability.
- [ ] Reconnect, idempotency, duplicate command, stale command, and out-of-order event tests pass.
- [ ] The release suite checks URLs, repository visibility, license, required files, artifact sizes, video durations, and release metadata.
- [ ] The final verification report clearly separates passing tests, waived checks, external blockers, and human attestations.
- [ ] There are no skipped, focused-only, or quarantined tests affecting a submission claim.
- [ ] `pnpm test:persona` passes all three personas' hard gates, and its `not_evaluated` list is read rather than skimmed — a gate that could not be checked is not a gate that passed.
- [ ] Every claim in the submission copy appears in [`webmcp/claim-evidence-matrix.md`](./webmcp/claim-evidence-matrix.md) with an implementation, a proof, and a limitation. A claim with no row is a claim we do not make.
- [ ] The matrix's "claims we deliberately do not make" section has been re-read against the current submission text, so nothing crept back in.

## Shared presentation assets

- [ ] Final product name and capitalization are consistent everywhere.
- [ ] Final title, tagline, short description, long description, and Built With list are reviewed.
- [ ] Screenshots show real product state at legible scale and do not reveal private information.
- [ ] The architecture diagram matches the implemented runtime and deployment.
- [ ] The diagram distinguishes browser/WebMCP, Railway, deterministic governance, Strands, storage, telemetry, AWS services, and human authority.
- [ ] Both videos use the final deployed UI and contain clear spoken audio.
- [ ] Captions are accurate and readable.
- [ ] Every claim in the narration can be traced to code, a passing test, a runtime event, or a clearly labeled design choice.
- [ ] The videos begin with the working product rather than slides or setup.
- [ ] Public video links work while signed out.

## Final release review

- [ ] `pnpm verify:release` passes against the final public deployment and repository.
- [ ] A second reviewer follows the published testing instructions from a clean browser session.
- [ ] A second reviewer checks spelling, links, form answers, video visibility, audio, captions, and artifact uploads.
- [ ] The release owner compares every Devpost answer with this checklist before pressing Submit.
- [ ] Both submissions show a completed/submitted state rather than a saved draft.
- [ ] Submission confirmation pages or emails are saved privately.
- [ ] The final submitted values, artifact hashes, URLs, and timestamps are recorded in release metadata.

## Post-deadline preservation

- [ ] After each deadline, freeze that submission's repository state, production deployment, Devpost form, and video until organizer rules permit changes.
- [ ] Preserve the submitted commit with an immutable tag.
- [ ] Preserve final verification artifacts and architecture exports.
- [ ] Monitor the public URL without changing submitted behavior.
- [ ] Keep organizer communications and requests for clarification with the release record.
