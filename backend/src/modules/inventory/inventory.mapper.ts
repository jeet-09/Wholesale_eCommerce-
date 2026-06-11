import type { Inventory } from '@prisma/client';

import { sellableQuantity, toQuantityString } from '../../utils/decimal';
import type { InventoryDto } from './inventory.types';

export function toInventoryDto(inventory: Inventory): InventoryDto {
  return {
    id: inventory.id,
    productId: inventory.productId,
    availableQuantity: toQuantityString(inventory.availableQuantity),
    reservedQuantity: toQuantityString(inventory.reservedQuantity),
    sellableQuantity: toQuantityString(
      sellableQuantity(inventory.availableQuantity, inventory.reservedQuantity),
    ),
    minimumQuantity: toQuantityString(inventory.minimumQuantity),
    maximumQuantity: inventory.maximumQuantity ? toQuantityString(inventory.maximumQuantity) : null,
    version: inventory.version,
    updatedAt: inventory.updatedAt.toISOString(),
  };
}
