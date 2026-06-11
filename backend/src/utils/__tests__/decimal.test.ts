import { describe, expect, it } from 'vitest';

import {
  lineSubtotal,
  orderTotal,
  sellableQuantity,
  toMoneyString,
  toQuantityString,
} from '../decimal';

describe('decimal money/quantity helpers', () => {
  it('formats money to 2dp strings', () => {
    expect(toMoneyString(1)).toBe('1.00');
    expect(toMoneyString('10.5')).toBe('10.50');
    expect(toMoneyString(0)).toBe('0.00');
  });

  it('formats quantity to 3dp strings', () => {
    expect(toQuantityString(2)).toBe('2.000');
    expect(toQuantityString('1.5')).toBe('1.500');
  });

  it('computes sellable = available - reserved', () => {
    expect(sellableQuantity(10, 3).toFixed(3)).toBe('7.000');
    expect(sellableQuantity('5.5', '5.5').toFixed(3)).toBe('0.000');
  });

  it('computes a line subtotal rounded half-up to money precision', () => {
    expect(lineSubtotal(3, '10.00').toFixed(2)).toBe('30.00');
    // 3 * 2.555 = 7.665 -> rounds half-up to 7.67
    expect(lineSubtotal(3, '2.555').toFixed(2)).toBe('7.67');
  });

  it('computes order total = subtotal - discount + gst + delivery', () => {
    const total = orderTotal({
      subtotal: '100.00',
      discountAmount: '10.00',
      gstAmount: '5.00',
      deliveryCharges: '20.00',
    });
    expect(total.toFixed(2)).toBe('115.00');
  });
});
