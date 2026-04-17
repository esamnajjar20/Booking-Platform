import { describe, it, expect } from 'vitest';
import { getPagination, paginationSchema } from '../../../../src/utils/pagination';

describe('pagination', () => {
  it('defaults page=1 limit=10 order=asc', () => {
    const parsed = paginationSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(10);
    expect(parsed.order).toBe('asc');
  });

  it('getPagination computes skip', () => {
    const result = getPagination({ page: '3', limit: '5' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
    expect(result.skip).toBe(10);
  });

  it('rejects limit > 100', () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });

  it('rejects inconsistent price range', () => {
    expect(() => paginationSchema.parse({ minPrice: 10, maxPrice: 5 })).toThrow(
      /minPrice/i
    );
  });
});
