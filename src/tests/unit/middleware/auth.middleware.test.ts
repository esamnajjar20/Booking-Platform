import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction } from 'express';

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn()
  },
  verify: vi.fn()
}));

vi.mock('../../../../src/utils/logger', () => ({
  default: {
    error: vi.fn()
  }
}));

import jwt from 'jsonwebtoken';
import { authenticate, type AuthRequest } from '../../../../src/middleware/auth.middleware';
import { UnauthorizedError } from '../../../../src/utils/errors';

describe('authenticate middleware', () => {
  const makeReq = (authorization?: string): AuthRequest =>
    ({
      headers: authorization ? { authorization } : {}
    }) as any;

  const makeRes = () => ({}) as any;

  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it('rejects when Authorization header missing', () => {
    const req = makeReq();
    authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect((next as any).mock.calls[0][0].message).toMatch(/no token/i);
  });

  it('rejects when Authorization is not Bearer', () => {
    const req = makeReq('Basic abc');
    authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects when jwt payload missing required fields', () => {
    (jwt.verify as any).mockReturnValue({ id: '1' });

    const req = makeReq('Bearer t');
    authenticate(req, makeRes(), next);

    expect(jwt.verify).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect((next as any).mock.calls[0][0].message).toMatch(/payload/i);
  });

  it('attaches user and calls next on valid token', () => {
    (jwt.verify as any).mockReturnValue({ id: '1', email: 'a@a.com', role: 'USER' });

    const req = makeReq('Bearer t');
    authenticate(req, makeRes(), next);

    expect(req.user).toEqual({ id: '1', email: 'a@a.com', role: 'USER' });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects when jwt.verify throws', () => {
    (jwt.verify as any).mockImplementation(() => {
      throw new Error('bad');
    });

    const req = makeReq('Bearer t');
    authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect((next as any).mock.calls[0][0].message).toMatch(/invalid|expired/i);
  });
});
