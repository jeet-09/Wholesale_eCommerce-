import { sellableQuantity, toMoneyString, toQuantityString } from '../../utils/decimal';
import type { ProductDto, ProductWithRelations } from './product.types';

export function toProductDto(product: ProductWithRelations): ProductDto {
  const current = product.prices[0] ?? null;
  const inventory = product.inventory;

  return {
    id: product.id,
    vendorId: product.vendorId,
    vendorName: product.vendor?.vendorName ?? null,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    brand: product.brand,
    status: product.status,
    isFeatured: product.isFeatured,
    currentPrice: current ? { price: toMoneyString(current.price), currency: current.currency } : null,
    inventory: inventory
      ? {
          availableQuantity: toQuantityString(inventory.availableQuantity),
          reservedQuantity: toQuantityString(inventory.reservedQuantity),
          sellableQuantity: toQuantityString(
            sellableQuantity(inventory.availableQuantity, inventory.reservedQuantity),
          ),
        }
      : null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
