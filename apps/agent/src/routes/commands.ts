/**
 * `POST /api/cases/:caseId/commands/:commandName`
 * (docs/specs/architecture.md "HTTP service"), dispatching to
 * `CommandService`. Covers every `SiftCommands` verb except `startDemo`
 * (its own `POST /api/cases/demo` route, `routes/cases.ts`) and
 * `requestInvestigation` (its own `POST /api/cases/:caseId/run` route,
 * `routes/runs.ts` -- see `services/run-service.ts` for why that one is not
 * part of `CommandService` at all).
 *
 * `COMMAND_NAMES`/`CommandName`/`dispatchCommand` are exported for
 * `routes/agentcore.ts` to reuse verbatim: `POST /invocations` genuinely
 * dispatches into this exact same `CommandService` command table (a second
 * transport onto the same real engine, per docs/specs/strands-runtime.md
 * "AgentCore contract"), not a re-implemented or duplicated switch that
 * could drift from this one.
 */
import { Router } from 'express';
import type { CommandReceipt } from '@sift/contracts';
import type { CommandService } from '../services/command-service.js';
import type { ServiceResult } from '../services/service-result.js';
import { readCommandId, respondWithServiceResult, sendError } from './http-support.js';

export interface CommandsRouterDeps {
  readonly commandService: CommandService;
}

export const COMMAND_NAMES = [
  'selectPack',
  'upsertOption',
  'focusOption',
  'defineCaseAttribute',
  'reviewCaseExtension',
  'focusEvidence',
  'updateCriteria',
  'submitSource',
  'setEvidenceDisposition',
  'requestRevision',
  'reviewProposal',
] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

function isCommandName(value: string): value is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(value);
}

export function dispatchCommand(
  service: CommandService,
  commandName: CommandName,
  commandId: string,
  input: unknown,
): ServiceResult<CommandReceipt> {
  switch (commandName) {
    case 'selectPack':
      return service.selectPack(commandId, input);
    case 'upsertOption':
      return service.upsertOption(commandId, input);
    case 'focusOption':
      return service.focusOption(commandId, input);
    case 'defineCaseAttribute':
      return service.defineCaseAttribute(commandId, input);
    case 'reviewCaseExtension':
      return service.reviewCaseExtension(commandId, input);
    case 'focusEvidence':
      return service.focusEvidence(commandId, input);
    case 'updateCriteria':
      return service.updateCriteria(commandId, input);
    case 'submitSource':
      return service.submitSource(commandId, input);
    case 'setEvidenceDisposition':
      return service.setEvidenceDisposition(commandId, input);
    case 'requestRevision':
      return service.requestRevision(commandId, input);
    case 'reviewProposal':
      return service.reviewProposal(commandId, input);
  }
}

export function createCommandsRouter(deps: CommandsRouterDeps): Router {
  const router = Router();

  router.post('/api/cases/:caseId/commands/:commandName', (req, res) => {
    const commandId = readCommandId(req, res);
    if (commandId === undefined) return;

    const { caseId, commandName } = req.params;
    if (!isCommandName(commandName)) {
      sendError(res, 404, 'NOT_FOUND', `Unknown command "${commandName}".`, false);
      return;
    }

    const rawBody: Record<string, unknown> =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
    if ('caseId' in rawBody && rawBody['caseId'] !== caseId) {
      sendError(
        res,
        400,
        'VALIDATION',
        'The request body "caseId" does not match the URL path caseId.',
        false,
      );
      return;
    }

    const result = dispatchCommand(deps.commandService, commandName, commandId, {
      ...rawBody,
      caseId,
    });
    respondWithServiceResult(res, result);
  });

  return router;
}
