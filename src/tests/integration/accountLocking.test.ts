import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

vi.mock('../../../src/middleware/rateLimit.middleware', () => ({
  authLimiter: (_req: any, _res: any, next: any) => next(),
  generalLimiter: (_req: any, _res: any, next: any) => next(),
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  bookingLimiter: (_req: any, _res: any, next: any) => next()
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn()
  },
  compare: vi.fn(),
  hash: vi.fn()
}));

vi.mock('../../../src/config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn()
    },
    refreshToken: {
      create: vi.fn()
    }
  }
}));

const store = new Map<string, string>();

vi.mock('../../../src/config/redis', () => ({
  default: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return keys.length;
    })
  }
}));

vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import prisma from '../../../src/config/database';
import authRoutes from '../../../src/routes/v1/auth.routes';
import { errorHandler } from '../../../src/middleware/error.middleware';

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRoutes);
  app.use(errorHandler);
  return app;
};

describe('Integration: account locking flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    (prisma.user.findUnique as any).mockResolvedValue(null);
  });

  it('locks account after 5 failed login attempts', async () => {
    const app = makeApp();

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'victim@example.com',
        password: 'wrong'
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    }

    const locked = await request(app).post('/api/v1/auth/login').send({
      email: 'victim@example.com',
      password: 'wrong'
    });

    expect(locked.status).toBe(401);
    expect(locked.body.success).toBe(false);
    expect(String(locked.body.error)).toMatch(/locked/i);
  });
});

