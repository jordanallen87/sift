/**
 * The case's reference library: everything the case has collected, browsable
 * and organised by tag.
 *
 * ## What this surface is for
 *
 * The project owner's framing, this session: "This is essentially just a
 * library of reference material... research papers, blogs, and any other
 * detail that might be relevant to the case," with tagging so it can be
 * organised in the UI. It sits inside the larger thesis that the
 * conversation is the primary interface and Sift is where the model stores
 * durable context and memory -- this component is that memory made
 * browsable, so a person can see what has accumulated without asking for it
 * to be recited back.
 *
 * ## Reference versus evidence -- the distinction this exists to make legible
 *
 * Both are `Source` records (`packages/contracts/src/case.ts`). The
 * difference is what has been drawn FROM one:
 *
 *  - a source nothing cites is a **reference** -- kept because it is
 *    relevant to the case;
 *  - a source some `Claim.sourceIds` or `EvidenceLink.sourceId` names is
 *    **evidence** -- it answers a specific open question.
 *
 * `SubmitSourceInputSchema` deliberately allows an empty `claims` array and
 * an absent `obligationId` precisely so the first kind can exist. So this
 * component labels the two and stops there: a reference is not an
 * incomplete piece of evidence, it is a different and equally legitimate
 * thing, and nothing here dims it, sorts it lower, or captions it as
 * missing something.
 *
 * That classification is READ from the case's own canonical `claims` and
 * `evidenceLinks` -- it is never inferred from the `Source` alone, which
 * carries no linkage of its own. Both arrays are required props for exactly
 * that reason: an unwired caller would silently label every evidence source
 * a "Reference", which is a false claim about the case rather than a missing
 * feature.
 *
 * ## Honesty rules this file follows
 *
 * Every field renders only when the record actually carries it. An absent
 * `publisher` or `publishedAt` renders as ABSENT -- never "Unknown
 * publisher", never a guessed date. `verification` and `origin` are shown as
 * they are, including `rejected` and including `agent_discovered`: "added by
 * Sift while researching" is a reassuring, useful thing for a person to see,
 * not something to bury.
 *
 * `summary` and `excerpt` are kept visually and verbally distinct because
 * conflating them would misattribute: `summary` is the SUBMITTER's own
 * account of why the reference matters, `excerpt` is a quotation FROM the
 * source, rendered as a real `<blockquote>` with a "Quoted from ..." caption.
 * A `summary` is rendered through `MarkdownText` only when the record's own
 * `summaryFormat` says `'markdown'` -- never on a guess.
 *
 * ## Purely presentational
 *
 * No context, no fetching, no command calls -- like every other leaf in this
 * directory. The one piece of local state is which tags the reader has
 * pressed, which is ephemeral view state: it narrows what is VISIBLE and can
 * never change what the case has recorded, append a `CaseEvent`, or advance
 * `eventSequence` (change-set §54 / ADR 0005 decision 1, the same rule
 * `FilterSheet`/`FilterBar` follow for options).
 */
import { useMemo, useState } from 'react';
import type {
  Claim,
  EvidenceLink,
  Source,
  SourceOrigin,
  SourceVerification,
} from '@sift/contracts';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';
import { MarkdownText } from './MarkdownText.js';
import type { FacetOption } from './workspace-filters.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export interface ReferenceLibraryProps {
  /** `CaseState.sources` -- every source the case has collected, reference and evidence alike. */
  sources: Source[];
  /** `CaseState.claims`. Read ONLY to tell a reference from evidence; never mutated. Required, not optional: see this file's header comment. */
  claims: Claim[];
  /** `CaseState.evidenceLinks`. Read ONLY to tell a reference from evidence; never mutated. */
  evidenceLinks: EvidenceLink[];
}

/**
 * Wording chosen to be true of every record that can carry the value, not
 * only of the common case.
 *
 * `user_submitted` is the origin `submitSource` stamps on EVERY submission
 * through the shared command path -- a person using a visible control and
 * ChatGPT calling `sift_submit_source` both land here (that tool's own
 * description: "discovered by the user or ChatGPT"). "Added by you" alone
 * would therefore be false half the time, which is exactly the quiet
 * fabrication this product's evidence model exists to prevent.
 */
const ORIGIN_LABEL: Record<SourceOrigin, string> = {
  fixture: 'Included with the case',
  user_submitted: 'Added by you or ChatGPT',
  agent_discovered: 'Added by Sift while researching',
};

/**
 * `unverified` reads as "Not verified" rather than "Not yet verified": the
 * latter promises a verification pass that may never be scheduled for this
 * source. Stating the current fact and nothing more is the honest option.
 */
