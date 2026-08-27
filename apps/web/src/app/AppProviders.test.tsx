import { describe, expect, it } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { AppProviders, usePaxCommands } from './AppProviders.js';
import { createFakePaxCommands } from '../test/fake-pax-commands.js';

describe('AppProviders', () => {
  it('renders its children', () => {
    render(
      <AppProviders>
        <p>child content</p>
      </AppProviders>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('provides a default PaxCommands client to descendants when no override is given', () => {
    const { result } = renderHook(() => usePaxCommands(), {
      wrapper: ({ children }) => <AppProviders>{children}</AppProviders>,
    });

    expect(typeof result.current.startDemo).toBe('function');
    expect(typeof result.current.requestInvestigation).toBe('function');
  });

  it('lets a test inject a fake PaxCommands client that descendants receive by identity', () => {
    const fakeClient = createFakePaxCommands();

    const { result } = renderHook(() => usePaxCommands(), {
      wrapper: ({ children }) => (
        <AppProviders commandsClient={fakeClient}>{children}</AppProviders>
      ),
    });

    expect(result.current).toBe(fakeClient);
  });

  it('throws a clear error when usePaxCommands is called outside AppProviders', () => {
    const { result } = renderHook(() => {
      try {
        return { error: null, value: usePaxCommands() };
      } catch (error) {
        return { error, value: null };
      }
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toMatch(/AppProviders/);
  });
});
