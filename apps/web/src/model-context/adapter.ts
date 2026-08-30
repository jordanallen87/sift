/**
 * WebMCP browser adapter (docs/specs/webmcp.md "Browser adapter"):
 *
 * ```ts
 * interface ModelContextAdapter {
 *   supported(): boolean
 *   registerTool(definition: WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<void>
 * }
 * ```
 *
 * "Production uses `document.modelContext`. Tests inject an in-memory
 * adapter that captures registrations and executes callbacks with schema
 * validation." -- `BrowserModelContextAdapter` below is the production
 * implementation; `InMemoryModelContextAdapter` is the test double.
 *
 * "When WebMCP is unavailable, the website remains fully usable through
 * visible controls and shows a non-blocking `WebMCP unavailable in this
 * browser` notice." `BrowserModelContextAdapter.supported()` is the feature
 * detection a later UI component reads to decide whether to render that
 * notice; `registerTool()` rejects (never throws synchronously, never
 * crashes the app) when called on an unsupported browser, so a caller that
 * forgets to check `supported()` first still fails safely.
 *
 * Registration-lifetime signal vs. per-call signal: `registerTool`'s
 * `options.signal` controls how long the *tool definition itself* stays
 * registered (webmcp.md "Registration lifecycle": "Abort the previous
 * registration controller whenever the active case changes or the
 * component unmounts" -- `register-sift-tools.ts` creates a fresh
 * `AbortController` per case generation and aborts it to unregister that
 * generation's case-scoped tools). `WebMcpToolDefinition.execute`'s own
 * second `context.signal` parameter is a *separate*, per-invocation signal
 * the browser can abort to cancel one in-flight tool call without
 * unregistering the tool (webmcp.md "Cancellation and concurrency": "Each
 * callback accepts the browser-provided abort signal ... Cancellation
 * produces `UNAVAILABLE` with `retryable: true` and does not apply a late
 * response" -- a per-call concept, distinct from unregistration).
 *
 * Ambient typing choice (this task's brief asked this to be called out
 * explicitly, not silently decided): `document.modelContext` is declared
 * here as a hand-rolled ambient `Document` augmentation, not via the
 * types-only `webmcp-types` / `@mcp-b/webmcp-types` packages. Reasoning: the
 * surface this codebase actually calls is exactly one method
 * (`registerTool`), already fully specified by webmcp.md's own
 * `ModelContextAdapter` interface; hand-rolling it keeps that one global
 * declaration exact, avoids taking on a new supply-chain dependency (and
 * the offline-install risk of adding one mid-build) for a single `.d.ts`
 * shape this file already needs to state precisely to type-check
 * `BrowserModelContextAdapter`, and avoids importing a third-party package's
 * possibly-broader `document.modelContext` surface (additional methods this
 * codebase does not use and has not verified against the current origin
 * trial). No runtime WebMCP polyfill (e.g. `@mcp-b/webmcp-polyfill`,
 * `@mcp-b/global`) is added anywhere in this module or task -- production
 * behavior depends solely on the real browser API being present.
 */

export interface WebMcpToolCallContext {
  /** Per-invocation abort signal; aborts *this one call*, not the tool's registration. */
  signal?: AbortSignal;
}

export interface WebMcpToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** JSON Schema (draft 2020-12) object describing `TInput`. */
  inputSchema: Record<string, unknown>;
  execute: (input: TInput, context?: WebMcpToolCallContext) => Promise<TOutput>;
}

export interface WebMcpRegisterOptions {
  /** Registration-lifetime abort signal; aborting unregisters the tool. */
  signal?: AbortSignal;
}

/** docs/specs/webmcp.md "Browser adapter" -- copied verbatim by method name, parameter, and return type. */
export interface ModelContextAdapter {
  supported(): boolean;
  registerTool(definition: WebMcpToolDefinition, options?: WebMcpRegisterOptions): Promise<void>;
}

declare global {
  interface Document {
    /** Present only in browsers shipping the WebMCP origin trial (Chrome 149-156 behind `chrome://flags/#enable-webmcp-testing` as of this build). */
    modelContext?: {
      registerTool: (
        definition: WebMcpToolDefinition,
        options?: WebMcpRegisterOptions,
      ) => Promise<void>;
    };
  }
}

/** Production `ModelContextAdapter`, backed by the real `document.modelContext`. */
export class BrowserModelContextAdapter implements ModelContextAdapter {
  supported(): boolean {
    return (
      typeof document !== 'undefined' && typeof document.modelContext?.registerTool === 'function'
    );
  }

  async registerTool(
    definition: WebMcpToolDefinition,
    options?: WebMcpRegisterOptions,
  ): Promise<void> {
    if (!this.supported()) {
      throw new Error('WebMCP unavailable in this browser: document.modelContext is not present.');
    }
    // `supported()` just confirmed `document.modelContext` exists; the `!`
    // asserts a fact already checked, it does not bypass the check.
    await document.modelContext!.registerTool(definition, options);
  }
}

interface RegistrationRecord {
  definition: WebMcpToolDefinition;
}

/**
 * In-memory `ModelContextAdapter` test double (webmcp.md "Tests inject an
 * in-memory adapter that captures registrations and executes callbacks with
 * schema validation" -- schema validation itself lives at the tool-callback
 * boundary in `register-sift-tools.ts`, not in this generic adapter).
 */
export class InMemoryModelContextAdapter implements ModelContextAdapter {
  private readonly byName = new Map<string, RegistrationRecord>();

  /** Every `registerTool` call ever made, in call order, including ones later superseded or unregistered -- the full registration history for lifecycle assertions. */
  readonly calls: WebMcpToolDefinition[] = [];

  supported(): boolean {
    return true;
  }

  // Not `async`: every branch here is synchronous bookkeeping with nothing
  // to `await`; the interface still requires `Promise<void>`, so each
  // branch returns `Promise.resolve()` explicitly instead of adding an
  // `async` keyword with no `await` inside it.
  registerTool(definition: WebMcpToolDefinition, options?: WebMcpRegisterOptions): Promise<void> {
    this.calls.push(definition);

    const { signal } = options ?? {};
    if (signal?.aborted) {
      // Registering with an already-aborted signal is a same-tick no-op:
      // the tool is never exposed as currently registered.
      return Promise.resolve();
    }

    const record: RegistrationRecord = { definition };
    this.byName.set(definition.name, record);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          // Only remove this exact registration -- a newer registration
          // under the same name (a later case generation) must not be torn
          // down by an older generation's abort firing late.
          if (this.byName.get(definition.name) === record) {
            this.byName.delete(definition.name);
          }
        },
        { once: true },
      );
    }

    return Promise.resolve();
  }

  /** The tool currently registered under `name`, or `undefined` if never registered or since unregistered. */
  getRegisteredTool(name: string): WebMcpToolDefinition | undefined {
    return this.byName.get(name)?.definition;
  }

  get registeredToolNames(): string[] {
    return [...this.byName.keys()];
  }

  /** Directly invokes a currently-registered tool's `execute` callback with a given input and optional per-call abort signal -- the seam tests use to simulate ChatGPT calling a tool. Throws if no tool is currently registered under `name`. */
  async invoke<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput,
    context?: WebMcpToolCallContext,
  ): Promise<TOutput> {
    const tool = this.getRegisteredTool(name);
    if (!tool) {
      throw new Error(`No tool named "${name}" is currently registered.`);
    }
    return tool.execute(input, context) as Promise<TOutput>;
  }
}
