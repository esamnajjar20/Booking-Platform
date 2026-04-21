import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';

/**
 * Central validation layer using Zod
 * -----------------------------------
 * Ensures all incoming requests are validated
 * before reaching business logic.
 *
 * This prevents:
 * - invalid data in DB
 * - runtime crashes
 * - security injection issues
 */

/* -------------------- SCHEMAS -------------------- */

export const idParamSchema = z.object({
  id: z.string().uuid()
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  sortBy: z.enum(['name', 'price', 'duration', 'createdAt']).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().trim().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional()
});

export const registerSchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(8),
  name: z.string().min(2).max(100).trim()
});

export const loginSchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(1)
});

export const createServiceSchema = z.object({
  name: z.string().min(3).max(200).trim(),
  description: z.string().optional(),
  price: z.number().positive(),
  duration: z.number().int().positive()
});

export const createBookingSchema = z.object({
  serviceId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime()
}).superRefine((data, ctx) => {
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid date/time format'
    });
    return;
  }

  if (start < new Date()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startTime cannot be in the past'
    });
  }

  if (end <= start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid time range (endTime must be after startTime)'
    });
  }
});



export const updateServiceSchema = z.object({
  name: z.string().min(3).max(200).trim().optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  duration: z.number().int().positive().optional(),
  isAvailable: z.boolean().optional()
}).refine((data) => {
  // ensure at least one field is provided
  return Object.keys(data).length > 0;
}, {
  message: 'At least one field must be provided for update'
});
/* -------------------- MIDDLEWARE -------------------- */

/**
 * Validate request body
 */
export const validateBody = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return next(new ValidationError(
        JSON.stringify(result.error.flatten())
      ));
    }

    req.body = result.data;
    next();
  };

/**
 * Validate URL params
 */
export const validateParams = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      return next(new ValidationError(
        JSON.stringify(result.error.flatten())
      ));
    }

    req.params = result.data;
    next();
  };

/**
 * Validate query string
 */
export const validateQuery = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      return next(new ValidationError(
        JSON.stringify(result.error.flatten())
      ));
    }

    req.query = result.data;
    next();
  };
