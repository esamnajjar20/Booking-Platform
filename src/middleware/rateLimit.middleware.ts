import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redis from '../config/redis';
import { AuthRequest } from './auth.middleware';
import crypto from 'crypto';

/**
 * Create a stable fingerprint for anonymous users
 * Combines IP + User-Agent to reduce simple IP bypassing
 */
const buildFingerprint = (req: AuthRequest) => {
  const ip = req.ip || '';
  const ua = req.headers['user-agent'] || '';

  return crypto
    .createHash('sha256')
    .update(`${ip}:${ua}`)
    .digest('hex');
};

/**
 * Factory function:
 * Each limiter MUST have its own RedisStore instance
 * to avoid ERR_ERL_STORE_REUSE
 */
const createRedisStore = (prefix: string) =>
  new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).call(...args),
    prefix
  });

/**
 * Key generator:
 * - Auth users → userId
 * - Guests → fingerprint (IP + UA hash)
 */
const getKey = (req: AuthRequest) => {
  return req.user?.id || buildFingerprint(req);
};

/**
 * Shared base config
 */
const baseConfig = {
  standardHeaders: true,
  legacyHeaders: false
};

/* -------------------- GENERAL LIMITER -------------------- */
export const generalLimiter = rateLimit({
  ...baseConfig,
  store: createRedisStore('general'),
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: getKey,
  message: { error: 'Too many requests' }
});

/* -------------------- AUTH LIMITER -------------------- */
export const authLimiter = rateLimit({
  ...baseConfig,
  store: createRedisStore('auth'),
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: buildFingerprint,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts' }
});

/* -------------------- API LIMITER -------------------- */
export const apiLimiter = rateLimit({
  ...baseConfig,
  store: createRedisStore('api'),
  windowMs: 60 * 1000,
  max: 50,
  keyGenerator: getKey,
  message: { error: 'Rate limit exceeded' }
});

/* -------------------- BOOKING LIMITER -------------------- */
export const bookingLimiter = rateLimit({
  ...baseConfig,
  store: createRedisStore('booking'),
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: getKey,
  message: { error: 'Booking limit exceeded' }
});