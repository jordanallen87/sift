import { describe, expect, it } from 'vitest';
import { ExternalToolError, RecordingDefectError } from './errors.js';
import { parseProbeReport, probeVideo } from './probe.js';
import { createScriptedToolRunner } from './testing.js';

/** Trimmed from a real `ffprobe -show_format -show_streams` run on a narrated take. */
const narratedTake = {
  streams: [
    {
      index: 0,
      codec_name: 'h264',
      codec_type: 'video',
      width: 860,
      height: 1800,
      r_frame_rate: '30/1',
      avg_frame_rate: '23355/779',
      duration: '155.800000',
    },
    {
      index: 1,
      codec_name: 'aac',
      codec_type: 'audio',
      sample_rate: '44100',
      channels: 1,
      duration: '155.777000',
    },
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '155.800000' },
};

function without(codecType: 'video' | 'audio'): unknown {
  return {
    ...narratedTake,
    streams: narratedTake.streams.filter((stream) => stream.codec_type !== codecType),
  };
}

describe('probing a finished recording', () => {
  it('reads dimensions, duration, both frame rates, and the audio track', () => {
    expect(parseProbeReport(narratedTake)).toEqual({
      widthPx: 860,
      heightPx: 1800,
      durationSeconds: 155.8,
      framesPerSecond: 30,
      averageFramesPerSecond: 29.981,
      videoCodec: 'h264',
      audio: { codec: 'aac', channels: 1, sampleRateHz: 44100, durationSeconds: 155.777 },
    });
  });

  it('rejects a narrated recording that has no audio stream', () => {
    expect(() => parseProbeReport(without('audio'), 'take-3.mp4')).toThrow(RecordingDefectError);
    expect(() => parseProbeReport(without('audio'), 'take-3.mp4')).toThrow(
      /take-3\.mp4 has no audio stream/,
    );
    try {
      parseProbeReport(without('audio'));
    } catch (error: unknown) {
      expect((error as RecordingDefectError).code).toBe('missing-audio-stream');
    }
  });

  it('rejects an audio stream that exists but holds no samples', () => {
    const opened = {
      streams: [
        { ...narratedTake.streams[0] },
        {
          codec_name: 'aac',
          codec_type: 'audio',
          channels: 2,
          sample_rate: '48000',
          duration: '0',
        },
      ],
      format: { duration: '155.800000' },
    };
    try {
      parseProbeReport(opened);
      expect.unreachable('a zero-length audio stream must fail');
    } catch (error: unknown) {
      expect((error as RecordingDefectError).code).toBe('zero-length-audio');
    }
  });

  it('rejects a report with no video stream and one with no readable duration', () => {
    expect(() => parseProbeReport(without('video'))).toThrow(/no video stream/);
    expect(() =>
      parseProbeReport({
        streams: [
          { codec_type: 'video', codec_name: 'h264', r_frame_rate: '30/1' },
          { codec_type: 'audio', codec_name: 'aac', duration: '10' },
        ],
      }),
    ).toThrow(/no usable duration/);
  });

  it('rejects a video stream with no readable frame rate', () => {
    expect(() =>
      parseProbeReport({
        streams: [
          { codec_type: 'video', codec_name: 'h264', r_frame_rate: '0/0', duration: '12' },
          { codec_type: 'audio', codec_name: 'aac', duration: '12' },
        ],
      }),
    ).toThrow(/no readable frame rate/);
  });

  it('falls back to container values when a stream omits them', () => {
    const properties = parseProbeReport({
      streams: [
        { codec_type: 'video', r_frame_rate: '25/1' },
        { codec_type: 'audio', channels: '2' },
      ],
      format: { duration: 12.5 },
    });
    expect(properties).toMatchObject({
      durationSeconds: 12.5,
      framesPerSecond: 25,
      averageFramesPerSecond: 25,
      videoCodec: 'unknown',
      widthPx: 0,
      heightPx: 0,
      audio: { codec: 'unknown', channels: 2, sampleRateHz: 0, durationSeconds: 12.5 },
    });
  });

  it('ignores unreadable numbers and accepts a frame rate written without a denominator', () => {
    expect(
      parseProbeReport({
        streams: [
          { codec_type: 'video', codec_name: 'h264', r_frame_rate: '25', duration: 'N/A' },
          { codec_type: 'audio', codec_name: 'aac', duration: '9' },
        ],
        format: { duration: '9' },
      }),
    ).toMatchObject({ framesPerSecond: 25, durationSeconds: 9 });
  });

  it('rejects a report that lists no streams at all', () => {
    expect(() => parseProbeReport({ format: { duration: '9' } })).toThrow(/0 stream/);
  });

  it('runs ffprobe with JSON output and surfaces a tool failure separately from a defect', async () => {
    const runner = createScriptedToolRunner([
      { tool: 'ffprobe', result: { stdout: JSON.stringify(narratedTake) } },
    ]);
    await expect(probeVideo('take.mp4', runner)).resolves.toMatchObject({ widthPx: 860 });
    expect(runner.invocations[0]?.args).toEqual([
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      'take.mp4',
    ]);

    const failing = createScriptedToolRunner([
      { tool: 'ffprobe', result: { exitCode: 1, stderr: 'No such file' } },
    ]);
    await expect(probeVideo('gone.mp4', failing)).rejects.toBeInstanceOf(ExternalToolError);

    const quiet = createScriptedToolRunner([{ tool: 'ffprobe', result: { exitCode: 1 } }]);
    await expect(probeVideo('gone.mp4', quiet)).rejects.toThrow(/no diagnostics/);

    const garbled = createScriptedToolRunner([{ tool: 'ffprobe', result: { stdout: 'not json' } }]);
    await expect(probeVideo('take.mp4', garbled)).rejects.toThrow(/did not return JSON/);
  });
});
