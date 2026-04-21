import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateBody,
  validateParams,
  validateQuery,
  registerSchema,
  idParamSchema,
  paginationQuerySchema,
  updateServiceSchema,
  createBookingSchema
} from '../../../../src/middleware/validation.middleware';
import { ValidationError } from '../../../../src/utils/errors';

describe('validation.middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validateBody parses and replaces body on success', () => {
    const req: any = { body: { email: 'a@a.com', password: '12345678', name: 'AA' } };
    const next = vi.fn();

    validateBody(registerSchema)(req, {} as any, next);

    expect(req.body).toEqual({ email: 'a@a.com', password: '12345678', name: 'AA' });
    expect(next).toHaveBeenCalledWith();
  });

  it('validateParams and validateQuery fail with ValidationError', () => {
    const nextParams = vi.fn();
    const nextQuery = vi.fn();

    validateParams(idParamSchema)({ params: { id: 'bad' } } as any, {} as any, nextParams);
    validateQuery(paginationQuerySchema)({ query: { page: '0' } } as any, {} as any, nextQuery);

    expect(nextParams).toHaveBeenCalledWith(expect.any(ValidationError));
    expect(nextQuery).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('updateServiceSchema enforces at least one field', () => {
    const result = updateServiceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('createBookingSchema rejects invalid time ranges', () => {
    vi.setSystemTime(new Date('2026-01-01T09:00:00.000Z'));
    const result = createBookingSchema.safeParse({
      serviceId: '11111111-1111-1111-1111-111111111111',
      startTime: '2026-01-01T11:00:00.000Z',
      endTime: '2026-01-01T10:00:00.000Z'
    });

    expect(result.success).toBe(false);
  });

  it('createBookingSchema rejects startTime in the past', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    const result = createBookingSchema.safeParse({
      serviceId: '11111111-1111-1111-1111-111111111111',
      startTime: '2026-01-01T11:00:00.000Z',
      endTime: '2026-01-01T13:00:00.000Z'
    });

    expect(result.success).toBe(false);
  });
});
