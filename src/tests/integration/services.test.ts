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

const { serviceServiceMock } = vi.hoisted(() => ({
  serviceServiceMock: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../../src/services/service.service', () => ({
  ServiceService: vi.fn(() => serviceServiceMock)
}));

import jwt from 'jsonwebtoken';
import servicesRoutes from '../../../src/routes/v1/services.routes';
import { errorHandler } from '../../../src/middleware/error.middleware';
import { NotFoundError } from '../../../src/utils/errors';

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/services', servicesRoutes);
  app.use(errorHandler);
  return app;
};

describe('Integration: services endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (jwt.verify as any).mockImplementation((token: string) => {
      if (token === 'admin-token') {
        return { id: 'admin', email: 'a@a.com', role: 'ADMIN', type: 'access' };
      }
      return { id: 'u1', email: 'u@u.com', role: 'USER', type: 'access' };
    });
  });

  it('GET /services/:id returns service for valid id', async () => {
    serviceServiceMock.getById.mockResolvedValue({ id: 's1', name: 'Haircut' });

    const app = makeApp();
    const res = await request(app).get('/api/v1/services/11111111-1111-1111-1111-111111111111');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('s1');
  });

  it('GET /services/:id returns 404 when service not found', async () => {
    serviceServiceMock.getById.mockRejectedValue(new NotFoundError('Service'));

    const app = makeApp();
    const res = await request(app).get('/api/v1/services/11111111-1111-1111-1111-111111111111');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/service not found/i);
  });

  it('GET /services/:id validates UUID param', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/services/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /services rejects unauthorized user (no token)', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/v1/services').send({
      name: 'Haircut',
      price: 10,
      duration: 30
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /services requires ADMIN role', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', 'Bearer user-token')
      .send({
        name: 'Haircut',
        price: 10,
        duration: 30
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('POST /services validates request body', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'x',
        price: -1,
        duration: 0
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /services creates service for ADMIN', async () => {
    serviceServiceMock.create.mockResolvedValue({ id: 's1', name: 'Haircut' });

    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/services')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Haircut',
        description: 'Basic service',
        price: 10,
        duration: 30
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('s1');
    expect(serviceServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Haircut', price: 10, duration: 30 }),
      undefined
    );
  });

  it('PUT /services/:id rejects forbidden role mismatch', async () => {
    const app = makeApp();
    const res = await request(app)
      .put('/api/v1/services/11111111-1111-1111-1111-111111111111')
      .set('Authorization', 'Bearer user-token')
      .send({ name: 'Updated' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('PUT /services/:id rejects empty partial update body', async () => {
    const app = makeApp();
    const res = await request(app)
      .put('/api/v1/services/11111111-1111-1111-1111-111111111111')
      .set('Authorization', 'Bearer admin-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('PUT /services/:id accepts partial update with single field', async () => {
    serviceServiceMock.update.mockResolvedValue({ id: 's1', isAvailable: false });

    const app = makeApp();
    const res = await request(app)
      .put('/api/v1/services/11111111-1111-1111-1111-111111111111')
      .set('Authorization', 'Bearer admin-token')
      .send({ isAvailable: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(serviceServiceMock.update).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      { isAvailable: false }
    );
  });
});
