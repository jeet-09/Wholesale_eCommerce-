import { z } from 'zod';

import { ROLES } from '../../common/types';
import {
  emailSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
} from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  isEmailVerified: z.boolean(),
  isPhoneVerified: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createUserSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  role: z.nativeEnum(ROLES),
  organizationId: z.string().uuid().optional(),
});

export const updateUserSchema = z
  .object({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
