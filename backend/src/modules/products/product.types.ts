import type { Prisma } from '@prisma/client';

export interface ProductPriceSummary {
  price: string;
  currency: string;
}

/**
 * Aggregated vendor supply for a master-catalog product (project-working.md
 * PRODUCT PRICING FLOW). Computed from APPROVED offers; surfaced to Admin /
 * Administration so they understand how the selling price was derived.
 */
export interface ProductSupplySummary {
  vendorCount: number;
  averageVendorPrice: string | null;
  lowestVendorPrice: string | null;
  /** averageVendorPrice × (1 + transportPercent/100) — the suggested price. */
  computedPrice: string | null;
  totalAvailableQuantity: string;
  inStock: boolean;
}

export interface ProductDto {
  id: string;
  categoryId: string;
  categoryName: string | null;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  brand: string | null;
  status: string;
  isFeatured: boolean;
  transportPercent: string;
  /** Final selling price shown to restaurants (admin-controlled). */
  sellingPrice: ProductPriceSummary | null;
  supply: ProductSupplySummary;
  createdAt: string;
  updatedAt: string;
}

/** Relations joined for the catalog representation. */
export const productInclude = {
  prices: { where: { isCurrent: true }, take: 1 },
  category: { select: { id: true, name: true } },
  offers: {
    where: { status: 'APPROVED' as const, deletedAt: null },
    select: { vendorPrice: true, availableQuantity: true, reservedQuantity: true },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
