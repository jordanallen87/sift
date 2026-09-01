/**
 * What a person can actually see and press in the case's reference library:
 * which entries render, which fields appear only when they really exist, how
 * the tag facets are derived and counted, what filtering narrows and
 * clearing restores, the two genuinely different empty states, and the
 * reference-versus-evidence distinction that gives the whole surface its
 * point.
 *
 * Deliberately fixture-driven rather than snapshot-driven: every assertion
 * names the real `Source`/`Claim`/`EvidenceLink` data it is measured
 * against, so a failure says which fact stopped being rendered rather than
 * that some pixels moved.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { Claim, EvidenceLink, Source } from '@sift/contracts';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';
import { ReferenceLibrary, ReferenceLibrarySheet } from './ReferenceLibrary.js';

const RETRIEVED_AT = '2026-02-01T12:00:00.000Z';
const PUBLISHED_AT = '2025-11-14T09:30:00.000Z';

function buildSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-1',
    url: 'https://example.com/reliability-study',
    title: 'Long-term reliability study',
    retrievedAt: RETRIEVED_AT,
    origin: 'user_submitted',
    verification: 'unverified',
    createdAt: RETRIEVED_AT,
    ...overrides,
  };
}

function buildClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    obligationId: 'obl-1',
    statement: 'Failure rates fall sharply after the third model year.',
    stance: 'supports',
    confidence: 0.6,
    sourceIds: ['src-1'],
    stale: false,
    createdAt: RETRIEVED_AT,
    ...overrides,
  };
}

function buildEvidenceLink(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id: 'ev-1',
    obligationId: 'obl-1',
    claimId: 'claim-1',
    sourceId: 'src-1',
    level: 'E0',
    verdict: 'pass',
    disposition: 'included',
    summary: 'Cited in support of the reliability question.',
    stale: false,
    createdAt: RETRIEVED_AT,
    updatedAt: RETRIEVED_AT,
    ...overrides,
  };
}

function library(overrides: Partial<Parameters<typeof ReferenceLibrary>[0]> = {}) {
  return <ReferenceLibrary sources={[]} claims={[]} evidenceLinks={[]} {...overrides} />;
}

/** The realistic multi-source library every filtering assertion below is measured against. */
const SOURCES: Source[] = [
  buildSource({
    id: 'src-1',
    title: 'Long-term reliability study',
    publisher: 'Institute of Transport Research',
    publishedAt: PUBLISHED_AT,
    url: 'https://example.com/reliability-study',
    tags: ['Reliability', 'Research paper'],
    summary: 'Ten-year failure rates, broken down by drivetrain.',
    excerpt: 'Median time to first major repair was 7.4 years.',
    verification: 'verified',
    origin: 'agent_discovered',
  }),
  buildSource({
    id: 'src-2',
    title: 'Owner forum thread on winter handling',
    url: 'https://example.com/forum-thread',
    tags: ['Reliability', 'Community'],
    verification: 'unverified',
    origin: 'user_submitted',
  }),
  buildSource({
    id: 'src-3',
    title: 'Manufacturer specification sheet',
    url: 'https://example.com/spec-sheet',
    tags: ['Specifications'],
    verification: 'challenged',
    origin: 'fixture',
  }),
];

