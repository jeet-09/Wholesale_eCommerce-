export interface InventoryDto {
  id: string;
  productId: string;
  availableQuantity: string;
  reservedQuantity: string;
  sellableQuantity: string;
  minimumQuantity: string;
  maximumQuantity: string | null;
  version: number;
  updatedAt: string;
}
