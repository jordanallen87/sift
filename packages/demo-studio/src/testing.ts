import type { ToolInvocation, ToolResult, ToolRunner } from './tool-runner.js';
import type { Transcript, Transcriber } from './transcribe.js';

/**
 * Test doubles for the two ports the review lane depends on, exported because a
 * consumer's own tests need exactly the same thing this package's do: a review
 * that runs with no FFmpeg install, no network, and no API key.
 */

export interface ScriptedToolResponse {
  /** Matched against the tool name, e.g. `ffprobe`. */
  tool: string;
  /** Optional substring every invocation must contain, to script two ffmpeg calls differently. */
  argsInclude?: string;
  result: Partial<ToolResult>;
}

export interface ScriptedToolRunner extends ToolRunner {
  /** Every invocation received, in order, so a test can assert on the real arguments. */
  readonly invocations: readonly ToolInvocation[];
}

export function createScriptedToolRunner(
  responses: readonly ScriptedToolResponse[],
): ScriptedToolRunner {
  const invocations: ToolInvocation[] = [];

  return {
    invocations,
    run(invocation) {
      invocations.push(invocation);
      const match = responses.find(
        (response) =>
          response.tool === invocation.tool &&
          (response.argsInclude === undefined ||
            invocation.args.some((arg) => arg.includes(response.argsInclude ?? ''))),
      );
      if (match === undefined) {
        return Promise.reject(
          new Error(
            `No scripted response for ${invocation.tool} ${invocation.args.join(' ')}. Script one so the test states what the tool returned.`,
          ),
        );
      }
      return Promise.resolve({
        exitCode: match.result.exitCode ?? 0,
        stdout: match.result.stdout ?? '',
        stderr: match.result.stderr ?? '',
      });
    },
  };
}

export interface ScriptedTranscriber extends Transcriber {
  readonly requestedPaths: readonly string[];
}

export function createScriptedTranscriber(transcript: Transcript): ScriptedTranscriber {
  const requestedPaths: string[] = [];
  return {
    name: `scripted:${transcript.source}`,
    requestedPaths,
    transcribe({ mediaPath }) {
      requestedPaths.push(mediaPath);
      return Promise.resolve(transcript);
    },
  };
}

/** Builds a word-timed transcript from `[text, startSeconds, endSeconds]` triples. */
export function scriptedTranscript(
  words: readonly (readonly [string, number, number])[],
  overrides: Partial<Pick<Transcript, 'source' | 'evidence'>> = {},
): Transcript {
  return {
    source: overrides.source ?? 'scripted',
    evidence: overrides.evidence ?? 'recorded-audio',
    text: words.map(([text]) => text).join(' '),
    words: words.map(([text, startSeconds, endSeconds]) => ({ text, startSeconds, endSeconds })),
  };
}
