import { beforeEach, describe, expect, it, vi } from 'vitest';

const clock = vi.hoisted(() => ({
  now: 0
}));

vi.mock('../../../../src/config/redis', () => ({
  default: {
    call: vi.fn()
  }
}));

vi.mock('rate-limit-redis', () => ({
  default: vi.fn().mockImplementation((options: any) => options)
}));

vi.mock('express-rate-limit', () => ({
  default: (options: any) => {
    const hits = new Map<string, { count: number; resetAt: number }>();

    const middleware = ((req: any, res: any, next: any) => {
      const key = options.keyGenerator(req);
      const now = Date.now();
      const existing = hits.get(key);

      if (!existing || now >= existing.resetAt) {
        hits.set(key, { count: 1, resetAt: now + options.windowMs });
      } else {
        existing.count += 1;
      }

      const state = hits.get(key)!;
      const remaining = Math.max(0, options.max - state.count);
      const resetInSec = Math.ceil((state.resetAt - now) / 1000);

      if (options.standardHeaders) {
        res.setHeader('RateLimit-Limit', String(options.max));
        res.setHeader('RateLimit-Remaining', String(remaining));
        res.setHeader('RateLimit-Reset', String(resetInSec));
      }

      if (state.count > options.max) {
        return res.status(429).json(options.message);
      }

      return next();
    }) as any;

    Object.assign(middleware, options);
    return middleware;
  }
}));

import { generalLimiter } from '../../../../src/middleware/rateLimit.middleware';

describe('rateLimit.middleware behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clock.now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
  });

  it('returns 429 when request limit is exceeded', () => {
    const req: any = { user: { id: 'u1' }, ip: '1.1.1.1', headers: { 'user-agent': 'ua' } };
    const res: any = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn(() => res) };
    const next = vi.fn();

    for (let i = 0; i < 100; i += 1) {
      generalLimiter(req, res, next);
    }
    generalLimiter(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests' });
  });

  it('returns standard rate-limit headers', () => {
    const req: any = { user: { id: 'u2' }, ip: '2.2.2.2', headers: { 'user-agent': 'ua2' } };
    const res: any = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn(() => res) };
    const next = vi.fn();

    generalLimiter(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '100');
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '99');
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', expect.any(String));
    expect(next).toHaveBeenCalled();
  });

  it('resets limit after window elapses', () => {
    const req: any = { user: { id: 'u3' }, ip: '3.3.3.3', headers: { 'user-agent': 'ua3' } };
    const res: any = { setHeader: vi.fn(), status: vi.fn(() => res), json: vi.fn(() => res) };
    const next = vi.fn();

    for (let i = 0; i < 100; i += 1) {
      generalLimiter(req, res, next);
    }
    generalLimiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);

    clock.now += 15 * 60 * 1000 + 1;
    res.status.mockClear();
    res.json.mockClear();
    next.mockClear();

    generalLimiter(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
