import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ExternalToolError } from './errors.js';

/**
 * ffmpeg and ffprobe are external processes, so every module that needs them
 * depends on this port instead of `child_process`. Two things fall out of that:
 * parsing stays pure and unit-testable with recorded tool output, and a machine
 * without FFmpeg installed produces one sentence telling the operator what to
 * install rather than a spawn ENOENT stack trace.
 */
export interface ToolInvocation {
  readonly tool: string;
  readonly args: readonly string[];
}

export interface ToolResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ToolRunner {
  run(invocation: ToolInvocation): Promise<ToolResult>;
}

/** The single `child_process` surface this package uses, so it can be swapped in tests. */
export type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: { readonly maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;

/**
 * ffmpeg's `volumedetect`/`silencedetect` diagnostics for a three-minute take
 * run to a few hundred kilobytes of stderr, and ffprobe's full JSON report is
 * larger still. Node's 1 MB default truncates both, which would silently drop
 * findings; 32 MB is generous enough that truncation stops being a failure mode.
 */
export const DEFAULT_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

const execFileAsync = promisify(execFile);

const nodeExecFile: ExecFileLike = (file, args, options) => execFileAsync(file, [...args], options);

function readStreamProperty(source: unknown, key: 'stdout' | 'stderr'): string {
  if (typeof source !== 'object' || source === null) return '';
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function readFailureCode(source: unknown): string | number | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const value = (source as Record<string, unknown>)['code'];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export interface ProcessToolRunnerOptions {
  execFileImpl?: ExecFileLike;
  maxBufferBytes?: number;
}

/**
 * Runs a real process. A non-zero exit is returned rather than thrown, because
 * ffmpeg exits non-zero for ordinary situations a caller wants to interpret
 * (an unmappable stream, for example). Only "the tool could not be run at all"
 * throws, since there is no result to interpret in that case.
 */
export function createProcessToolRunner(options: ProcessToolRunnerOptions = {}): ToolRunner {
  const exec = options.execFileImpl ?? nodeExecFile;
  const maxBuffer = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

  return {
    async run({ tool, args }) {
      try {
        const { stdout, stderr } = await exec(tool, args, { maxBuffer });
        return { exitCode: 0, stdout, stderr };
      } catch (error: unknown) {
        const code = readFailureCode(error);
        if (code === 'ENOENT') {
          throw new ExternalToolError(
            tool,
            `"${tool}" is not installed or not on PATH. Install FFmpeg (which provides both ffmpeg and ffprobe) before reviewing a recording.`,
            error,
          );
        }
        if (typeof code === 'number') {
          return {
            exitCode: code,
            stdout: readStreamProperty(error, 'stdout'),
            stderr: readStreamProperty(error, 'stderr'),
          };
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new ExternalToolError(tool, `"${tool}" could not be run: ${detail}`, error);
      }
    },
  };
}
