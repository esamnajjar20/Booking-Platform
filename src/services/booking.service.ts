import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '../utils/errors';
import { cacheService } from './cache.service';
import logger from '../utils/logger';
import { AuditService } from './audit.service';
import { Request } from 'express';

export class BookingService {
  /**
   * Retrieve all bookings for a specific user with pagination support
   * Returns both the bookings array and total count for pagination metadata
   */
  async getUserBookings(userId: string, skip?: number, take?: number) {
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: {
          userId,
          deletedAt: null // Exclude soft-deleted bookings
        },
        include: { service: true }, // Include related service details
        orderBy: { startTime: 'desc' }, // Most recent bookings first
        skip,
        take
      }),

      prisma.booking.count({
        where: {
          userId,
          deletedAt: null
        }
      })
    ]);

    return { bookings, total };
  }

  /**
   * Get a single booking by ID with user ownership verification
   * Uses caching to reduce database load for frequently accessed bookings
   */
  async getById(id: string, userId: string) {
    const cacheKey = `booking:${id}:user:${userId}`;

    return cacheService.getOrSet(cacheKey, async () => {
      const booking = await prisma.booking.findFirst({
        where: { id, userId, deletedAt: null }, // Ensures user owns this booking
        include: { service: true }
      });

      if (!booking) throw new NotFoundError('Booking');
      return booking;
    }, 1800); // Cache for 30 minutes
  }

  /**
   * Create a new booking with concurrent safety measures
   * Uses SERIALIZABLE transaction isolation to prevent double bookings
   * Implements row-level locking on service to prevent race conditions
   */
  async create(userId: string, serviceId: string, startTime: Date, endTime: Date, req?: Request) {
    return prisma.$transaction(async (tx) => {
      // Lock the service row to prevent concurrent modifications
      const service = await tx.$queryRaw<Array<{ id: string; price: number; isAvailable: boolean }>>`
        SELECT id, price, "isAvailable"
        FROM "Service"
        WHERE id = ${serviceId}
        FOR UPDATE
      `;

      if (!service[0]) throw new NotFoundError('Service');
      if (!service[0].isAvailable) throw new ConflictError('Service not available');

      // Check for overlapping bookings using PostgreSQL OVERLAPS operator
      // FOR UPDATE lock prevents concurrent inserts in the same time slot
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

      // Create booking with price snapshot to preserve historical accuracy
      const booking = await tx.booking.create({
        data: {
          userId,
          serviceId,
          startTime,
          endTime,
          totalPrice: service[0].price // Capture current price at booking time
        },
        include: { service: true }
      });

      // Invalidate user's bookings list cache
      await cacheService.delete(`user:${userId}:bookings`);

      // Log creation for audit trail
      await AuditService.log(userId, 'CREATE_BOOKING', 'Booking', booking.id, null, booking, req);

      logger.info(`Booking created: ${booking.id}`);

      return booking;
    },
    {
      // Highest isolation level to prevent phantom reads in overlap detection
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  }

  /**
   * Cancel an existing booking with business rule validation
   * Enforces valid state transitions (cannot cancel completed bookings)
   */
  async cancel(id: string, userId: string, req?: Request) {
    // Verify booking exists and belongs to the user
    const booking = await prisma.booking.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!booking) throw new NotFoundError('Booking');

    // Business rule: already cancelled bookings cannot be cancelled again
    if (booking.status === 'CANCELLED') {
      throw new ConflictError('Already cancelled');
    }
    
    // Business rule: completed bookings are immutable
    if (booking.status === 'COMPLETED') {
      throw new ConflictError('Cannot cancel completed booking');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    // Invalidate both specific booking cache and user's aggregated bookings cache
    await cacheService.delete(`booking:${id}:user:${userId}`);
    await cacheService.delete(`user:${userId}:bookings`);

    // Log cancellation with before/after state for audit trail
    await AuditService.log(userId, 'CANCEL_BOOKING', 'Booking', id, booking, updated, req);

    logger.info(`Booking cancelled: ${id}`);

    return updated;
  }

  /**
   * Confirm a pending booking (typically an admin function)
   * Validates that only PENDING bookings can transition to CONFIRMED state
   */
  async confirm(id: string, req?: Request) {
    // Find booking regardless of user ownership (admin operation)
    const booking = await prisma.booking.findFirst({
      where: { id, deletedAt: null } as any
    });

    if (!booking) throw new NotFoundError('Booking');

    // Ensure valid state transition from PENDING to CONFIRMED
    if (booking.status !== 'PENDING') {
      throw new ConflictError('Only pending bookings can be confirmed');
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED' }
    });

    // Clear affected cache entries
    await cacheService.delete(`booking:${id}:user:${booking.userId}`);
    await cacheService.delete(`user:${booking.userId}:bookings`);

    // Record confirmation in audit log
    await AuditService.log(booking.userId, 'CONFIRM_BOOKING', 'Booking', id, booking, updated, req);

    logger.info(`Booking confirmed: ${id}`);

    return updated;
  }
}