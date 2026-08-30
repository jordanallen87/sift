/**
 * Contract test for `ModelContextAdapter` (docs/specs/webmcp.md "Browser
 * adapter"): both the `document.modelContext`-backed production
 * implementation (feature-detected, so an unsupported browser degrades
 * gracefully rather than throwing at import/mount time) and the in-memory
 * test double every other `model-context/*.test.ts` file uses to register
 * tools and invoke their `execute` callbacks directly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserModelContextAdapter,
  InMemoryModelContextAdapter,
  type WebMcpToolDefinition,
} from './adapter.js';

function buildTool(
  name: string,
  overrides: Partial<WebMcpToolDefinition> = {},
): WebMcpToolDefinition {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe('InMemoryModelContextAdapter', () => {
  it('reports supported() as true', () => {
    const adapter = new InMemoryModelContextAdapter();
    expect(adapter.supported()).toBe(true);
  });

  it('records every registerTool call in order', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const toolA = buildTool('tool_a');
    const toolB = buildTool('tool_b');

    await adapter.registerTool(toolA);
    await adapter.registerTool(toolB);

    expect(adapter.calls).toEqual([toolA, toolB]);
    expect(adapter.registeredToolNames).toEqual(['tool_a', 'tool_b']);
    expect(adapter.getRegisteredTool('tool_a')).toBe(toolA);
  });

  it('invokes a registered tool execute callback with a given input and abort signal', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const execute = vi.fn().mockResolvedValue({ ok: true, echoed: true });
    await adapter.registerTool(buildTool('echo_tool', { execute }));

    const controller = new AbortController();
    const result = await adapter.invoke(
      'echo_tool',
      { hello: 'world' },
      {
        signal: controller.signal,
      },
    );

    expect(execute).toHaveBeenCalledWith({ hello: 'world' }, { signal: controller.signal });
    expect(result).toEqual({ ok: true, echoed: true });
  });

  it('throws when invoking a tool name that was never registered', async () => {
    const adapter = new InMemoryModelContextAdapter();
    await expect(adapter.invoke('does_not_exist', {})).rejects.toThrow(/does_not_exist/);
  });

  it('unregisters a tool once its registration signal aborts', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const controller = new AbortController();
    await adapter.registerTool(buildTool('case_tool'), { signal: controller.signal });

    expect(adapter.getRegisteredTool('case_tool')).toBeDefined();

    controller.abort();

    expect(adapter.getRegisteredTool('case_tool')).toBeUndefined();
    expect(adapter.registeredToolNames).not.toContain('case_tool');
    await expect(adapter.invoke('case_tool', {})).rejects.toThrow();
  });

  it('never registers a tool whose signal is already aborted', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const controller = new AbortController();
    controller.abort();

    await adapter.registerTool(buildTool('already_aborted'), { signal: controller.signal });

    expect(adapter.getRegisteredTool('already_aborted')).toBeUndefined();
  });

  it('replaces the previous registration when the same tool name registers again', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const first = buildTool('sift_focus_option', { execute: vi.fn().mockResolvedValue('first') });
    const second = buildTool('sift_focus_option', { execute: vi.fn().mockResolvedValue('second') });

    await adapter.registerTool(first);
    await adapter.registerTool(second);

    expect(adapter.registeredToolNames).toEqual(['sift_focus_option']);
    await expect(adapter.invoke('sift_focus_option', {})).resolves.toBe('second');
  });

  it("does not let an old registration's abort remove a newer registration under the same name", async () => {
    const adapter = new InMemoryModelContextAdapter();
    const firstController = new AbortController();
    const first = buildTool('sift_focus_option');
    const second = buildTool('sift_focus_option');

    await adapter.registerTool(first, { signal: firstController.signal });
    await adapter.registerTool(second);

    firstController.abort();

    expect(adapter.getRegisteredTool('sift_focus_option')).toBe(second);
  });
});

describe('BrowserModelContextAdapter', () => {
  afterEach(() => {
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });

  it('reports supported() as false when document.modelContext is absent', () => {
    const adapter = new BrowserModelContextAdapter();
    expect(adapter.supported()).toBe(false);
  });

  it('rejects registerTool when unsupported, without throwing synchronously or breaking the app', async () => {
    const adapter = new BrowserModelContextAdapter();
    await expect(adapter.registerTool(buildTool('sift_get_case_context'))).rejects.toThrow(
      /WebMCP unavailable/i,
    );
  });

  it('reports supported() as true and forwards registerTool to document.modelContext when present', async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    (document as unknown as { modelContext: { registerTool: typeof registerTool } }).modelContext =
      { registerTool };

    const adapter = new BrowserModelContextAdapter();
    expect(adapter.supported()).toBe(true);

    const tool = buildTool('sift_get_case_context');
    const controller = new AbortController();
    await adapter.registerTool(tool, { signal: controller.signal });

    expect(registerTool).toHaveBeenCalledWith(tool, { signal: controller.signal });
  });
});
