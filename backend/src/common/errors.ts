/**
 * Typed domain error hierarchy (TECHNICAL-DETAILS.MD §5.1, RULES.md §5).
 * Business code throws these — never a bare `throw new Error(...)`.
 * The global error handler (plugins/error-handler.ts) maps them to the
 * standard error envelope + HTTP status. Internals are never leaked.
 */

export interface ErrorDetail {
  field: string;
  message: string;
}

/** Stable, machine-readable error codes. Mirrors README → Error Code Catalog. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  ORDER_NOT_MODIFIABLE: 'ORDER_NOT_MODIFIABLE',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCode;
  readonly details: ErrorDetail[];

  constructor(message: string, details: ErrorDetail[] = [], options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = ERROR_CODES.VALIDATION_ERROR;
}

export class UnauthenticatedError extends AppError {
  readonly statusCode = 401;
  readonly code = ERROR_CODES.UNAUTHENTICATED;

  constructor(message = 'Authentication required', details: ErrorDetail[] = []) {
    super(message, details);
  }
}

export class TokenExpiredError extends AppError {
  readonly statusCode = 401;
  readonly code = ERROR_CODES.TOKEN_EXPIRED;

  constructor(message = 'Token has expired', details: ErrorDetail[] = []) {
    super(message, details);
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = ERROR_CODES.FORBIDDEN;

  constructor(message = 'You do not have permission to perform this action', details: ErrorDetail[] = []) {
    super(message, details);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = ERROR_CODES.NOT_FOUND;

  constructor(message = 'Resource not found', details: ErrorDetail[] = []) {
    super(message, details);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = ERROR_CODES.CONFLICT;
}

export class DuplicateResourceError extends AppError {
  readonly statusCode = 409;
  readonly code = ERROR_CODES.DUPLICATE_RESOURCE;

  constructor(message = 'Resource already exists', details: ErrorDetail[] = []) {
    super(message, details);
  }
}

export class InsufficientStockError extends AppError {
  readonly statusCode = 409;
  readonly code = ERROR_CODES.INSUFFICIENT_STOCK;
}

export class OrderNotModifiableError extends AppError {
  readonly statusCode = 409;
  readonly code = ERROR_CODES.ORDER_NOT_MODIFIABLE;
}

export class IdempotencyKeyReusedError extends AppError {
  readonly statusCode = 409;
  readonly code = ERROR_CODES.IDEMPOTENCY_KEY_REUSED;

  constructor(
    message = 'Idempotency-Key was reused with a different request payload',
    details: ErrorDetail[] = [],
  ) {
    super(message, details);
  }
}

export class RateLimitedError extends AppError {
  readonly statusCode = 429;
  readonly code = ERROR_CODES.RATE_LIMITED;

  constructor(message = 'Too many requests', details: ErrorDetail[] = []) {
    super(message, details);
  }
}

/** Wrap an unexpected internal failure while preserving the original cause. */
export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly code = ERROR_CODES.INTERNAL_ERROR;

  constructor(message = 'Something went wrong', options?: { cause?: unknown }) {
    super(message, [], options);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
