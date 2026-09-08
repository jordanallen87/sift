export {
  AnnotationSchema,
  DemoManifestSchema,
  DemoSegmentSchema,
  FrameAnchorSchema,
  TITLE_SAFE_MARGIN,
  TimeAnchorSchema,
  parseDemoManifest,
  validateTimeline,
} from './schema.js';
export type { Annotation, DemoManifest, DemoSegment, TimeAnchor } from './schema.js';
export { renderAnnotationDocument } from './render-annotations.js';
export { resolveAnnotationTiming, resolveNarrationAnchor } from './timing.js';
export type {
  ResolvedAnnotationTiming,
  ResolvedNarrationAnchor,
  SpeechAlignment,
} from './timing.js';
