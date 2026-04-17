import redis from '../config/redis';
import { config } from '../config/env';
import logger from '../utils/logger';

export class CacheService {
  private defaultTTL: number = config.CACHE_TTL;

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(key);
      if (!data) return null;

      logger.debug(`Cache hit: ${key}`);

      // Parse cached JSON safely (Redis stores everything as string)
      // Fallback to null if data is corrupted or not valid JSON
      try {
        return JSON.parse(data) as T;
      } catch (err) {
        logger.error(`Invalid cache data for key: ${key}`, err);

        // Optional self-healing: remove corrupted cache entry
        await redis.del(key);

        return null;
      }
    } catch (error) {
      logger.error(`Cache get error: ${key}`, error);
      return null;
    }
  }

  async set(
    key: string,
    value: any,
    ttlSeconds: number = this.defaultTTL
  ): Promise<void> {
    try {
      // Store value as JSON string with TTL (atomic operation via SETEX)
      await redis.setex(key, ttlSeconds, JSON.stringify(value));

      logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      logger.error(`Cache set error: ${key}`, error);
    }
  }

  async delete(key: string): Promise<void> {
    // Simple key deletion (no error handling since failure is non-critical)
    await redis.del(key);

    logger.debug(`Cache deleted: ${key}`);
  }

  async deletePattern(pattern: string): Promise<void> {
    let cursor = '0';

    do {
      // SCAN used instead of KEYS to avoid blocking Redis in production
      const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);

      cursor = reply[0];
      const keys = reply[1];

      if (keys.length) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');

    logger.debug(`Cache pattern deleted: ${pattern}`);
  }

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = this.defaultTTL
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Cache-aside pattern: fetch from DB if cache miss
    const fresh = await fetchFn();

    await this.set(key, fresh, ttlSeconds);

    return fresh;
  }
}

export const cacheService = new CacheService();