/**
 * A bounded Markdown subset, rendered as React elements.
 *
 * ## Why this exists
 *
 * A model asked to explain a `custom.*` comparison field has genuinely
 * structured things to say -- a short lead, a couple of measurements as a
 * list, a caveat about how they were taken. A single unbroken paragraph
 * throws that structure away, so `TextAttributeValueSchema` gained an
 * optional `format: 'markdown'` (`packages/contracts/src/attributes.ts`) and
 * `SourceSchema` gained `summary`/`summaryFormat` alongside it. This is the
 * renderer for both.
 *
 * ## This is a security boundary, not a styling feature
 *
 * The content here is written by a MODEL and rendered in the user's browser.
 * Two independent halves hold the line, and neither may lean on the other:
 *
 *  - At the contract edge, `safeString` rejects `<tag`, `javascript:`, and
 *    `on*=` handlers. That check is exactly why the format is Markdown and
 *    never HTML -- `**bold**`, lists, and `[links](https://...)` need none of
 *    what it blocks, so formatting was gained without weakening it.
 *  - At the render edge, this file. It assumes NOTHING about the string
 *    having passed the contract check, because a value can reach a renderer
 *    from a snapshot written under an older schema, from a replayed event, or
 *    from a future code path nobody has audited yet.
 *
 * The three rules that make the render edge safe, in the order they matter:
 *
 * 1. **No raw HTML passthrough, structurally.** There is no
 *    `dangerouslySetInnerHTML` here and no HTML string is ever built. Every
 *    output is a React element or a text node, and React escapes text nodes,
 *    so `<script>alert(1)</script>` in the source becomes the eleven visible
 *    characters and never an element. This is stronger than sanitising an
 *    HTML string: there is no HTML string to get the sanitiser wrong about.
 * 2. **Link schemes restricted to `http` and `https`.** `safeString` blocks
 *    `javascript:` but NOT `data:text/html;base64,...`, `vbscript:`, or a
 *    protocol-relative `//evil.com` -- all of which a browser will happily
 *    navigate to. `safeLinkHref` below is an allowlist, so anything it does
 *    not recognise renders as ordinary text rather than as an anchor. It
 *    fails closed on anything it cannot parse.
 * 3. **No image embedding.** A remote image URL loaded from model-written
 *    text is a tracking pixel at best and an exfiltration channel at worst
 *    (the URL itself carries whatever the model chose to put in it, and the
 *    request goes out with no user action). Image syntax renders as its alt
 *    text and produces no `<img>` element at any URL, including same-origin
 *    ones -- there is no legitimate case for one here.
 *
 * ## Why no library
 *
 * `apps/web/package.json` carried no Markdown dependency, and adding one
 * would mean auditing its HTML-passthrough configuration, its link handling,
 * and its transitive tree on every upgrade -- for a subset small enough to
 * read in one sitting. A parser that emits React elements rather than HTML
 * cannot have an HTML-passthrough setting to get wrong, which is the whole
 * argument. The cost is a deliberately small subset; see "Not supported".
 *
 * ## Supported
 *
 * Paragraphs, ATX headings (`#`..`######`), `**bold**`/`__bold__`,
 * `*italic*`/`_italic_`, `` `inline code` ``, fenced code blocks (``` or
 * ~~~), unordered lists (`-`/`*`/`+`), ordered lists (`1.`/`1)`),
 * `[links](https://...)`, and `![images](...)` as their alt text.
 *
 * ## Not supported, on purpose
 *
 * Nested lists, block quotes, tables, setext headings, reference links, link
 * titles (`[a](url "title")`), URLs containing parentheses, multi-line list
 * items, backslash escapes, and HTML of any kind. Each would add parser
 * surface for a construct this content does not need. Anything unrecognised
 * renders as the literal text that was written, which is the honest failure
 * mode: nothing is silently dropped.
 *
 * ## Generic by construction
 *
 * No domain vocabulary and no case concepts -- this renders a string for any
 * pack. Purely presentational, like every sibling leaf: no context, no
 * fetching, no command calls, no local state.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Heading levels this component may emit. `1` is deliberately excluded: this
 * renders a fragment inside a page that already owns its `h1`, and a second
 * one would break the document outline.
 */
export type MarkdownHeadingLevel = 2 | 3 | 4 | 5 | 6;