const VERIFICATION_META: Record<SourceVerification, { label: string; tone: StatusTone }> = {
  unverified: { label: 'Not verified', tone: 'open' },
  challenged: { label: 'Challenged', tone: 'accepted-uncertainty' },
  verified: { label: 'Verified', tone: 'satisfied' },
  rejected: { label: 'Rejected', tone: 'blocked' },
};

/**
 * The case-insensitive identity two tags share, matching exactly the rule
 * `command-service.ts`'s `normalizeSourceTags` uses when it de-duplicates
 * within one submission. Applying the same rule on the read side is what
 * keeps "EV" and "ev" from becoming two separate shelves in a library whose
 * entire purpose is grouping -- and, because the FIRST casing seen wins for
 * display, neither label is rewritten into a canonical form nobody typed.
 */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * The tags actually present across `sources`, each with how many sources
 * carry it -- the same derivation `workspace-filters.ts`'s `buildFacetOptions`
 * performs for option attributes, and the same ordering (count descending,
 * then alphabetically). Never a hard-coded vocabulary: a reference library
 * exists to collect material nobody anticipated, so the shelves can only be
 * read off the shelved items.
 *
 * Counts are over the WHOLE library, not the currently-filtered subset, so
 * "Reliability (2)" always means the same checkable thing -- two of this
 * case's sources carry that tag -- regardless of what else is pressed.
 */
