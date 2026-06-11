import { describe, expect, it } from 'vitest';

import {
  ForbiddenError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
  isAppError,
} from '../errors';

describe('AppError hierarchy', () => {
  it('maps each error to its status code and stable code', () => {
    expect(new ValidationError('x').statusCode).toBe(422);
    expect(new ValidationError('x').code).toBe('VALIDATION_ERROR');
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new InsufficientStockError('no stock').statusCode).toBe(409);
    expect(new InsufficientStockError('no stock').code).toBe('INSUFFICIENT_STOCK');
  });

  it('defaults details to an empty array and carries provided details', () => {
    expect(new NotFoundError().details).toEqual([]);
    const err = new ValidationError('bad', [{ field: 'email', message: 'required' }]);
    expect(err.details).toEqual([{ field: 'email', message: 'required' }]);
  });

  it('isAppError narrows only AppError instances', () => {
    expect(isAppError(new NotFoundError())).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('nope')).toBe(false);
  });
});
