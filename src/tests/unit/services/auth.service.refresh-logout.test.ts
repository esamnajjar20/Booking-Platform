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

describe('AuthService - refresh + logout + edge cases', () => {
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

  describe('refresh token', () => {
    it('refresh success', async () => {
      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: '1',
        token: 't',
        familyId: 'f',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: '1', email: 'x', role: 'USER' }
      });

      (prisma.refreshToken.update as any).mockResolvedValue({});
      (prisma.refreshToken.create as any).mockResolvedValue({
        token: 'new'
      });

      const r = await service.refreshAccessToken('t');

      expect(r.refreshToken).toBeDefined();
    });

    it('invalid refresh token', async () => {
      (prisma.refreshToken.findUnique as any).mockResolvedValue(null);

      await expect(service.refreshAccessToken('bad')).rejects.toThrow(
        'Invalid refresh token'
      );
    });

    it('reuse attack detection', async () => {
      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: '1',
        token: 't',
        familyId: 'f',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: '1', email: 'x', role: 'USER' }
      });

      (prisma.refreshToken.updateMany as any).mockResolvedValue({});

      await expect(service.refreshAccessToken('t')).rejects.toThrow(/reuse/i);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'f' },
        data: { revokedAt: expect.any(Date) }
      });
    });

    it('expired refresh token is rejected', async () => {
      (prisma.refreshToken.findUnique as any).mockResolvedValue({
        id: '1',
        token: 't',
        familyId: 'f',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
        user: { id: '1', email: 'x', role: 'USER' }
      });

      await expect(service.refreshAccessToken('t')).rejects.toThrow('Expired refresh token');
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes token', async () => {
      (prisma.refreshToken.findFirst as any).mockResolvedValue({
        token: 'token',
        familyId: 'f',
        userId: 'u1'
      });
      (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 1 });

      await service.logout('token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('handles empty token safely', async () => {
      (prisma.refreshToken.findFirst as any).mockResolvedValue(null);
      await service.logout('');

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('security edge cases', () => {
    it('handles redis failure gracefully', async () => {
      (redis.get as any).mockRejectedValue(new Error('redis down'));

      (prisma.user.findUnique as any).mockResolvedValue({
        id: '1',
        email: 'x',
        password: 'hashed',
        role: 'USER'
      });

      await expect(service.login('x', '123')).rejects.toThrow();
    });

    it('does not crash on malformed user object', async () => {
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

      await expect(service.login('x', '123')).rejects.toThrow();
    });
  });
});