describe('ReferenceLibrary: entries', () => {
  it('renders one entry per source, with title, publisher, dates, summary, excerpt, and tags', () => {
    render(library({ sources: [SOURCES[0]!], claims: [], evidenceLinks: [] }));

    const entry = screen.getByTestId('reference-library-entry-src-1');
    expect(within(entry).getByText('Long-term reliability study')).toBeInTheDocument();
    expect(within(entry).getByText('Institute of Transport Research')).toBeInTheDocument();
    expect(within(entry).getByTestId('reference-library-entry-summary-src-1')).toHaveTextContent(
      'Ten-year failure rates, broken down by drivetrain.',
    );
    expect(within(entry).getByTestId('reference-library-entry-excerpt-src-1')).toHaveTextContent(
      'Median time to first major repair was 7.4 years.',
    );

    const tags = within(entry).getByTestId('reference-library-entry-tags-src-1');
    expect(within(tags).getByText('Reliability')).toBeInTheDocument();
    expect(within(tags).getByText('Research paper')).toBeInTheDocument();

    // Real dates, formatted from the real ISO strings -- never a placeholder.
    expect(within(entry).getByTestId('reference-library-entry-dates-src-1')).toHaveTextContent(
      new Date(PUBLISHED_AT).toLocaleDateString(),
    );
    expect(within(entry).getByTestId('reference-library-entry-dates-src-1')).toHaveTextContent(
      new Date(RETRIEVED_AT).toLocaleDateString(),
    );
  });

  it('attributes the excerpt as a quotation FROM the source, never as something said about it', () => {
    render(library({ sources: [SOURCES[0]!] }));

    const excerpt = screen.getByTestId('reference-library-entry-excerpt-src-1');
    expect(excerpt.tagName.toLowerCase()).toBe('blockquote');
    expect(excerpt).toHaveTextContent(/Quoted from/i);
    expect(excerpt).toHaveTextContent('Long-term reliability study');
  });

  it('renders a markdown summary as markdown when the source says its summary is markdown', () => {
    render(
      library({
        sources: [
          buildSource({
            id: 'src-md',
            summary: 'Failure rates **fall sharply** after year three.',
            summaryFormat: 'markdown',
          }),
        ],
      }),
    );

    const summary = screen.getByTestId('reference-library-entry-summary-src-md');
    expect(within(summary).getByText('fall sharply').tagName.toLowerCase()).toBe('strong');
    expect(summary.textContent).not.toContain('**');
  });

  it('renders a summary with no declared format as literal plain text, never as guessed markup', () => {
    render(
      library({
        sources: [
          buildSource({
            id: 'src-plain',
            summary: 'Failure rates **fall sharply** after year three.',
          }),
        ],
      }),
    );

    const summary = screen.getByTestId('reference-library-entry-summary-src-plain');
    expect(summary.querySelector('strong')).toBeNull();
    expect(summary).toHaveTextContent('Failure rates **fall sharply** after year three.');
  });

  it('renders a source with no tags, summary, excerpt, publisher, or publishedAt without holes or invented values', () => {
    render(library({ sources: [buildSource({ id: 'src-bare', title: 'Bare source' })] }));

    const entry = screen.getByTestId('reference-library-entry-src-bare');
    expect(within(entry).getByText('Bare source')).toBeInTheDocument();
    expect(
      within(entry).queryByTestId('reference-library-entry-summary-src-bare'),
    ).not.toBeInTheDocument();
    expect(
      within(entry).queryByTestId('reference-library-entry-excerpt-src-bare'),
    ).not.toBeInTheDocument();
    expect(
      within(entry).queryByTestId('reference-library-entry-tags-src-bare'),
    ).not.toBeInTheDocument();
    // "Never fabricate": an absent publisher/published date renders as
    // absent, not as "Unknown publisher" or a guessed date.
    expect(entry.textContent).not.toMatch(/unknown/i);
    expect(entry.textContent).not.toMatch(/n\/a/i);
    expect(
      within(entry).getByTestId('reference-library-entry-dates-src-bare'),
    ).not.toHaveTextContent(/Published/);
  });

  it('links out to the source url with rel="noopener noreferrer" and shows the url itself', () => {
    render(library({ sources: [SOURCES[0]!] }));

    const link = within(screen.getByTestId('reference-library-entry-src-1')).getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/reliability-study');
    expect(link).toHaveAttribute('target', '_blank');
    const rel = link.getAttribute('rel') ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(link).toHaveTextContent('https://example.com/reliability-study');
  });

  it('shows verification and origin honestly, including that Sift added a source while researching', () => {
    render(library({ sources: SOURCES }));

    expect(screen.getByTestId('reference-library-entry-verification-src-1')).toHaveTextContent(
      'Verified',
    );
    expect(screen.getByTestId('reference-library-entry-verification-src-2')).toHaveTextContent(
      'Not verified',
    );
    expect(screen.getByTestId('reference-library-entry-verification-src-3')).toHaveTextContent(
      'Challenged',
    );

    expect(screen.getByTestId('reference-library-entry-origin-src-1')).toHaveTextContent(
      'Added by Sift while researching',
    );
    expect(screen.getByTestId('reference-library-entry-origin-src-2')).toHaveTextContent(
      'Added by you or ChatGPT',
    );
    expect(screen.getByTestId('reference-library-entry-origin-src-3')).toHaveTextContent(
      'Included with the case',
    );
  });

  it('renders a rejected source rather than hiding it, and says so', () => {
    render(library({ sources: [buildSource({ id: 'src-x', verification: 'rejected' })] }));
    expect(screen.getByTestId('reference-library-entry-verification-src-x')).toHaveTextContent(
      'Rejected',
    );
  });
});

