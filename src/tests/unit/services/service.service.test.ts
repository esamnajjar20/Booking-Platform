import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError, NotFoundError } from '../../../../src/utils/errors';

vi.mock('../../../../src/config/database', () => ({
  default: {
    service: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock('../../../../src/services/cache.service', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetchFn: () => any) => fetchFn()),
    delete: vi.fn()
  }
}));

import prisma from '../../../../src/config/database';
import { cacheService } from '../../../../src/services/cache.service';
import { ServiceService } from '../../../../src/services/service.service';

describe('ServiceService', () => {
  let service: ServiceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ServiceService();
  });

  describe('getAll', () => {
    it('returns paginated services with computed filters', async () => {
      (prisma.service.findMany as any).mockResolvedValue([{ id: '1' }]);
      (prisma.service.count as any).mockResolvedValue(1);

      const result = await service.getAll({
        skip: 10,
        take: 10,
        sortBy: 'price',
        order: 'asc',
        search: 'hair',
        minPrice: 5,
        maxPrice: 20
      });

      expect(result).toEqual({ services: [{ id: '1' }], total: 1 });
      expect(prisma.service.findMany).toHaveBeenCalledWith({
        where: {
          isAvailable: true,
          deletedAt: null,
          OR: [
            { name: { contains: 'hair', mode: 'insensitive' } },
            { description: { contains: 'hair', mode: 'insensitive' } }
          ],
          price: { gte: 5, lte: 20 }
        },
        orderBy: { price: 'asc' },
        skip: 10,
        take: 10
      });
    });
  });

  describe('getAllCached', () => {
    it('uses cache key services:all with TTL 3600', async () => {
      (prisma.service.findMany as any).mockResolvedValue([{ id: '1' }]);

      const result = await service.getAllCached();

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'services:all',
        expect.any(Function),
        3600
      );
      expect(result).toEqual([{ id: '1' }]);
      expect(prisma.service.findMany).toHaveBeenCalledWith({
        where: { isAvailable: true, deletedAt: null },
        orderBy: { name: 'asc' }
      });
    });
  });

  describe('getById', () => {
    it('returns service when found', async () => {
      (prisma.service.findFirst as any).mockResolvedValue({ id: 's1', name: 'A' });

      const result = await service.getById('s1');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'service:s1',
        expect.any(Function),
        3600
      );
      expect(result).toEqual({ id: 's1', name: 'A' });
      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', deletedAt: null }
      });
    });

    it('throws NotFoundError when missing', async () => {
      (prisma.service.findFirst as any).mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.getById('missing')).rejects.toThrow('Service not found');
    });
  });

  describe('create', () => {
    it('rejects duplicate service name', async () => {
      (prisma.service.findUnique as any).mockResolvedValue({ id: 'x' });

      await expect(
        service.create({ name: 'Haircut', price: 10, duration: 30 })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('validates price > 0', async () => {
      (prisma.service.findUnique as any).mockResolvedValue(null);

      await expect(
        service.create({ name: 'Haircut', price: 0, duration: 30 })
      ).rejects.toThrow('Price must be greater than 0');
    });

    it('validates duration > 0', async () => {
      (prisma.service.findUnique as any).mockResolvedValue(null);

      await expect(
        service.create({ name: 'Haircut', price: 10, duration: 0 })
      ).rejects.toThrow('Duration must be greater than 0');
    });

    it('creates service and invalidates services:all cache', async () => {
      (prisma.service.findUnique as any).mockResolvedValue(null);
      (prisma.service.create as any).mockResolvedValue({ id: 's1', name: 'Haircut' });

      const created = await service.create(
        { name: 'Haircut', description: 'x', price: 10, duration: 30 },
        'uploads/x.png'
      );

      expect(prisma.service.create).toHaveBeenCalledWith({
        data: {
          name: 'Haircut',
          description: 'x',
          price: 10,
          duration: 30,
          imageUrl: 'uploads/x.png'
        }
      });
      expect(cacheService.delete).toHaveBeenCalledWith('services:all');
      expect(created).toEqual({ id: 's1', name: 'Haircut' });
    });
  });

  describe('update', () => {
    it('rejects duplicate new name', async () => {
      (prisma.service.findFirst as any).mockResolvedValue({ id: 's1', name: 'Old' });
      (prisma.service.findUnique as any).mockResolvedValue({ id: 's2' });

      await expect(service.update('s1', { name: 'New' })).rejects.toBeInstanceOf(
        ConflictError
      );
    });

    it('updates service and invalidates per-service and list cache', async () => {
      (prisma.service.findFirst as any).mockResolvedValue({ id: 's1', name: 'Old' });
      (prisma.service.findUnique as any).mockResolvedValue(null);
      (prisma.service.update as any).mockResolvedValue({ id: 's1', name: 'New' });

      const updated = await service.update('s1', { name: 'New', price: 20 });

      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { name: 'New', price: 20 }
      });
      expect(cacheService.delete).toHaveBeenCalledWith('service:s1');
      expect(cacheService.delete).toHaveBeenCalledWith('services:all');
      expect(updated).toEqual({ id: 's1', name: 'New' });
    });

    it('does not check uniqueness when name unchanged', async () => {
      (prisma.service.findFirst as any).mockResolvedValue({ id: 's1', name: 'Same' });
      (prisma.service.update as any).mockResolvedValue({ id: 's1', name: 'Same' });

      await service.update('s1', { name: 'Same', duration: 45 });

      expect(prisma.service.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('soft deletes and invalidates cache keys', async () => {
      (prisma.service.findFirst as any).mockResolvedValue({ id: 's1', name: 'A' });
      (prisma.service.update as any).mockResolvedValue({ id: 's1' });

      await service.delete('s1');

      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { deletedAt: expect.any(Date) }
      });
      expect(cacheService.delete).toHaveBeenCalledWith('service:s1');
      expect(cacheService.delete).toHaveBeenCalledWith('services:all');
    });
  });
});

