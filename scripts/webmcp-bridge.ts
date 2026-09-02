#!/usr/bin/env tsx
/**
 * `pnpm webmcp:bridge` — lets a real coding agent drive Sift's WebMCP tools.
 *
 * ## Why this exists
 *
 * `pnpm test:journey` proves the tools are callable and correct, but *this
 * script* chooses every call. It cannot tell you whether a model finds the
 * tools, reads their descriptions the way you meant them, or sequences them
 * sensibly — which is the half of the WebMCP claim no scripted harness can
 * reach.
 *
 * Chrome 152 exposes a `WebMCP` CDP domain, so anything that speaks CDP can
 * be a WebMCP client. This is a stdio **MCP server** that is exactly that
 * bridge:
 *
 *   MCP `tools/list`  ←  the page's live `WebMCP.toolsAdded` registrations
 *   MCP `tools/call`  →  `WebMCP.invokeTool` in the real browser
 *
 * Point Codex, Claude Code, or any MCP client at it and a real model is
 * driving the real page, with the real tool descriptions, and can fix what
 * it finds as it goes.
 *
 * ## Configure a client
 *
 *   {
 *     "mcpServers": {
 *       "sift-page": {
 *         "command": "pnpm",
 *         "args": ["-s", "webmcp:bridge"],
 *         "env": { "SIFT_HOST_URL": "http://localhost:8080" }
 *       }
 *     }
 *   }
 *
 * ## What this is not
 *
 * A development tool, not part of the product and not shipped in the image.
 * It opens a visible browser on a throwaway profile and hands a model
 * control of that page: every call it makes is real, against whatever
 * instance `SIFT_HOST_URL` names. Point it at a local build, not at
 * anything whose state you care about.
 *
 * MCP's stdio transport is newline-delimited JSON-RPC on stdout, so
 * **nothing but protocol may be written there** — all logging goes to
 * stderr.
 */
import { createInterface } from 'node:readline';
import { HostSession, HostSessionUnavailableError } from './journey/host-session.js';

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

function log(message: string): void {
  process.stderr.write(`[sift] webmcp:bridge ${message}\n`);
}

function send(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id: number | string, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id: number | string, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function main(): Promise<void> {
  const baseUrl = (process.env['SIFT_HOST_URL'] ?? '').replace(/\/+$/, '');
  if (baseUrl === '') {
    log(
      'SIFT_HOST_URL is not set. Set it to the Sift origin to drive (e.g. http://localhost:8080).',
    );
    process.exit(1);
  }

  let host: HostSession;
  try {
    host = await HostSession.open();
  } catch (error) {
    if (error instanceof HostSessionUnavailableError) {
      log(error.message);
      process.exit(1);
    }
    throw error;
  }

  await host.page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  // Global tools register on mount; case-scoped ones only once a case
  // exists, so an early `tools/list` legitimately returns three.
  await host.page.waitForTimeout(3_000);
  log(`attached to ${baseUrl}; ${host.tools.size} tool(s) registered`);

  const close = async (): Promise<void> => {
    await host.close().catch(() => undefined);
  };
  process.on('SIGINT', () => void close().then(() => process.exit(0)));
  process.on('SIGTERM', () => void close().then(() => process.exit(0)));

  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (line.trim() === '') continue;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      log(`ignored unparseable line: ${line.slice(0, 120)}`);
      continue;
    }

    const id = request.id;

    switch (request.method) {
      case 'initialize': {
        if (id === undefined) break;
        const requested = (request.params?.['protocolVersion'] as string | undefined) ?? '';
        reply(id, {
          protocolVersion: requested === '' ? DEFAULT_PROTOCOL_VERSION : requested,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: 'sift-webmcp-bridge', version: '1.0.0' },
        });
        break;
      }

      case 'notifications/initialized':
        break;

      case 'ping':
        if (id !== undefined) reply(id, {});
        break;

      case 'tools/list': {
        if (id === undefined) break;
        // Read live rather than cached: the page adds case-scoped tools the
        // moment a case exists, and a model that listed once at startup
        // would never see them.
        reply(id, {
          tools: [...host.tools.values()].map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
          })),
        });
        break;
      }

      case 'tools/call': {
        if (id === undefined) break;
        const name = request.params?.['name'];
        const args = (request.params?.['arguments'] ?? {}) as Record<string, unknown>;
        if (typeof name !== 'string') {
          fail(id, -32602, 'tools/call requires a string `name`.');
          break;
        }
        if (!host.tools.has(name)) {
          // Not an error: an unregistered tool is a fact about the page's
          // current state, and saying so is more useful to a model than a
          // protocol failure it cannot act on.
          reply(id, {
            content: [
              {
                type: 'text',
                text: `The page does not currently offer "${name}". Registered right now: ${[...host.tools.keys()].join(', ')}`,
              },
            ],
            isError: true,
          });
          break;
        }

        const response = await host.invoke(name, args);
        const text =
          typeof response.output === 'string'
            ? response.output
            : JSON.stringify(response.output ?? { error: response.errorText }, null, 2);
        log(`${name} → ${response.status}`);
        reply(id, {
          content: [{ type: 'text', text }],
          isError: response.status !== 'Completed',
        });
        break;
      }

      default:
        if (id !== undefined) fail(id, -32601, `Unknown method: ${request.method}`);
    }
  }

  await close();
}

await main();
