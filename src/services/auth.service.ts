/**
 * Authentication Service
 *
 * Responsible for all authentication-related logic:
 * - User registration
 * - User login
 * - JWT access token generation
 * - Refresh token rotation and reuse detection
 * - Brute-force protection (account locking via Redis)
 * - Logout handling (revoking refresh tokens)
 *
 * This service represents the core security layer of the application.
 */

import prisma from '../config/database';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { ConflictError, UnauthorizedError } from '../utils/errors';
import logger from '../utils/logger';
import { Response } from 'express';
import redis from '../config/redis';
import { v4 as uuidv4} from 'uuid';
import { addDays } from 'date-fns';

export class AuthService {

  //  BRUTE FORCE PROTECTION (ACCOUNT SECURITY)

  /**
   * Retrieves failed login attempts and lock status from Redis.
   * Used to enforce brute-force protection rules.
   */
  private async getFailedAttempts(email: string) {
    const attemptsKey = `login:attempts:${email}`;
    const lockKey = `login:lock:${email}`;

    const attempts = await redis.get(attemptsKey);
    const lockedUntil = await redis.get(lockKey);

    return {
      attempts: attempts ?  Number.parseInt(attempts) : 0,
      lockedUntil: lockedUntil ? new Date( Number.parseInt(lockedUntil)) : null
    };
  }

  /**
   * Records a failed login attempt.
   * Locks the account if the maximum allowed attempts are exceeded.
   */
  private async recordFailedAttempt(email: string) {
    const attemptsKey = `login:attempts:${email}`;
    const lockKey = `login:lock:${email}`;

    const current = await redis.get(attemptsKey);
    const newCount = (current ?  Number.parseInt(current) : 0) + 1;

    // Lock account if threshold is reached
    if (newCount >= config.MAX_LOGIN_ATTEMPTS) {
      const lockUntil = Date.now() + config.LOCK_TIME_MINUTES * 60 * 1000;

      await redis.setex(
        lockKey,
        config.LOCK_TIME_MINUTES * 60,
        lockUntil.toString()
      );

      await redis.del(attemptsKey);
    } else {
      // Increment failed attempts with TTL
      await redis.setex(
        attemptsKey,
        config.LOCK_TIME_MINUTES * 60,
        newCount.toString()
      );
    }
  }

  /**
   * Clears failed login attempts after successful authentication.
   */
  private async clearFailedAttempts(email: string) {
    await redis.del(`login:attempts:${email}`);
    await redis.del(`login:lock:${email}`);
  }

  // TOKEN MANAGEMENT (JWT + REFRESH TOKENS)

  /**
   * Generates a JWT access token and a database-stored refresh token.
   *
   * Includes:
   * - Access token (short-lived JWT)
   * - Refresh token (UUID stored in DB)
   * - Token family tracking for reuse detection
   */
  private async generateTokens(
    user: { id: string; email: string; role: string },
    familyId?: string,
    deviceInfo?: string
  ) {
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.JWT_SECRET ,
      { expiresIn: config.ACCESS_TOKEN_EXPIRES_IN as any }
    );

    const newFamilyId = familyId || uuidv4();
    const refreshToken = uuidv4();
    const expiresAt = addDays(new Date(), 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        familyId: newFamilyId,
        expiresAt,
        deviceInfo
      }
    });

    return { accessToken, refreshToken, familyId: newFamilyId };
  }

  //  PUBLIC AUTH METHODS

  /**
   * Registers a new user.
   * - Checks for duplicate email
   * - Hashes password securely
   * - Creates user record
   * - Issues authentication tokens
   */
  async register(email: string, password: string, name: string) {
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictError('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(
      password,
      config.BCRYPT_ROUNDS || 10
    );

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
      select: { id: true, email: true, name: true, role: true }
    });

    const { accessToken, refreshToken } =
      await this.generateTokens(user);

    logger.info(`User registered: ${email}`);

    return { user, accessToken, refreshToken };
  }

  /**
   * Authenticates user login.
   * - Checks account lock status
   * - Validates credentials
   * - Handles failed login attempts
   * - Issues JWT and refresh token cookie
   */
  async login(
    email: string,
    password: string,
    res: Response,
    deviceInfo?: string
  ) {
    const { lockedUntil } = await this.getFailedAttempts(email);

    if (lockedUntil && lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (lockedUntil.getTime() - Date.now()) / 60000
      );

      throw new UnauthorizedError(
        `Account locked. Try again in ${minutesLeft} minutes.`
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      await this.recordFailedAttempt(email);
      throw new UnauthorizedError('Invalid credentials');
    }

    await this.clearFailedAttempts(email);

    const { accessToken, refreshToken } =
      await this.generateTokens(user, undefined, deviceInfo);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    logger.info(`User logged in: ${email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      accessToken
    };
  }

  /**
   * Refreshes access token using a valid refresh token.
   * - Validates token existence
   * - Detects token reuse (security feature)
   * - Rotates refresh token
   */
  async refreshAccessToken(refreshToken: string) {
    const stored = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    if (!stored) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const familyTokens = await prisma.refreshToken.findMany({
      where: { familyId: stored.familyId }
    });

    if (familyTokens.some(t => t.revokedAt !== null)) {
      await prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { revokedAt: new Date() }
      });

      throw new UnauthorizedError(
        'Refresh token reuse detected – session compromised'
      );
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() }
    });

    const {
      accessToken,
      refreshToken: newRefreshToken
    } = await this.generateTokens(stored.user, stored.familyId);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logs out the user by revoking refresh token.
   */
  async logout(refreshToken: string) {
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revokedAt: new Date() }
      });
    }
  }
}