function buildTagFacets(sources: Source[]): FacetOption[] {
  const byKey = new Map<string, FacetOption>();
  for (const source of sources) {
    // One source counts once per distinct tag even if it somehow carries the
    // same label twice: a facet count is "how many sources", not "how many
    // labels".
    const seenInSource = new Set<string>();
    for (const tag of source.tags ?? []) {
      const key = tagKey(tag);
      if (key === '' || seenInSource.has(key)) continue;
      seenInSource.add(key);
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, { value: tag.trim(), count: 1 });
      } else {
        existing.count += 1;
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function sourceHasEveryTag(source: Source, selectedKeys: string[]): boolean {
  if (selectedKeys.length === 0) return true;
  const keys = new Set((source.tags ?? []).map(tagKey));
  return selectedKeys.every((key) => keys.has(key));
}

/** `undefined` for an ISO string a browser cannot parse, so a bad timestamp is omitted rather than rendered as "Invalid Date". */
function formatDate(iso: string): string | undefined {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString();
}

function Chip({ tone, children }: { tone: StatusTone; children: string }) {
  const meta = STATUS_TONE_META[tone];
  return (
    <Badge
      className="label-caps max-w-full gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)] whitespace-normal"
      style={{ color: meta.ink, backgroundColor: meta.bg }}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {children}
    </Badge>
  );
}

function ReferenceEntry({ source, isEvidence }: { source: Source; isEvidence: boolean }) {
  const verification = VERIFICATION_META[source.verification];
  const publishedOn = source.publishedAt === undefined ? undefined : formatDate(source.publishedAt);
  const retrievedOn = formatDate(source.retrievedAt);
  const tags = (source.tags ?? []).filter((tag) => tag.trim() !== '');

  return (
    <li
      data-testid={`reference-library-entry-${source.id}`}
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-card p-[var(--space-3)]"
    >
      <div className="flex flex-wrap items-center gap-[var(--space-1-5)]">
        {/*
         * Deliberately the same neutral outline treatment for both words.
         * Colouring "Evidence" and greying "Reference" would rank them, and
         * a reference is not a lesser record -- see this file's header.
         */}
        <Badge
          data-testid={`reference-library-entry-kind-${source.id}`}
          variant="outline"
          className="label-caps rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)] text-[var(--color-ink-secondary)]"
        >
          {isEvidence ? 'Evidence' : 'Reference'}
        </Badge>
        <span
          data-testid={`reference-library-entry-verification-${source.id}`}
          className="inline-flex max-w-full"
        >
          <Chip tone={verification.tone}>{verification.label}</Chip>
        </span>
      </div>

      {/*
       * `break-words` on the title and `break-all` on the URL are the
       * load-bearing half of this component's 390px behaviour: a long
       * unbroken URL is the one string here that has no natural break
       * opportunity at all, and this project has already shipped a label
       * truncated to an unreadable stub twice. Nothing here truncates.
       */}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`reference-library-entry-link-${source.id}`}
        className="flex min-w-0 flex-col gap-[var(--space-0-5)] text-[var(--color-brand)] underline underline-offset-2"
      >
        <span className="text-[length:var(--font-size-base)] font-[var(--font-weight-medium)] break-words">
          {source.title}
        </span>
        <span className="text-[length:var(--font-size-xs)] break-all text-[var(--color-ink-muted)] no-underline">
          {source.url}
        </span>
      </a>

      {source.publisher !== undefined ? (
        <p
          data-testid={`reference-library-entry-publisher-${source.id}`}
          className="text-[length:var(--font-size-sm)] break-words text-[var(--color-ink-secondary)]"
        >
          {source.publisher}
        </p>
      ) : null}

      <p
        data-testid={`reference-library-entry-dates-${source.id}`}
        className="flex flex-wrap gap-x-[var(--space-3)] gap-y-[var(--space-0-5)] text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
      >
        {publishedOn !== undefined ? (
          <span>
            {'Published '}
            <time dateTime={source.publishedAt}>{publishedOn}</time>
          </span>
        ) : null}
        {retrievedOn !== undefined ? (
          <span>
            {'Retrieved '}
            <time dateTime={source.retrievedAt}>{retrievedOn}</time>
          </span>
        ) : null}
        <span data-testid={`reference-library-entry-origin-${source.id}`}>
          {ORIGIN_LABEL[source.origin]}
        </span>
      </p>

      {/*
       * The submitter's OWN words about why this reference matters -- never
       * presented as the source speaking.
       *
       * Rendered as markdown ONLY when the record itself says so. A summary
       * with no declared `summaryFormat` is plain text and stays literal:
       * guessing that stray asterisks were meant as emphasis would silently
       * rewrite what somebody wrote. The plain branch keeps
       * `whitespace-pre-wrap` so a written summary's own paragraph breaks
       * survive; `MarkdownText` handles block structure itself.
       */}
      {source.summary !== undefined ? (
        source.summaryFormat === 'markdown' ? (
          <MarkdownText
            data-testid={`reference-library-entry-summary-${source.id}`}
            className="text-[length:var(--font-size-sm)] break-words text-[var(--color-ink)]"
          >
            {source.summary}
          </MarkdownText>
        ) : (
          <p
            data-testid={`reference-library-entry-summary-${source.id}`}
            className="text-[length:var(--font-size-sm)] break-words whitespace-pre-wrap text-[var(--color-ink)]"
          >
            {source.summary}
          </p>
        )
      ) : null}

      {/*
       * A real `<blockquote>` with an explicit attribution line, because the
       * one thing that must never be ambiguous is whether these are the
       * source's words or somebody's words about the source.
       */}
      {source.excerpt !== undefined ? (
        <blockquote
          data-testid={`reference-library-entry-excerpt-${source.id}`}
          cite={source.url}
          className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-sm)] bg-secondary p-[var(--space-2)]"
        >
          <p className="text-[length:var(--font-size-sm)] break-words text-[var(--color-ink)] italic">
            {`“${source.excerpt}”`}
          </p>
          <footer className="text-[length:var(--font-size-xs)] break-words text-[var(--color-ink-muted)] not-italic">
            {`Quoted from ${source.title}`}
          </footer>
        </blockquote>
      ) : null}

      {tags.length > 0 ? (
        <ul
          data-testid={`reference-library-entry-tags-${source.id}`}
          aria-label="Tags"
          className="flex flex-wrap gap-[var(--space-1-5)]"
        >
          {tags.map((tag) => (
            <li key={tag}>
              <Badge
                variant="outline"
                className="max-w-full rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)] break-words whitespace-normal text-[var(--color-ink-secondary)]"
              >
                {tag}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ReferenceLibrary({ sources, claims, evidenceLinks }: ReferenceLibraryProps) {
  // Ephemeral view state only -- see this file's header. Held as the
  // case-insensitive keys rather than the display labels so a selection
  // survives two sources spelling the same tag differently.
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([]);

  const facets = useMemo(() => buildTagFacets(sources), [sources]);

  // A tag can disappear from the library entirely (a different case loads, a
  // source is replaced). Honouring a selection whose tag no longer exists
  // would strand the reader on a permanently empty list with no visible
  // reason, so the selection is narrowed to what is actually still on the
  // shelves before anything is filtered by it.
  const availableKeys = new Set(facets.map((facet) => tagKey(facet.value)));
  const activeTagKeys = selectedTagKeys.filter((key) => availableKeys.has(key));

  const visibleSources = sources.filter((source) => sourceHasEveryTag(source, activeTagKeys));
  const hasSelection = activeTagKeys.length > 0;

  function toggleTag(tag: string) {
    const key = tagKey(tag);
    setSelectedTagKeys((previous) =>
      previous.includes(key) ? previous.filter((entry) => entry !== key) : [...previous, key],
    );
  }

  // Read from the case's canonical linkage, never guessed from the `Source`.
  const citedSourceIds = new Set<string>();
  for (const claim of claims) {
    for (const sourceId of claim.sourceIds) citedSourceIds.add(sourceId);
  }
  for (const link of evidenceLinks) {
    if (link.sourceId !== undefined) citedSourceIds.add(link.sourceId);
  }

  const countLabel = hasSelection
    ? `${visibleSources.length} of ${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`
    : `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`;

  return (
    <section
      data-testid="reference-library"
      aria-label="Reference library"
      className="flex flex-col gap-[var(--space-3)]"
    >
      {/*
       * The genuinely empty library gets the whole surface: no count, no
       * facet row, no filter controls -- there is nothing yet to count or
       * organise, and rendering the chrome anyway would imply something is
       * hidden behind it.
       */}
      {sources.length === 0 ? (
        <p
          data-testid="reference-library-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          Nothing has been saved to this case yet. Research papers, articles, and any other
          reference material you or Sift add will be kept here.
        </p>
      ) : (
        <>
          <span
            data-testid="reference-library-count"
            aria-live="polite"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            {countLabel}
          </span>

          {facets.length > 0 ? (
            <div
              role="group"
              aria-label="Filter by tag"
              data-testid="reference-library-tags"
              className="flex flex-wrap items-center gap-[var(--space-2)]"
            >
              {facets.map((facet) => {
                const pressed = activeTagKeys.includes(tagKey(facet.value));
                return (
                  <Toggle
                    key={tagKey(facet.value)}
                    data-testid={`reference-library-tag-${facet.value}`}
                    pressed={pressed}
                    onPressedChange={() => {
                      toggleTag(facet.value);
                    }}
                    variant="outline"
                    size="sm"
                    title={facet.value}
                    className="h-auto max-w-full min-h-[var(--size-touch-target-min)] rounded-[var(--radius-pill)] px-[var(--space-3)] whitespace-normal data-[state=on]:bg-[color:var(--color-status-active-bg)] data-[state=on]:text-[color:var(--color-status-active-ink)]"
                  >
                    <span className="min-w-0 break-words">{facet.value}</span>
                    <span className="shrink-0 text-[length:var(--font-size-xs)] opacity-70">{` (${facet.count})`}</span>
                  </Toggle>
                );
              })}
              {/*
               * Last item of the wrapping chip row, and present only while
               * there is something to clear -- exactly `FilterBar.tsx`'s
               * arrangement, for the same reason it landed there: an
               * `ml-auto` clear control strands itself on its own line at
               * 390px the moment the row wraps.
               */}
              {hasSelection ? (
                <Button
                  type="button"
                  data-testid="reference-library-clear-tags"
                  variant="ghost"
                  onClick={() => {
                    setSelectedTagKeys([]);
                  }}
                  className="min-h-[var(--size-touch-target-min)] px-[var(--space-3)]"
                >
                  Clear tags
                </Button>
              ) : null}
            </div>
          ) : null}

          {/*
           * A different situation from an empty library, so a different
           * sentence: the material IS here, the current tag selection just
           * does not reach it. The way out is the `Clear tags` control that
           * stays visible directly above.
           */}
          {visibleSources.length === 0 ? (
            <p
              data-testid="reference-library-no-matches"
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
            >
              No source carries every selected tag. Clear the tags above to see the whole library
              again.
            </p>
          ) : (
            <ul className="flex flex-col gap-[var(--space-2)]">
              {visibleSources.map((source) => (
                <ReferenceEntry
                  key={source.id}
                  source={source}
                  isEvidence={citedSourceIds.has(source.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export interface ReferenceLibrarySheetProps extends ReferenceLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The library as an overlay, following `FilterSheet.tsx` exactly: no
 * `layout` prop and no `matchMedia`, because `ui/sheet.tsx` already renders
 * the same content as a bottom sheet at <=480px and as a centred dialog
 * above `global.css`'s own `min-[481px]` boundary. One surface serves the
 * canonical ChatGPT right pane and a desktop viewport without a variant
 * decision here.
 *
 * The visible title lives on `SheetTitle` rather than inside
 * `ReferenceLibrary`, which carries only an `aria-label` -- one heading, not
 * two saying the same thing.
 */
export function ReferenceLibrarySheet({
  open,
  onOpenChange,
  sources,
  claims,
  evidenceLinks,
}: ReferenceLibrarySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="reference-library-sheet">
        <SheetHeader>
          <SheetTitle>Reference library</SheetTitle>
          <SheetDescription>
            Everything this case has collected. A reference is kept because it is relevant; evidence
            is a reference something has been drawn from to answer an open question.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <ReferenceLibrary sources={sources} claims={claims} evidenceLinks={evidenceLinks} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
