import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Correlation ID Middleware
 * -------------------------
 * Assigns a unique identifier to each incoming request
 * for tracing logs across the system.
 */

export const correlationIdMiddleware = (
  req: Request & { correlationId?: string },
  res: Response,
  next: NextFunction
) => {

  /**
   * Prefer client-provided ID only if valid,
   * otherwise generate a new one
   */
  const incomingId = req.headers['x-correlation-id'];

  const correlationId =
    typeof incomingId === 'string' && incomingId.trim().length > 0
      ? incomingId
      : uuidv4();

  /**
   * Store in request object (cleaner than headers mutation)
   */
  req.correlationId = correlationId;

  /**
   * Return to client for traceability
   */
  res.setHeader('X-Correlation-Id', correlationId);

  next();
};