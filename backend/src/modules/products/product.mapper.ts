import { Prisma } from '@prisma/client';

import {
  applyTransportMarkup,
  averageMoney,
  sellableQuantity,
  toMoneyString,
  toQuantityString,
} from '../../utils/decimal';
import type { ProductDto, ProductWithRelations } from './product.types';

export function toProductDto(product: ProductWithRelations): ProductDto {
  const current = product.prices[0] ?? null;
  const offers = product.offers;

  const vendorPrices = offers.map((offer) => offer.vendorPrice);
  const averageVendorPrice = vendorPrices.length > 0 ? averageMoney(vendorPrices) : null;
  const lowestVendorPrice =
    vendorPrices.length > 0
      ? vendorPrices.reduce((min, value) => (value.lessThan(min) ? value : min))
      : null;
  const computedPrice =
    averageVendorPrice !== null
      ? applyTransportMarkup(averageVendorPrice, product.transportPercent)
      : null;
  const totalAvailable = offers.reduce(
    (sum, offer) => sum.plus(sellableQuantity(offer.availableQuantity, offer.reservedQuantity)),
    new Prisma.Decimal(0),
  );

  return {
    id: product.id,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    brand: product.brand,
    status: product.status,
    isFeatured: product.isFeatured,
    transportPercent: product.transportPercent.toFixed(2),
    sellingPrice: current
      ? { price: toMoneyString(current.price), currency: current.currency }
      : null,
    supply: {
      vendorCount: offers.length,
      averageVendorPrice: averageVendorPrice !== null ? toMoneyString(averageVendorPrice) : null,
      lowestVendorPrice: lowestVendorPrice !== null ? toMoneyString(lowestVendorPrice) : null,
      computedPrice: computedPrice !== null ? toMoneyString(computedPrice) : null,
      totalAvailableQuantity: toQuantityString(totalAvailable),
      inStock: totalAvailable.greaterThan(0),
    },
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
