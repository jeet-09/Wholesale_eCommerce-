import type { Prisma } from '@prisma/client';

export interface OfferDto {
  id: string;
  vendorId: string;
  vendorName: string | null;
  productId: string;
  productName: string | null;
  productSku: string | null;
  unit: string | null;
  vendorPrice: string;
  currency: string;
  availableQuantity: string;
  reservedQuantity: string;
  sellableQuantity: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const offerInclude = {
  vendor: { select: { id: true, vendorName: true } },
  product: { select: { id: true, name: true, sku: true, unit: true } },
} satisfies Prisma.VendorProductOfferInclude;

export type OfferWithRelations = Prisma.VendorProductOfferGetPayload<{
  include: typeof offerInclude;
}>;
