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

vi.mock('../../../src/config/database', () => ({
  default: {
    booking: {
      findMany: vi.fn(),
      count: vi.fn()
    }
  }
}));

const { bookingServiceMock } = vi.hoisted(() => ({
  bookingServiceMock: {
    getById: vi.fn(),
    create: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn()
  }
}));

vi.mock('../../../src/services/booking.service', () => ({
  BookingService: vi.fn(() => bookingServiceMock)
}));

import jwt from 'jsonwebtoken';
import bookingsRoutes from '../../../src/routes/v1/bookings.routes';
import { errorHandler } from '../../../src/middleware/error.middleware';
import prisma from '../../../src/config/database';
import { ConflictError, NotFoundError } from '../../../src/utils/errors';

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/bookings', bookingsRoutes);
  app.use(errorHandler);
  return app;
};

describe('Integration: bookings endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (jwt.verify as any).mockImplementation((token: string) => {
      if (token === 'admin-token') return { id: 'admin', email: 'a@a.com', role: 'ADMIN' };
      return { id: 'u1', email: 'u@u.com', role: 'USER' };
    });
  });

  it('GET /bookings requires authentication', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/v1/bookings');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /bookings returns paginated list', async () => {
    (prisma.booking.findMany as any).mockResolvedValue([{ id: 'b1' }]);
    (prisma.booking.count as any).mockResolvedValue(1);

    const app = makeApp();
    const res = await request(app)
      .get('/api/v1/bookings?page=1&limit=10')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([{ id: 'b1' }]);
    expect(res.body.data.pagination.total).toBe(1);
  });

  it('GET /bookings/:id returns booking', async () => {
    bookingServiceMock.getById.mockResolvedValue({ id: 'b1' });

    const app = makeApp();
    const res = await request(app)
      .get('/api/v1/bookings/11111111-1111-1111-1111-111111111111')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('b1');
  });

  it('GET /bookings/:id validates booking id param', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/api/v1/bookings/not-a-uuid')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /bookings/:id returns 404 on permission mismatch (not owner)', async () => {
    bookingServiceMock.getById.mockRejectedValue(new NotFoundError('Booking'));

    const app = makeApp();
    const res = await request(app)
      .get('/api/v1/bookings/11111111-1111-1111-1111-111111111111')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('POST /bookings creates booking', async () => {
    bookingServiceMock.create.mockResolvedValue({ id: 'b1' });

    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', 'Bearer user-token')
      .send({
        serviceId: '22222222-2222-2222-2222-222222222222',
        startTime: '2026-01-01T10:00:00.000Z',
        endTime: '2026-01-01T11:00:00.000Z'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('b1');
  });

  it('PATCH /bookings/:id/cancel cancels booking', async () => {
    bookingServiceMock.cancel.mockResolvedValue({ id: 'b1', status: 'CANCELLED' });

    const app = makeApp();
    const res = await request(app)
      .patch('/api/v1/bookings/11111111-1111-1111-1111-111111111111/cancel')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /bookings/:id/cancel returns conflict when already cancelled', async () => {
    bookingServiceMock.cancel.mockRejectedValue(new ConflictError('Already cancelled'));

    const app = makeApp();
    const res = await request(app)
      .patch('/api/v1/bookings/11111111-1111-1111-1111-111111111111/cancel')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already cancelled/i);
  });

  it('PATCH /bookings/:id/confirm requires ADMIN', async () => {
    const app = makeApp();
    const res = await request(app)
      .patch('/api/v1/bookings/11111111-1111-1111-1111-111111111111/confirm')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /bookings/:id/confirm confirms booking for ADMIN', async () => {
    bookingServiceMock.confirm.mockResolvedValue({ id: 'b1', status: 'CONFIRMED' });

    const app = makeApp();
    const res = await request(app)
      .patch('/api/v1/bookings/11111111-1111-1111-1111-111111111111/confirm')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('PATCH /bookings/:id/confirm returns conflict when booking was cancelled', async () => {
    bookingServiceMock.confirm.mockRejectedValue(
      new ConflictError('Only pending bookings can be confirmed')
    );

    const app = makeApp();
    const res = await request(app)
      .patch('/api/v1/bookings/11111111-1111-1111-1111-111111111111/confirm')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/only pending bookings can be confirmed/i);
  });
});
