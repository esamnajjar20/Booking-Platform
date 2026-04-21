import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../../../src/services/auth.service';
import { Response } from 'express';

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn()
  },
  hash: vi.fn(),
  compare: vi.fn()
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn()
  },
  sign: vi.fn(),
  verify: vi.fn()
}));

vi.mock('../../../../src/config/redis', () => ({
  default: {
    get: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    setex: vi.fn(),
    del: vi.fn()
  }
}));

vi.mock('../../../../src/config/database', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    refreshToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    }
  }
}));

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import redis from '../../../../src/config/redis';
import prisma from '../../../../src/config/database';

describe('AuthService - register', () => {
  let service: AuthService;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AuthService();

    res = {
      cookie: vi.fn(),
      clearCookie: vi.fn()
    } as any;

    (bcrypt.hash as any).mockResolvedValue('hashed');
    (bcrypt.compare as any).mockResolvedValue(true);
    (jwt.sign as any).mockReturnValue('access-token');
    (redis.get as any).mockResolvedValue(null);
    (redis.incr as any).mockResolvedValue(1);
    (redis.expire as any).mockResolvedValue(1);
  });

  it('registers user successfully', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      name: 'A',
      role: 'USER'
    });

    const result = await service.register('a@a.com', '123', 'A');

    expect(result.user.id).toBe('1');
    expect(result.accessToken).toBeDefined();
  });

  it('blocks duplicate email', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'x' });

    await expect(service.register('a@a.com', '123', 'A')).rejects.toThrow(
      'Email already exists'
    );
  });

  it('hashes password', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      role: 'USER'
    });

    await service.register('a@a.com', '123', 'A');

    expect(bcrypt.hash).toHaveBeenCalled();
  });
});

