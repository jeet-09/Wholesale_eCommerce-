import type { Vendor } from '@prisma/client';

import type { VendorDto } from './vendor.types';

export function toVendorDto(vendor: Vendor): VendorDto {
  return {
    id: vendor.id,
    organizationId: vendor.organizationId,
    vendorName: vendor.vendorName,
    vendorCode: vendor.vendorCode,
    businessCategory: vendor.businessCategory,
    status: vendor.status,
    createdAt: vendor.createdAt.toISOString(),
    updatedAt: vendor.updatedAt.toISOString(),
  };
}
