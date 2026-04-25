import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../../../src/services/auth.service';

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
      findUnique: vi.fn(),
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

describe('AuthService - login', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new AuthService();

    (bcrypt.hash as any).mockResolvedValue('hashed');
    (bcrypt.compare as any).mockResolvedValue(true);
    (jwt.sign as any).mockReturnValue('access-token');
    (redis.get as any).mockResolvedValue(null);
    (redis.incr as any).mockResolvedValue(1);
    (redis.expire as any).mockResolvedValue(1);
  });

  it('logs in successfully', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: '1',
      email: 'a@a.com',
      password: 'hashed',
      name: 'A',
      role: 'USER'
    });

    (prisma.refreshToken.create as any).mockResolvedValue({ token: 'refresh-token' });
    const result = await service.login('a@a.com', '123');

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('rejects invalid credentials (no user)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    await expect(service.login('x', 'y')).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('rejects invalid password', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: '1',
      password: 'hashed'
    });

    (bcrypt.compare as any).mockResolvedValue(false);

    await expect(service.login('x', 'y')).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('clears redis on success', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: '1',
      email: 'x',
      password: 'hashed',
      role: 'USER'
    });

    (prisma.refreshToken.create as any).mockResolvedValue({ token: 'refresh-token' });
    await service.login('x', 'y');

    expect(redis.del).toHaveBeenCalled();
  });

  it('increments failed attempts', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    await expect(service.login('x', 'wrong')).rejects.toThrow();

    expect(redis.incr).toHaveBeenCalled();
  });

  it('blocks when locked', async () => {
    (redis.get as any).mockImplementation((key: string) => {
      if (key.includes('lock')) return String(Date.now() + 10000);
      return null;
    });

    await expect(service.login('x', 'y')).rejects.toThrow(/locked/i);
  });
});

