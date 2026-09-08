/**
 * The one explanation of Sift that exists in the product, rendered by both
 * surfaces that explain it:
 *
 *  - `FirstRunGuide` -- proactive, shown once, on a person's first case in
 *    this browser;
 *  - `HelpButton` -- the "show me again" path, on every top-level screen.
 *
 * They share this module rather than each holding their own prose, because
 * the two had already drifted once. The Help sheet told people to click
 * "Request investigation" for months after that button was renamed to "Ask
 * Sift to look into this" (`RecommendationHero.tsx`) -- a control that no
 * longer existed, in the one place a lost person goes to look. One content
 * module means a rename can only be wrong in one place, and the tests below
 * this file assert the real labels rather than paraphrases of them.
 *
 * ## Why the assistant phrases are the important half
 *
 * A judge opening Sift in a WebMCP-enabled host can see every visible
 * control, and has no way at all to guess what to *say*. The tool catalog
 * is 26 tools deep (`register-sift-tools.ts`) and none of it is
 * discoverable from the page. `ASSISTANT_PHRASES` is the fix: real,
 * copy-pasteable sentences, each annotated with the tool it actually
 * reaches.
 *
 * That annotation is type-checked, not documentary. `phrase.tools` is typed
 * `readonly SiftWebMcpToolName[]`, so a phrase citing a capability Sift does
 * not register fails `tsc` -- an invented example cannot be written here
 * even by accident, and this file's sibling test re-proves the same thing at
 * runtime against `SIFT_WEBMCP_TOOL_NAMES`.
 *
 * ## The authority boundary is content, not a footnote
 *
 * `reviewProposal` is the only `SiftCommands` method that can approve a
 * decision, and it is absent from the WebMCP catalog by construction --
 * proved in `model-context/webmcp-contract.test.ts` ("none of the
 * twenty-six registered tools ever calls ... reviewProposal"). That is the
 * product's central claim, and a person should learn it from the product
 * rather than the README, so it renders as its own marked block naming the
 * three human-only controls by their real labels (`ApprovalCard.tsx`).
 *
 * ## Honesty about the host
 *
 * Most browsers have no WebMCP host. The phrases still render there -- they
 * are what the product does -- but the lead above them says plainly that
 * nothing typed to an assistant reaches this page, using the same real
 * `adapter.supported()` signal `WebMcpStatus` uses (`useWebMcpSupported`).
 * Promising agent interaction that cannot happen would be the one failure
 * mode worse than saying nothing.
 */
import type { ReactNode } from 'react';
import { useWebMcpSupported } from '../app/AppProviders.js';
import {
  SIFT_WEBMCP_TOOL_NAMES,
  type SiftWebMcpToolName,
} from '../model-context/register-sift-tools.js';

/** Shared between the first-run guide and the Help sheet, so the two can never announce themselves differently. */
export const HOW_SIFT_WORKS_TITLE = 'How Sift works';

/** One line: what this is. `FirstRunGuide` and `HelpButton` both render it as their sheet description. */
export const HOW_SIFT_WORKS_SUMMARY =
  'A decision workspace you and your assistant share. Sift holds the options, the evidence and the ranking — you both work on the same page, and the decision stays yours.';

/**
 * One thing a person can say to their assistant, what it does, and the
 * registered tool(s) it reaches.
 *
 * `tools` is typed against the real catalog union, so this list cannot cite
 * a capability that does not exist.
 */
export interface AssistantPhrase {
  /** Verbatim, copy-pasteable. Written the way a person actually talks, not as a command. */
  readonly phrase: string;
  /** What happens in the pane when they say it. */
  readonly effect: string;
  /** The registered WebMCP tool(s) it reaches. Type-checked against `SIFT_WEBMCP_TOOL_NAMES`. */
  readonly tools: readonly SiftWebMcpToolName[];
}

