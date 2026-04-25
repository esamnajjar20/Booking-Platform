import { describe, expect, it, vi } from 'vitest';

const authenticateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/middleware/auth.middleware', () => ({
  authenticate: authenticateMock
}));

import { protectUploads } from '../../../../src/middleware/uploadAuth.middleware';

describe('uploadAuth.middleware', () => {
  it('rejects when auth is missing', () => {
    const req: any = { headers: {} };
    const res: any = {};
    const next = vi.fn();
    const authError = new Error('No token provided');

    authenticateMock.mockImplementation((_req: any, _res: any, nextFn: any) => nextFn(authError));
    protectUploads(req, res, next);

    expect(authenticateMock).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledWith(authError);
  });

  it('allows request when auth is valid', () => {
    const req: any = { headers: { authorization: 'Bearer token' } };
    const res: any = {};
    const next = vi.fn();

    authenticateMock.mockImplementation((_req: any, _res: any, nextFn: any) => nextFn());
    protectUploads(req, res, next);

    expect(authenticateMock).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects when token is invalid', () => {
    const req: any = { headers: { authorization: 'Bearer invalid' } };
    const res: any = {};
    const next = vi.fn();
    const authError = new Error('Invalid token');

    authenticateMock.mockImplementation((_req: any, _res: any, nextFn: any) => nextFn(authError));
    protectUploads(req, res, next);

    expect(authenticateMock).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledWith(authError);
  });
});
