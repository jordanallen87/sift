# Demo Studio

`@sift/demo-studio` is a portable, narration-led pre-production package. It
validates a demo manifest and translates generated speech alignment into stable
seconds and video-frame ranges. It does not record a browser, operate a model
host, or overwrite an approved take.

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

## Current boundary

The package owns portable manifest validation and timing resolution. Browser
capture remains with aidemo or another declared adapter. The current WebMCP
manifest may retain event-specific capture metadata such as prompts, selectors,
and acceptance checks while it migrates to the portable rendering fields.

## Verification

```bash
pnpm vitest run packages/demo-studio/src
pnpm --filter @sift/demo-studio typecheck
```
