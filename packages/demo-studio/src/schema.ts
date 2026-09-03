import { z } from 'zod';

/** The default visual safe margin on all four sides of a 16:9 demo canvas. */
export const TITLE_SAFE_MARGIN = 0.05;

const NonEmptyTextSchema = z.string().trim().min(1);
const NormalizedNumberSchema = z.number().min(0).max(1);

export const FrameAnchorSchema = z
  .object({
    kind: z.literal('frame'),
    x: NormalizedNumberSchema,
    y: NormalizedNumberSchema,
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .superRefine((anchor, ctx) => {
    if (anchor.x + anchor.width > 1) {
      ctx.addIssue({ code: 'custom', path: ['width'], message: 'Anchor exceeds the frame width.' });
    }
    if (anchor.y + anchor.height > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['height'],
        message: 'Anchor exceeds the frame height.',
      });
    }
  });

export const TimeAnchorSchema = z.union([
  z.object({ seconds: z.number().min(0) }).strict(),
  z.object({ phrase: NonEmptyTextSchema }).strict(),
  z.object({ word: NonEmptyTextSchema, occurrence: z.number().int().min(1).optional() }).strict(),
]);

export const AnnotationSchema = z
  .object({
    id: NonEmptyTextSchema,
    kind: z.enum(['callout', 'arrow', 'spotlight', 'blur', 'lowerThird']),
    text: z.string().trim().min(1).max(120).optional(),
    start: TimeAnchorSchema,
    end: TimeAnchorSchema,
    anchor: FrameAnchorSchema.optional(),
  })
  .strict()
  .superRefine((annotation, ctx) => {
    if (
      (annotation.kind === 'callout' || annotation.kind === 'lowerThird') &&
      annotation.text === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: `${annotation.kind} requires text.`,
      });
    }
    if (annotation.kind !== 'lowerThird' && annotation.anchor === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['anchor'],
        message: `${annotation.kind} requires a frame anchor.`,
      });
    }
  });

export const DemoSegmentSchema = z
  .object({
    id: NonEmptyTextSchema,
    startSeconds: z.number().min(0),
    targetSeconds: z.number().positive(),
    sourceType: NonEmptyTextSchema,
    source: NonEmptyTextSchema,
    narration: NonEmptyTextSchema.optional(),
    annotations: z.array(AnnotationSchema).max(50).optional(),
  })
  // Capture adapters carry operator-facing metadata such as host prompts,
  // selector acceptance conditions, and fallback instructions. Preserve those
  // fields while Demo Studio owns only portable timing/rendering fields.
  .passthrough();

export const DemoManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    project: NonEmptyTextSchema,
    hardCapSeconds: z.number().positive(),
    canvas: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fps: z.number().int().positive().max(120),
      })
      .strict(),
    segments: z.array(DemoSegmentSchema).min(1).max(100),
  })
  // Existing event manifests include submission and capture metadata (for
  // example URLs, audio policy, and mix budgets). Keeping extensions allows
  // a staged migration without throwing away a working operator runbook.
  .passthrough();

export type DemoManifest = z.infer<typeof DemoManifestSchema>;
export type DemoSegment = z.infer<typeof DemoSegmentSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type TimeAnchor = z.infer<typeof TimeAnchorSchema>;

export function parseDemoManifest(value: unknown): DemoManifest {
  return DemoManifestSchema.parse(value);
}

function isWithinTitleSafeArea(anchor: z.infer<typeof FrameAnchorSchema>): boolean {
  return (
    anchor.x >= TITLE_SAFE_MARGIN &&
    anchor.y >= TITLE_SAFE_MARGIN &&
    anchor.x + anchor.width <= 1 - TITLE_SAFE_MARGIN &&
    anchor.y + anchor.height <= 1 - TITLE_SAFE_MARGIN
  );
}

function secondsOf(anchor: TimeAnchor): number | undefined {
  return 'seconds' in anchor ? anchor.seconds : undefined;
}

/**
 * Returns all cross-field manifest issues in one pass. This intentionally
 * does not resolve word or phrase anchors: those become exact seconds only
 * after narration is generated and its alignment data is available.
 */
export function validateTimeline(manifest: DemoManifest): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const sorted = [...manifest.segments].sort(
    (left, right) => left.startSeconds - right.startSeconds,
  );

  for (const segment of sorted) {
    if (ids.has(segment.id)) issues.push(`Segment id "${segment.id}" is duplicated.`);
    ids.add(segment.id);

    const segmentEnd = segment.startSeconds + segment.targetSeconds;
    if (segmentEnd > manifest.hardCapSeconds) {
      issues.push(`Segment "${segment.id}" exceeds the hard cap of ${manifest.hardCapSeconds}s.`);
    }

    const annotationIds = new Set<string>();
    for (const annotation of segment.annotations ?? []) {
      if (annotationIds.has(annotation.id)) {
        issues.push(`Annotation id "${annotation.id}" is duplicated in segment "${segment.id}".`);
      }
      annotationIds.add(annotation.id);

      const start = secondsOf(annotation.start);
      const end = secondsOf(annotation.end);
      if (start !== undefined && end !== undefined && end < start) {
        issues.push(
          `Annotation "${annotation.id}" in segment "${segment.id}" ends before it starts.`,
        );
      }
      if (start !== undefined && start > segment.targetSeconds) {
        issues.push(
          `Annotation "${annotation.id}" in segment "${segment.id}" starts after the segment ends.`,
        );
      }
      if (end !== undefined && end > segment.targetSeconds) {
        issues.push(
          `Annotation "${annotation.id}" in segment "${segment.id}" ends after the segment ends.`,
        );
      }
      if (annotation.anchor !== undefined && !isWithinTitleSafeArea(annotation.anchor)) {
        issues.push(
          `Annotation "${annotation.id}" in segment "${segment.id}" is outside the title-safe area.`,
        );
      }
    }
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous === undefined || current === undefined) continue;
    const previousEnd = previous.startSeconds + previous.targetSeconds;
    if (current.startSeconds < previousEnd) {
      issues.push(`Segment "${current.id}" overlaps segment "${previous.id}".`);
    } else if (current.startSeconds > previousEnd) {
      issues.push(`Segment "${current.id}" is not contiguous after segment "${previous.id}".`);
    }
  }

  const finalEnd = Math.max(
    ...manifest.segments.map((segment) => segment.startSeconds + segment.targetSeconds),
  );
  if (finalEnd > manifest.hardCapSeconds) {
    issues.push(`Timeline exceeds the hard cap of ${manifest.hardCapSeconds}s.`);
  }
  return issues;
}