describe('ReferenceLibrary: reference versus evidence', () => {
  it('lists both a plain reference and an evidence source, and tells them apart', () => {
    render(
      library({
        sources: [
          buildSource({ id: 'src-evidence', title: 'Cited study' }),
          buildSource({ id: 'src-reference', title: 'Kept for background' }),
        ],
        claims: [buildClaim({ id: 'claim-1', sourceIds: ['src-evidence'] })],
        evidenceLinks: [buildEvidenceLink({ id: 'ev-1', sourceId: 'src-evidence' })],
      }),
    );

    expect(screen.getByTestId('reference-library-entry-src-evidence')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-entry-src-reference')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-entry-kind-src-evidence')).toHaveTextContent(
      'Evidence',
    );
    expect(screen.getByTestId('reference-library-entry-kind-src-reference')).toHaveTextContent(
      'Reference',
    );
  });

  it('counts a source as evidence when only an evidence link cites it (no claim of its own)', () => {
    render(
      library({
        sources: [buildSource({ id: 'src-1' })],
        claims: [],
        evidenceLinks: [buildEvidenceLink({ sourceId: 'src-1', claimId: undefined })],
      }),
    );
    expect(screen.getByTestId('reference-library-entry-kind-src-1')).toHaveTextContent('Evidence');
  });

  it('counts a source as evidence when only a claim cites it (submitted without an obligation link)', () => {
    render(
      library({
        sources: [buildSource({ id: 'src-1' })],
        claims: [buildClaim({ sourceIds: ['src-1'] })],
        evidenceLinks: [],
      }),
    );
    expect(screen.getByTestId('reference-library-entry-kind-src-1')).toHaveTextContent('Evidence');
  });
});

