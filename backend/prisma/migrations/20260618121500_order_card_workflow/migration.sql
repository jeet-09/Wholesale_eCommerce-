-- =============================================================================
-- Order "card" workflow: delivery scheduling, dispatch tracking, customer review.
-- Forward-only, additive (DATABASE.md DATA RETENTION & MIGRATIONS):
--   * new OUT_FOR_DELIVERY order status (vendor dispatch step)
--   * orders: requested delivery date + same-day surcharge breakdown,
--     vendor dispatch contact/note, restaurant rating + review
--   * order_items: delivered_quantity for partial fulfilment
-- CHECK constraints for the new columns live in prisma/sql/constraints.sql
-- (applied by `npm run db:constraints`), matching the existing convention.
-- =============================================================================

-- AlterEnum: add the dispatch ("in delivery") state after READY_FOR_DELIVERY.
ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY' AFTER 'READY_FOR_DELIVERY';

-- AlterTable: orders
ALTER TABLE "orders"
  ADD COLUMN "requested_delivery_date" TIMESTAMPTZ,
  ADD COLUMN "is_same_day_delivery"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "same_day_charge"         DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "delivery_contact_phone"  TEXT,
  ADD COLUMN "dispatch_note"           TEXT,
  ADD COLUMN "dispatched_at"           TIMESTAMPTZ,
  ADD COLUMN "customer_rating"         INTEGER,
  ADD COLUMN "customer_review"         TEXT,
  ADD COLUMN "rated_at"                TIMESTAMPTZ;

-- AlterTable: order_items
ALTER TABLE "order_items"
  ADD COLUMN "delivered_quantity" DECIMAL(14,3);
