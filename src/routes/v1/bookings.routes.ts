import { Router } from 'express';
import { BookingController } from '../../controllers/booking.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/authorize.middleware';
import {
  validateBody,
  validateParams,
  idParamSchema,
  createBookingSchema,
  validateQuery,
  paginationQuerySchema
} from '../../middleware/validation.middleware';
import { bookingLimiter } from '../../middleware/rateLimit.middleware';

const router = Router();
const ctrl = new BookingController();

/**
 * All booking routes require authentication
 */
router.use(authenticate);

/**
 * Get user bookings
 */
router.get('/', validateQuery(paginationQuerySchema), ctrl.getUserBookings);

/**
 * Get booking by id
 */
router.get('/:id', validateParams(idParamSchema), ctrl.getById);

/**
 * Create booking
 */
router.post('/', bookingLimiter, validateBody(createBookingSchema), ctrl.create);

/**
 * Cancel booking (user or owner logic handled inside service)
 */
router.patch(
  '/:id/cancel',
  bookingLimiter,
  validateParams(idParamSchema),
  ctrl.cancel
);

/**
 * Confirm booking (admin only)
 */
router.patch(
  '/:id/confirm',
  authorize('ADMIN'),
  bookingLimiter,
  validateParams(idParamSchema),
  
  ctrl.confirm
);

export default router;