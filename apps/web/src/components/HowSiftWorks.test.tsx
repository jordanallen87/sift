import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import { AppProviders } from '../app/AppProviders.js';
import { InMemoryModelContextAdapter } from '../model-context/adapter.js';
import { SIFT_WEBMCP_TOOL_NAMES } from '../model-context/register-sift-tools.js';
import {
  ASSISTANT_PHRASES,
  HOW_SIFT_WORKS_SUMMARY,
  HOW_SIFT_WORKS_TITLE,
  HowSiftWorksContent,
} from './HowSiftWorks.js';

/** WebMCP present: the real `InMemoryModelContextAdapter.supported()` returns `true`. */
function renderWithWebMcp() {
  return render(
    <AppProviders webMcpAdapter={new InMemoryModelContextAdapter()}>
      <HowSiftWorksContent />
    </AppProviders>,
  );
}

/**
 * WebMCP absent: rendered with no `<AppProviders>` at all, which is the
 * same signal a stock browser gives -- `useWebMcpSupported()` resolves to
 * `false` rather than throwing.
 */
function renderWithoutWebMcp() {
  return render(<HowSiftWorksContent />);
}

describe('HowSiftWorks shared content', () => {
  it('cites only tools that are genuinely registered', () => {
    const registered = new Set<string>(SIFT_WEBMCP_TOOL_NAMES);
    for (const phrase of ASSISTANT_PHRASES) {
      expect(phrase.tools.length).toBeGreaterThan(0);
      for (const tool of phrase.tools) {
        expect(registered.has(tool), `${tool} is not in SIFT_WEBMCP_TOOL_NAMES`).toBe(true);
      }
    }
  });

  it('never cites an approval-shaped tool, because none exists', () => {
    const approvalShaped = /approve|reject|review_proposal|reviewProposal/i;
    for (const phrase of ASSISTANT_PHRASES) {
      for (const tool of phrase.tools) {
        expect(approvalShaped.test(tool)).toBe(false);
      }
    }
  });

  it('names the product and the shared-authority claim in one summary line', () => {
    expect(HOW_SIFT_WORKS_TITLE).toBe('How Sift works');
    expect(HOW_SIFT_WORKS_SUMMARY).toMatch(/share/i);
  });

  it('names the real visible controls, exactly as they render', () => {
    renderWithWebMcp();
    const controls = screen.getByTestId('how-sift-works-controls');
    // Every string below is a live label: RecommendationHero.tsx ("Ask Sift
    // to look into this", "Inspect run"), WorkspaceAppBar.tsx ("Findings",
    // CREATE_MENU_LABEL "Add or adjust"), DemoLauncher.tsx.
    expect(within(controls).getByText('Ask Sift to look into this')).toBeInTheDocument();
    expect(within(controls).getByText('Findings')).toBeInTheDocument();
    expect(within(controls).getByText('Add or adjust')).toBeInTheDocument();
    expect(within(controls).getByText('Inspect run')).toBeInTheDocument();
  });

  it('names the real launcher entry points', () => {
    renderWithWebMcp();
    const start = screen.getByTestId('how-sift-works-start');
    expect(within(start).getByText('Compare vehicles')).toBeInTheDocument();
    expect(within(start).getByText(/Or try a finished example/)).toBeInTheDocument();
  });

  it('renders every copy-paste assistant phrase with what it does', () => {
    renderWithWebMcp();
    const phrases = screen.getByTestId('how-sift-works-phrases');
    for (const phrase of ASSISTANT_PHRASES) {
      expect(within(phrases).getByText(`“${phrase.phrase}”`)).toBeInTheDocument();
      expect(within(phrases).getByText(phrase.effect)).toBeInTheDocument();
    }
    expect(ASSISTANT_PHRASES.length).toBeGreaterThanOrEqual(6);
  });

  it('states the authority boundary and names the human-only controls', () => {
    renderWithWebMcp();
    const boundary = screen.getByTestId('how-sift-works-authority');
    expect(boundary).toHaveTextContent(/cannot approve/i);
    // ApprovalCard.tsx's three real decision controls.
    expect(boundary).toHaveTextContent('Choose this');
    expect(boundary).toHaveTextContent('Pass');
    expect(boundary).toHaveTextContent('Keep researching');
  });

  it('reports the real registered tool count rather than a hard-coded number', () => {
    renderWithWebMcp();
    expect(screen.getByTestId('how-sift-works-phrases-lead')).toHaveTextContent(
      String(SIFT_WEBMCP_TOOL_NAMES.length),
    );
  });

  it('promises assistant interaction only where WebMCP actually exists', () => {
    renderWithWebMcp();
    const lead = screen.getByTestId('how-sift-works-phrases-lead');
    expect(lead).toHaveTextContent(/plain language is enough/i);
    expect(lead).not.toHaveTextContent(/no WebMCP host/i);
  });

  it('says plainly that an assistant cannot reach this page when WebMCP is unavailable', () => {
    renderWithoutWebMcp();
    const lead = screen.getByTestId('how-sift-works-phrases-lead');
    expect(lead).toHaveTextContent(/no WebMCP host/i);
    // The phrases still render -- they are what the product does, and they
    // are honestly framed as host-dependent rather than promised here.
    expect(screen.getByTestId('how-sift-works-phrases')).toBeInTheDocument();
  });

  it('has no axe violations in either WebMCP state', async () => {
    const supported = renderWithWebMcp();
    expect(await axe(supported.container)).toHaveNoViolations();
    supported.unmount();

    const unsupported = renderWithoutWebMcp();
    expect(await axe(unsupported.container)).toHaveNoViolations();
  });
});