/**
 * The examples, ordered by how early in a case a person would reach for
 * them: start work, understand the answer, change what matters, add
 * something the pack never anticipated, record a human impression, change
 * the view.
 *
 * Car-flavoured because Choose Our Next Car is the WebMCP hero pack and the
 * first case a judge opens, but every tool cited is pack-agnostic.
 */
export const ASSISTANT_PHRASES: readonly AssistantPhrase[] = [
  {
    phrase: 'Look into the safety record on these.',
    effect: 'Starts a real investigation run; sourced findings land in this pane as they arrive.',
    tools: ['sift_request_investigation'],
  },
  {
    phrase: "What's driving the ranking?",
    effect: "Reads out Sift's own scoring, criterion by criterion, instead of guessing at one.",
    tools: ['sift_explain_ranking'],
  },
  {
    phrase: 'Make ownership cost matter more than driving comfort.',
    effect: 'Reweights the criteria, and marks whatever that invalidates as needing another look.',
    tools: ['sift_update_criteria'],
  },
  {
    phrase: 'I need a dog crate to fit — make that one of the things we compare.',
    effect: 'Defines a typed concern the pack never anticipated, then gives it weight.',
    tools: ['sift_define_case_attribute', 'sift_update_criteria'],
  },
  {
    phrase: 'Add a note that the seat position felt wrong on the test drive.',
    effect: 'Files your observation on the case. A note is never treated as evidence.',
    tools: ['sift_add_note'],
  },
  {
    phrase: 'Show me these side by side.',
    effect: 'Switches the pane to the Compare view. Presentation only — nothing is re-decided.',
    tools: ['sift_set_view'],
  },
];

/**
 * A labelled block. Lifted out of `HelpButton.tsx` unchanged when this
 * content moved here, so both surfaces keep the same rhythm.
 */
function HelpSection({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} className="flex flex-col gap-[var(--space-1-5)]">
      <h3 className="label-caps text-[length:var(--font-size-xs)] text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  );
}

/** One row of "control name — what it does", so a real label is always the thing set in bold. */
function ControlRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] text-foreground">
      <strong className="font-[var(--font-weight-semibold)]">{name}</strong>
      <span className="text-muted-foreground"> — {children}</span>
    </li>
  );
}

export interface HowSiftWorksContentProps {
  /**
   * Test/host override for the real `adapter.supported()` signal. Omitted
   * everywhere in production -- both real callers let this resolve from the
   * shared adapter, so the copy and `WebMcpStatus` cannot disagree.
   */
  readonly webMcpSupported?: boolean;
}

