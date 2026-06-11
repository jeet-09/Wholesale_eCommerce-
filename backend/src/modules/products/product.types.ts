import type { Prisma } from '@prisma/client';

export interface ProductPriceSummary {
  price: string;
  currency: string;
}

export interface ProductInventorySummary {
  availableQuantity: string;
  reservedQuantity: string;
  sellableQuantity: string;
}

export interface ProductDto {
  id: string;
  vendorId: string;
  vendorName: string | null;
  categoryId: string;
  categoryName: string | null;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  brand: string | null;
  status: string;
  isFeatured: boolean;
  currentPrice: ProductPriceSummary | null;
  inventory: ProductInventorySummary | null;
  createdAt: string;
  updatedAt: string;
}

/** Relations joined for the storefront/catalog representation. */
export const productInclude = {
  prices: { where: { isCurrent: true }, take: 1 },
  inventory: true,
  vendor: { select: { id: true, vendorName: true } },
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
