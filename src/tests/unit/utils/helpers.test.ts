import { describe, it, expect } from 'vitest';
import {
  sleep,
  generateSecureRandomString,
  generateRandomString
} from '../../../../src/utils/helpers';

describe('utils/helpers', () => {
  it('sleep waits at least the requested time', async () => {
    const start = Date.now();
    await sleep(15);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(10);
  });

  it('generateSecureRandomString returns requested length and hex chars', () => {
    const value = generateSecureRandomString(11);
    expect(value).toHaveLength(11);
    expect(value).toMatch(/^[a-f0-9]+$/);
  });

  it('generateRandomString alias keeps backward compatibility', () => {
    const value = generateRandomString();
    expect(value).toHaveLength(8);
    expect(value).toMatch(/^[a-f0-9]+$/);
  });
});
