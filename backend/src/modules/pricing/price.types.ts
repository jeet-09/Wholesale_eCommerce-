export interface PriceDto {
  id: string;
  productId: string;
  price: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isCurrent: boolean;
  createdAt: string;
}
