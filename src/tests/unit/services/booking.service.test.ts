import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError, NotFoundError } from '../../../../src/utils/errors';

vi.mock('../../../../src/utils/logger', () => ({
  default: {
    info: vi.fn()
  }
}));

vi.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: vi.fn()
  }
}));

vi.mock('../../../../src/services/cache.service', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetchFn: () => any) => fetchFn()),
    delete: vi.fn()
  }
}));

vi.mock('../../../../src/config/database', () => ({
  default: {
    booking: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

import prisma from '../../../../src/config/database';
import { cacheService } from '../../../../src/services/cache.service';
import { AuditService } from '../../../../src/services/audit.service';
import logger from '../../../../src/utils/logger';
import { BookingService } from '../../../../src/services/booking.service';

describe('BookingService', () => {
  let service: BookingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BookingService();
  });

  describe('getUserBookings', () => {
    it('returns bookings using a per-user cache key', async () => {
      (prisma.booking.findMany as any).mockResolvedValue([{ id: 'b1' }]);

      const result = await service.getUserBookings('u1');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'user:u1:bookings',
        expect.any(Function),
        1800
      );
      expect(prisma.booking.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', deletedAt: null },
        include: { service: true },
        orderBy: { startTime: 'desc' }
      });
      expect(result).toEqual([{ id: 'b1' }]);
    });
  });

  describe('getById', () => {
    it('returns booking when found and scopes cache by userId', async () => {
      (prisma.booking.findFirst as any).mockResolvedValue({ id: 'b1' });

      const result = await service.getById('b1', 'u1');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'booking:b1:user:u1',
        expect.any(Function),
        1800
      );
      expect(result).toEqual({ id: 'b1' });
    });

    it('throws NotFoundError when booking is missing', async () => {
      (prisma.booking.findFirst as any).mockResolvedValue(null);

      await expect(service.getById('b1', 'u1')).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.getById('b1', 'u1')).rejects.toThrow('Booking not found');
    });
  });

  describe('create', () => {
    const userId = 'u1';
    const serviceId = 's1';
    const startTime = new Date('2026-01-01T10:00:00.000Z');
    const endTime = new Date('2026-01-01T11:00:00.000Z');

    const makeTx = () => {
      return {
        $queryRaw: vi.fn(),
        booking: {
          create: vi.fn()
        }
      };
    };

    it('throws NotFoundError when service is missing', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValueOnce([]);

      (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      await expect(service.create(userId, serviceId, startTime, endTime)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('throws ConflictError when service is not available', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any).mockResolvedValueOnce([
        { id: serviceId, price: 50, isAvailable: false }
      ]);

      (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const promise = service.create(userId, serviceId, startTime, endTime);
      await expect(promise).rejects.toBeInstanceOf(ConflictError);
      await expect(promise).rejects.toThrow('Service not available');
    });

    it('throws ConflictError when slot overlaps', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any)
        .mockResolvedValueOnce([{ id: serviceId, price: 50, isAvailable: true }])
        .mockResolvedValueOnce([{ id: 'existing' }]);

      (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const promise = service.create(userId, serviceId, startTime, endTime);
      await expect(promise).rejects.toBeInstanceOf(ConflictError);
      await expect(promise).rejects.toThrow('Time slot overlaps with existing booking');
    });

    it('creates booking, clears user cache, logs audit, and uses transaction options', async () => {
      const tx = makeTx();
      (tx.$queryRaw as any)
        .mockResolvedValueOnce([{ id: serviceId, price: 99, isAvailable: true }])
        .mockResolvedValueOnce([]);

      const createdBooking = {
        id: 'b1',
        userId,
        serviceId,
        startTime,
        endTime,
        totalPrice: 99,
        service: { id: serviceId }
      };

      (tx.booking.create as any).mockResolvedValue(createdBooking);

      (prisma.$transaction as any).mockImplementation(async (fn: any, options: any) => {
        expect(options).toEqual(
          expect.objectContaining({
            isolationLevel: expect.anything()
          })
        );
        return fn(tx);
      });

      const result = await service.create(userId, serviceId, startTime, endTime);

      expect(tx.booking.create).toHaveBeenCalledWith({
        data: {
          userId,
          serviceId,
          startTime,
          endTime,
          totalPrice: 99
        },
        include: { service: true }
      });
      expect(cacheService.delete).toHaveBeenCalledWith('user:u1:bookings');
      expect(AuditService.log).toHaveBeenCalledWith(
        userId,
        'CREATE_BOOKING',
        'Booking',
        'b1',
        null,
        createdBooking,
        undefined
      );
      expect(logger.info).toHaveBeenCalled();
      expect(result).toEqual(createdBooking);
    });
  });

  describe('cancel', () => {
    it('throws NotFoundError when missing', async () => {
      (prisma.booking.findFirst as any).mockResolvedValue(null);

      await expect(service.cancel('b1', 'u1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects cancelling already cancelled', async () => {
      (prisma.booking.findFirst as any).mockResolvedValue({
        id: 'b1',
        userId: 'u1',
        status: 'CANCELLED'
      });

      const promise = service.cancel('b1', 'u1');
      await expect(promise).rejects.toBeInstanceOf(ConflictError);
      await expect(promise).rejects.toThrow('Already cancelled');
    });

    it('rejects cancelling completed booking', async () => {
      (prisma.booking.findFirst as any).mockResolvedValue({
        id: 'b1',
        userId: 'u1',
        status: 'COMPLETED'
      });

      const promise = service.cancel('b1', 'u1');
      await expect(promise).rejects.toBeInstanceOf(ConflictError);
      await expect(promise).rejects.toThrow('Cannot cancel completed booking');
    });

    it('cancels booking, clears cache, and audits', async () => {
      const before = { id: 'b1', userId: 'u1', status: 'PENDING' };
      const after = { id: 'b1', status: 'CANCELLED' };

      (prisma.booking.findFirst as any).mockResolvedValue(before);
      (prisma.booking.update as any).mockResolvedValue(after);

      const result = await service.cancel('b1', 'u1');

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { status: 'CANCELLED' }
      });
      expect(cacheService.delete).toHaveBeenCalledWith('booking:b1:user:u1');
      expect(cacheService.delete).toHaveBeenCalledWith('user:u1:bookings');
      expect(AuditService.log).toHaveBeenCalledWith(
        'u1',
        'CANCEL_BOOKING',
        'Booking',
        'b1',
        before,
        after,
        undefined
      );
      expect(result).toEqual(after);
    });
  });

  describe('confirm', () => {
    it('throws NotFoundError when missing', async () => {
      (prisma.booking.findFirst as any).mockResolvedValue(null);

      await expect(service.confirm('b1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects confirming non-pending booking', async () => {
      (prisma.booking.findFirst as any).mockResolvedValue({
        id: 'b1',
        userId: 'u1',
        status: 'CANCELLED'
      });

      const promise = service.confirm('b1');
      await expect(promise).rejects.toBeInstanceOf(ConflictError);
      await expect(promise).rejects.toThrow('Only pending bookings can be confirmed');
    });

    it('confirms booking, clears caches, and audits', async () => {
      const before = { id: 'b1', userId: 'u1', status: 'PENDING' };
      const after = { id: 'b1', status: 'CONFIRMED' };

      (prisma.booking.findFirst as any).mockResolvedValue(before);
      (prisma.booking.update as any).mockResolvedValue(after);

      const result = await service.confirm('b1');

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { status: 'CONFIRMED' }
      });
      expect(cacheService.delete).toHaveBeenCalledWith('booking:b1:user:u1');
      expect(cacheService.delete).toHaveBeenCalledWith('user:u1:bookings');
      expect(AuditService.log).toHaveBeenCalledWith(
        'u1',
        'CONFIRM_BOOKING',
        'Booking',
        'b1',
        before,
        after,
        undefined
      );
      expect(result).toEqual(after);
    });
  });
});
