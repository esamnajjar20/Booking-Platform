import { describe, it, expect, vi, beforeEach } from 'vitest';

const authServiceMock = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  refreshAccessToken: vi.fn()
}));

vi.mock('../../../../src/services/auth.service', () => ({
  AuthService: vi.fn(() => authServiceMock)
}));

vi.mock('../../../../src/config/database', () => ({
  default: {
    refreshToken: {
      updateMany: vi.fn()
    }
  }
}));

import { AuthController } from '../../../../src/controllers/auth.controller';
import prisma from '../../../../src/config/database';

describe('AuthController', () => {
  let controller: AuthController;

  const makeRes = () => {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.cookie = vi.fn(() => res);
    res.clearCookie = vi.fn(() => res);
    return res;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AuthController();
  });

  describe('register', () => {
    it('returns 201 with service result', async () => {
      authServiceMock.register.mockResolvedValue({
        user: { id: '1' },
        accessToken: 'a',
        refreshToken: 'r'
      });

      const req: any = { body: { email: 'a@a.com', password: '12345678', name: 'A' } };
      const res = makeRes();
      const next = vi.fn();

      await controller.register(req, res, next);

      expect(authServiceMock.register).toHaveBeenCalledWith('a@a.com', '12345678', 'A');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'User registered successfully'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next', async () => {
      const err = new Error('boom');
      authServiceMock.register.mockRejectedValue(err);

      const req: any = { body: { email: 'a@a.com', password: '12345678', name: 'A' } };
      const res = makeRes();
      const next = vi.fn();

      await controller.register(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('login', () => {
    it('returns 200 with service result', async () => {
      authServiceMock.login.mockResolvedValue({
        user: { id: '1' },
        accessToken: 'a'
      });

      const req: any = { body: { email: 'a@a.com', password: 'pw' } };
      const res = makeRes();
      const next = vi.fn();

      await controller.login(req, res, next);

      expect(authServiceMock.login).toHaveBeenCalledWith('a@a.com', 'pw', res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Login successful'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('returns 401 when refresh token cookie is missing', async () => {
      const req: any = { cookies: {} };
      const res = makeRes();
      const next = vi.fn();

      await controller.refresh(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No refresh token',
          code: 'NO_REFRESH_TOKEN'
        })
      );
      expect(authServiceMock.refreshAccessToken).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('sets new refresh cookie and returns access token', async () => {
      authServiceMock.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh'
      });

      const req: any = { cookies: { refreshToken: 'old-refresh' } };
      const res = makeRes();
      const next = vi.fn();

      await controller.refresh(req, res, next);

      expect(authServiceMock.refreshAccessToken).toHaveBeenCalledWith('old-refresh');
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh',
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'strict'
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Token refreshed',
          data: { accessToken: 'new-access' }
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes refresh token when cookie exists and clears cookie', async () => {
      (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 1 });

      const req: any = { cookies: { refreshToken: 'r1' } };
      const res = makeRes();
      const next = vi.fn();

      await controller.logout(req, res, next);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: 'r1' },
        data: { revokedAt: expect.any(Date) }
      });
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Logged out successfully'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('clears cookie even when refresh token cookie missing', async () => {
      const req: any = { cookies: {} };
      const res = makeRes();
      const next = vi.fn();

      await controller.logout(req, res, next);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(next).not.toHaveBeenCalled();
    });
  });
});
