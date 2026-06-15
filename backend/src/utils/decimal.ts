import { Prisma } from '@prisma/client';

/**
 * Money/quantity helpers. Money is DECIMAL(14,2); quantities DECIMAL(14,3)
 * (DATABASE.md C4). Responses return money as a fixed-precision STRING with an
 * explicit currency — never a float (README → Dates, IDs, and Types).
 */

export const MONEY_DP = 2;
export const QUANTITY_DP = 3;

export type DecimalInput = Prisma.Decimal | number | string;

export function toDecimal(value: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function toMoneyString(value: DecimalInput): string {
  return new Prisma.Decimal(value).toFixed(MONEY_DP);
}

export function toQuantityString(value: DecimalInput): string {
  return new Prisma.Decimal(value).toFixed(QUANTITY_DP);
}

/** sellable = available − reserved (DATABASE.md INVENTORY FORMULA). */
export function sellableQuantity(available: DecimalInput, reserved: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(available).minus(new Prisma.Decimal(reserved));
}

/** total = subtotal − discount + gst + delivery (DATABASE.md Order total formula). */
export function orderTotal(parts: {
  subtotal: DecimalInput;
  discountAmount: DecimalInput;
  gstAmount: DecimalInput;
  deliveryCharges: DecimalInput;
}): Prisma.Decimal {
  return new Prisma.Decimal(parts.subtotal)
    .minus(new Prisma.Decimal(parts.discountAmount))
    .plus(new Prisma.Decimal(parts.gstAmount))
    .plus(new Prisma.Decimal(parts.deliveryCharges));
}

/** quantity × unitPrice rounded to money precision. */
export function lineSubtotal(quantity: DecimalInput, unitPrice: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(quantity)
    .times(new Prisma.Decimal(unitPrice))
    .toDecimalPlaces(MONEY_DP, Prisma.Decimal.ROUND_HALF_UP);
}

/** percentage of a base amount, rounded to money precision (e.g. 30% advance). */
export function percentOf(base: DecimalInput, percent: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(base)
    .times(new Prisma.Decimal(percent))
    .dividedBy(100)
    .toDecimalPlaces(MONEY_DP, Prisma.Decimal.ROUND_HALF_UP);
}

/** Apply a transport markup to a base price: base × (1 + percent/100). */
export function applyTransportMarkup(base: DecimalInput, percent: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(base)
    .times(new Prisma.Decimal(100).plus(new Prisma.Decimal(percent)))
    .dividedBy(100)
    .toDecimalPlaces(MONEY_DP, Prisma.Decimal.ROUND_HALF_UP);
}

/** Arithmetic mean of money values, rounded to money precision. Empty ⇒ 0. */
export function averageMoney(values: DecimalInput[]): Prisma.Decimal {
  if (values.length === 0) {
    return new Prisma.Decimal(0);
  }
  const sum = values.reduce<Prisma.Decimal>(
    (acc, value) => acc.plus(new Prisma.Decimal(value)),
    new Prisma.Decimal(0),
  );
  return sum.dividedBy(values.length).toDecimalPlaces(MONEY_DP, Prisma.Decimal.ROUND_HALF_UP);
}
