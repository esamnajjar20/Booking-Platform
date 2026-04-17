import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResponseWrapper } from '../../../../src/utils/response';

describe('ResponseWrapper', () => {
  const makeRes = () => {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('success sends status and payload', () => {
    const res = makeRes();
    ResponseWrapper.success(res as any, { a: 1 }, 'ok', 201);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { a: 1 },
      message: 'ok',
      timestamp: '2026-01-01T00:00:00.000Z'
    });
  });

  it('error sends status and payload', () => {
    const res = makeRes();
    ResponseWrapper.error(res as any, 'bad', 401, 'NOPE', 'c1');

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'bad',
      code: 'NOPE',
      correlationId: 'c1',
      timestamp: '2026-01-01T00:00:00.000Z'
    });
  });

  it('paginated includes pagination metadata', () => {
    const res = makeRes();
    ResponseWrapper.paginated(res as any, [{ id: 1 }], 25, 2, 10, 'list');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        items: [{ id: 1 }],
        pagination: {
          page: 2,
          limit: 10,
          total: 25,
          pages: 3,
          hasNext: true,
          hasPrev: true
        }
      },
      message: 'list',
      timestamp: '2026-01-01T00:00:00.000Z'
    });
  });
});
