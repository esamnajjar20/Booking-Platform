import Redis from 'ioredis';
import { config } from './env';
import logger from '../utils/logger';

const redis = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,

  // Avoid passing empty string as password (some Redis setups treat it differently)
  password: config.REDIS_PASSWORD || undefined,

  // Custom retry backoff: linear increase capped at 2 seconds
  // Prevents aggressive reconnection loops under network issues
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },

  // Limits how many times a single command is retried before failing
  // Important to avoid hanging requests in API layer
  maxRetriesPerRequest: 3
});

// Fired when TCP connection is established (not necessarily ready for commands yet)
redis.on('connect', () => logger.info('🔴 Redis connected'));

// Centralized error logging (connection issues, timeouts, etc.)
redis.on('error', (err) => logger.error('Redis error:', err));

export default redis;