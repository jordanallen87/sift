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

export function WebMcpStatus({ adapter }: WebMcpStatusProps) {
  const supported = adapter.supported();

  if (!supported) {
    return (
      <p
        data-testid="webmcp-status-unsupported"
        role="status"
        className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
      >
        WebMCP unavailable in this browser. Every action here is still available through the visible
        controls on this page.
      </p>
    );
  }

  return (
    <p
      data-testid="webmcp-status-supported"
      role="status"
      className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
    >
      WebMCP ready — a connected assistant can operate this page directly.
    </p>
  );
}
