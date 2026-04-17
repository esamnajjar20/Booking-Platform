import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/config/env', () => ({
  config: {
    CACHE_TTL: 123
  }
}));

vi.mock('../../../src/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../../src/config/redis', () => ({
  default: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    scan: vi.fn()
  }
}));

import { CacheService } from '../../../src/services/cache.service';
import redis from '../../../src/config/redis';
import logger from '../../../src/utils/logger';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CacheService();
  });

  describe('get', () => {
    it('returns null on cache miss', async () => {
      (redis.get as any).mockResolvedValue(null);

      const result = await service.get('k');

      expect(result).toBeNull();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('returns parsed JSON on cache hit', async () => {
      (redis.get as any).mockResolvedValue(JSON.stringify({ a: 1 }));

      const result = await service.get<{ a: number }>('k');

      expect(result).toEqual({ a: 1 });
      expect(logger.debug).toHaveBeenCalled();
    });

    it('self-heals by deleting corrupted JSON and returns null', async () => {
      (redis.get as any).mockResolvedValue('{bad json');

      const result = await service.get('k');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('k');
    });

    it('returns null when redis.get throws', async () => {
      (redis.get as any).mockRejectedValue(new Error('redis down'));

      const result = await service.get('k');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('uses default TTL from config when ttlSeconds omitted', async () => {
      await service.set('k', { x: 1 });

      expect(redis.setex).toHaveBeenCalledWith('k', 123, JSON.stringify({ x: 1 }));
      expect(logger.debug).toHaveBeenCalled();
    });

    it('uses custom TTL when provided', async () => {
      await service.set('k', { x: 1 }, 10);

      expect(redis.setex).toHaveBeenCalledWith('k', 10, JSON.stringify({ x: 1 }));
    });

    it('does not throw when redis.setex fails', async () => {
      (redis.setex as any).mockRejectedValue(new Error('no permission'));

      await expect(service.set('k', { x: 1 }, 10)).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes key and logs', async () => {
      await service.delete('k');

      expect(redis.del).toHaveBeenCalledWith('k');
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('deletePattern', () => {
    it('scans until cursor is 0 and deletes found keys', async () => {
      (redis.scan as any)
        .mockResolvedValueOnce(['1', ['a', 'b']])
        .mockResolvedValueOnce(['0', []]);

      await service.deletePattern('foo:*');

      expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'foo:*', 'COUNT', 100);
      expect(redis.del).toHaveBeenCalledWith('a', 'b');
      expect(logger.debug).toHaveBeenCalled();
    });

    it('does not call del when scan returns no keys', async () => {
      (redis.scan as any).mockResolvedValueOnce(['0', []]);

      await service.deletePattern('foo:*');

      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('getOrSet', () => {
    it('returns cached value without calling fetchFn', async () => {
      (redis.get as any).mockResolvedValue(JSON.stringify({ v: 1 }));

      const fetchFn = vi.fn(async () => ({ v: 2 }));
      const result = await service.getOrSet('k', fetchFn);

      expect(result).toEqual({ v: 1 });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('calls fetchFn and caches result on miss', async () => {
      (redis.get as any).mockResolvedValue(null);

      const fetchFn = vi.fn(async () => ({ v: 2 }));
      const result = await service.getOrSet('k', fetchFn, 77);

      expect(result).toEqual({ v: 2 });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(redis.setex).toHaveBeenCalledWith('k', 77, JSON.stringify({ v: 2 }));
    });

    it('propagates fetchFn error and does not cache', async () => {
      (redis.get as any).mockResolvedValue(null);
      const fetchFn = vi.fn(async () => {
        throw new Error('boom');
      });

      await expect(service.getOrSet('k', fetchFn)).rejects.toThrow('boom');
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('returns fresh value even if caching fails', async () => {
      (redis.get as any).mockResolvedValue(null);
      (redis.setex as any).mockRejectedValue(new Error('redis down'));

      const fetchFn = vi.fn(async () => ({ v: 3 }));
      const result = await service.getOrSet('k', fetchFn);

      expect(result).toEqual({ v: 3 });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

