import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseWrapper } from '../utils/response';
import { authService } from '../services/service.container';
import { config } from '../config/env';
import { UnauthorizedError } from '../utils/errors';

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

      const { user, accessToken, refreshToken } = await authService.login(email, password);

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, 
        path: '/',
      });

       ResponseWrapper.success(res, { user, accessToken }, 'Login successful');
    } catch (error) { next(error); }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refreshToken;

      // Explicit guard: refresh flow depends entirely on cookie presence
       if (!refreshToken) {
        throw new UnauthorizedError('Missing refresh token');
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
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      ResponseWrapper.success(res, { accessToken: tokens.accessToken }, 'Token refreshed');
    } catch (error) { next(error); }
  }

  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refreshToken 

      // best-effort logout (idempotent)
      if (refreshToken) {
      await authService.logout(refreshToken);
    }
      

      // Clears cookie from client regardless of DB state
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      });


      ResponseWrapper.success(res, null, 'Logged out successfully');
    } catch (error) { next(error); }
  }
}
