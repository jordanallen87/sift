# Hackathon demo production system

This directory defines the shared production contract for the WebMCP and
Agents for Humans videos. Each video has its own hybrid `manifest.json`, an
aidemo browser storyboard, slide-card specifications, and a capture runbook.

## Why this shape

Devpost recommends a narrated screencast, an immediate explanation of what the
app does, editing out setup/dead time, and scripting the video before recording.
Its demo guidance calls the working product the most important part and says to
show the resolution of the opening problem. The resulting house style is:

1. open on the working product and the result at stake;
2. spend one short slide on the human problem;
3. show the smallest complete, real product journey;
4. use one architecture slide for relationships that cannot be seen in the UI;
5. close on the outcome and differentiator.

Slides explain invisible concepts. They never substitute for product proof.
Both manifests keep generated slides below 25% of runtime.

Sources:

- <https://help.devpost.com/article/84-video-making-best-practices>
- <https://info.devpost.com/blog/how-to-present-a-successful-hackathon-demo>
- <https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video>
- <https://info.devpost.com/blog/hackathon-judging-tips>

## Reuse, do not rebuild

The proven reference implementation is:

`/Users/jordanallen/IdeaProjects/praetor/docs/hackathons/all-things-agentic/demo`

Its content-independent pieces should be copied or promoted to a shared package
when rendering begins:

- `narrate.mjs`: per-cue TTS, measured durations, cue-only rerenders, SRT;
- `mkseg.mjs`: still-card plus narration to video;
- `compose.mjs`, `stitch.mjs`, `mksrt.mjs`: normalized edit list, crossfades,
  captions, hard duration cap;
- `record.mjs`: screen capture around a deterministic driver;
- `cards/make-cards.mjs`: HTML cards to 1920x1080 PNGs.

For ordinary browser scenes, use
[aidemo v0.8.0](https://github.com/tandryukha/aidemo/tree/v0.8.0). It has already
been exercised end-to-end on this machine and adds deterministic Chrome replay,
cursor animation, autozoom, narration retiming, captions, and cards. Pin the
Git tag; do not use an unpinned latest version during submission week.

```bash
npx -y github:tandryukha/aidemo#v0.8.0 probe <demo-dir>
AIDEMO_TTS_PROVIDER=local npx -y github:tandryukha/aidemo#v0.8.0 voice <demo-dir>
npx -y github:tandryukha/aidemo#v0.8.0 captions <demo-dir> --offline
npx -y github:tandryukha/aidemo#v0.8.0 record <demo-dir> --capture native
npx -y github:tandryukha/aidemo#v0.8.0 compose <demo-dir>
```

Run stages separately. The tested v0.8.0 `render` command can require an OpenAI
key even when another voice provider was already used.

## Three capture adapters

| `sourceType` | What it proves | Capture path |
| --- | --- | --- |
| `browser` | Sift UI and persisted case behavior | aidemo storyboard |
| `host` | ChatGPT/WebMCP tool calls | WebMCP-capable host + native recording |
| `slide` | problem, architecture, closing thesis | HTML card renderer |

The master manifest is the edit decision list. Browser and host clips are
recorded separately, then the reference FFmpeg pipeline trims them to the
declared targets and lays the shared narration/captions over them.

## Rendering gate

A video is not ready until all of these are true:

- every manifest cue has a real source asset and matching narration audio;
- every selector passes an aidemo `probe` against the deployed commit;
- every host-tool expectation is visible in the captured host transcript;
- narration is never sped up to meet the cap;
- slide time remains at or below 25%;
- the output has H.264 video, AAC audio, and captions;
- `ffprobe` reports WebMCP `< 180s` and Agents for Humans `<= 300s`;
- a signed-out viewer can play the uploaded video.

