import type { Organization, OrganizationAddress, OrganizationMember } from '@prisma/client';

import type { AddressDto, MemberDto, OrganizationDto } from './organization.types';

export function toOrganizationDto(org: Organization): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    organizationType: org.organizationType,
    gstNumber: org.gstNumber,
    panNumber: org.panNumber,
    email: org.email,
    phone: org.phone,
    website: org.website,
    status: org.status,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

export function toMemberDto(member: OrganizationMember): MemberDto {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    designation: member.designation,
    status: member.status,
    joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
    createdAt: member.createdAt.toISOString(),
  };
}

export function toAddressDto(address: OrganizationAddress): AddressDto {
  return {
    id: address.id,
    organizationId: address.organizationId,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    state: address.state,
    country: address.country,
    pincode: address.pincode,
    latitude: address.latitude ? address.latitude.toNumber() : null,
    longitude: address.longitude ? address.longitude.toNumber() : null,
    addressType: address.addressType,
    isPrimary: address.isPrimary,
    createdAt: address.createdAt.toISOString(),
  };
}
