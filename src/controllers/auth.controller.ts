import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseWrapper } from '../utils/response';
import prisma from '../config/database';
import { authService } from '../services/service.container';
import { config } from '../config/env';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name } = req.body;

      // Delegates validation + hashing + user creation to service layer
      const result = await authService.register(email, password, name);

      ResponseWrapper.success(res, result, 'User registered successfully', 201);
    } catch (error) { next(error); }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      // Note: passing `res` to service indicates that service is handling side-effects (e.g., setting cookies)
      // This slightly breaks separation of concerns (service becomes HTTP-aware)
      const result = await authService.login(email, password, res);

      ResponseWrapper.success(res, result, 'Login successful');
    } catch (error) { next(error); }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies.refreshToken;

      // Explicit guard: refresh flow depends entirely on cookie presence
      if (!refreshToken) {
        return ResponseWrapper.error(res, 'No refresh token', 401, 'NO_REFRESH_TOKEN');
      }

      // Handles validation + rotation (likely invalidates old token and issues new pair)
      const tokens = await authService.refreshAccessToken(refreshToken);

      // Sets new refresh token in httpOnly cookie (prevents JS access → mitigates XSS)
      // `secure: true` means cookie only sent over HTTPS (important for production)
      // `sameSite: 'strict'` prevents CSRF but may break cross-origin flows
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      ResponseWrapper.success(res, { accessToken: tokens.accessToken }, 'Token refreshed');
    } catch (error) { next(error); }
  }

  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (refreshToken) {
        // Instead of deleting, token is soft-revoked (keeps audit trail)
        // updateMany used in case of duplicates (defensive, though token is unique in schema)
        await prisma.refreshToken.updateMany({
          where: { token: refreshToken },
          data: { revokedAt: new Date() }
        });
      }

      // Clears cookie from client regardless of DB state
      res.clearCookie('refreshToken');

      ResponseWrapper.success(res, null, 'Logged out successfully');
    } catch (error) { next(error); }
  }
}