const MAX_HEADING_LEVEL = 6;

export interface MarkdownTextProps {
  /** The Markdown source. Empty or whitespace-only renders nothing at all. */
  children: string;
  /**
   * The level the shallowest heading in the source is rendered at, so the
   * fragment slots correctly under whatever heading its host already
   * rendered. Defaults to `4`, the level below the section headings the
   * workspace's sheets use.
   */
  headingLevel?: MarkdownHeadingLevel;
  /** Extra classes on the wrapper, for spacing that belongs to the host. */
  className?: string;
  'data-testid'?: string;
}

// --- Link safety ---------------------------------------------------------

/**
 * A URL's scheme, or `null` when the string does not begin with one.
 *
 * Deliberately strict about the characters a scheme may contain (RFC 3986:
 * a letter followed by letters, digits, `+`, `-`, `.`) so a payload that
 * hides a control character inside the scheme -- `java\x01script:` -- fails
 * to parse and is rejected, rather than being normalised into something that
 * passes.
 */
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/;

const ALLOWED_LINK_SCHEMES = new Set(['http', 'https']);

/**
 * The `href` to render, or `null` when this URL may not become a link.
 *
 * An allowlist, and it fails closed: only an absolute `http`/`https` URL is
 * ever returned. Everything else -- `javascript:`, `data:text/html`,
 * `vbscript:`, `file:`, `mailto:`, a protocol-relative `//evil.com`, and any
 * relative path -- returns `null` and is rendered as ordinary text.
 *
 * The protocol-relative case is called out because it is the one that looks
 * harmless: `//evil.com` inherits the page's own scheme, so it is a fully
 * functional external navigation that no scheme check catches unless the
 * check requires a scheme to be PRESENT. It is rejected before the scheme
 * pattern runs, since it has no scheme to test.
 *
 * Relative paths are rejected for a different reason: this component renders
 * content from an untrusted author inside an application that has its own
 * routes, and "go to /admin" is not a thing that author gets to say.
 */
function safeLinkHref(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (url === '' || url.startsWith('//')) return null;
  const scheme = SCHEME_PATTERN.exec(url);
  if (scheme === null) return null;
  const name = scheme[1];
  if (name === undefined) return null;
  return ALLOWED_LINK_SCHEMES.has(name.toLowerCase()) ? url : null;
}

// --- Inline parsing ------------------------------------------------------

/**
 * How far emphasis may nest before the parser stops looking and emits plain
 * text. Bold-inside-italic is real; four levels deep is a malformed document
 * or an attempt to make the parser do exponential work.
 */
const MAX_INLINE_DEPTH = 4;

/**
 * The longest span an emphasis marker may reach across.
 *
 * A ReDoS bound, not a style rule. `**` with no closing `**` makes the lazy
 * quantifier scan to the end of the input at every `**` in the document,
 * which on a 20 000-character value (`safeString`'s ceiling for these
 * fields) is quadratic work in the user's browser. Capping the span makes
 * each attempt bounded; a genuinely 2 000-character bold run renders as
 * literal asterisks instead, which is a fair trade for a bound.
 */
const MAX_EMPHASIS_SPAN = 2000;

