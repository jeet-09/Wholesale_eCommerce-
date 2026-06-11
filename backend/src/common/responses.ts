import type { ErrorCode, ErrorDetail } from './errors';
import type { PaginationMeta } from './pagination';

/**
 * The single response envelope used by EVERY endpoint
 * (README → Standard Response Envelope; TECHNICAL-DETAILS.MD §3).
 * Handlers return `ok()`/`paginated()`; the error handler returns `fail()`.
 * No handler hand-rolls JSON.
 */

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details: ErrorDetail[];
  };
  meta: ResponseMeta;
}

function buildMeta(requestId: string, pagination?: PaginationMeta): ResponseMeta {
  const meta: ResponseMeta = {
    requestId,
    timestamp: new Date().toISOString(),
  };
  if (pagination) {
    meta.pagination = pagination;
  }
  return meta;
}

export function ok<T>(data: T, requestId: string): SuccessResponse<T> {
  return { success: true, data, meta: buildMeta(requestId) };
}

export function paginated<T>(
  data: T[],
  pagination: PaginationMeta,
  requestId: string,
): SuccessResponse<T[]> {
  return { success: true, data, meta: buildMeta(requestId, pagination) };
}

export function fail(
  code: ErrorCode,
  message: string,
  details: ErrorDetail[],
  requestId: string,
): ErrorResponse {
  return {
    success: false,
    error: { code, message, details },
    meta: buildMeta(requestId),
  };
}
