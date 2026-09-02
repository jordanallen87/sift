/**
 * Turns `GET /api/cases/:caseId/run-plan` into the one line the orientation
 * shell shows.
 *
 * Deliberately tolerant of everything except a shape it cannot read. The
 * plan is a derived projection: a 404 is the ordinary state of a case
 * nobody has asked Sift to investigate yet, and a body from an older build
 * is not worth breaking the workspace over. Both return `null`, and the
 * shell simply says nothing about work in flight.
 *
 * Counting happens here rather than on the server because the server's job
 * is to report the plan, and "how many things is Sift looking into" is a
 * presentation question — a person does not count `RunPlanItem`s, they
 * count things being looked into, and the two stop matching the moment the
 * plan grows an item kind that is not worth mentioning.
 */
import type { WorkInFlight } from '../components/DecisionOrientationShell.js';

interface RunPlanItemShape {
  status?: unknown;
  targetEntityId?: unknown;
  depth?: unknown;
}

interface RunPlanShape {
  version?: unknown;
  items?: unknown;
  unverifiable?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function summarizeRunPlanResponse(payload: unknown): WorkInFlight | null {
  if (!isRecord(payload)) return null;
  const plan = payload['plan'];
  if (!isRecord(plan)) return null;

  const shape = plan as RunPlanShape;
  if (typeof shape.version !== 'number' || !Array.isArray(shape.items)) return null;

  const items = shape.items.filter(isRecord) as RunPlanItemShape[];
  const outstanding = items.filter(
    (item) => item.status === 'planned' || item.status === 'running',
  );
  // Options being *investigated*, which is deep work only. Counting
  // enrichment here would report every candidate in the catalog as "under
  // investigation", which is both wrong and the kind of inflated number
  // that makes a person stop trusting the rest of the pane.
  const options = new Set(
    outstanding
      .filter((item) => item.depth === 'deep' && typeof item.targetEntityId === 'string')
      .map((item) => item.targetEntityId as string),
  );

  return {
    plannedItems: outstanding.length,
    optionsUnderInvestigation: options.size,
    unverifiableConcerns: Array.isArray(shape.unverifiable) ? shape.unverifiable.length : 0,
    planVersion: shape.version,
  };
}
