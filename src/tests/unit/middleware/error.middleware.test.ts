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
