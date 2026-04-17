import { z } from 'zod';
/**
 * Standard pagination + filtering schema
 * Used for GET list endpoints (services, bookings, etc.)
 */
export const paginationSchema = z
  .object({
    // Page number (1-based indexing)
    page: z.coerce.number().int().positive().default(1),

    // Number of items per page (limited for safety/performance)
    limit: z.coerce.number().int().positive().max(100).default(10),

    // Field used for sorting results
    sortBy: z.enum(['name', 'price', 'duration', 'createdAt']).optional(),

    // Sorting direction
    order: z.enum(['asc', 'desc']).default('asc'),

    // Optional search keyword
    search: z.string().optional(),

    // Price range filters
    minPrice: z.coerce.number().positive().optional(),
    maxPrice: z.coerce.number().positive().optional()
  })
  .refine(
    (data) => {
      // Ensure logical consistency between price range values
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return data.minPrice <= data.maxPrice;
      }
      return true;
    },
    {
      message: 'minPrice must be less than or equal to maxPrice'
    }
  );




/**
 * Helper function to parse pagination query
 * Also calculates "skip" for database queries (Prisma offset)
 */

export type PaginationQuery = z.infer<typeof paginationSchema>;

export const getPagination = (query: unknown): PaginationQuery & { skip: number } => {
  const parsed = paginationSchema.parse(query);
  return { ...parsed, skip: (parsed.page - 1) * parsed.limit };
};