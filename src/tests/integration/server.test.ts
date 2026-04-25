import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  startReminderJob: vi.fn(),
  generalLimiter: vi.fn((_req: any, _res: any, next: any) => next()),
  protectUploads: vi.fn((_req: any, _res: any, next: any) => next()),
  prismaQueryRaw: vi.fn(),
  prismaDisconnect: vi.fn(),
  redisPing: vi.fn(),
  redisQuit: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../../src/config/env', () => ({
  config: {
    TRUST_PROXY: false,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    BODY_LIMIT: '1mb',
    PORT: 0,
    HEALTHCHECK_TOKEN: 'health-token',
    NODE_ENV: 'test'
  }
}));

vi.mock('../../../src/middleware/rateLimit.middleware', () => ({
  generalLimiter: mocks.generalLimiter
}));

vi.mock('../../../src/middleware/uploadAuth.middleware', () => ({
  protectUploads: mocks.protectUploads
}));

vi.mock('../../../src/jobs/reminder.job', () => ({
  startReminderJob: mocks.startReminderJob
}));

vi.mock('../../../src/config/database', () => ({
  default: {
    $queryRaw: mocks.prismaQueryRaw,
    $disconnect: mocks.prismaDisconnect
  }
}));

vi.mock('../../../src/config/redis', () => ({
  default: {
    ping: mocks.redisPing,
    quit: mocks.redisQuit
  }
}));

vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  },
  stream: { write: vi.fn() }
}));

vi.mock('../../../src/routes/v1/index', async () => {
  const router = express.Router();
  router.get('/boom', (_req, _res, next) => next(new Error('boom')));
  router.get('/ok', (_req, res) => res.status(200).json({ ok: true }));
  return { default: router };
});

vi.mock('../../../src/routes/docs.routes', async () => {
  const router = express.Router();
  router.get('/', (_req, res) => res.status(200).json({ docs: true }));
  return { default: router };
});

describe('Integration: server bootstrap', () => {
  let app: express.Express;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    const mod = await import('../../../src/server');
    app = mod.default;
  });

  afterAll(async () => {
    process.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 20));
    exitSpy.mockRestore();
  });

  it('starts app and serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(mocks.startReminderJob).toHaveBeenCalledTimes(1);
  });

  it('loads middleware stack for /api routes', async () => {
    const res = await request(app).get('/api/v1/ok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mocks.generalLimiter).toHaveBeenCalled();
  });

  it('uses global error handler for unhandled route errors', async () => {
    const res = await request(app).get('/api/v1/boom');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('boom');
  });
});
