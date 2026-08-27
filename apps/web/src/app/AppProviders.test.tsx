import { describe, expect, it } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { AppProviders, useApiConfig, usePaxCommands, useWebMcpAdapter } from './AppProviders.js';
import { createFakePaxCommands } from '../test/fake-pax-commands.js';
import {
  BrowserModelContextAdapter,
  InMemoryModelContextAdapter,
} from '../model-context/adapter.js';

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

  it('provides an empty ApiConfig by default', () => {
    const { result } = renderHook(() => useApiConfig(), {
      wrapper: ({ children }) => <AppProviders>{children}</AppProviders>,
    });
    expect(result.current).toEqual({});
  });

  it('lets a test inject caseEventsConfig overrides that descendants receive by identity', () => {
    const config = { baseUrl: 'http://pax.test' };
    const { result } = renderHook(() => useApiConfig(), {
      wrapper: ({ children }) => <AppProviders caseEventsConfig={config}>{children}</AppProviders>,
    });
    expect(result.current).toBe(config);
  });

  it('provides a default real BrowserModelContextAdapter when no override is given', () => {
    const { result } = renderHook(() => useWebMcpAdapter(), {
      wrapper: ({ children }) => <AppProviders>{children}</AppProviders>,
    });
    expect(result.current).toBeInstanceOf(BrowserModelContextAdapter);
  });

  it('lets a test inject a fake ModelContextAdapter that descendants receive by identity', () => {
    const adapter = new InMemoryModelContextAdapter();
    const { result } = renderHook(() => useWebMcpAdapter(), {
      wrapper: ({ children }) => <AppProviders webMcpAdapter={adapter}>{children}</AppProviders>,
    });
    expect(result.current).toBe(adapter);
  });

  it('throws a clear error when useWebMcpAdapter is called outside AppProviders', () => {
    const { result } = renderHook(() => {
      try {
        return { error: null, value: useWebMcpAdapter() };
      } catch (error) {
        return { error, value: null };
      }
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toMatch(/AppProviders/);
  });
});
