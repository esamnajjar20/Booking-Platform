import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseWrapper } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { bookingService } from '../services/service.container';

export class BookingController {

  /**
   * GET /api/v1/bookings
   * Retrieve paginated list of authenticated user's bookings
   */
  async getUserBookings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // Extract pagination parameters from query string
      const { page, limit, skip } = getPagination(req.query);

      // Delegate data fetching to service layer
      const { bookings, total } = await bookingService.getUserBookings(
        req.user!.id,
        skip,
        limit
      );

      // Return standardized paginated response
      ResponseWrapper.paginated(res, bookings, total, page, limit);
    } catch (error) {
      next(error); // Pass to global error handler
    }
  }

  /**
   * GET /api/v1/bookings/:id
   * Retrieve a single booking by ID with ownership verification
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // Service layer handles authorization and caching
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
   * Create a new booking for the authenticated user
   */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { serviceId, startTime, endTime } = req.body;

      // Pass request object for audit logging
      const booking = await bookingService.create(
        req.user!.id,
        serviceId,
        new Date(startTime),
        new Date(endTime),
        req
      );

      // Return 201 Created status for successful resource creation
      ResponseWrapper.success(res, booking, 'Booking created', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/bookings/:id/cancel
   * Cancel an existing booking (owner only)
   */
  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const booking = await bookingService.cancel(
        req.params.id,
        req.user!.id,
        req // Pass request for audit context
      );

      ResponseWrapper.success(res, booking, 'Booking cancelled');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/bookings/:id/confirm
   * Confirm a pending booking (admin operation)
   */
  async confirm(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // No user ID needed as this is an admin endpoint
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