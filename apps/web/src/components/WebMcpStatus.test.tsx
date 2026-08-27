import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { WebMcpStatus } from './WebMcpStatus.js';
import {
  BrowserModelContextAdapter,
  InMemoryModelContextAdapter,
} from '../model-context/adapter.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

describe('WebMcpStatus', () => {
  it('shows the non-blocking "WebMCP unavailable in this browser" notice when the real BrowserModelContextAdapter reports unsupported', () => {
    // No `document.modelContext` exists in this jsdom test environment, so
    // the REAL adapter's own `.supported()` check (not a re-implemented
    // guess) genuinely returns false here.
    render(<WebMcpStatus adapter={new BrowserModelContextAdapter()} />);

    const notice = screen.getByTestId('webmcp-status-unsupported');
    expect(notice).toHaveTextContent('WebMCP unavailable in this browser');
    // Non-blocking: a polite status announcement, not an alert, and no
    // control on the page is disabled by its presence.
    expect(notice).toHaveAttribute('role', 'status');
  });

  it('shows a supported confirmation when the adapter reports supported', () => {
    render(<WebMcpStatus adapter={new InMemoryModelContextAdapter()} />);
    expect(screen.getByTestId('webmcp-status-supported')).toHaveTextContent(/ready/i);
    expect(screen.queryByTestId('webmcp-status-unsupported')).not.toBeInTheDocument();
  });

  it('has no axe violations in either state', async () => {
    const { container: unsupported } = render(
      <WebMcpStatus adapter={new BrowserModelContextAdapter()} />,
    );
    expect(await axe(unsupported)).toHaveNoViolations();

    const { container: supported } = render(
      <WebMcpStatus adapter={new InMemoryModelContextAdapter()} />,
    );
    expect(await axe(supported)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <WebMcpStatus adapter={new BrowserModelContextAdapter()} />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
