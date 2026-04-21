/**
 * Booking Controller
 * Handles HTTP layer only (no business logic here)
 * Delegates all business logic to BookingService
 * Ensures clean separation of concerns (Controller → Service → DB)
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseWrapper } from '../utils/response';
import { getPagination } from '../utils/pagination';
import prisma from '../config/database';
import { bookingService } from '../services/service.container';

export class BookingController {

  /**
   * GET /api/v1/bookings
   * Returns paginated list of user's bookings
   * Includes total count for frontend pagination UI
   */
  async getUserBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req.query);

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where: {
            userId: req.user!.id,
            deletedAt: null
          },
          include: { service: true },
          orderBy: { startTime: 'desc' },
          skip,
          take: limit
        }),

        prisma.booking.count({
          where: {
            userId: req.user!.id,
            deletedAt: null
          }
        })
      ]);

      ResponseWrapper.paginated(res, bookings, total, page, limit);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/bookings/:id
   * Returns single booking (only if owned by current user)
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const booking = await bookingService.getById(
        req.params.id,
        req.user!.id
      );

      ResponseWrapper.success(res, booking);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/bookings
   * Creates new booking for authenticated user
   * Business logic handled in service (validation, overlap, pricing)
   */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { serviceId, startTime, endTime } = req.body;

      const booking = await bookingService.create(
        req.user!.id,
        serviceId,
        new Date(startTime),
        new Date(endTime),
        req
      );

      ResponseWrapper.success(res, booking, 'Booking created', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/bookings/:id/cancel
   * Cancels a booking if it belongs to the user and is allowed
   */
  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const booking = await bookingService.cancel(
        req.params.id,
        req.user!.id,
        req
      );

      ResponseWrapper.success(res, booking, 'Booking cancelled');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/bookings/:id/confirm
   * Admin-only operation to confirm bookings
   */
  async confirm(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const booking = await bookingService.confirm(
        req.params.id,
        req
      );

      ResponseWrapper.success(res, booking, 'Booking confirmed');
    } catch (error) {
      next(error);
    }
  }
}
