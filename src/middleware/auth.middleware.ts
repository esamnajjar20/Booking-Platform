import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UnauthorizedError } from '../utils/errors';
import logger from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Authentication middleware
 * -------------------------
 * Validates JWT token from Authorization header
 * and attaches decoded user info to request object.
 *
 * Security improvements:
 * - Strong type validation
 * - Payload sanity checks
 * - Safer error handling
 */
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  // 1. Check if Authorization header exists and has Bearer token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    // 2. Verify JWT token integrity and signature
    const decoded = jwt.verify(token, config.JWT_SECRET);

    // 3. Runtime type validation (avoid unsafe casting)
    if (
      typeof decoded !== 'object' ||
      !decoded ||
      !('id' in decoded) ||
      !('email' in decoded) ||
      !('role' in decoded)
    ) {
      return next(new UnauthorizedError('Invalid token payload'));
    }

    const payload = decoded as {
      id: string;
      email: string;
      role: string;
    };

    // 4. Attach validated user to request
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role
    };

    next();
  } catch (error) {
    // 5. Generic error to avoid leaking JWT details
    logger.error('JWT verification failed : ' , error)
    return next(new UnauthorizedError('Invalid or expired token'));
  }
};