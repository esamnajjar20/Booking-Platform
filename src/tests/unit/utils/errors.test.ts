import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
} from '../../../../src/utils/errors';

describe('errors', () => {
  it('AppError carries statusCode and isOperational', () => {
    const err = new AppError('x', 418);
    expect(err.message).toBe('x');
    expect(err.statusCode).toBe(418);
    expect(err.isOperational).toBe(true);
  });

  it('ValidationError is 400', () => {
    const err = new ValidationError('bad');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('bad');
  });

  it('NotFoundError formats message and is 404', () => {
    const err = new NotFoundError('Service');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Service not found');
  });

  it('UnauthorizedError defaults to Unauthorized and is 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Unauthorized');
  });

  it('ForbiddenError defaults to Forbidden and is 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Forbidden');
  });

  it('ConflictError is 409', () => {
    const err = new ConflictError('dup');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('dup');
  });
});
