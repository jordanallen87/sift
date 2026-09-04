# Demo Studio

`@sift/demo-studio` is a portable, narration-led package with two halves.

**Authoring** validates a demo manifest and translates generated speech
alignment into stable seconds and video-frame ranges. **Review** inspects a
finished recording: what it really contains, what a viewer sees at each beat,
and whether the words on the soundtrack match the screen behind them.

It does not record a browser, operate a model host, or overwrite an approved
take.

## Why narration owns the timeline

Every visual effect should prove the exact claim being spoken. Generate a cue
through ElevenLabs' `with-timestamps` endpoint, pass its character alignment to
`resolveNarrationAnchor` or `resolveAnnotationTiming`, and schedule overlays or
cuts from the returned frames.

```ts
import { parseDemoManifest, resolveAnnotationTiming, validateTimeline } from '@sift/demo-studio';

const manifest = parseDemoManifest(rawManifest);
const issues = validateTimeline(manifest);
if (issues.length > 0) throw new Error(issues.join('\n'));

const timing = resolveAnnotationTiming(
  manifest.segments[0].annotations[0],
  elevenLabsResponse.alignment,
  manifest.canvas.fps,
);
// timing.startFrame / timing.endFrame now drive the renderer.
```

## Reviewing a finished recording

Hand-reviewing a take with ad-hoc `ffmpeg` calls found two real defects: figures
read out over a screen that did not show them, and part of a take recorded
against the wrong theme after a mid-session rebuild. Both were caught by
eyeballing extracted frames, which does not repeat and does not scale.

`reviewRecording` composes the whole lane; each step is also usable alone.

```ts
import {
  createAlignmentTranscriber,
  createProcessToolRunner,
  parseCuts,
  parseNarrationClaims,
  reviewRecording,
} from '@sift/demo-studio';

const review = await reviewRecording({
  videoPath: 'artifacts/demo/take.mp4',
  cuts: parseCuts(JSON.parse(await readFile('artifacts/demo/cuts.json', 'utf8'))),
  claims: parseNarrationClaims([{ id: 'range', beat: '4', phrase: '95% to 65%' }]),
  runner: createProcessToolRunner(),
  transcriber: createAlignmentTranscriber(cues),
  frameOutputDir: 'artifacts/demo/frames',
});

if (!review.ok) {
  console.error(review.audio.issues, review.claims.verifications, review.gaps);
}
```

| Step                               | What it settles                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `probeVideo` / `parseProbeReport`  | Real dimensions, duration, both frame rates, codecs. Fatal on a missing or zero-length audio stream.       |
| `deriveBeatWindows`                | Half-open window per cut mark. Fatal when a mark falls outside the render or the take is flagged unusable. |
| `planBeatFrames` / `extractFrames` | One settled frame per beat plus the dwell frame the viewer rests on longest — not an even time sample.     |
| `measureAudio` / `evaluateAudio`   | Mean/peak level, clipping, and the beats containing an unbroken silence.                                   |
| `createElevenLabsTranscriber`      | A word-timed transcript of the recorded audio (ElevenLabs Scribe; `ELEVENLABS_API_KEY`).                   |
| `transcriptFromSpeechAlignments`   | The same shape rebuilt offline from the narration alignment files, marked as the weaker evidence.          |
| `verifyNarrationClaims`            | Whether each promised phrase is spoken **during the beat it was promised to**.                             |

Three rules hold throughout:

- **`ffmpeg`/`ffprobe` and transcription are ports.** Parsing and verification
  are pure; process and network calls live at the edges. A machine with no
  FFmpeg gets one sentence naming what to install, not a spawn stack trace.
- **A gap is never a pass.** A claim with no transcript, no word timings, or no
  matching cut mark reports `unverifiable`, and `review.ok` is false while any
  gap remains.
- **Evidence is labelled.** A transcript says whether it came from the recorded
  audio or from generated narration, because only the first proves what a viewer
  will hear.

`createScriptedToolRunner`, `createScriptedTranscriber`, and `scriptedTranscript`
are exported so a consumer's tests run a full review with no FFmpeg install, no
network, and no API key.

## Current boundary

The package owns portable manifest validation, timing resolution, and recording
review. Browser capture remains with aidemo or another declared adapter, and the
review lane has no CLI of its own — `demo-studio validate|diagram|overlays|compose-plan`
owns command dispatch when it lands. The current WebMCP manifest may retain
event-specific capture metadata such as prompts, selectors, and acceptance
checks while it migrates to the portable rendering fields.

## Verification

```bash
pnpm vitest run packages/demo-studio/src
pnpm --filter @sift/demo-studio typecheck
```