/** `` `code` `` -- a single backtick pair, no markup interpreted inside. */
const CODE_SPAN_PATTERN = /`([^`\n]+)`/y;
/** `![alt](url)`. The URL is captured only so it can be discarded; no image is ever emitted. */
const IMAGE_PATTERN = /!\[([^\]\n]*)\]\(([^()\s]*)\)/y;
/** `[label](url)`. Whitespace and parentheses are excluded from the URL so a payload cannot smuggle a line break into it. */
const LINK_PATTERN = /\[([^\]\n]*)\]\(([^()\s]*)\)/y;
const STRONG_PATTERN = new RegExp(
  `(\\*\\*|__)(\\S(?:[\\s\\S]{0,${MAX_EMPHASIS_SPAN}}?\\S)?)\\1`,
  'y',
);
const EMPHASIS_PATTERN = new RegExp(
  `(\\*|_)(\\S(?:[^*_\\n]{0,${MAX_EMPHASIS_SPAN}}?\\S)?)\\1`,
  'y',
);

/** A character that may not sit either side of an `_` emphasis marker. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * Whether an underscore at `start` may open emphasis running to `end`.
 *
 * CommonMark's intraword rule, implemented because this product writes
 * identifiers into exactly these fields: `custom.fits_our_space` would
 * otherwise render as "fits*our*space" with the underscores eaten. Asterisks
 * keep the permissive behaviour, since `a*b*c` is not a shape anything here
 * produces.
 */
function isUnderscoreBoundary(text: string, start: number, end: number): boolean {
  const before = start === 0 ? '' : text.charAt(start - 1);
  const after = end >= text.length ? '' : text.charAt(end);
  return !WORD_CHARACTER.test(before) && !WORD_CHARACTER.test(after);
}

const CODE_CLASS =
  'rounded-[var(--radius-xs)] bg-[var(--color-surface-sunken)] px-[var(--space-1)] py-[var(--space-0-5)] font-[family-name:var(--font-mono)] text-[0.9em]';

const LINK_CLASS = 'text-[var(--color-brand)] underline underline-offset-2';

interface InlineMatch {
  node: ReactNode;
  /** Characters of source consumed, which is always > 0 so the scanner cannot stall. */
  length: number;
}

/**
 * The one inline construct starting exactly at `index`, or `null`.
 *
 * Rules are tried in precedence order, and the first to match at this exact
 * position wins. Code spans come first so nothing inside them is
 * interpreted; images come before links so `![a](b)` is never read as a link
 * whose label happens to start with `!`.
 */
function matchInline(
  text: string,
  index: number,
  keyPrefix: string,
  depth: number,
): InlineMatch | null {
  CODE_SPAN_PATTERN.lastIndex = index;
  const code = CODE_SPAN_PATTERN.exec(text);
  if (code !== null) {
    const [whole, content] = code;
    return {
      node: (
        <code key={keyPrefix} className={CODE_CLASS}>
          {content}
        </code>
      ),
      length: whole.length,
    };
  }

  IMAGE_PATTERN.lastIndex = index;
  const image = IMAGE_PATTERN.exec(text);
  if (image !== null) {
    const [whole, alt] = image;
    // The alt text and nothing else. The URL is read by the pattern purely
    // so the whole construct is consumed -- it is never rendered, never
    // linked, and never requested.
    return { node: alt ?? '', length: whole.length };
  }

  LINK_PATTERN.lastIndex = index;
  const link = LINK_PATTERN.exec(text);
  if (link !== null) {
    const [whole, label, url] = link;
    const href = safeLinkHref(url ?? '');
    if (href === null) {
      // Rendered as the literal source, not as the bare label: a reader
      // should be able to see that a link was written and refused, and
      // silently swallowing the URL would hide the interesting half.
      return { node: whole, length: whole.length };
    }
    return {
      node: (
        <a
          key={keyPrefix}
          href={href}
          target="_blank"
          // `noopener` denies the opened page a handle on this window;
          // `noreferrer` keeps the case's URL out of the destination's logs.
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          {renderInline(label ?? '', `${keyPrefix}-l`, depth + 1)}
        </a>
      ),
      length: whole.length,
    };
  }

  STRONG_PATTERN.lastIndex = index;
  const strong = STRONG_PATTERN.exec(text);
  if (strong !== null) {
    const [whole, marker, content] = strong;
    if (marker !== '__' || isUnderscoreBoundary(text, index, index + whole.length)) {
      return {
        node: (
          <strong key={keyPrefix} className="font-[var(--font-weight-semibold)]">
            {renderInline(content ?? '', `${keyPrefix}-s`, depth + 1)}
          </strong>
        ),
        length: whole.length,
      };
    }
  }

  EMPHASIS_PATTERN.lastIndex = index;
  const emphasis = EMPHASIS_PATTERN.exec(text);
  if (emphasis !== null) {
    const [whole, marker, content] = emphasis;
    if (marker !== '_' || isUnderscoreBoundary(text, index, index + whole.length)) {
      return {
        node: <em key={keyPrefix}>{renderInline(content ?? '', `${keyPrefix}-e`, depth + 1)}</em>,
        length: whole.length,
      };
    }
  }

  return null;
}

/**
 * One line of Markdown as React nodes.
 *
 * Scans left to right, taking the first construct that starts at the current
 * position and otherwise accumulating a literal character. Literal runs are
 * emitted as plain strings, which React escapes -- that is the mechanism by
 * which raw HTML in the source becomes visible text rather than DOM.
 */
function renderInline(text: string, keyPrefix: string, depth: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let literal = '';
  let index = 0;
  let key = 0;

  while (index < text.length) {
    const match =
      depth >= MAX_INLINE_DEPTH ? null : matchInline(text, index, `${keyPrefix}-${key}`, depth);
    if (match === null) {
      literal += text.charAt(index);
      index += 1;
      continue;
    }
    if (literal !== '') {
      nodes.push(literal);
      literal = '';
    }
    nodes.push(match.node);
    index += match.length;
    key += 1;
  }

  if (literal !== '') nodes.push(literal);
  return nodes;
}

// --- Block parsing -------------------------------------------------------

type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'heading'; depth: number; text: string }
  | { kind: 'code'; lines: string[] }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] };

/** ``` or ~~~, with an optional info string this renderer reads and ignores. */
const FENCE_PATTERN = /^ {0,3}(```|~~~)\s*[^\n`]*$/;
const FENCE_MARKER_PATTERN = /^ {0,3}(```|~~~)/;
/** `# Heading`. The space is required, so `#4 in the ranking` stays prose. */
const HEADING_PATTERN = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const UNORDERED_ITEM_PATTERN = /^ {0,3}[-*+][ \t]+(.*)$/;
const ORDERED_ITEM_PATTERN = /^ {0,3}(\d{1,9})[.)][ \t]+(.*)$/;

