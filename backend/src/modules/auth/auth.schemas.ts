import { z } from 'zod';

import { emailSchema, nameSchema, passwordSchema, phoneSchema } from '../../common/schemas';
import { userResponseSchema } from '../users/user.schemas';

export const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  accountType: z.enum(['RESTAURANT', 'VENDOR']),
  organizationName: z.string().trim().min(1).max(200),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10).max(512),
  newPassword: passwordSchema,
});

export const authContextSchema = z.object({
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  organizationId: z.string().uuid().nullable(),
  vendorId: z.string().uuid().nullable(),
  restaurantId: z.string().uuid().nullable(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  user: userResponseSchema,
  context: authContextSchema,
});

export const meResponseSchema = z.object({
  user: userResponseSchema,
  context: authContextSchema,
});

export const messageResponseSchema = z.object({
  message: z.string(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
