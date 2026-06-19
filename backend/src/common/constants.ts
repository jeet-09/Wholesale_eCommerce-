/** API version prefix — every route lives under this (README → API Versioning). */
export const API_PREFIX = '/api/v1';

/** Name of the HttpOnly refresh-token cookie for web clients. */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Header carrying the client-supplied idempotency key (README → Idempotency). */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Default ISO-4217 currency (DATABASE.md C4). */
export const DEFAULT_CURRENCY = 'INR';

/** Idempotency record TTL in hours (DATABASE.md idempotency_keys). */
export const IDEMPOTENCY_TTL_HOURS = 24;

/** Password-reset token TTL in minutes (DATABASE.md password_reset_tokens). */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** Canonical keys for the `settings` table (seeded, read at runtime). */
export const SETTING_KEYS = {
  GST_PERCENTAGE: 'GST_PERCENTAGE',
  DELIVERY_CHARGES: 'DELIVERY_CHARGES',
  /** Flat surcharge added when the restaurant requests same-day delivery. */
  SAME_DAY_DELIVERY_SURCHARGE: 'SAME_DAY_DELIVERY_SURCHARGE',
  MIN_ORDER_VALUE: 'MIN_ORDER_VALUE',
  /** Advance % collected up front at checkout (project-working.md PAYMENT SYSTEM). */
  ADVANCE_PERCENTAGE: 'ADVANCE_PERCENTAGE',
  /** Transportation markup added on top of the average vendor price. */
  TRANSPORT_PERCENTAGE: 'TRANSPORT_PERCENTAGE',
  /** PhonePe/UPI handle shown to restaurants on the checkout QR. */
  PAYMENT_UPI_ID: 'PAYMENT_UPI_ID',
  /** Image/URL of the PhonePe QR shown at checkout. */
  PAYMENT_QR_URL: 'PAYMENT_QR_URL',
} as const;

/** Fallback GST percentage used if the setting row is absent. */
export const DEFAULT_GST_PERCENT = 5;

/** Default advance percentage (30%) — project-working.md BUSINESS FLOW step 4. */
export const DEFAULT_ADVANCE_PERCENT = 30;

/** Default transportation markup (20%) — project-working.md PRODUCT PRICING FLOW. */
export const DEFAULT_TRANSPORT_PERCENT = 20;

/** Default same-day delivery surcharge (₹) if the setting row is absent. */
export const DEFAULT_SAME_DAY_SURCHARGE = 150;

/**
 * How far ahead a restaurant may schedule delivery, in days from today
 * (inclusive). Today (0) is allowed and triggers the same-day surcharge.
 */
export const MAX_DELIVERY_DAYS_AHEAD = 20;

/** Aggregate/event names for the transactional outbox. */
export const OUTBOX_AGGREGATE_ORDER = 'order';
export const OUTBOX_AGGREGATE_OFFER = 'vendor_offer';
export const OUTBOX_EVENTS = {
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_PAYMENT_SUBMITTED: 'ORDER_PAYMENT_SUBMITTED',
  ORDER_PAYMENT_VERIFIED: 'ORDER_PAYMENT_VERIFIED',
  ORDER_VENDOR_ASSIGNED: 'ORDER_VENDOR_ASSIGNED',
  ORDER_OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  ORDER_REVIEWED: 'ORDER_REVIEWED',
  OFFER_SUBMITTED: 'OFFER_SUBMITTED',
  PRICE_RECALCULATED: 'PRICE_RECALCULATED',
} as const;
