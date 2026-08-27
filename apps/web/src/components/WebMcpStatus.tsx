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
      WebMCP ready — ChatGPT can operate this page directly.
    </p>
  );
}
