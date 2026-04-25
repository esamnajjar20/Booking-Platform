import { describe, it, expect, vi, beforeEach } from 'vitest';

const authServiceMock = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  refreshAccessToken: vi.fn(),
  logout: vi.fn()
}));

vi.mock('../../../../src/services/service.container', () => ({
  authService: authServiceMock
}));

import { AuthController } from '../../../../src/controllers/auth.controller';

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
        accessToken: 'a',
        refreshToken: 'r'
      });

      const req: any = { body: { email: 'a@a.com', password: 'pw' } };
      const res = makeRes();
      const next = vi.fn();

      await controller.login(req, res, next);

      expect(authServiceMock.login).toHaveBeenCalledWith('a@a.com', 'pw');
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

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Missing refresh token' }));
      expect(authServiceMock.refreshAccessToken).not.toHaveBeenCalled();
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
          secure: false,
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000
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
      authServiceMock.logout.mockResolvedValue(undefined);

      const req: any = { cookies: { refreshToken: 'r1' } };
      const res = makeRes();
      const next = vi.fn();

      await controller.logout(req, res, next);

      expect(authServiceMock.logout).toHaveBeenCalledWith('r1');
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/'
        })
      );
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

      expect(authServiceMock.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
