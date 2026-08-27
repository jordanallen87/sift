import { describe, expect, it } from 'vitest';
import {
  PaxDomainError,
  PolicyViolationError,
  RoutingRejectionError,
  ValidationFailedError,
  isPaxDomainError,
} from './errors.js';

describe('PaxDomainError taxonomy', () => {
  it('gives PolicyViolationError a stable machine-readable code and human-readable message', () => {
    const error = new PolicyViolationError('Only a human actor may approve a decision.');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PaxDomainError);
    expect(error).toBeInstanceOf(PolicyViolationError);
    expect(error.code).toBe('POLICY_VIOLATION');
    expect(error.message).toBe('Only a human actor may approve a decision.');
    expect(error.name).toBe('PolicyViolationError');
  });

  it('gives RoutingRejectionError a stable machine-readable code', () => {
    const error = new RoutingRejectionError('Candidate pack is absent from the compiled registry.');

    expect(error).toBeInstanceOf(PaxDomainError);
    expect(error.code).toBe('ROUTING_REJECTED');
    expect(error.name).toBe('RoutingRejectionError');
  });

  it('gives ValidationFailedError a stable machine-readable code', () => {
    const error = new ValidationFailedError('Input failed validation.');

    expect(error).toBeInstanceOf(PaxDomainError);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.name).toBe('ValidationFailedError');
  });

  it('has no details or cause when none are supplied', () => {
    const error = new ValidationFailedError('missing options entirely');

    expect(error.details).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('attaches bounded JSON-safe details when supplied', () => {
    const error = new PolicyViolationError('rejected', {
      details: { actor: 'agent', proposalId: 'proposal-1', attempt: 2, ok: false, note: null },
    });

    expect(error.details).toEqual({
      actor: 'agent',
      proposalId: 'proposal-1',
      attempt: 2,
      ok: false,
      note: null,
    });
  });

  it('chains a cause when supplied', () => {
    const cause = new Error('underlying zod failure');
    const error = new ValidationFailedError('wrapped', { cause });

    expect(error.cause).toBe(cause);
  });

  it('attaches both details and cause together', () => {
    const cause = new Error('root cause');
    const error = new RoutingRejectionError('rejected candidate', {
      details: { packId: 'car-purchase' },
      cause,
    });

    expect(error.details).toEqual({ packId: 'car-purchase' });
    expect(error.cause).toBe(cause);
  });

  it('identifies PaxDomainError instances via isPaxDomainError', () => {
    expect(isPaxDomainError(new PolicyViolationError('x'))).toBe(true);
    expect(isPaxDomainError(new RoutingRejectionError('x'))).toBe(true);
    expect(isPaxDomainError(new ValidationFailedError('x'))).toBe(true);
  });

  it('rejects non-PaxDomainError values via isPaxDomainError', () => {
    expect(isPaxDomainError(new Error('plain error'))).toBe(false);
    expect(isPaxDomainError('a string')).toBe(false);
    expect(isPaxDomainError(null)).toBe(false);
    expect(isPaxDomainError(undefined)).toBe(false);
    expect(isPaxDomainError({ code: 'POLICY_VIOLATION' })).toBe(false);
  });
});
