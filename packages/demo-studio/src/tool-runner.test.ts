import { describe, expect, it } from 'vitest';
import { ExternalToolError } from './errors.js';
import { createProcessToolRunner } from './tool-runner.js';
import { createScriptedToolRunner } from './testing.js';

function failWith(properties: Record<string, unknown>): never {
  throw Object.assign(new Error('spawn failed'), properties);
}

describe('the external-tool port', () => {
  it('passes the invocation through and returns both streams', async () => {
    const runner = createProcessToolRunner({
      execFileImpl: (file, args, options) => {
        expect(options.maxBuffer).toBeGreaterThan(1_000_000);
        return Promise.resolve({ stdout: `${file} ${args.join(' ')}`, stderr: '' });
      },
    });
    await expect(runner.run({ tool: 'ffprobe', args: ['-v', 'error'] })).resolves.toEqual({
      exitCode: 0,
      stdout: 'ffprobe -v error',
      stderr: '',
    });
  });

  it('runs a real process through its default child_process implementation', async () => {
    // Deterministic and offline: the runner is already executing inside Node.
    await expect(
      createProcessToolRunner().run({
        tool: process.execPath,
        args: ['-e', 'process.stdout.write("ok")'],
      }),
    ).resolves.toMatchObject({ exitCode: 0, stdout: 'ok' });
  });

  it('explains a missing FFmpeg install instead of leaking a spawn error', async () => {
    const runner = createProcessToolRunner({
      execFileImpl: () => failWith({ code: 'ENOENT' }),
      maxBufferBytes: 1024,
    });
    const failure = await runner
      .run({ tool: 'ffprobe', args: [] })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ExternalToolError);
    expect((failure as Error).message).toMatch(
      /"ffprobe" is not installed or not on PATH\. Install FFmpeg/,
    );
    expect((failure as ExternalToolError).tool).toBe('ffprobe');
  });

  it('returns a non-zero exit with its output, so the caller can interpret it', async () => {
    const runner = createProcessToolRunner({
      execFileImpl: () => failWith({ code: 1, stdout: '', stderr: 'Invalid argument' }),
    });
    await expect(runner.run({ tool: 'ffmpeg', args: [] })).resolves.toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'Invalid argument',
    });
  });

  it('reports empty streams when a failure carries none', async () => {
    const runner = createProcessToolRunner({ execFileImpl: () => failWith({ code: 2 }) });
    await expect(runner.run({ tool: 'ffmpeg', args: [] })).resolves.toEqual({
      exitCode: 2,
      stdout: '',
      stderr: '',
    });
  });

  it('wraps any other spawn failure as a tool error', async () => {
    const runner = createProcessToolRunner({ execFileImpl: () => failWith({}) });
    await expect(runner.run({ tool: 'ffmpeg', args: [] })).rejects.toThrow(
      /"ffmpeg" could not be run: spawn failed/,
    );

    const thrower = createProcessToolRunner({
      execFileImpl: () => {
        // A rejection that is not an Error at all still has to produce a
        // readable tool error rather than an unhandled value.
        const thrown: unknown = 'not an error';
        throw thrown;
      },
    });
    await expect(thrower.run({ tool: 'ffmpeg', args: [] })).rejects.toThrow(/not an error/);
  });
});

describe('the scripted tool runner', () => {
  it('selects a response by tool name and argument substring', async () => {
    const runner = createScriptedToolRunner([
      { tool: 'ffmpeg', argsInclude: 'volumedetect', result: { stderr: 'mean_volume: -20 dB' } },
      { tool: 'ffmpeg', result: { stdout: 'frame' } },
    ]);
    await expect(
      runner.run({ tool: 'ffmpeg', args: ['-af', 'volumedetect,silencedetect=noise=-35dB:d=0.6'] }),
    ).resolves.toMatchObject({ stderr: 'mean_volume: -20 dB' });
    await expect(runner.run({ tool: 'ffmpeg', args: ['-frames:v', '1'] })).resolves.toMatchObject({
      stdout: 'frame',
    });
    expect(runner.invocations).toHaveLength(2);
  });

  it('fails loudly when a test forgot to script a call', async () => {
    const runner = createScriptedToolRunner([]);
    await expect(runner.run({ tool: 'ffprobe', args: ['x'] })).rejects.toThrow(
      /No scripted response for ffprobe x/,
    );
  });
});
