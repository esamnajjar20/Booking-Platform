import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../../../src/services/auth.service';
import { Response } from 'express';

// ================= MOCKS =================

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

// ================= IMPORT MOCKS =================

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import redis from '../../../../src/config/redis';
import prisma from '../../../../src/config/database';

// ================= TEST SUITE =================

describe('AuthService - FULL COVERAGE', () => {
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
  });

  // ================= REGISTER =================

  describe('register', () => {
    it('should register user successfully', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue({
        id: '1',
        email: 'a@a.com',
        name: 'A',
        role: 'USER'
      });

      const resu = await service.register('a@a.com', '123', 'A');

      expect(resu.user.id).toBe('1');
      expect(resu.accessToken).toBeDefined();
    });

    it('should block duplicate email', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: 'x' });

      await expect(
        service.register('a@a.com', '123', 'A')
      ).rejects.toThrow('Email already exists');
    });

    it('should hash password', async () => {
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

  // ================= LOGIN =================

  describe('login', () => {
    it('success login', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        email: 'a@a.com',
        password: 'hashed',
        name: 'A',
        role: 'USER'
      });

      const result = await service.login('a@a.com', '123', res);

      expect(result.accessToken).toBeDefined();
      expect(res.cookie).toHaveBeenCalled();
    });

    it('invalid credentials (no user)', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(
        service.login('x', 'y', res)
      ).rejects.toThrow('Invalid credentials');
    });

    it('invalid password', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        password: 'hashed'
      });

      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(
        service.login('x', 'y', res)
      ).rejects.toThrow('Invalid credentials');
    });

    it('should clear redis on success', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        email: 'x',
        password: 'hashed',
        role: 'USER'
      });

      await service.login('x', 'y', res);

      expect(redis.del).toHaveBeenCalled();
    });

    it('should increment failed attempts', async () => {
      (prisma.user.findUnique as any).mockResolvedValue(null);

      await expect(
        service.login('x', 'wrong', res)
      ).rejects.toThrow();

      expect(redis.setex).toHaveBeenCalled();
    });

    it('should block when locked', async () => {
      (redis.get as any).mockImplementation((key: string) => {
        if (key.includes('lock')) return String(Date.now() + 10000);
        return null;
      });

      await expect(
        service.login('x', 'y', res)
      ).rejects.toThrow(/locked/i);
    });
  });

  // ================= REFRESH =================

  describe('refresh token', () => {
    it('refresh success', async () => {
      (prisma.refreshToken.findFirst as any).mockResolvedValue({
        id: '1',
        token: 't',
        familyId: 'f',
        revokedAt: null,
        user: { id: '1', email: 'x', role: 'USER' }
      });

      (prisma.refreshToken.findMany as any).mockResolvedValue([]);
      (prisma.refreshToken.update as any).mockResolvedValue({});
      (prisma.refreshToken.create as any).mockResolvedValue({
        token: 'new'
      });

      const r = await service.refreshAccessToken('t');

      expect(r.refreshToken).toBeDefined();
    });

    it('invalid refresh token', async () => {
      (prisma.refreshToken.findFirst as any).mockResolvedValue(null);

      await expect(
        service.refreshAccessToken('bad')
      ).rejects.toThrow('Invalid refresh token');
    });

    it('reuse attack detection', async () => {
      (prisma.refreshToken.findFirst as any).mockResolvedValue({
        id: '1',
        token: 't',
        familyId: 'f',
        revokedAt: null,
        user: { id: '1', email: 'x', role: 'USER' }
      });

      (prisma.refreshToken.findMany as any).mockResolvedValue([
        { revokedAt: new Date() }
      ]);

      (prisma.refreshToken.updateMany as any).mockResolvedValue({});

      await expect(
        service.refreshAccessToken('t')
      ).rejects.toThrow(/reuse/i);
    });
  });

  // ================= LOGOUT =================

  describe('logout', () => {
    it('should revoke token', async () => {
      (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 1 });

      await service.logout('token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('should handle empty token safely', async () => {
      await service.logout('');

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  // ================= SECURITY EDGE CASES =================

  describe('security edge cases', () => {
    it('should handle redis failure gracefully', async () => {
      (redis.get as any).mockRejectedValue(new Error('redis down'));

      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        email: 'x',
        password: 'hashed',
        role: 'USER'
      });

      await expect(
        service.login('x', '123', res)
      ).rejects.toThrow();
    });

    it('should not crash on malformed user object', async () => {
      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1'
        // missing password
      });

      (bcrypt.compare as any).mockImplementation(
        async (_password: string, hash: unknown) => {
          if (!hash) throw new Error('Invalid hash');
          return true;
        }
      );

      await expect(
        service.login('x', '123', res)
      ).rejects.toThrow();
    });
  });
});
