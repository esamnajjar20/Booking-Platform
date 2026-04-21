import { describe, it, expect, vi, beforeEach } from 'vitest';

const serviceServiceMock = vi.hoisted(() => ({
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn()
}));

vi.mock('../../../../src/services/service.container', () => ({
  serviceService: serviceServiceMock
}));

vi.mock('../../../../src/config/database', () => ({
  default: {
    service: {
      findMany: vi.fn(),
      count: vi.fn()
    }
  }
}));

import prisma from '../../../../src/config/database';
import { ServiceController } from '../../../../src/controllers/service.controller';

describe('ServiceController', () => {
  let controller: ServiceController;

  const makeRes = () => {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ServiceController();
  });

  it('getAll returns paginated services with filters and sorting', async () => {
    (prisma.service.findMany as any).mockResolvedValue([{ id: 's1' }]);
    (prisma.service.count as any).mockResolvedValue(1);

    const req: any = {
      query: {
        page: '2',
        limit: '10',
        sortBy: 'price',
        order: 'asc',
        search: 'hair',
        minPrice: '5',
        maxPrice: '20'
      }
    };
    const res = makeRes();
    const next = vi.fn();

    await controller.getAll(req, res, next);

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
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          items: [{ id: 's1' }]
        })
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('getById delegates to service and returns success', async () => {
    serviceServiceMock.getById.mockResolvedValue({ id: 's1' });
    const req: any = { params: { id: 's1' } };
    const res = makeRes();
    const next = vi.fn();

    await controller.getById(req, res, next);

    expect(serviceServiceMock.getById).toHaveBeenCalledWith('s1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('create casts numeric fields and passes uploaded image path', async () => {
    serviceServiceMock.create.mockResolvedValue({ id: 's1' });
    const req: any = {
      body: { name: 'Haircut', description: 'x', price: '10', duration: '30' },
      file: { path: 'uploads/x.png' }
    };
    const res = makeRes();
    const next = vi.fn();

    await controller.create(req, res, next);

    expect(serviceServiceMock.create).toHaveBeenCalledWith(
      { name: 'Haircut', description: 'x', price: 10, duration: 30 },
      'uploads/x.png'
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it('update and delete delegate to service layer', async () => {
    serviceServiceMock.update.mockResolvedValue({ id: 's1', name: 'New' });
    serviceServiceMock.delete.mockResolvedValue(undefined);

    const res = makeRes();
    const next = vi.fn();

    await controller.update(
      { params: { id: 's1' }, body: { name: 'New' } } as any,
      res,
      next
    );
    await controller.delete({ params: { id: 's1' } } as any, res, next);

    expect(serviceServiceMock.update).toHaveBeenCalledWith('s1', { name: 'New' });
    expect(serviceServiceMock.delete).toHaveBeenCalledWith('s1');
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards errors to next', async () => {
    const err = new Error('boom');
    (prisma.service.findMany as any).mockRejectedValue(err);

    const req: any = { query: {} };
    const res = makeRes();
    const next = vi.fn();

    await controller.getAll(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
