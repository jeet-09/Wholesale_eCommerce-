import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination';
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from '../../common/schemas';

const PROFILE_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const;

export const vendorResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  vendorName: z.string(),
  vendorCode: z.string(),
  businessCategory: z.string().nullable(),
  status: z.enum(PROFILE_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const updateVendorSchema = z
  .object({
    vendorName: z.string().trim().min(1).max(200).optional(),
    businessCategory: z.string().trim().min(1).max(100).nullable().optional(),
    status: z.enum(PROFILE_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const listVendorsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PROFILE_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

/**
 * Admin-initiated vendor onboarding: provisions the organization, vendor
 * profile, and an owner login in one step so the vendor can sign in immediately.
 */
export const createVendorAccountSchema = z.object({
  vendorName: z.string().trim().min(1).max(200),
  businessCategory: z.string().trim().min(1).max(100).optional(),
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
});

export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type ListVendorsQueryInput = z.infer<typeof listVendorsQuerySchema>;
export type CreateVendorAccountInput = z.infer<typeof createVendorAccountSchema>;
