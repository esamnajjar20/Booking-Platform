import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction } from 'express';
import { authorize } from '../../../../src/middleware/authorize.middleware';
import { ForbiddenError, UnauthorizedError } from '../../../../src/utils/errors';

describe('authorize middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('returns UnauthorizedError when user is missing', () => {
    const req: any = {};
    authorize('ADMIN')(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('returns ForbiddenError when user role is not allowed', () => {
    const req: any = { user: { id: 'u1', role: 'USER' } };
    authorize('ADMIN')(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('calls next without error when user role is allowed', () => {
    const req: any = { user: { id: 'u1', role: 'ADMIN' } };
    authorize('ADMIN', 'SUPPORT')(req, {} as any, next);

    expect(next).toHaveBeenCalledWith();
  });
});