/**
 * Splits the source into blocks.
 *
 * Line-based and single pass. A fenced block swallows its lines whole and is
 * never inspected for other constructs, which is what makes a code block
 * containing `<script>` or `**text**` render exactly as written.
 */
function parseBlocks(source: string): Block[] {
  // Normalised so a document written on Windows parses identically.
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const closeParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph });
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (FENCE_PATTERN.test(line)) {
      closeParagraph();
      const opening = FENCE_MARKER_PATTERN.exec(line)?.[1] ?? '```';
      const body: string[] = [];
      index += 1;
      // An unterminated fence runs to the end of the document rather than
      // falling back to prose -- the author's intent is unambiguous, and
      // re-reading the rest as Markdown would interpret markup they fenced
      // off precisely to avoid that.
      while (index < lines.length) {
        const candidate = lines[index] ?? '';
        if (
          candidate.trimEnd() === opening ||
          FENCE_MARKER_PATTERN.exec(candidate)?.[1] === opening
        ) {
          break;
        }
        body.push(candidate);
        index += 1;
      }
      blocks.push({ kind: 'code', lines: body });
      continue;
    }

    if (line.trim() === '') {
      closeParagraph();
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading !== null) {
      closeParagraph();
      blocks.push({ kind: 'heading', depth: (heading[1] ?? '#').length, text: heading[2] ?? '' });
      continue;
    }

    const unordered = UNORDERED_ITEM_PATTERN.exec(line);
    if (unordered !== null) {
      closeParagraph();
      const last = blocks.at(-1);
      if (last?.kind === 'list' && !last.ordered) {
        last.items.push(unordered[1] ?? '');
      } else {
        blocks.push({ kind: 'list', ordered: false, start: 1, items: [unordered[1] ?? ''] });
      }
      continue;
    }

    const ordered = ORDERED_ITEM_PATTERN.exec(line);
    if (ordered !== null) {
      closeParagraph();
      const last = blocks.at(-1);
      if (last?.kind === 'list' && last.ordered) {
        last.items.push(ordered[2] ?? '');
      } else {
        blocks.push({
          kind: 'list',
          ordered: true,
          start: Number(ordered[1] ?? '1'),
          items: [ordered[2] ?? ''],
        });
      }
      continue;
    }

    paragraph.push(line);
  }

  closeParagraph();
  return blocks;
}

// --- Rendering -----------------------------------------------------------

const HEADING_SIZE: Record<MarkdownHeadingLevel, string> = {
  2: 'var(--font-size-lg)',
  3: 'var(--font-size-md)',
  4: 'var(--font-size-base)',
  5: 'var(--font-size-sm)',
  6: 'var(--font-size-sm)',
};

