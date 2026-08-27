---
name: home-event-correlation
description: Correlates the household/appliance event log against the anomalous billing cycle to identify whether a plausible event (for example a malfunctioning thermostat) explains usage the rate change and weather do not. Use for the home-systems-analyst specialist on the energy.household_change obligation.
---

# Home-event correlation

## What this technique does

Once rate-change and weather attribution have been isolated, any usage gap that remains is a genuine open question, not an invitation to guess. This technique searches the household's own logged appliance and household events for one whose timing plausibly overlaps the anomalous billing cycle and whose nature (a malfunction, a new appliance, a maintenance visit) could account for the residual — producing a supported hypothesis grounded in a real logged event rather than an invented explanation.

## Inputs and tools

Use the household event lookup to search logged events, filtering by type or id once a plausible candidate is identified. Compare the event's date against the billing cycle's start/end and against how many kWh (or days) of elevated usage remain unexplained; an event first observed only a day or two before the cycle closes explains far less residual than one that began near the cycle's start.

## Output shape

Produce one claim naming the correlated event, its date, and why its timing and nature plausibly account for the residual, with `sourceIds` back to the household-event record (`energy.household_change` requires E1: at least one source). This obligation allows accepted uncertainty — correlation is not proof, so `suggestedStatus` should be `accepted_uncertainty` rather than `satisfied` when no independent confirmation of causation exists, and the `limitations` field must say so plainly. Hand off to `source-challenger` once a plausible correlation (or the deliberate absence of one) is established; this is the last of the four sequential obligations before response-options synthesis.

## Required honesty behavior

Never present a plausible correlation as a confirmed cause. If no logged event correlates with the residual at all, say so explicitly rather than forcing a weak match — an honest "no correlating event found" is a valid, complete answer to this obligation's question.
