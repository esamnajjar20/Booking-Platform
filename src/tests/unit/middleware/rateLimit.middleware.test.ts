import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.mock('../../../../src/config/redis', () => ({
  default: {
    call: vi.fn()
  }
}));

const { redisStoreInstances } = vi.hoisted(() => ({
  redisStoreInstances: [] as any[]
}));

vi.mock('rate-limit-redis', () => ({
  default: vi.fn().mockImplementation((options: any) => {
    const instance = { ...options };
    redisStoreInstances.push(instance);
    return instance;
  })
}));

vi.mock('express-rate-limit', () => ({
  default: (options: any) => options
}));

import { generalLimiter, authLimiter, apiLimiter, bookingLimiter } from '../../../../src/middleware/rateLimit.middleware';

describe('rateLimit.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStoreInstances.length = 0;
  });

  it('creates distinct Redis store prefixes', () => {
    expect((generalLimiter as any).store.prefix).toBe('general');
    expect((authLimiter as any).store.prefix).toBe('auth');
    expect((apiLimiter as any).store.prefix).toBe('api');
    expect((bookingLimiter as any).store.prefix).toBe('booking');
  });

  it('general limiter key uses user id when authenticated', () => {
    const req: any = { user: { id: 'u1' }, ip: '1.1.1.1', headers: { 'user-agent': 'ua' } };
    const key = (generalLimiter as any).keyGenerator(req);
    expect(key).toBe('u1');
  });

  it('general limiter key uses fingerprint when anonymous', () => {
    const req: any = { ip: '1.1.1.1', headers: { 'user-agent': 'ua' } };
    const key = (generalLimiter as any).keyGenerator(req);

    const expected = crypto
      .createHash('sha256')
      .update('1.1.1.1:ua')
      .digest('hex');

    expect(key).toBe(expected);
  });

  it('auth limiter uses fingerprint and skips successful requests', () => {
    const req: any = { ip: '2.2.2.2', headers: { 'user-agent': 'ua2' } };
    const key = (authLimiter as any).keyGenerator(req);

    const expected = crypto
      .createHash('sha256')
      .update('2.2.2.2:ua2')
      .digest('hex');

    expect(key).toBe(expected);
    expect((authLimiter as any).skipSuccessfulRequests).toBe(true);
    expect((authLimiter as any).max).toBe(5);
  });
});