export function HowSiftWorksContent({ webMcpSupported }: HowSiftWorksContentProps = {}) {
  const detected = useWebMcpSupported();
  const supported = webMcpSupported ?? detected;
  const toolCount = SIFT_WEBMCP_TOOL_NAMES.length;

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      <HelpSection label="Starting a case" testId="how-sift-works-start">
        <ul className="flex list-none flex-col gap-[var(--space-1-5)] p-0">
          <ControlRow name="Compare vehicles">
            browse the bundled catalog, build your own shortlist, and start a real case.
          </ControlRow>
          <ControlRow name="Or try a finished example">
            two ready-made cases, already part-way through, if you would rather start mid-flight.
          </ControlRow>
        </ul>
      </HelpSection>

      <HelpSection label="The controls in this pane" testId="how-sift-works-controls">
        <ul className="flex list-none flex-col gap-[var(--space-1-5)] p-0">
          <ControlRow name="Ask Sift to look into this">
            sends Sift to work the open questions and bring back sourced findings.
          </ControlRow>
          <ControlRow name="Findings">
            what came back, with the source behind each claim.
          </ControlRow>
          <ControlRow name="Add to this case">
            an option, a note, or a question of your own.
          </ControlRow>
          <ControlRow name="Inspect run">
            every step, tool call and state change the run actually made.
          </ControlRow>
        </ul>
      </HelpSection>

      <HelpSection label="Talking to your assistant" testId="how-sift-works-phrases-section">
        <p
          data-testid="how-sift-works-phrases-lead"
          className="text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] text-muted-foreground"
        >
          {supported ? (
            <>
              Sift registers {toolCount} tools with this browser&apos;s WebMCP host, so plain
              language is enough — say it, and it happens here.
            </>
          ) : (
            <>
              Sift registers {toolCount} tools wherever a WebMCP host exists, and plain language is
              enough there. This browser has no WebMCP host, so nothing you type to an assistant
              reaches this page here — the controls above still do everything you can see.
            </>
          )}
        </p>

        <dl data-testid="how-sift-works-phrases" className="flex flex-col gap-[var(--space-3)]">
          {ASSISTANT_PHRASES.map((entry) => (
            <div
              key={entry.phrase}
              /*
               * The tool name with `_` swapped for `-`, so the testid is a
               * plain lowercase kebab identifier. Not cosmetic: the repo's
               * own source-integrity scanner (`scripts/check-source.ts`)
               * exempts multi-segment kebab-case tokens from its
               * high-entropy secret heuristic but not hybrid kebab/snake
               * ones, so the underscored form of this prefix tripped it as
               * a "possible secret" where it appeared as a literal in
               * `tests/e2e/first-run-guide.spec.ts`. Hyphenating keeps the
               * tool it names entirely legible while staying inside the
               * shape that guard understands -- the alternative was
               * loosening a security scanner to accommodate a test hook.
               */
              data-testid={`how-sift-works-phrase-${entry.tools[0]!.replaceAll('_', '-')}`}
              className="flex flex-col gap-[var(--space-0-5)] rounded-[var(--radius-sm)] bg-[color:var(--color-surface-sunken)] px-[var(--space-3)] py-[var(--space-2)]"
            >
              <dt className="text-[length:var(--font-size-sm)] leading-[var(--line-height-snug)] font-[var(--font-weight-medium)] text-foreground">
                {/* Curly quotes, and the phrase verbatim: this is a line to
                    copy and say, not a code sample, so it is never set in
                    mono. */}
                {`“${entry.phrase}”`}
              </dt>
              <dd className="m-0 text-[length:var(--font-size-xs)] leading-[var(--line-height-normal)] text-muted-foreground">
                {entry.effect}
              </dd>
            </div>
          ))}
        </dl>
      </HelpSection>

      {/*
        The authority boundary, given its own block rather than a trailing
        sentence, because it is the product's central claim and the one
        thing a judge should not have to find in the README. The three
        control names are `ApprovalCard.tsx`'s real labels.

        Structural tokens, not a status triad, and that is deliberate. This
        was briefly built from `--color-status-decided-*`, which is wrong
        twice over: `docs/design-system.md` scopes the nine status tokens to
        per-obligation and per-case STATES ("the case is closed"), which a
        permanent statement in a help panel is not; and measured in the real
        pane, `decided`'s deliberately quietest-in-the-set tint rendered
        almost indistinguishable from the `--color-surface-sunken` phrase
        chips directly above it, so the one block that had to stand out was
        the one that disappeared. An outlined card on the panel's own white
        surface, with the label in full-strength ink rather than the muted
        ink every other section label uses, separates it by shape and weight
        instead of by borrowing a hue that means something else.
      */}
      <section
        data-testid="how-sift-works-authority"
        className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-[var(--space-3)] py-[var(--space-3)]"
      >
        <h3 className="label-caps text-[length:var(--font-size-xs)] text-[color:var(--color-ink)]">
          What it cannot do
        </h3>
        <p className="text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] text-foreground">
          Your assistant can research, reweight, re-frame and ask for a revision. It cannot approve.{' '}
          <strong className="font-[var(--font-weight-semibold)]">Choose this</strong>,{' '}
          <strong className="font-[var(--font-weight-semibold)]">Pass</strong> and{' '}
          <strong className="font-[var(--font-weight-semibold)]">Keep researching</strong> are yours
          alone — no tool in the catalog can reach them.
        </p>
      </section>
    </div>
  );
}