type HeadingTag = 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * Maps a source heading depth onto a real heading level that never skips.
 *
 * Two separate reasons, both real. Semantically, an `h1` inside a sheet whose
 * host already rendered one is a broken outline. Mechanically, axe's
 * `heading-order` rule fails a document that jumps from `h4` to `h6`, and a
 * model writing `#` then `#####` produces exactly that. So the level is
 * clamped to at most one deeper than the previous heading: relative depth is
 * preserved wherever the source is contiguous, and a jump is compressed
 * rather than rendered as a hole.
 */
function nextHeadingLevel(
  depth: number,
  base: MarkdownHeadingLevel,
  previous: number,
): MarkdownHeadingLevel {
  const desired = Math.min(MAX_HEADING_LEVEL, base + depth - 1);
  const level = Math.min(desired, previous + 1);
  return Math.max(base, Math.min(MAX_HEADING_LEVEL, level)) as MarkdownHeadingLevel;
}

export function MarkdownText({
  children,
  headingLevel = 4,
  className,
  'data-testid': testId,
}: MarkdownTextProps) {
  const blocks = parseBlocks(children);
  // An empty or whitespace-only value renders nothing at all rather than an
  // empty block: a stray gap in a layout reads as content that failed to
  // load, which is a claim this component is not entitled to make.
  if (blocks.length === 0) return null;

  let previousLevel = headingLevel - 1;
  const rendered: ReactNode[] = [];

  blocks.forEach((block, index) => {
    const key = `block-${index}`;
    switch (block.kind) {
      case 'heading': {
        const level = nextHeadingLevel(block.depth, headingLevel, previousLevel);
        previousLevel = level;
        const Tag = `h${level}` as HeadingTag;
        rendered.push(
          <Tag
            key={key}
            className="font-[family-name:var(--font-display)] leading-[var(--line-height-snug)] font-[var(--font-weight-semibold)] text-[var(--color-ink)]"
            style={{ fontSize: HEADING_SIZE[level] }}
          >
            {renderInline(block.text, key, 0)}
          </Tag>,
        );
        return;
      }
      case 'code': {
        rendered.push(
          // `overflow-x-auto` on the block plus `min-w-0` on the wrapper is
          // what keeps a long unwrappable line scrolling inside the block
          // instead of widening the 390px pane.
          <pre
            key={key}
            className="m-0 max-w-full overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] p-[var(--space-3)] text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
          >
            <code className="font-[family-name:var(--font-mono)]">{block.lines.join('\n')}</code>
          </pre>,
        );
        return;
      }
      case 'list': {
        const items = block.items.map((item, itemIndex) => (
          <li key={`${key}-${itemIndex}`} className="min-w-0">
            {renderInline(item, `${key}-${itemIndex}`, 0)}
          </li>
        ));
        rendered.push(
          block.ordered ? (
            <ol
              key={key}
              start={block.start}
              className="m-0 flex list-decimal flex-col gap-[var(--space-1)] pl-[var(--space-5)]"
            >
              {items}
            </ol>
          ) : (
            <ul
              key={key}
              className="m-0 flex list-disc flex-col gap-[var(--space-1)] pl-[var(--space-5)]"
            >
              {items}
            </ul>
          ),
        );
        return;
      }
      case 'paragraph': {
        rendered.push(
          // Soft line breaks join with a space, per CommonMark: a model
          // hard-wrapping its prose is not asking for a line break.
          <p key={key} className="m-0">
            {renderInline(block.lines.join(' '), key, 0)}
          </p>,
        );
        return;
      }
    }
  });

  return (
    <div
      className={cn(
        // `reading-measure` because this is running prose (global.css: "It
        // belongs on paragraphs a person READS"), `min-w-0` +
        // `[overflow-wrap:anywhere]` because a model-written URL or
        // identifier is exactly the unbreakable token that would otherwise
        // push the canonical 390px pane into horizontal scroll.
        'reading-measure flex min-w-0 flex-col gap-[var(--space-2)] [overflow-wrap:anywhere]',
        // Type scale and colour live HERE rather than on each paragraph and
        // list so a host can retune them in one `className` -- a summary
        // under a small source title wants the secondary scale, an attribute
        // body wants the same base size as the plain values beside it. `cn`
        // (tailwind-merge) resolves the conflicting utility to the caller's.
        'text-[length:var(--font-size-base)] leading-[var(--line-height-relaxed)] text-[var(--color-ink)]',
        className,
      )}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      {rendered}
    </div>
  );
}
