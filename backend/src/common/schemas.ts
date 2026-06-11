import { z } from 'zod';

/**
 * Shared Zod schemas for the standard response envelope (README → Standard
 * Response Envelope). Every route's `response` uses these so the OpenAPI spec
 * and runtime serialization both reflect the one true shape.
 */

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const responseMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
  pagination: paginationMetaSchema.optional(),
});

export function successEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
    meta: responseMetaSchema,
  });
}

export function paginatedEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    meta: responseMetaSchema,
  });
}

export const errorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(errorDetailSchema),
  }),
  meta: responseMetaSchema,
});

/** Reusable param/body building blocks. */
export const uuidSchema = z.string().uuid();

export const uuidParamSchema = z.object({
  id: uuidSchema,
});

export type UuidParam = z.infer<typeof uuidParamSchema>;

/** Money is a fixed-precision decimal STRING in responses (README → Types). */
export const moneyStringSchema = z.string().regex(/^-?\d+\.\d{2}$/, 'Expected a 2dp decimal string');
export const quantityStringSchema = z
  .string()
  .regex(/^-?\d+\.\d{3}$/, 'Expected a 3dp decimal string');
export const currencySchema = z.string().length(3);

/** Reusable, validated field schemas shared across modules. */
export const emailSchema = z.string().trim().toLowerCase().email().max(255);

/** Password strength validation (README → Password Security). */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one number');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Phone must be in E.164 format');

export const nameSchema = z.string().trim().min(1).max(100);

/** Standard error responses to spread into a route's `response` for OpenAPI. */
export const commonErrorResponses = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  422: errorEnvelopeSchema,
  429: errorEnvelopeSchema,
  500: errorEnvelopeSchema,
} as const;

export const noContentSchema = z.null();
