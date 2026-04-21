import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMockState = vi.hoisted(() => ({
  options: undefined as any,
  handlers: {} as Record<string, (arg?: any) => void>
}));

vi.mock('../../../../src/config/env', () => ({
  config: {
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: ''
  }
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn()
}));

vi.mock('../../../../src/utils/logger', () => ({
  default: loggerMock
}));

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation((options: any) => {
    redisMockState.options = options;
    return {
      on: vi.fn((event: string, cb: (arg?: any) => void) => {
        redisMockState.handlers[event] = cb;
      })
    };
  })
}));

import redis from '../../../../src/config/redis';

describe('config/redis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates Redis client with expected options', () => {
    expect(redis).toBeDefined();
    expect(redisMockState.options).toEqual(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 6379,
        password: undefined,
        maxRetriesPerRequest: 3
      })
    );
  });

  it('retryStrategy increases linearly and is capped at 2000ms', () => {
    const retry = redisMockState.options.retryStrategy as (times: number) => number;
    expect(retry(1)).toBe(50);
    expect(retry(10)).toBe(500);
    expect(retry(100)).toBe(2000);
  });

  it('logs connect and error events', () => {
    redisMockState.handlers.connect();
    redisMockState.handlers.error(new Error('redis down'));

    expect(loggerMock.info).toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith('Redis error:', expect.any(Error));
  });
});
