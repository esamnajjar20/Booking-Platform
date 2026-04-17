import { Router } from 'express';
import { ServiceController } from '../../controllers/service.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/authorize.middleware';
import {
  validateBody,
  validateParams,
  idParamSchema,
  createServiceSchema,
  updateServiceSchema,
  validateQuery,
  paginationQuerySchema
} from '../../middleware/validation.middleware';
import { apiLimiter } from '../../middleware/rateLimit.middleware';
import { upload } from '../../middleware/upload.middleware';

const router = Router();
const ctrl = new ServiceController();

/**
 * Public routes (read-only)
 */
router.get('/', apiLimiter, validateQuery(paginationQuerySchema), ctrl.getAll);
router.get('/:id', apiLimiter, validateParams(idParamSchema), ctrl.getById);

/**
 * Admin routes (write operations)
 * Order rule:
 * auth → authorization → validation → upload → controller
 */

router.post(
  '/',
  apiLimiter,
  authenticate,
  authorize('ADMIN'),
  validateBody(createServiceSchema),
  upload.single('image'),
  ctrl.create
);

router.put(
  '/:id',
  apiLimiter,
  authenticate,
  authorize('ADMIN'),
  validateParams(idParamSchema),
  validateBody(updateServiceSchema),
  upload.single('image'),
  ctrl.update
);

router.delete(
  '/:id',
  apiLimiter,
  authenticate,
  authorize('ADMIN'),
  validateParams(idParamSchema),
  ctrl.delete
);

export default router;