import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import logger from "../utils/logger";
import { ResponseWrapper } from "../utils/response";

/**
 * Global error handler
 * --------------------
 * Centralized error processing for the entire application.
 * Responsible for:
 * - Logging errors with context
 * - Mapping known errors to HTTP responses
 * - Hiding internal implementation details in production
 */

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const correlationId = req.headers["x-correlation-id"] as string | undefined;

  /**
   * 1. Structured logging for observability
   */
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    correlationId,
  });

  /**
   * 2. Handle custom application errors
   */
  if (err instanceof AppError) {
    return ResponseWrapper.error(
      res,
      err.message,
      err.statusCode,
      err.name,
      correlationId,
    );
  }

  /**
   * 3. Prisma error mapping (database layer)
   */
  if (err.name === "PrismaClientKnownRequestError") {
    const code = (err as unknown as { code: string }).code;

    switch (code) {
      case "P2002":
        return ResponseWrapper.error(
          res,
          "Duplicate entry",
          409,
          "DUPLICATE",
          correlationId,
        );

      case "P2025":
        return ResponseWrapper.error(
          res,
          "Record not found",
          404,
          "NOT_FOUND",
          correlationId,
        );
    }
  }

  /**
   * 4. Authentication errors (JWT)
   */
  if (err.name === "JsonWebTokenError") {
    return ResponseWrapper.error(
      res,
      "Invalid token",
      401,
      "INVALID_TOKEN",
      correlationId,
    );
  }

  if (err.name === "TokenExpiredError") {
    return ResponseWrapper.error(
      res,
      "Token expired",
      401,
      "TOKEN_EXPIRED",
      correlationId,
    );
  }

  /**
   * 5. Fallback (unknown errors)
   * Hide internal details in production for security
   */
  const isProd = process.env.NODE_ENV === "production";

  return ResponseWrapper.error(
    res,
    isProd ? "Internal server error" : err.message,
    500,
    "INTERNAL_ERROR",
    correlationId,
  );
};
