/**
 * The "unsupported WebMCP host" required visible state
 * (docs/specs/product.md "Required visible states"; docs/specs/webmcp.md
 * "Browser adapter": "When WebMCP is unavailable, the website remains fully
 * usable through visible controls and shows a non-blocking `WebMCP
 * unavailable in this browser` notice.").
 *
 * Calls the exact real `adapter.supported()` check this task's brief
 * requires -- no re-implemented feature-detection guess of its own. A
 * caller wires the real `BrowserModelContextAdapter` in production; tests
 * (and this component's own tests) can substitute
 * `InMemoryModelContextAdapter` or any other `ModelContextAdapter`.
 *
 * ## Why the supported copy does not name a product
 *
 * It used to read "ChatGPT can operate this page directly", and that was a
 * claim this component cannot make. `adapter.supported()` tests for
 * `document.modelContext` -- the browser's WebMCP surface. It says a host
 * is present; it says nothing about *which* host, and the page has no way
 * to find out. Chrome 152 ships WebMCP natively, so the first real host to
 * exercise this line was Chrome, with the pane telling the person ChatGPT
 * was driving (`pnpm test:host`, ADR 0013). Naming the assistant a person
 * happens to be using is their business, not something to guess at from a
 * feature detect.
 */
import type { ModelContextAdapter } from '../model-context/adapter.js';

export interface WebMcpStatusProps {
  adapter: ModelContextAdapter;
}

/**
 * Shared row styling: one line, a status dot, muted small type.
 *
 * This used to be a bare paragraph of body copy sitting in the content
 * column, where it wrapped to two full lines at every width the pane
 * actually renders at and cost roughly 40px of the scarcest resource the
 * product has. It reads as a strip of chrome now rather than as a sentence
 * competing with the case, which is what it always was: a persistent
 * statement about the host, not a thing to read once and act on.
 *
 * `items-start` rather than `items-center`, because the text can still wrap
 * at 390px and a centred dot would drift to the middle of a two-line block.
 */
const ROW_CLASS =
  'flex items-start gap-[var(--space-1-5)] text-[length:var(--font-size-xs)] leading-[var(--line-height-snug)] text-[var(--color-ink-muted)]';

/** `mt-[0.35em]` optically centres the dot on the first line of text rather than on the box. */
const DOT_CLASS = 'mt-[0.35em] size-[6px] shrink-0 rounded-full';

export function WebMcpStatus({ adapter }: WebMcpStatusProps) {
  const supported = adapter.supported();

  if (!supported) {
    return (
      <p data-testid="webmcp-status-unsupported" role="status" className={ROW_CLASS}>
        <span
          aria-hidden="true"
          className={DOT_CLASS}
          style={{ backgroundColor: 'var(--color-ink-muted)' }}
        />
        {/*
          "WebMCP unavailable in this browser" is kept verbatim: it is the
          exact notice docs/specs/webmcp.md's "Browser adapter" section
          requires, and this component's own test asserts that substring. Only
          the reassurance after it was tightened.
        */}
        <span>WebMCP unavailable in this browser — every action is still available here.</span>
      </p>
    );
  }

  return (
    <p data-testid="webmcp-status-supported" role="status" className={ROW_CLASS}>
      <span
        aria-hidden="true"
        className={DOT_CLASS}
        style={{ backgroundColor: 'var(--color-status-active-ink)' }}
      />
      <span>WebMCP ready — a connected assistant can operate this page.</span>
    </p>
  );
}
