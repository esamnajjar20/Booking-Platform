import { describe, expect, it, vi } from 'vitest';
import logger, { stream } from '../../../../src/utils/logger';

describe('utils/logger', () => {
  it('writes info logs without crashing', () => {
    const infoSpy = vi.spyOn(logger, 'info');

    expect(() => logger.info('hello info log')).not.toThrow();
    expect(infoSpy).toHaveBeenCalled();
  });

  it('writes error logs without crashing', () => {
    const errorSpy = vi.spyOn(logger, 'error');

    expect(() => logger.error('hello error log')).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not crash on malformed input payloads', () => {
    expect(() => logger.info({ message: undefined, meta: { token: 'secret' } } as any)).not.toThrow();
    expect(() => logger.error(null as any)).not.toThrow();
    expect(() => stream.write(' request log line \n')).not.toThrow();
  });
});
