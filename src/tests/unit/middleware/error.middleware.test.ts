import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorHandler } from '../../../../src/middleware/error.middleware';
import { ValidationError } from '../../../../src/utils/errors';
import logger from '../../../../src/utils/logger';

vi.mock('../../../../src/utils/logger', () => ({
  default: {
    error: vi.fn()
  }
}));

describe('errorHandler middleware', () => {
  const makeReq = () =>
    ({
      headers: { 'x-correlation-id': 'corr-1' },
      url: '/x',
      method: 'GET',
      ip: '127.0.0.1'
    }) as any;

  const makeRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('handles AppError with its status and code', () => {
    const res = makeRes();
    const err = new ValidationError('bad input');

    errorHandler(err, makeReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'bad input',
        code: 'Error',
        correlationId: 'corr-1'
      })
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('maps Prisma duplicate error to 409', () => {
    const res = makeRes();
    const err: any = new Error('duplicate');
    err.name = 'PrismaClientKnownRequestError';
    err.code = 'P2002';

    errorHandler(err, makeReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Duplicate entry',
        code: 'DUPLICATE'
      })
    );
  });

  it('maps Prisma not-found error to 404', () => {
    const res = makeRes();
    const err: any = new Error('missing');
    err.name = 'PrismaClientKnownRequestError';
    err.code = 'P2025';

    errorHandler(err, makeReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Record not found',
        code: 'NOT_FOUND'
      })
    );
  });

  it('maps JWT errors to 401', () => {
    const res1 = makeRes();
    const res2 = makeRes();

    const invalid: any = new Error('bad token');
    invalid.name = 'JsonWebTokenError';
    const expired: any = new Error('expired');
    expired.name = 'TokenExpiredError';

    errorHandler(invalid, makeReq(), res1, vi.fn());
    errorHandler(expired, makeReq(), res2, vi.fn());

    expect(res1.status).toHaveBeenCalledWith(401);
    expect(res1.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Invalid token', code: 'INVALID_TOKEN' })
    );
    expect(res2.status).toHaveBeenCalledWith(401);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
    );
  });

  it('returns raw message for unknown errors in non-production', () => {
    process.env.NODE_ENV = 'test';
    const res = makeRes();
    const err = new Error('debug details');

    errorHandler(err, makeReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'debug details',
        code: 'INTERNAL_ERROR'
      })
    );
  });

  it('hides internal message in production for unknown errors', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    const err = new Error('sensitive details');

    errorHandler(err, makeReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      })
    );
  });
});
