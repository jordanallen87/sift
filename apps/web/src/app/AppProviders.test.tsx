import { describe, expect, it } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { AppProviders, useApiConfig, useSiftCommands, useWebMcpAdapter } from './AppProviders.js';
import { createFakeSiftCommands } from '../test/fake-sift-commands.js';
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

  it('provides a default SiftCommands client to descendants when no override is given', () => {
    const { result } = renderHook(() => useSiftCommands(), {
      wrapper: ({ children }) => <AppProviders>{children}</AppProviders>,
    });

    expect(typeof result.current.startDemo).toBe('function');
    expect(typeof result.current.requestInvestigation).toBe('function');
  });

  it('lets a test inject a fake SiftCommands client that descendants receive by identity', () => {
    const fakeClient = createFakeSiftCommands();

    const { result } = renderHook(() => useSiftCommands(), {
      wrapper: ({ children }) => (
        <AppProviders commandsClient={fakeClient}>{children}</AppProviders>
      ),
    });

    expect(result.current).toBe(fakeClient);
  });

  it('throws a clear error when useSiftCommands is called outside AppProviders', () => {
    const { result } = renderHook(() => {
      try {
        return { error: null, value: useSiftCommands() };
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
    const config = { baseUrl: 'http://sift.test' };
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
