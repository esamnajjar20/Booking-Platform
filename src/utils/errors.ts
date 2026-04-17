/**
 * Base application error class
 * Used to standardize all operational errors in the system
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);

    // HTTP status code associated with the error
    this.statusCode = statusCode;

    /**
     * Marks error as "operational"
     * meaning: expected error (not a system crash / bug)
     */
    this.isOperational = true;

    /**
     * Removes constructor from stack trace
     * for cleaner and more readable debugging output
     */
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 - Bad Request
 * Used for validation or client input errors
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

/**
 * 404 - Resource not found
 * Used when requested entity does not exist in DB
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

/**
 * 401 - Unauthorized
 * Used when authentication is missing or invalid
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

/**
 * 403 - Forbidden
 * Used when user is authenticated but lacks permissions
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

/**
 * 409 - Conflict
 * Used for business logic conflicts
 * (e.g. duplicate data, overlapping bookings)
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}