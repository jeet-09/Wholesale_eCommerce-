export interface PriceDto {
  id: string;
  productId: string;
  price: string;
  currency: string;
  averageVendorPrice: string | null;
  transportPercent: string | null;
  isOverride: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  isCurrent: boolean;
  createdAt: string;
}

/**
 * The pricing suggestion shown to Admin (project-working.md PRODUCT PRICING
 * FLOW): average of APPROVED vendor offers + the product's transport markup.
 */
export interface PriceSuggestionDto {
  productId: string;
  vendorCount: number;
  averageVendorPrice: string | null;
  transportPercent: string;
  computedPrice: string | null;
  currentPrice: string | null;
  currency: string;
}
