/**
 * Service Controller
 * Handles HTTP requests for service CRUD operations.
 * Uses ResponseWrapper for standardized API responses.
 */
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseWrapper } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { serviceService } from '../services/service.container';

export class ServiceController {
  /**
   * GET /api/v1/services
   * Retrieve paginated list of available services with filtering options
   */
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      // Extract pagination and filter parameters from query string
      const { page, limit, skip, sortBy, order, search, minPrice, maxPrice } = getPagination(req.query);

      // Delegate filtering and data fetching to service layer
      const { services, total } = await serviceService.getAll({
        skip,
        take: limit,
        sortBy,
        order: order as 'asc' | 'desc',
        search,
        minPrice,
        maxPrice
      });

      // Return standardized paginated response
      ResponseWrapper.paginated(res, services, total, page, limit);
    } catch (error) {
      next(error); // Pass to global error handler
    }
  }

  /**
   * GET /api/v1/services/:id
   * Retrieve a single service by ID
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      // Service layer handles caching and validation
      const service = await serviceService.getById(req.params.id);
      ResponseWrapper.success(res, service);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/services
   * Create a new service (Admin only)
   * Handles image upload via multer middleware
   */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, description, price, duration } = req.body;
      const imagePath = (req.file as any)?.path; // Extract uploaded file path

      // Delegate creation logic to service layer
      const service = await serviceService.create(
        { 
          name, 
          description, 
          price: Number(price), 
          duration: Number(duration) 
        }, 
        imagePath
      );

      // Return 201 Created for successful resource creation
      ResponseWrapper.success(res, service, 'Service created', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/services/:id
   * Update an existing service (Admin only)
   */
  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Service layer handles validation and cache invalidation
      const service = await serviceService.update(id, req.body);

      ResponseWrapper.success(res, service, 'Service updated');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/services/:id
   * Soft delete a service (Admin only)
   * Does not permanently remove the record from database
   */
  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await serviceService.delete(req.params.id);

      // Return 204 No Content for successful deletion
      ResponseWrapper.success(res, null, 'Service deleted', 204);
    } catch (error) {
      next(error);
    }
  }
}