/**
 * Environment variables configuration and validation layer
 *
 * Responsibilities:
 * - Load environment variables from .env file
 * - Validate required variables using Zod schema
 * - Ensure correct types and safe defaults
 * - Fail fast if configuration is invalid
 *
 * This prevents the application from running with broken configuration.
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables into process.env
dotenv.config();

/**
 * Environment schema definition
 * All variables are validated at startup
 */
const envSchema = z.object({

  // =========================
  // General
  // =========================
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  TRUST_PROXY: z.preprocess((value) => {
    if (value === undefined) return false;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return 1;
      if (normalized === 'false' || normalized === '0' || normalized === '') return false;
      const asNumber = Number(normalized);
      if (Number.isFinite(asNumber)) return asNumber;
    }
    return value;
  }, z.union([z.literal(false), z.number().int().nonnegative()])).default(false),
  
  HEALTHCHECK_TOKEN: z.string().min(16).optional(),

  // =========================
  // Database
  // =========================
  DATABASE_URL: z.string().url(),

  // =========================
  // JWT
  // =========================
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d') ,

  // =========================
  // Redis
  // =========================
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // =========================
  // Cache
  // =========================
  CACHE_TTL: z.coerce.number().default(3600),

  // =========================
  // Rate Limiting
  // =========================
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  // =========================
  // Security
  // =========================
  MAX_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  LOCK_TIME_MINUTES: z.coerce.number().default(15),

  // =========================
  // CORS
  // =========================
  ALLOWED_ORIGINS: z.string().default(
    'http://localhost:3000,http://localhost:5173'
  ),

  // =========================
  // Logging
  // =========================
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  BODY_LIMIT: z.string().default('1mb'),

  // =========================
  // Bcrypt
  // =========================
  BCRYPT_ROUNDS: z.coerce.number().default(10)
});

// Validate environment variables
const parsed = envSchema.safeParse(process.env);

// Fail fast if invalid config
if (!parsed.success) {
  console.error(' Invalid environment variables:\n');
  console.error(parsed.error.format());
  process.exit(1);
}

// Export typed config
export const config = parsed.data;
