/**
 * `GET /api/cases/:caseId/events` (docs/specs/architecture.md "HTTP
 * service" / "Real-time event contract").
 *
 * One route, two transports, selected by `?mode=poll`:
 *  - default: Server-Sent Events. Replays from `Last-Event-ID` (the
 *    standard `EventSource` reconnection header) or `?afterSequence=`,
 *    sends every `PublicActivityEvent`'s `sequence` as the SSE `id:` field
 *    (so a reconnecting browser `EventSource` and this task's own
 *    duplicate-suppression tests can rely on it), sends periodic heartbeat
 *    comments, and uses `sse.ts`'s bounded writer to detect a slow consumer
 *    and emit a `case.snapshot`-typed resync marker
 *    (`safeDetails.resyncRequired: true` -- see that file's header comment
 *    for why this is not a distinct `PublicActivityEventType` member).
 *  - `?mode=poll`: plain JSON `{ snapshot, events }` -- the polling-fallback
 *    path architecture.md requires to "produce the same visible state as
 *    SSE".
 */
import { Router } from 'express';
import { z } from 'zod';
import { CaseStateSchema, PublicActivityEventSchema } from '@sift/contracts';
import type { ActivityStore } from '../store/activity-store.js';
import type { CaseStore } from '../store/case-store.js';
import { sendError } from './http-support.js';
import { createSseWriter } from './sse.js';

export interface EventsRouterDeps {
  readonly caseStore: CaseStore;
  readonly activityStore: ActivityStore;
  /** Overridable for tests; defaults to 15s. */
  readonly heartbeatIntervalMs?: number;
  /** Overridable for tests; defaults to `sse.ts`'s own default (50). */
  readonly sseMaxQueueLength?: number;
}

const PollResponseSchema = z
  .object({ snapshot: CaseStateSchema, events: z.array(PublicActivityEventSchema) })
  .strict();

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

function parseNonNegativeInteger(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function createEventsRouter(deps: EventsRouterDeps): Router {
  const router = Router();

  router.get('/api/cases/:caseId/events', (req, res) => {
    const { caseId } = req.params;
    const snapshot = deps.caseStore.load(caseId);
    if (snapshot === undefined) {
      sendError(res, 404, 'NOT_FOUND', `Case "${caseId}" was not found.`, false);
      return;
    }

    if (req.query['mode'] === 'poll') {
      let afterSequence = 0;
      if (req.query['afterSequence'] !== undefined) {
        const parsed = parseNonNegativeInteger(req.query['afterSequence']);
        if (parsed === undefined) {
          sendError(
            res,
            400,
            'VALIDATION',
            '"afterSequence" must be a non-negative integer.',
            false,
          );
          return;
        }
        afterSequence = parsed;
      }

      const events = deps.activityStore.replayFrom(caseId, afterSequence);
      // Re-load: the snapshot must reflect the current state at response
      // time, not the one read above purely to confirm the case exists.
      const latestSnapshot = deps.caseStore.load(caseId) ?? snapshot;
      res.status(200).json(PollResponseSchema.parse({ snapshot: latestSnapshot, events }));
      return;
    }

    // --- SSE path ---
    const lastEventIdHeader = req.get('Last-Event-ID');
    const fromHeader =
      lastEventIdHeader !== undefined ? parseNonNegativeInteger(lastEventIdHeader) : undefined;
    const fromQuery = parseNonNegativeInteger(req.query['afterSequence']);
    const fromSequence = fromHeader ?? fromQuery ?? 0;

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    const onResyncRequired = (): void => {
      const resyncSequence = deps.activityStore.latestSequence(caseId) + 1;
      const resyncEvent = PublicActivityEventSchema.parse({
        schemaVersion: '1.0',
        eventId: `resync-${caseId}-${resyncSequence}`,
        sequence: resyncSequence,
        // A transport-level marker, not canonical case data -- the one
        // acceptable use of the wall clock in this route, since every
        // *canonical* timestamp already came from the injected `Clock` at
        // the point the underlying activity event was created.
        timestamp: new Date().toISOString(),
        caseId,
        type: 'case.snapshot',
        phase: 'completed',
        summary: 'The activity stream fell behind; reload the canonical case snapshot.',
        safeDetails: { resyncRequired: true },
      });
      res.write(
        `id: ${resyncEvent.sequence}\nevent: ${resyncEvent.type}\ndata: ${JSON.stringify(resyncEvent)}\n\n`,
      );
      res.end();
    };

    const writer = createSseWriter(res, onResyncRequired, {
      ...(deps.sseMaxQueueLength !== undefined ? { maxQueueLength: deps.sseMaxQueueLength } : {}),
    });

    const subscription = deps.activityStore.subscribe(caseId, (event) => {
      if (writer.closed) return;
      writer.send({ id: String(event.sequence), type: event.type, data: event });
    });

    for (const event of subscription.replay) {
      if (event.sequence <= fromSequence) continue;
      if (writer.closed) break;
      writer.send({ id: String(event.sequence), type: event.type, data: event });
    }

    const heartbeat = setInterval(() => {
      if (!writer.closed) writer.sendComment('heartbeat');
    }, deps.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();

    req.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });
  });

  return router;
}
