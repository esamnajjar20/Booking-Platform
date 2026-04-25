import { Router } from 'express';
import { AuthController } from '../../controllers/auth.controller';
import { validateBody, registerSchema, loginSchema } from '../../middleware/validation.middleware';
import { authLimiter } from '../../middleware/rateLimit.middleware';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
const ctrl = new AuthController();

/**
 * Authentication routes module
 * This file defines all endpoints related to user authentication flow,
 * including registration, login, token refresh, and logout.
 *
 * Each route is connected to:
 * - Validation middleware (to ensure request integrity)
 * - Security middleware (rate limiting / authentication)
 * - Controller methods (business logic handling)
 */

router.post('/register', authLimiter, validateBody(registerSchema), ctrl.register);

router.post('/login', authLimiter, validateBody(loginSchema), ctrl.login);

router.post('/refresh', authLimiter, ctrl.refresh);

router.post('/logout',authLimiter, authenticate, ctrl.logout);

export default router;