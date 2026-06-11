import { z } from 'zod';

import { emailSchema, phoneSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

const ORG_TYPES = ['RESTAURANT', 'VENDOR', 'FARMER', 'WAREHOUSE'] as const;
const ORG_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const;
const ADDRESS_TYPES = ['BILLING', 'SHIPPING', 'REGISTERED'] as const;
const MEMBER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const;

const gstSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{3}$/, 'Invalid GST number format');
const panSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number format');

export const organizationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  organizationType: z.enum(ORG_TYPES),
  gstNumber: z.string().nullable(),
  panNumber: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  status: z.enum(ORG_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    gstNumber: gstSchema.nullable().optional(),
    panNumber: panSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    website: z.string().url().max(255).nullable().optional(),
    status: z.enum(ORG_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const listOrganizationsQuerySchema = paginationQuerySchema.extend({
  organizationType: z.enum(ORG_TYPES).optional(),
  status: z.enum(ORG_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const memberResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  designation: z.string().nullable(),
  status: z.enum(MEMBER_STATUSES),
  joinedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  designation: z.string().trim().min(1).max(100).optional(),
  status: z.enum(MEMBER_STATUSES).default('ACTIVE'),
});

export const addressResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  pincode: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  addressType: z.enum(ADDRESS_TYPES),
  isPrimary: z.boolean(),
  createdAt: z.string(),
});

export const addAddressSchema = z.object({
  addressLine1: z.string().trim().min(1).max(255),
  addressLine2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  country: z.string().trim().length(2).default('IN'),
  pincode: z.string().trim().regex(/^\d{4,10}$/, 'Invalid pincode'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  addressType: z.enum(ADDRESS_TYPES),
  isPrimary: z.boolean().default(false),
});

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type ListOrganizationsQueryInput = z.infer<typeof listOrganizationsQuerySchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type AddAddressInput = z.infer<typeof addAddressSchema>;
