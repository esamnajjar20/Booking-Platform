/**
 * Service Controller
 * Handles HTTP requests for service CRUD operations.
 * Uses ResponseWrapper for standardized API responses.
 */
import { Request, Response, NextFunction } from 'express';
import { ServiceService } from '../services/service.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseWrapper } from '../utils/response';
import { getPagination } from '../utils/pagination';
import prisma from '../config/database';

const serviceService = new ServiceService();

export class ServiceController {
  /**
   * GET /api/v1/services
   * Get all available services with filtering, sorting, and pagination.
   */
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip, sortBy, order, search, minPrice, maxPrice } = getPagination(req.query);

      const where: any = { isAvailable: true, deletedAt: null };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }
      if (minPrice !== undefined) where.price = { ...where.price, gte: minPrice };
      if (maxPrice !== undefined) where.price = { ...where.price, lte: maxPrice };

      let orderBy: any = { createdAt: 'desc' };
      if (sortBy && ['name', 'price', 'duration', 'createdAt'].includes(sortBy)) {
        orderBy = { [sortBy]: order === 'asc' ? 'asc' : 'desc' };
      }

      const [services, total] = await Promise.all([
        prisma.service.findMany({ where, orderBy, skip, take: limit }),
        prisma.service.count({ where })
      ]);

      ResponseWrapper.paginated(res, services, total, page, limit);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/services/:id
   * Get a single service by ID.
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const service = await serviceService.getById(req.params.id);
      ResponseWrapper.success(res, service);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/services
   * Create a new service (Admin only).
   * Handles image upload via multer.
   */
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, description, price, duration } = req.body;
      const imagePath = (req.file as any)?.path;
      const service = await serviceService.create({ name, description, price: Number(price), duration: Number(duration) }, imagePath);
      ResponseWrapper.success(res, service, 'Service created', 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/services/:id
   * Update a service (Admin only).
   */
  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const service = await serviceService.update(id, req.body);
      ResponseWrapper.success(res, service, 'Service updated');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/services/:id
   * Soft delete a service (Admin only).
   */
  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await serviceService.delete(req.params.id);
      ResponseWrapper.success(res, null, 'Service deleted', 204);
    } catch (error) {
      next(error);
    }
  }
}