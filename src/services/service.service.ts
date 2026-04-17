import prisma from '../config/database';
import { cacheService } from './cache.service';
import { NotFoundError, ConflictError } from '../utils/errors';

/**
 * ServiceService (Improved Version)
 * ---------------------------------
 * Handles business logic for Service entity with:
 * - Optimized caching strategy (no pattern deletion)
 * - Defensive validations
 * - Soft delete support
 * - Better consistency handling
 */
export class ServiceService {

  /**
   * Get all active services
   * Cached globally for fast reads
   */
  async getAll() {
    return cacheService.getOrSet('services:all', async () => {
      return prisma.service.findMany({
        where: {
          isAvailable: true,
          deletedAt: null
        },
        orderBy: { name: 'asc' }
      });
    }, 3600);
  }

  /**
   * Get service by ID
   * Cached per service for performance
   */
  async getById(id: string) {
    return cacheService.getOrSet(`service:${id}`, async () => {
      const service = await prisma.service.findFirst({
        where: { id, deletedAt: null }
      });

      if (!service) throw new NotFoundError('Service');

      return service;
    }, 3600);
  }

  /**
   * Create new service
   * - Prevents duplicate names
   * - Validates business rules
   * - Updates cache directly (no pattern delete)
   */
  async create(
    data: {
      name: string;
      description?: string;
      price: number;
      duration: number;
    },
    imagePath?: string
  ) {
    // Defensive check: prevent duplicate service names
    const existing = await prisma.service.findUnique({
      where: { name: data.name }
    });

    if (existing) {
      throw new ConflictError('Service already exists');
    }

    // Business rules validation
    if (data.price <= 0) throw new Error('Price must be greater than 0');
    if (data.duration <= 0) throw new Error('Duration must be greater than 0');

    const service = await prisma.service.create({
      data: {
        ...data,
        imageUrl: imagePath
      }
    });

    // Better cache strategy: invalidate only known keys
    await cacheService.delete('services:all');

    return service;
  }

  /**
   * Update service
   * - Ensures service exists first
   * - Updates cache instead of full invalidation scan
   */
  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      price: number;
      duration: number;
      isAvailable: boolean;
    }>
  ) {
    const service = await this.getById(id);

    // If name is being updated → ensure uniqueness
    if (data.name && data.name !== service.name) {
      const exists = await prisma.service.findUnique({
        where: { name: data.name }
      });

      if (exists) {
        throw new ConflictError('Service name already exists');
      }
    }

    const updated = await prisma.service.update({
      where: { id },
      data
    });

    // Optimized cache handling (no scan)
    await cacheService.delete(`service:${id}`);
    await cacheService.delete('services:all');

    return updated;
  }

  /**
   * Soft delete service
   * Marks record as deleted instead of removing it
   */
  async delete(id: string) {
    await this.getById(id);

    await prisma.service.update({
      where: { id },
      data: {
        deletedAt: new Date()
      }
    });

    // Clear only affected cache keys
    await cacheService.delete(`service:${id}`);
    await cacheService.delete('services:all');
  }
}