export interface VendorDto {
  id: string;
  organizationId: string;
  vendorName: string;
  vendorCode: string;
  businessCategory: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorData {
  organizationId: string;
  vendorName: string;
  vendorCode: string;
  businessCategory?: string | null;
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  createdBy?: string | null;
}
