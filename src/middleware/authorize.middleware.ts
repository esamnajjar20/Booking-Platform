import { Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { AuthRequest } from './auth.middleware';

/**
 * Role-based authorization middleware
 * ------------------------------------
 * Ensures that authenticated users have the required roles
 * before accessing protected routes.
 *
 * This is a simple RBAC implementation.
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {

    // 1. Ensure user is authenticated first
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // 2. Validate role exists in user context
    const userRole = req.user.role;

    // 3. Check if user role is allowed
    if (!roles.includes(userRole)) {
      return next(
        new ForbiddenError(
          'You do not have permission to access this resource'
        )
      );
    }

    // 4. Authorized → continue
    next();
  };
};