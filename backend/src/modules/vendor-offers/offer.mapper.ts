import { sellableQuantity, toMoneyString, toQuantityString } from '../../utils/decimal';
import type { OfferDto, OfferWithRelations } from './offer.types';

export function toOfferDto(offer: OfferWithRelations): OfferDto {
  return {
    id: offer.id,
    vendorId: offer.vendorId,
    vendorName: offer.vendor?.vendorName ?? null,
    productId: offer.productId,
    productName: offer.product?.name ?? null,
    productSku: offer.product?.sku ?? null,
    unit: offer.product?.unit ?? null,
    vendorPrice: toMoneyString(offer.vendorPrice),
    currency: offer.currency,
    availableQuantity: toQuantityString(offer.availableQuantity),
    reservedQuantity: toQuantityString(offer.reservedQuantity),
    sellableQuantity: toQuantityString(
      sellableQuantity(offer.availableQuantity, offer.reservedQuantity),
    ),
    status: offer.status,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}
