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

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn()
  },
  verify: vi.fn()
}));

const { authServiceMock } = vi.hoisted(() => ({
  authServiceMock: {
    register: vi.fn(),
    login: vi.fn(),
    refreshAccessToken: vi.fn(),
    logout: vi.fn()
  }
}));

vi.mock('../../../src/services/service.container', () => ({
  authService: authServiceMock
}));

import jwt from 'jsonwebtoken';
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

describe('Integration: auth endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (jwt.verify as any).mockReturnValue({ id: 'u1', email: 'a@a.com', role: 'USER', type: 'access' });
  });

  it('POST /register validates body', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'bad',
      password: '123',
      name: 'A'
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /register returns 201', async () => {
    authServiceMock.register.mockResolvedValue({
      user: { id: '1', email: 'a@a.com' },
      accessToken: 'access',
      refreshToken: 'refresh'
    });

    const app = makeApp();
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'a@a.com',
      password: '12345678',
      name: 'AA'
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('access');
  });

  it('POST /login returns 200', async () => {
    authServiceMock.login.mockResolvedValue({
      user: { id: '1', email: 'a@a.com' },
      accessToken: 'access',
      refreshToken: 'refresh'
    });

    const app = makeApp();
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'a@a.com',
      password: 'pw'
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('access');
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/refreshToken=refresh/i)])
    );
  });

  it('POST /refresh requires cookie (after auth passes)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Authorization', 'Bearer access');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Missing refresh token');
  });

  it('POST /refresh sets new refresh cookie and returns access token', async () => {
    authServiceMock.refreshAccessToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh'
    });

    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Authorization', 'Bearer access')
      .set('Cookie', ['refreshToken=old-refresh']);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('new-access');
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/refreshToken=new-refresh/i)])
    );
  });

  it('POST /logout clears cookie and revokes token when present', async () => {
    authServiceMock.logout.mockResolvedValue(undefined);

    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer access')
      .set('Cookie', ['refreshToken=to-revoke']);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authServiceMock.logout).toHaveBeenCalledWith('to-revoke');
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/refreshToken=;/i)])
    );
  });

  it('POST /logout remains idempotent when refresh cookie is missing', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer access');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(authServiceMock.logout).not.toHaveBeenCalled();
  });
});
