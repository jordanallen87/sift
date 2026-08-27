import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { AppProviders } from './AppProviders.js';
import { createFakePaxCommands, buildFakeCommandReceipt } from '../test/fake-pax-commands.js';

describe('App', () => {
  it('renders the demo launcher when no case is active', () => {
    render(
      <AppProviders commandsClient={createFakePaxCommands()}>
        <App />
      </AppProviders>,
    );

    expect(screen.getByTestId('demo-launcher')).toBeInTheDocument();
    expect(screen.queryByTestId('case-workspace')).not.toBeInTheDocument();
  });

  it('transitions from the launcher to the case workspace once a demo starts', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-abc' });
    const commands = createFakePaxCommands({
      startDemo: () => Promise.resolve(receipt),
    });
    const user = userEvent.setup();

    render(
      <AppProviders commandsClient={commands}>
        <App />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Choose our next car' }));

    await waitFor(() => {
      expect(screen.getByTestId('case-workspace')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('demo-launcher')).not.toBeInTheDocument();
  });

  it('has no routing chrome -- renders exactly one top-level region at a time', () => {
    render(
      <AppProviders commandsClient={createFakePaxCommands()}>
        <App />
      </AppProviders>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
