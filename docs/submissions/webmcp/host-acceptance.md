# Real-host acceptance

The canonical plan's Task 10 asks for a session in a fresh, real ChatGPT or WebMCP-enabled Chrome host, recording tool discovery, activation, both-direction state control, reconnect/resume, case and run IDs, transcript, screenshots, and outcome.

**Status: not performed.** This is an external action requiring a person with a WebMCP-capable host signed into their own account. No test in this repository can stand in for it, and nothing below should be read as a substitute. `claim-evidence-matrix.md` row E6 records the same fact where the claims live.

What follows is everything that *can* be established without that host, so the session itself is short and its failure modes are known in advance.

---

## What has been verified without a host

| Check | Where | Result |
|---|---|---|
| The tool catalog is exactly 26 tools with pinned names, descriptions, and JSON schemas | `apps/web/src/model-context/webmcp-contract.test.ts` | Passing |
| Global tools register on mount and case-scoped tools register only once a case exists | same | Passing |
| Every registration is released on unmount, with no leak across case switches | same | Passing |
| No tool in the catalog can approve a consequential decision | same — `reviewProposal` is absent from the catalog | Passing |
| A tool call and the equivalent UI control run the same command implementation | `apps/agent/src/services/command-service.ts`, one handler per command | Passing |
| The pane degrades honestly when no WebMCP host is present | `WebMcpStatus`; visible copy: "WebMCP unavailable in this browser. Every action here is still available through the visible controls on this page." | Visible in every screenshot baseline |

## The session script, when it is run

Fill this table in during the session. Leave a row blank rather than inferring it.

| # | Step | What to record | Result |
|---|---|---|---|
| 1 | Open the live URL in the host, signed out | Whether the page loads and the pane renders | |
| 2 | Ask the host what tools this page offers | The tool names the host discovered | |
| 3 | Start the vehicle case from the launcher | `caseId` | |
| 4 | Ask the host to read the case | Whether `sift_get_case_context` returns the case actually on screen | |
| 5 | Answer a discovery question **in the pane** | Whether the host's next read reflects it | |
| 6 | Ask the host to record a discovery answer | Whether the pane updates without a reload, and that it lands as a *proposal* rather than a confirmation | |
| 7 | Press Keep in the pane | Whether the host can read the disposition back | |
| 8 | Ask the host to confirm the shortlist | **Expected: it cannot.** Record exactly how the refusal surfaces | |
| 9 | Ask the host to request an investigation | `runId` | |
| 10 | Reload the page mid-run | Whether case state, plan version, and activity resume from the server | |
| 11 | Disconnect and reconnect the host | Whether tools re-register and the case is still addressable | |
| 12 | Screenshots | One per step 3, 6, 8, 10 | |
| 13 | Transcript | Full host transcript, attached | |

## Known failure modes to watch for

- **Tool discovery reporting fewer than 26 tools.** Case-scoped tools register only after a case exists; steps 2 and 4 should be compared, not conflated.
- **A stale `expectedSequence`.** The pane tracks the server's `acceptedSequence` and retries once; a host acting in the same moment as a person can still lose a race, and the visible result is a conflict message rather than silent loss. That is intended behavior, not a defect — record it if it appears.
- **Step 8 succeeding.** If any host manages to confirm a shortlist, that is a release blocker, not a note.
