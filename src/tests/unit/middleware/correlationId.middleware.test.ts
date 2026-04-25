import { describe, expect, it, vi } from 'vitest';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-correlation-id')
}));

import { correlationIdMiddleware } from '../../../../src/middleware/correlationId.middleware';

describe('correlationId.middleware', () => {
  it('generates correlation id when request header is missing', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: vi.fn() };
    const next = vi.fn();

    correlationIdMiddleware(req, res, next);

    expect(req.correlationId).toBe('generated-correlation-id');
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'generated-correlation-id');
    expect(next).toHaveBeenCalled();
  });

  it('preserves incoming correlation id when provided', () => {
    const req: any = { headers: { 'x-correlation-id': 'incoming-id-123' } };
    const res: any = { setHeader: vi.fn() };
    const next = vi.fn();

    correlationIdMiddleware(req, res, next);

    expect(req.correlationId).toBe('incoming-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'incoming-id-123');
    expect(next).toHaveBeenCalled();
  });
});