describe('ReferenceLibrary: tag facets and filtering', () => {
  it('derives the tag facets from the tags actually present, with live counts, never a fixed list', () => {
    render(library({ sources: SOURCES }));

    // "Reliability" is on src-1 and src-2; the other two on one source each.
    // Ordered by count descending, then alphabetically -- the same ordering
    // `workspace-filters.ts`'s own `buildFacetOptions` uses.
    const facets = screen.getByTestId('reference-library-tags');
    const labels = within(facets)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toEqual([
      'Reliability (2)',
      'Community (1)',
      'Research paper (1)',
      'Specifications (1)',
    ]);

    // No tag that no source carries.
    expect(screen.queryByTestId('reference-library-tag-Safety')).not.toBeInTheDocument();
  });

  it('renders no tag facets at all when no source carries a tag', () => {
    render(library({ sources: [buildSource({ id: 'src-1' })] }));
    expect(screen.queryByTestId('reference-library-tags')).not.toBeInTheDocument();
  });

  it('groups tags that differ only by casing under the first casing seen, counting them together', () => {
    render(
      library({
        sources: [
          buildSource({ id: 'src-1', tags: ['EV'] }),
          buildSource({ id: 'src-2', tags: ['ev'] }),
        ],
      }),
    );

    const facets = within(screen.getByTestId('reference-library-tags')).getAllByRole('button');
    expect(facets.map((button) => button.textContent)).toEqual(['EV (2)']);
  });

  it('narrows the list to the sources carrying a selected tag, and updates the count', async () => {
    const user = userEvent.setup();
    render(library({ sources: SOURCES }));

    expect(screen.getByTestId('reference-library-count')).toHaveTextContent('3 sources');

    await user.click(screen.getByTestId('reference-library-tag-Specifications'));

    expect(screen.getByTestId('reference-library-entry-src-3')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-library-entry-src-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reference-library-entry-src-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('reference-library-count')).toHaveTextContent('1 of 3 sources');
  });

  it('narrows further when a second tag is selected: an entry must carry every selected tag', async () => {
    const user = userEvent.setup();
    render(library({ sources: SOURCES }));

    await user.click(screen.getByTestId('reference-library-tag-Reliability'));
    expect(screen.getByTestId('reference-library-entry-src-1')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-entry-src-2')).toBeInTheDocument();

    await user.click(screen.getByTestId('reference-library-tag-Community'));
    expect(screen.queryByTestId('reference-library-entry-src-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('reference-library-entry-src-2')).toBeInTheDocument();
  });

  it('matches a selected tag regardless of the casing an individual source used', async () => {
    const user = userEvent.setup();
    render(
      library({
        sources: [
          buildSource({ id: 'src-1', tags: ['EV'] }),
          buildSource({ id: 'src-2', tags: ['ev'] }),
        ],
      }),
    );

    await user.click(screen.getByTestId('reference-library-tag-EV'));
    expect(screen.getByTestId('reference-library-entry-src-1')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-entry-src-2')).toBeInTheDocument();
  });

  it('restores the whole library when the selected tag is pressed again', async () => {
    const user = userEvent.setup();
    render(library({ sources: SOURCES }));

    await user.click(screen.getByTestId('reference-library-tag-Specifications'));
    expect(screen.queryByTestId('reference-library-entry-src-1')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('reference-library-tag-Specifications'));
    expect(screen.getByTestId('reference-library-entry-src-1')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-count')).toHaveTextContent('3 sources');
  });

  it('restores the whole library through the clear control, which appears only once something is selected', async () => {
    const user = userEvent.setup();
    render(library({ sources: SOURCES }));

    expect(screen.queryByTestId('reference-library-clear-tags')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('reference-library-tag-Reliability'));
    await user.click(screen.getByTestId('reference-library-tag-Community'));
    await user.click(screen.getByTestId('reference-library-clear-tags'));

    expect(screen.getByTestId('reference-library-entry-src-1')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-entry-src-2')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-entry-src-3')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-library-clear-tags')).not.toBeInTheDocument();
  });

  it('drops a selected tag that no longer exists after the sources change, rather than stranding an empty list', () => {
    const { rerender } = render(library({ sources: SOURCES }));
    rerender(library({ sources: [buildSource({ id: 'src-9', tags: ['Fresh'] })] }));

    expect(screen.getByTestId('reference-library-entry-src-9')).toBeInTheDocument();
    expect(screen.queryByTestId('reference-library-no-matches')).not.toBeInTheDocument();
  });
});

describe('ReferenceLibrary: the two empty states', () => {
  it('says the library is empty when the case has no sources at all', () => {
    render(library({ sources: [] }));

    const empty = screen.getByTestId('reference-library-empty');
    expect(empty).toBeInTheDocument();
    expect(screen.queryByTestId('reference-library-no-matches')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reference-library-count')).not.toBeInTheDocument();
  });

  it('says no source matches the tag filter -- a different situation, with a different sentence and a way out', async () => {
    const user = userEvent.setup();
    render(library({ sources: SOURCES }));

    await user.click(screen.getByTestId('reference-library-tag-Specifications'));
    await user.click(screen.getByTestId('reference-library-tag-Community'));

    const noMatches = screen.getByTestId('reference-library-no-matches');
    expect(noMatches).toBeInTheDocument();
    expect(screen.queryByTestId('reference-library-empty')).not.toBeInTheDocument();
    expect(noMatches.textContent).not.toEqual(
      screen.queryByTestId('reference-library-empty')?.textContent,
    );
    // The escape hatch stays reachable while nothing is listed.
    expect(screen.getByTestId('reference-library-clear-tags')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-count')).toHaveTextContent('0 of 3 sources');
  });
});

describe('ReferenceLibrary: accessibility and layout', () => {
  it('has no axe violations with a full library rendered', async () => {
    const { container } = render(
      library({
        sources: SOURCES,
        claims: [buildClaim({ sourceIds: ['src-1'] })],
        evidenceLinks: [buildEvidenceLink({ sourceId: 'src-1' })],
      }),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the empty state', async () => {
    const { container } = render(library({ sources: [] }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations while a tag filter matches nothing', async () => {
    const user = userEvent.setup();
    const { container } = render(library({ sources: SOURCES }));
    await user.click(screen.getByTestId('reference-library-tag-Specifications'));
    await user.click(screen.getByTestId('reference-library-tag-Community'));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders at 390px with no fixed-width overflow risk, even with a very long title and url', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      library({
        sources: [
          buildSource({
            id: 'src-long',
            title: 'A '.repeat(80) + 'very long title',
            url: `https://example.com/${'segment-'.repeat(40)}end`,
            tags: ['A tag whose label is itself unusually long and descriptive'],
            summary: 'x'.repeat(2000),
            excerpt: 'y'.repeat(2000),
          }),
        ],
      }),
    );
    expect(overflowRisks).toEqual([]);
  });
});

describe('ReferenceLibrarySheet', () => {
  it('renders the library inside the sheet when open', () => {
    render(
      <ReferenceLibrarySheet
        open
        onOpenChange={vi.fn()}
        sources={SOURCES}
        claims={[]}
        evidenceLinks={[]}
      />,
    );

    expect(screen.getByTestId('reference-library-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library')).toBeInTheDocument();
    expect(screen.getByTestId('reference-library-entry-src-1')).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    render(
      <ReferenceLibrarySheet
        open={false}
        onOpenChange={vi.fn()}
        sources={SOURCES}
        claims={[]}
        evidenceLinks={[]}
      />,
    );
    expect(screen.queryByTestId('reference-library-sheet')).not.toBeInTheDocument();
  });

  it('reports a dismissal through onOpenChange rather than closing itself', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ReferenceLibrarySheet
        open
        onOpenChange={onOpenChange}
        sources={SOURCES}
        claims={[]}
        evidenceLinks={[]}
      />,
    );

    await user.click(screen.getByTestId('sheet-close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('has no axe violations while open', async () => {
    const { baseElement } = render(
      <ReferenceLibrarySheet
        open
        onOpenChange={vi.fn()}
        sources={SOURCES}
        claims={[]}
        evidenceLinks={[]}
      />,
    );
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
