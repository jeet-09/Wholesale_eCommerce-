import type { OrganizationType } from '@prisma/client';

export interface OrganizationDto {
  id: string;
  name: string;
  organizationType: string;
  gstNumber: string | null;
  panNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberDto {
  id: string;
  organizationId: string;
  userId: string;
  designation: string | null;
  status: string;
  joinedAt: string | null;
  createdAt: string;
}

export interface AddressDto {
  id: string;
  organizationId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  addressType: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface CreateOrganizationData {
  name: string;
  organizationType: OrganizationType;
  gstNumber?: string | null;
  panNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  createdBy?: string | null;
}
