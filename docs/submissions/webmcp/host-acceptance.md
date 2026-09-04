# Real-host acceptance

The canonical plan's Task 10 asks for a session in a real ChatGPT or WebMCP-enabled Chrome host, recording tool discovery, activation, both-direction state control, reconnect/resume, case and run IDs, transcript, screenshots, and outcome.

**Status: performed, automated, and passing — with two named limits.** This page previously read "not performed", on the reasoning that no WebMCP host could be driven. That stopped being true: Chrome 152 ships WebMCP natively and exposes a `WebMCP` CDP domain, so the session is now a repeatable gate rather than a transcript. See ADR 0013.

```
SIFT_HOST_URL=https://sift-hackathon-production.up.railway.app pnpm test:host
```

## The session, as it actually runs

Fourteen checks, all passing against the live public deployment on 2026-09-02. Evidence, screenshots, and the full host transcript land in `artifacts/host-acceptance/<runId>/`.

| # | Check | Result |
|---|---|---|
| 1 | `document.modelContext` with `registerTool()` is present | Real host confirmed |
| 2 | Discovery with no case: exactly the 3 global tools | `sift_get_case_context`, `sift_get_interaction_context`, `sift_list_packs` |
| 3 | Tool JSON schemas reach the host | 3/3 carried an `inputSchema` |
| 4 | A read tool returns real data through the host | `sift_list_packs` → 2 packs |
| 5 | Discovery once a case exists | 26 tools registered |
| 6 | The host reads the case that is on screen | `caseId` + `eventSequence` |
| 7 | A person clicks in the pane; the host's next read reflects it | `eventSequence` 12 → 13 |
| 8 | A write with no `expectedSequence` is refused | Rejected by schema validation |
| 9 | The host writes; the pane renders it without a reload | The note appeared |
| 10 | No tool can approve a consequential decision | Catalog exposes none |
| 11 | The host starts an investigation and reads the outcome | Recommendation present |
| 12 | Reload mid-case | Same `caseId`, state resumed |
| 13 | Tools re-register after reload | 26 |
| 14 | Host disconnect and reconnect | 26 re-announced |

Check 8 is the shared-control property made mechanical rather than promised: every write tool requires an `expectedSequence`, so a host physically cannot change a case it has not read, and a host acting in the same moment as a person loses the race visibly instead of silently.

## What this does not prove

Both limits are written into every `report.json`, so no reader of the artifact can mistake one for the other.

1. **This is Chrome, not ChatGPT.** A page cannot tell one WebMCP host from another, so the page-side contract proven here is the contract any host exercises — but a claim naming a product needs a session in that product.
2. **No model chose anything.** The script picks every call. It proves the tools are callable, correctly scoped, and correctly refused; it does not prove a model discovers them, sequences them sensibly, or reads their descriptions the way a person would want.

## What still needs a person

Exactly the two items above, and nothing else. The mechanical session that used to require a human transcriptionist is automated; what remains is a session in a specific assistant, watching an actual model work the catalog unaided.

| # | Step | What to record | Result |
|---|---|---|---|
| 1 | Open the live URL in that product | Whether the page loads and the pane renders | |
| 2 | Ask it what tools this page offers | The tool names it discovered, and whether it found them unprompted | |
| 3 | Ask it to work the case in its own words | Which tools it chose, in what order, and whether its reading of the descriptions matched intent | |
| 4 | Ask it to confirm the shortlist | **Expected: it cannot.** Record exactly how the refusal surfaces to a person | |
| 5 | Screenshots and transcript | Attached | |

## Known failure modes to watch for

- **Tool discovery reporting fewer than 26 tools.** Case-scoped tools register only after a case exists; the no-case and case-open counts are different facts and should be compared, not conflated.
- **A stale `expectedSequence`.** The pane tracks the server's `acceptedSequence` and retries once; a host acting simultaneously can still lose a race, and the visible result is a conflict message rather than silent loss. Intended behavior — record it if it appears.
- **Step 4 succeeding.** If any host manages to confirm a shortlist, that is a release blocker, not a note.
- **`activeRun.runId` reported as `(never sampled in flight)`.** Expected on the fixture run, which resolves faster than a one-second poll. The harness still proves the host read the finished recommendation; it does not claim to have watched the work in progress.
