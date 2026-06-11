import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../errors';
import { buildPaginationMeta } from '../pagination';
import { fail, ok, paginated } from '../responses';

describe('response envelope', () => {
  it('ok wraps data with meta', () => {
    const res = ok({ id: '1' }, 'req-1');
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ id: '1' });
    expect(res.meta.requestId).toBe('req-1');
    expect(() => new Date(res.meta.timestamp).toISOString()).not.toThrow();
    expect(res.meta.pagination).toBeUndefined();
  });

  it('paginated attaches pagination to meta', () => {
    const pagination = buildPaginationMeta(0, { page: 1, pageSize: 20 });
    const res = paginated([], pagination, 'req-2');
    expect(res.success).toBe(true);
    expect(res.data).toEqual([]);
    expect(res.meta.pagination).toEqual(pagination);
  });

  it('fail produces an error envelope with a stable code', () => {
    const res = fail(ERROR_CODES.NOT_FOUND, 'Missing', [], 'req-3');
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('NOT_FOUND');
    expect(res.error.message).toBe('Missing');
    expect(res.error.details).toEqual([]);
  });
});
