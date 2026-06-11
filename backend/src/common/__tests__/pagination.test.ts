import { describe, expect, it } from 'vitest';

import { buildPaginationMeta, parseSort, toPaginationArgs } from '../pagination';

describe('toPaginationArgs', () => {
  it('computes skip/take from page and pageSize', () => {
    expect(toPaginationArgs({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(toPaginationArgs({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });
});

describe('buildPaginationMeta', () => {
  it('derives totalPages and navigation flags', () => {
    const meta = buildPaginationMeta(45, { page: 1, pageSize: 20 });
    expect(meta).toMatchObject({
      page: 1,
      pageSize: 20,
      totalItems: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('handles the last page', () => {
    const meta = buildPaginationMeta(45, { page: 3, pageSize: 20 });
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });
});

describe('parseSort', () => {
  const allowed = ['createdAt', 'name'];

  it('falls back to default when sort is absent', () => {
    expect(parseSort(undefined, allowed)).toEqual([{ field: 'createdAt', direction: 'desc' }]);
  });

  it('parses descending (-) and ascending fields', () => {
    expect(parseSort('-createdAt', allowed)).toEqual([{ field: 'createdAt', direction: 'desc' }]);
    expect(parseSort('name', allowed)).toEqual([{ field: 'name', direction: 'asc' }]);
  });

  it('ignores fields not on the allow-list', () => {
    expect(parseSort('hacker,-createdAt', allowed)).toEqual([
      { field: 'createdAt', direction: 'desc' },
    ]);
  });

  it('falls back when no allowed field is provided', () => {
    expect(parseSort('unknown', allowed)).toEqual([{ field: 'createdAt', direction: 'desc' }]);
  });
});
