# WebMCP demo — narration-led storyline v2

Status: pre-capture draft. This is the approval script and not a claim that a
take has been recorded. Every tool sequence and visible state must be re-run
against the final deployed build before its wording is locked.

## Core claim

Sift is a shared decision environment: ChatGPT can read, configure, and
co-drive the same durable workspace as a person through WebMCP. Sift controls
what is valid, Strands investigates unresolved work, and only the person can
make the consequential decision.

## Timing rule

The narration is the master timeline. Each `Phrase marker` below becomes an
ElevenLabs-aligned frame anchor before effects are rendered. A visual appears
only to prove the claim currently being spoken; no decorative motion runs at
the same time as a proof moment.

## 2:48 target timeline

### 0:00–0:08 — Cold open: a decision already in motion

**Narration**

> “This is Sift. A household decision workspace where ChatGPT can help drive
> the page—not just talk beside it.”

**Visual proof**

Open on the live car case, not a title card. A restrained push-in lands on the
decision hero. `Phrase marker: “drive the page”` spotlights the visible
workspace controls.

**Truth to verify**

The real case title, recommendation state, and workspace controls are legible
without waiting for a load.

### 0:08–0:22 — The system contract

**Narration**

> “One shared case connects the person, ChatGPT through WebMCP, Sift’s
> decision engine, and a supervised Strands team. The model can participate;
> Sift decides what is valid; the person decides what happens.”

**Visual proof**

Use the short animated architecture flow. Reveal Human and ChatGPT first,
then the central durable case, then Sift, then Strands. On `“what is valid”`,
light the validation rail. On `“person decides”`, leave the approval path as
the only highlighted exit.

### 0:22–0:51 — ChatGPT configures the shared workspace

**Narration**

> “Watch the distinction. I ask ChatGPT to show the finalists side by side,
> with just the factors we need for this conversation. It reads the live case,
> switches the shared view, and configures the comparison. It changes what we
> see, not what we care about.”

**Visual proof**

In the WebMCP-capable host, show a prompt such as: *“Show the finalists side
by side. Focus the comparison on cargo, safety, and price.”* The transcript
must visibly show real calls to `sift_get_case_context`, `sift_set_view`, and
`sift_configure_comparison`. The page enters Compare and its rows/options
change in the same capture.

**Phrase markers**

- `“reads the live case”` → host tool chip / result
- `“switches the shared view”` → view transition
- `“configures the comparison”` → comparison columns and rows settle
- `“not what we care about”` → brief on-screen label: “Presentation only”

**Truth to verify**

The exact final tool order may vary, but the recording must show the tool
names and the durable shared view change. Do not claim that presentation calls
invalidate or re-score the recommendation.

### 0:51–1:18 — ChatGPT asks Sift to render the next interaction

**Narration**

> “Then the model needs a judgment that no data source can supply. It asks
> Sift what is still unresolved, and requests the next bounded interaction.
> Sift—not the model—renders it. The person can choose, say none of these, or
> say they are not sure. That answer becomes shared state for the next turn.”

**Visual proof**

Start from a final-build fixture with a valid unresolved discovery topic. The
host must call `sift_get_interaction_context`, then
`sift_request_interaction`. The Sift pane renders the corresponding bounded
interaction. The person visibly chooses an answer or escape hatch. The host
then reads the updated state with `sift_get_case_context`.

**Phrase markers**

- `“what is still unresolved”` → context result / unresolved-question focus
- `“Sift—not the model—renders it”` → interaction appears in the pane
- `“not sure”` → spotlight the escape hatch
- `“shared state”` → state/result confirmation

**Truth to verify**

The interaction must come from a pack-allowed topic and grammar. The model
does not provide arbitrary markup or preselect a human answer.

### 1:18–1:52 — The decision itself changes

**Narration**

> “Now the family changes what matters. Driving comfort moves ahead of fuel
> economy. Then they add something the original car pack never anticipated:
> two dog crates behind the second row. WebMCP reweights the decision and
> defines a typed case-specific concern. The old answer becomes stale because
> it no longer answers the real question.”

**Visual proof**

Show host prompts and real `sift_update_criteria` then
`sift_define_case_attribute` calls. The hero visibly becomes stale or begins
recomputing. Show the concern in the product surface that the final build
actually exposes; never imply that defining it instantly creates a comparison
row if the build does not do so.

### 1:52–2:20 — Strands investigates; Sift preserves the unknown

**Narration**

> “I ask Sift to investigate. Behind the page, its Strands Graph activates the
> relevant specialists and bounded tools. It can update evidence and revise
> the shortlist. But it does not pretend to know whether two physical crates
> fit. That remains an explicit test-drive question—not a made-up score.”

**Visual proof**

The host issues `sift_request_investigation`. The page shows the real run and
revised outcome. The product and/or developer view must visibly show the
post-concern skill/specialist/tool activity and the unresolved crate-fit
limitation.

**Phrase markers**

- `“activates the relevant specialists”` → Run Map/Inspector orchestration
  stage
- `“bounded tools”` → tool-stage count or event
- `“explicit test-drive question”` → limitation / unresolved-question card

### 2:20–2:40 — One causal trace, not a decorative dashboard

**Narration**

> “Here is the same run from the developer side. The WebMCP command enters,
> the Graph and skills activate, tools return evidence, and Sift updates the
> case. This is one causal trail—not a chatbot transcript beside a separate
> application.”

**Visual proof**

Open the real Runtime Inspector / Run Map. Reveal the sequence in order:
WebMCP origin, orchestration, skill activation, tool execution, evidence/state
update. Prefer a concise graphical progression with exact event drill-downs
over scrolling a raw log. If the final Inspector cannot render a claimed datum,
improve it before recording or remove the claim.

### 2:40–2:48 — Human authority and close

**Narration**

> “And when I ask ChatGPT to approve the decision, it cannot. Only the person
> has that control. Sift: a shared decision environment for people and
> agents.”

**Visual proof**

Show the host’s refusal/no approval tool, then the person’s visible approval
control. Land on the final case state with a quiet closing title.

## Capture gates

- A WebMCP-capable host must produce the actual tool calls named above.
- The final deployed product must support the selected unresolved discovery
  fixture; otherwise the interaction segment is rewritten around a real one.
- Every phrase marker must resolve in the generated voice alignment before an
  overlay is rendered.
- The final speech speed remains natural. If runtime is high, shorten copy
  before considering a modest per-request TTS speed increase.
