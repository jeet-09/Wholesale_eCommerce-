import type { ProductPrice } from '@prisma/client';

import { toMoneyString } from '../../utils/decimal';
import type { PriceDto } from './price.types';

export function toPriceDto(price: ProductPrice): PriceDto {
  return {
    id: price.id,
    productId: price.productId,
    price: toMoneyString(price.price),
    currency: price.currency,
    effectiveFrom: price.effectiveFrom.toISOString(),
    effectiveTo: price.effectiveTo ? price.effectiveTo.toISOString() : null,
    isCurrent: price.isCurrent,
    createdAt: price.createdAt.toISOString(),
  };
}
