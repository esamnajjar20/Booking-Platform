import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors';
import { cacheService } from './cache.service';
import logger from '../utils/logger';
import { AuditService } from './audit.service';
import { Request } from 'express';

export class BookingService {
  async getUserBookings(userId: string) {
    return cacheService.getOrSet(
      `user:${userId}:bookings`, // Cache scoped per user (prevents cross-user data leakage)
      async () => {
        return prisma.booking.findMany({
          where: { userId, deletedAt: null }, // Soft delete respected
          include: { service: true },
          orderBy: { startTime: 'desc' }
        });
      },
      1800 // TTL = 30 min (tradeoff between freshness vs performance)
    );
  }

  async getById(id: string, userId: string) {
    // Critical: userId included → prevents unauthorized access via cache poisoning
    const cacheKey = `booking:${id}:user:${userId}`;

    return cacheService.getOrSet(cacheKey, async () => {
      const booking = await prisma.booking.findFirst({
        where: { id, userId, deletedAt: null }, // Ownership enforced at DB level
        include: { service: true }
      });

      if (!booking) throw new NotFoundError('Booking');
      return booking;
    }, 1800);
  }

  async create(userId: string, serviceId: string, startTime: Date, endTime: Date, req?: Request) {
    return prisma.$transaction(async (tx) => {

      // Raw SQL used with FOR UPDATE to lock the service row (prevents race conditions)
      const service = await tx.$queryRaw<Array<{ id: string; price: number; isAvailable: boolean }>>`
        SELECT id, price, "isAvailable"
        FROM "Service"
        WHERE id = ${serviceId}
        FOR UPDATE
      `;

      if (!service[0]) throw new NotFoundError('Service');
      if (!service[0].isAvailable) throw new ConflictError('Service not available');

      // Overlap check using SQL OVERLAPS + FOR UPDATE
      // Ensures no concurrent bookings can bypass this check
      const overlapping = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Booking"
        WHERE "serviceId" = ${serviceId}
          AND status != 'CANCELLED'
          AND "deletedAt" IS NULL
          AND ( ("startTime", "endTime") OVERLAPS (${startTime}, ${endTime}) )
        FOR UPDATE
      `;

      if (overlapping.length > 0) {
        throw new ConflictError('Time slot overlaps with existing booking');
      }

      const booking = await tx.booking.create({
        data: {
          userId,
          serviceId,
          startTime,
          endTime,
          totalPrice: service[0].price // Snapshot price at booking time (avoids future inconsistencies)
        },
        include: { service: true }
      });

      // Cache invalidation (write-through strategy not used → manual eviction)
      await cacheService.delete(`user:${userId}:bookings`);

      // Audit log keeps full before/after traceability
      await AuditService.log(userId, 'CREATE_BOOKING', 'Booking', booking.id, null, booking, req);

      logger.info(`Booking created: ${booking.id}`);

      return booking;
    },
    {
      // Strongest isolation level → prevents phantom reads in overlap checks
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  }

  async cancel(id: string, userId: string, req?: Request) {
    const booking = await prisma.booking.findFirst({
      where: { id, userId, deletedAt: null } // Ownership + soft delete enforced
    });

    if (!booking) throw new NotFoundError('Booking');

    // State machine validation
    if (booking.status === 'CANCELLED') {
      throw new ConflictError('Already cancelled');
    }
    if (booking.status === 'COMPLETED') {
      throw new ConflictError('Cannot cancel completed booking');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    // Invalidate both specific booking cache + aggregated user cache
    await cacheService.delete(`booking:${id}:user:${userId}`);
    await cacheService.delete(`user:${userId}:bookings`);

    await AuditService.log(userId, 'CANCEL_BOOKING', 'Booking', id, booking, updated, req);

    logger.info(`Booking cancelled: ${id}`);

    return updated;
  }

  async confirm(id: string, req?: Request) {
   
    // findUnique does NOT support additional filters like deletedAt
    // This may ignore soft delete condition depending on Prisma behavior
    const booking = await prisma.booking.findFirst({
      where: { id, deletedAt: null } as any // (likely workaround, but not strictly correct)
    });

    if (!booking) throw new NotFoundError('Booking');

    // Enforces valid state transition (PENDING → CONFIRMED only)
    if (booking.status !== 'PENDING') {
      throw new ConflictError('Only pending bookings can be confirmed');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED' }
    });

    await cacheService.delete(`booking:${id}:user:${booking.userId}`);
    await cacheService.delete(`user:${booking.userId}:bookings`);

    await AuditService.log(booking.userId, 'CONFIRM_BOOKING', 'Booking', id, booking, updated, req);

    logger.info(`Booking confirmed: ${id}`);

    return updated;
  }
}