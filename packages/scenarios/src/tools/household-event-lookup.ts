/**
 * Fixture tool: "household event lookup"
 * (docs/specs/packs-and-routing.md "Home Energy Guardian Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Given an optional `eventId` and/or `type`, returns matching household/
 * appliance event facts from `household-events.json` (the annual HVAC
 * tune-up and the thermostat sensor-drift fault), or every real event when
 * neither filter is given. Backs `energy.household_change`
 * (packs-and-routing.md: "Did a household or appliance event plausibly
 * change consumption?").
 *
 * This tool never asserts that an event *does* explain the anomaly -- it
 * only returns the fixture's own recorded `relevanceNote` verbatim, exactly
 * as written by whoever logged the event. Whether an event plausibly
 * explains the residual usage gap is a specialist/human judgment
 * (`energy-calculator.ts`'s `computeUnexplainedUsageGap` supplies the
 * deterministic *size* of that gap; this tool supplies the candidate
 * explanation, never a verdict on it) -- consistent with packs-and-
 * routing.md's non-negotiable truth that "the model may propose candidate
 * events and recommendations. It may never approve a consequential
 * decision."
 *
 * Evidence-level assignment rule: each event comes from one traceable
 * service/device log entry, so it is tagged `E1` -- the same per-fact rule
 * as every other reader tool in this directory, and exactly the evidence
 * level `energy.household_change` requires (packs-and-routing.md's
 * obligation table).
 */
import { loadFixture, type HouseholdEvent } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const HOUSEHOLD_EVENT_LOOKUP_TOOL_ID = 'household-event-lookup';

export interface HouseholdEventDeviceFacts {
  make: string;
  model: string;
  deviceIdFictional: string;
}

export interface HouseholdEventFacts {
  eventId: string;
  type: string;
  date: string;
  label: string;
  description: string;
  relevanceNote: string;
  performedBy?: string;
  workOrderId?: string;
  outcome?: string;
  device?: HouseholdEventDeviceFacts;
  detectionMethod?: string;
  status?: string;
}

export interface HouseholdEventLookupResult {
  events: HouseholdEventFacts[];
  evidence: ToolEvidenceItem[];
}

export interface HouseholdEventLookupInput {
  eventId?: string;
  type?: string;
  signal?: AbortSignal;
}

function householdEventSourceId(eventId: string): string {
  return `source-household-event-${eventId}`;
}

function toEventFacts(event: HouseholdEvent): HouseholdEventFacts {
  return {
    eventId: event.eventId,
    type: event.type,
    date: event.date,
    label: event.label,
    description: event.description,
    relevanceNote: event.relevanceNote,
    ...(event.performedBy !== undefined ? { performedBy: event.performedBy } : {}),
    ...(event.workOrderId !== undefined ? { workOrderId: event.workOrderId } : {}),
    ...(event.outcome !== undefined ? { outcome: event.outcome } : {}),
    ...(event.device ? { device: { ...event.device } } : {}),
    ...(event.detectionMethod !== undefined ? { detectionMethod: event.detectionMethod } : {}),
    ...(event.status !== undefined ? { status: event.status } : {}),
  };
}

function toEvidenceItem(event: HouseholdEvent): ToolEvidenceItem {
  return {
    sourceId: householdEventSourceId(event.eventId),
    level: 'E1',
    verdict: 'pass',
    summary: `${event.date}: ${event.label} (${event.type}).`,
  };
}

export function lookupHouseholdEvents(
  input: HouseholdEventLookupInput = {},
): ToolResult<HouseholdEventLookupResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(HOUSEHOLD_EVENT_LOOKUP_TOOL_ID);
  }

  const fixture = loadFixture('household-events');

  if (isAborted(input.signal)) {
    return cancelledResult(HOUSEHOLD_EVENT_LOOKUP_TOOL_ID);
  }

  if (input.eventId !== undefined) {
    const event = fixture.events.find((entry) => entry.eventId === input.eventId);
    if (!event) {
      return notFoundResult(
        HOUSEHOLD_EVENT_LOOKUP_TOOL_ID,
        input.eventId,
        `no household-events entry found for eventId "${input.eventId}"`,
      );
    }
    return okResult(HOUSEHOLD_EVENT_LOOKUP_TOOL_ID, {
      events: [toEventFacts(event)],
      evidence: [toEvidenceItem(event)],
    });
  }

  const matched =
    input.type !== undefined
      ? fixture.events.filter((entry) => entry.type === input.type)
      : fixture.events;

  if (matched.length === 0) {
    return notFoundResult(
      HOUSEHOLD_EVENT_LOOKUP_TOOL_ID,
      input.type ?? '',
      `no household-events entries found for type "${input.type}"`,
    );
  }

  return okResult(HOUSEHOLD_EVENT_LOOKUP_TOOL_ID, {
    events: matched.map(toEventFacts),
    evidence: matched.map(toEvidenceItem),
  });
}
