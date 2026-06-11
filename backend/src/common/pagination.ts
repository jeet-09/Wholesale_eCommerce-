import { z } from 'zod';

/** Pagination defaults/limits — README → Performance Standards (default 20, max 100). */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SortField {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Reusable query schema for list endpoints: `?page&pageSize&sort=-createdAt`.
 * `sort` uses a leading `-` for descending order (README → Pagination).
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationArgs {
  skip: number;
  take: number;
}

export function toPaginationArgs(query: { page: number; pageSize: number }): PaginationArgs {
  return {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export function buildPaginationMeta(
  totalItems: number,
  query: { page: number; pageSize: number },
): PaginationMeta {
  const totalPages = query.pageSize > 0 ? Math.ceil(totalItems / query.pageSize) : 0;
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1,
  };
}

/**
 * Parse a `sort` query string into an ordered list of fields, validating each
 * against an allow-list so clients can never sort by arbitrary columns.
 */
export function parseSort(
  sort: string | undefined,
  allowedFields: readonly string[],
  fallback: SortField = { field: 'createdAt', direction: 'desc' },
): SortField[] {
  if (!sort) {
    return [fallback];
  }

  const parsed: SortField[] = [];
  for (const raw of sort.split(',')) {
    const token = raw.trim();
    if (!token) {
      continue;
    }
    const direction: SortField['direction'] = token.startsWith('-') ? 'desc' : 'asc';
    const field = token.replace(/^[+-]/, '');
    if (allowedFields.includes(field)) {
      parsed.push({ field, direction });
    }
  }

  return parsed.length > 0 ? parsed : [fallback];
}
