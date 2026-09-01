/**
 * `MarkdownText` is a security boundary before it is a styling feature, so
 * this file is organised around what an attacker could put in the string
 * rather than around what an author hopes to write.
 *
 * The content this component renders is written by a MODEL and displayed in
 * the user's browser. `safeString` (`packages/contracts/src/attributes.ts`)
 * holds one half of the boundary at the contract edge -- it rejects `<tag`,
 * `javascript:`, and `on*=` handlers -- and this component holds the other
 * half at the render edge. The two halves are deliberately independent:
 * these tests all feed strings that `safeString` would have rejected, so
 * they prove the renderer is safe ON ITS OWN, with no reliance on the
 * contract check having run. Defence in depth is only defence if each layer
 * is tested without the other.
 *
 * Every adversarial case asserts on the DOM (`container.querySelector`),
 * never on rendered text. A string assertion cannot tell the difference
 * between "the escaped characters are visible" and "a live element was
 * created and its text happens to match", which is exactly the difference
 * that matters here.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MarkdownText } from './MarkdownText.js';

describe('MarkdownText', () => {
  describe('link schemes -- the half of the boundary safeString does not cover', () => {
    it('renders a javascript: link as text, never as an anchor', () => {
      // Deliberately paren-free. `javascript:alert(1)` is refused one step
      // EARLIER -- the link pattern excludes parentheses from a URL, so that
      // form never reaches the scheme check at all -- and a test that used it
      // would pass without the allowlist existing. This form is a
      // well-formed link whose only defect is its scheme, which is precisely
      // what `safeLinkHref` is for.
      const { container } = render(
        <MarkdownText>{'Read [the note](javascript:alert) first.'}</MarkdownText>,
      );
      expect(container.querySelector('a')).toBeNull();
      // Nothing is silently swallowed either: the source stays visible so a
      // reader can see that something odd was written.
      expect(container.textContent).toContain('the note');
      expect(container.textContent).toContain('javascript:');
    });

    it('renders the parenthesised javascript:alert(1) form as text too', () => {
      const { container } = render(
        <MarkdownText>{'Read [the note](javascript:alert(1)) first.'}</MarkdownText>,
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('the note');
    });

    it('renders a data:text/html link as text, never as an anchor', () => {
      const { container } = render(
        <MarkdownText>
          {'[open](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'}
        </MarkdownText>,
      );
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('open');
    });

    it('renders a vbscript: link as text, never as an anchor', () => {
      const { container } = render(<MarkdownText>{'[go](vbscript:msgbox)'}</MarkdownText>);
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('go');
    });

    it('renders a file: link as text, never as an anchor', () => {
      const { container } = render(<MarkdownText>{'[disk](file:///etc/passwd)'}</MarkdownText>);
      expect(container.querySelector('a')).toBeNull();
    });

    it('does not treat a protocol-relative //evil.com link as an external http link', () => {
      const { container } = render(<MarkdownText>{'[click here](//evil.com/steal)'}</MarkdownText>);
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('click here');
    });

    it('does not link a relative path -- a scheme is required, not merely permitted', () => {
      const { container } = render(<MarkdownText>{'[settings](/admin/settings)'}</MarkdownText>);
      expect(container.querySelector('a')).toBeNull();
    });

    it('does not link a scheme smuggled past the check with a control character', () => {
      const { container } = render(<MarkdownText>{'[x](java\u0001script:alert)'}</MarkdownText>);
      expect(container.querySelector('a')).toBeNull();
    });

    it('renders a legitimate https link as an anchor carrying rel="noopener noreferrer"', () => {
      const { container } = render(
        <MarkdownText>{'See [the filing](https://example.com/filing) for detail.'}</MarkdownText>,
      );
      const anchor = container.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor).toHaveAttribute('href', 'https://example.com/filing');
      expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
      expect(anchor).toHaveTextContent('the filing');
    });

    it('renders a legitimate http link, and accepts an upper-case scheme', () => {
      const { container } = render(<MarkdownText>{'[a](HTTP://example.com/x)'}</MarkdownText>);
      const anchor = container.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor).toHaveAttribute('href', 'HTTP://example.com/x');
      expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('raw HTML is never live DOM', () => {
    it('renders an <img onerror=...> payload as visible text and creates no image element', () => {
      const { container } = render(
        <MarkdownText>{'Before <img src=x onerror=alert(1)> after.'}</MarkdownText>,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('renders a <script> tag as visible text and creates no script element', () => {
      const { container } = render(
        <MarkdownText>{'Lead in. <script>alert(document.cookie)</script> Lead out.'}</MarkdownText>,
      );
      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toContain('<script>alert(document.cookie)</script>');
    });

    it('creates no element for HTML written inside a list item or a heading', () => {
      const { container } = render(
        <MarkdownText>
          {
            '# <script>alert(1)</script>\n\n- <img src=x onerror=alert(2)>\n- <iframe src=x></iframe>'
          }
        </MarkdownText>,
      );
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
    });

    it('creates no element for HTML written inside a fenced code block', () => {
      const { container } = render(
        <MarkdownText>{'```\n<script>alert(1)</script>\n```'}</MarkdownText>,
      );
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('pre')).not.toBeNull();
      expect(container.textContent).toContain('<script>alert(1)</script>');
    });
  });

  describe('images are never embedded', () => {
    it('renders image syntax as its alt text and produces no <img> element', () => {
      const { container } = render(
        <MarkdownText>{'Chart: ![quarterly totals](https://example.com/pixel.png)'}</MarkdownText>,
      );
      // A remote image URL is a tracking pixel and an exfiltration channel,
      // so the alt text is all that survives.
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain('quarterly totals');
      expect(container.textContent).not.toContain('pixel.png');
    });

    it('produces no <img> and no anchor for image syntax pointing at a data: URL', () => {
      const { container } = render(
        <MarkdownText>{'![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)'}</MarkdownText>,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('a')).toBeNull();
    });
  });

  describe('nothing in, nothing out', () => {
    it('renders nothing at all for an empty string', () => {
      const { container } = render(<MarkdownText>{''}</MarkdownText>);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing at all for a string of only whitespace', () => {
      const { container } = render(<MarkdownText>{'   \n\n \t  \n '}</MarkdownText>);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('the supported subset', () => {
    it('leaves plain prose exactly as written, with no stray formatting', () => {
      const prose = 'A plain sentence about this option, with no markup in it at all.';
      const { container } = render(<MarkdownText>{prose}</MarkdownText>);
      expect(container.textContent).toBe(prose);
      expect(container.querySelectorAll('p')).toHaveLength(1);
      for (const tag of ['strong', 'em', 'code', 'a', 'ul', 'ol', 'pre', 'h1', 'h2', 'h3', 'h4']) {
        expect(container.querySelector(tag)).toBeNull();
      }
    });

    it('splits blank-line-separated blocks into separate paragraphs', () => {
      const { container } = render(
        <MarkdownText>{'First thought.\n\nSecond thought.'}</MarkdownText>,
      );
      const paragraphs = [...container.querySelectorAll('p')].map((node) => node.textContent);
      expect(paragraphs).toEqual(['First thought.', 'Second thought.']);
    });

    it('renders bold and italic as <strong> and <em>', () => {
      const { container } = render(
        <MarkdownText>{'It is **important** and slightly *unusual*.'}</MarkdownText>,
      );
      expect(container.querySelector('strong')).toHaveTextContent('important');
      expect(container.querySelector('em')).toHaveTextContent('unusual');
    });

    it('renders inline code without interpreting the markup inside it', () => {
      const { container } = render(
        <MarkdownText>{'Set `format: **markdown**` on the value.'}</MarkdownText>,
      );
      const code = container.querySelector('code');
      expect(code).not.toBeNull();
      expect(code).toHaveTextContent('format: **markdown**');
      expect(container.querySelector('strong')).toBeNull();
    });

    it('renders a fenced code block verbatim, markup and all', () => {
      const { container } = render(
        <MarkdownText>
          {'Example:\n\n```json\n{ "a": **1** }\n{ "b": 2 }\n```\n\nDone.'}
        </MarkdownText>,
      );
      const pre = container.querySelector('pre');
      expect(pre).not.toBeNull();
      expect(pre?.textContent).toBe('{ "a": **1** }\n{ "b": 2 }');
      expect(container.querySelector('strong')).toBeNull();
    });

    it('renders an unordered list, whichever bullet marker was used', () => {
      const { container } = render(<MarkdownText>{'- first\n* second\n+ third'}</MarkdownText>);
      const items = [...container.querySelectorAll('ul li')].map((node) => node.textContent);
      expect(items).toEqual(['first', 'second', 'third']);
      expect(container.querySelector('ol')).toBeNull();
    });

    it('renders an ordered list and keeps the number it started at', () => {
      const { container } = render(<MarkdownText>{'3. third\n4. fourth'}</MarkdownText>);
      const list = container.querySelector('ol');
      expect(list).not.toBeNull();
      expect(list).toHaveAttribute('start', '3');
      expect([...container.querySelectorAll('ol li')].map((node) => node.textContent)).toEqual([
        'third',
        'fourth',
      ]);
    });

    it('formats inline markup inside list items', () => {
      const { container } = render(
        <MarkdownText>
          {'- a **bold** point\n- a [linked](https://example.com) point'}
        </MarkdownText>,
      );
      expect(container.querySelector('li strong')).toHaveTextContent('bold');
      expect(container.querySelector('li a')).toHaveAttribute('href', 'https://example.com');
    });

    it('renders headings as real heading elements at the requested level', () => {
      render(<MarkdownText headingLevel={4}>{'# Overview\n\nSome body copy.'}</MarkdownText>);
      expect(screen.getByRole('heading', { level: 4, name: 'Overview' })).toBeInTheDocument();
    });

    it('never skips a heading level, however deep the source jumps', () => {
      // `# ` then `##### ` would map to h4 then h8-clamped-to-h6, which axe's
      // heading-order rule reports as a skipped level. Depth is compressed
      // instead so the rendered outline is always contiguous.
      const { container } = render(
        <MarkdownText headingLevel={4}>{'# One\n\n##### Five\n\n###### Six'}</MarkdownText>,
      );
      const levels = [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((node) =>
        Number(node.tagName.slice(1)),
      );
      expect(levels).toEqual([4, 5, 6]);
    });

    it('treats a hash with no following space as ordinary text, not a heading', () => {
      const { container } = render(<MarkdownText>{'#4 in the ranking'}</MarkdownText>);
      expect(container.querySelector('h1,h2,h3,h4,h5,h6')).toBeNull();
      expect(container.textContent).toBe('#4 in the ranking');
    });

    it('leaves an underscore inside a word alone, so an identifier survives intact', () => {
      // `custom.fits_our_space` is exactly the kind of string a model writes
      // into this field; intraword emphasis would render it as "fitsourspace".
      const { container } = render(
        <MarkdownText>{'The field custom.fits_our_space is set.'}</MarkdownText>,
      );
      expect(container.querySelector('em')).toBeNull();
      expect(container.textContent).toBe('The field custom.fits_our_space is set.');
    });

    it('renders a realistic mixed document as one structured block', () => {
      const { container } = render(
        <MarkdownText>
          {[
            '## What we measured',
            '',
            'The rear opening is **wider than the listing suggests**, though the',
            'load floor sits higher.',
            '',
            '- Opening: 44 in',
            '- Load floor: 30 in',
            '',
            'Source: [the manufacturer sheet](https://example.com/sheet).',
          ].join('\n')}
        </MarkdownText>,
      );
      expect(container.querySelector('h4,h5')).not.toBeNull();
      expect(container.querySelectorAll('li')).toHaveLength(2);
      expect(container.querySelector('strong')).toHaveTextContent(
        'wider than the listing suggests',
      );
      expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com/sheet');
      // A soft line break inside one paragraph is a space, not a new block.
      expect(container.textContent).toContain('though the load floor sits higher');
    });
  });

  describe('the canonical 390px pane', () => {
    /**
     * jsdom does no layout, so this asserts the guards are DECLARED rather
     * than that nothing overflowed -- the real "no horizontal overflow"
     * assertion belongs to the Playwright gate, at every required viewport.
     * It is still worth pinning: a model-written URL or identifier is exactly
     * the unbreakable token that pushes a 390px pane into horizontal scroll,
     * and losing either guard is a silent regression.
     */
    it('declares the wrap and scroll guards long unbreakable content depends on', () => {
      const { container } = render(
        <MarkdownText data-testid="md">
          {`https://example.com/${'a'.repeat(400)}\n\n\`\`\`\n${'x'.repeat(400)}\n\`\`\``}
        </MarkdownText>,
      );
      const wrapper = screen.getByTestId('md');
      expect(wrapper.className).toContain('[overflow-wrap:anywhere]');
      expect(wrapper.className).toContain('min-w-0');
      // A code block cannot wrap, so it scrolls inside itself instead.
      expect(container.querySelector('pre')?.className).toContain('overflow-x-auto');
    });
  });

  describe('accessibility', () => {
    it('has no axe violations on a document using every supported construct', async () => {
      const { container } = render(
        <MarkdownText headingLevel={4}>
          {[
            '# Heading',
            '',
            'A paragraph with **bold**, *italic*, `code`, and a',
            '[link](https://example.com).',
            '',
            '## Sub heading',
            '',
            '- one',
            '- two',
            '',
            '1. first',
            '2. second',
            '',
            '```ts',
            'const answer = 42;',
            '```',
          ].join('\n')}
        </MarkdownText>,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no axe violations on a document full of rejected links and raw HTML', async () => {
      const { container } = render(
        <MarkdownText>
          {
            '[a](javascript:alert(1)) [b](//evil.com) <script>alert(2)</script> ![c](https://e/x.png)'
          }
        </MarkdownText>,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
