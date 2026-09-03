import type { Annotation, DemoManifest, TimeAnchor } from './schema.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function anchorLabel(anchor: TimeAnchor): string {
  if ('seconds' in anchor) return `seconds:${anchor.seconds}`;
  if ('phrase' in anchor) return `phrase:${anchor.phrase}`;
  return `word:${anchor.word}:${anchor.occurrence ?? 1}`;
}

function secondsStyle(anchor: TimeAnchor): string {
  return 'seconds' in anchor ? `${anchor.seconds}s` : 'var(--unresolved-time)';
}

function layerMarkup(annotation: Annotation): string {
  const anchor = annotation.anchor;
  const geometry =
    anchor === undefined
      ? ''
      : `--x:${anchor.x * 100}%;--y:${anchor.y * 100}%;--width:${anchor.width * 100}%;--height:${anchor.height * 100}%;`;
  const text = annotation.text === undefined ? '' : `<span>${escapeHtml(annotation.text)}</span>`;
  return `<div class="layer ${annotation.kind}" data-annotation-id="${escapeHtml(annotation.id)}" data-start-anchor="${escapeHtml(anchorLabel(annotation.start))}" data-end-anchor="${escapeHtml(anchorLabel(annotation.end))}" style="${geometry}--start:${secondsStyle(annotation.start)};--end:${secondsStyle(annotation.end)};">${text}</div>`;
}

/**
 * Creates a transparent, standalone overlay document. Anchors expressed as
 * narration text deliberately remain annotated rather than guessed; the
 * timing compiler resolves them after TTS generation and before frame export.
 */
export function renderAnnotationDocument(manifest: DemoManifest, segmentId: string): string {
  const segment = manifest.segments.find((candidate) => candidate.id === segmentId);
  if (segment === undefined) throw new Error(`Unknown segment "${segmentId}".`);
  const layers = (segment.annotations ?? []).map(layerMarkup).join('');
  const title = escapeHtml(`${manifest.project} — ${segment.id} annotations`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { --unresolved-time: 0s; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
    .canvas { position: relative; width: 100%; height: 100%; }
    .layer { position: absolute; left: var(--x, 8%); top: var(--y, 84%); width: var(--width, 84%); height: var(--height, auto); opacity: 0; animation: reveal calc(var(--end) - var(--start)) linear var(--start) both; }
    .callout, .lowerThird { display: grid; place-items: center; min-height: 48px; padding: 10px 18px; border: 2px solid #d8673b; border-radius: 12px; background: #f4f0e8; color: #14231d; font: 700 30px/1.1 system-ui, sans-serif; letter-spacing: .01em; }
    .arrow::after { content: '➜'; color: #d8673b; font: 700 52px/1 system-ui, sans-serif; }
    .spotlight { border-radius: 12px; box-shadow: 0 0 0 200vmax rgb(20 35 29 / .62); outline: 3px solid #d8673b; }
    .blur { backdrop-filter: blur(12px); background: rgb(244 240 232 / .18); border-radius: 8px; }
    @keyframes reveal { 0%, 100% { opacity: 0; } 8%, 92% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .layer { animation: none; opacity: 1; } }
  </style>
</head>
<body><main class="canvas" aria-label="${title}">${layers}</main></body>
</html>`;
}
