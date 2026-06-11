import { describe, expect, it } from 'vitest';

import { formatOrderNumber } from '../order-number';

describe('formatOrderNumber', () => {
  it('pads the sequence to 6 digits with the year', () => {
    expect(formatOrderNumber(123, 2026)).toBe('ORD-2026-000123');
    expect(formatOrderNumber(1, 2026)).toBe('ORD-2026-000001');
  });

  it('accepts bigint sequence values', () => {
    expect(formatOrderNumber(42n, 2030)).toBe('ORD-2030-000042');
  });

  it('does not truncate sequences longer than 6 digits', () => {
    expect(formatOrderNumber(1234567, 2026)).toBe('ORD-2026-1234567');
  });
});
