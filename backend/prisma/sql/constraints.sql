-- =============================================================================
-- Raw SQL constraints — applied AFTER `prisma migrate deploy`
-- (npm run db:constraints). Idempotent: safe to re-run.
--
-- These objects are intentionally NOT in schema.prisma because Prisma's schema
-- DSL cannot express them: partial unique indexes, expression indexes,
-- CHECK constraints, trigram (GIN) search indexes, and FK constraints for the
-- created_by/updated_by attribution columns. They are first-class requirements
-- of DATABASE.md (C5, C7, INDEXING STRATEGY, CONSTRAINTS & INTEGRITY RULES).
-- =============================================================================

-- Required extensions are also declared in schema.prisma (datasource.extensions)
-- and created by the migration. Declared here too for standalone safety.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Collision-free human-readable order numbers (orders.order_number).
-- A dedicated sequence avoids the contention of count()-based numbering.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- -----------------------------------------------------------------------------
-- C5 — Soft-delete-aware uniqueness (partial unique indexes)
-- -----------------------------------------------------------------------------

-- users: email/phone unique only among active (non-deleted) rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_active
  ON users (lower(email))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_active
  ON users (phone)
  WHERE deleted_at IS NULL AND phone IS NOT NULL;

-- organizations: GST number unique among active rows when present.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_gst_active
  ON organizations (gst_number)
  WHERE deleted_at IS NULL AND gst_number IS NOT NULL;

-- organization_addresses: at most one primary per (org, address_type).
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_addresses_primary
  ON organization_addresses (organization_id, address_type)
  WHERE is_primary = true AND deleted_at IS NULL;

-- organization_members: one active membership per (org, user).
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_members_org_user_active
  ON organization_members (organization_id, user_id)
  WHERE deleted_at IS NULL;

-- products: SKU unique platform-wide among active rows (master catalog).
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_sku_active
  ON products (lower(sku))
  WHERE deleted_at IS NULL;

-- vendor_product_offers: one active offer per (vendor, product).
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_offers_vendor_product_active
  ON vendor_product_offers (vendor_id, product_id)
  WHERE deleted_at IS NULL;

-- product_prices: exactly one current price per product.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_prices_current
  ON product_prices (product_id)
  WHERE is_current = true;

-- carts: one ACTIVE cart per restaurant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_carts_active_restaurant
  ON carts (restaurant_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- cart_items: a product appears once per cart among active rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_items_cart_product_active
  ON cart_items (cart_id, product_id)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- Search — trigram index on product name (INDEXING STRATEGY)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING gin (name gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- CHECK constraints — domain invariants (CONSTRAINTS & INTEGRITY RULES)
-- DROP + ADD for idempotency (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
-- -----------------------------------------------------------------------------

-- vendor_product_offers: non-negative + reserved <= available (sellable formula).
ALTER TABLE vendor_product_offers DROP CONSTRAINT IF EXISTS chk_offers_price_nonneg;
ALTER TABLE vendor_product_offers ADD  CONSTRAINT chk_offers_price_nonneg CHECK (vendor_price >= 0);
ALTER TABLE vendor_product_offers DROP CONSTRAINT IF EXISTS chk_offers_available_nonneg;
ALTER TABLE vendor_product_offers ADD  CONSTRAINT chk_offers_available_nonneg CHECK (available_quantity >= 0);
ALTER TABLE vendor_product_offers DROP CONSTRAINT IF EXISTS chk_offers_reserved_nonneg;
ALTER TABLE vendor_product_offers ADD  CONSTRAINT chk_offers_reserved_nonneg CHECK (reserved_quantity >= 0);
ALTER TABLE vendor_product_offers DROP CONSTRAINT IF EXISTS chk_offers_reserved_le_available;
ALTER TABLE vendor_product_offers ADD  CONSTRAINT chk_offers_reserved_le_available CHECK (reserved_quantity <= available_quantity);

-- orders: non-negative money + total formula + advance/remaining consistency.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_subtotal_nonneg;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_subtotal_nonneg CHECK (subtotal >= 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_discount_nonneg;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_discount_nonneg CHECK (discount_amount >= 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_gst_nonneg;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_gst_nonneg CHECK (gst_amount >= 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_delivery_nonneg;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_delivery_nonneg CHECK (delivery_charges >= 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_total_nonneg;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_total_nonneg CHECK (total_amount >= 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_total_formula;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_total_formula
  CHECK (total_amount = subtotal - discount_amount + gst_amount + delivery_charges);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_advance_nonneg;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_advance_nonneg CHECK (advance_amount >= 0);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_remaining_formula;
ALTER TABLE orders ADD  CONSTRAINT chk_orders_remaining_formula
  CHECK (remaining_amount = total_amount - advance_amount);

-- order_items / cart_items: positive quantity, non-negative subtotal.
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS chk_order_items_qty_pos;
ALTER TABLE order_items ADD  CONSTRAINT chk_order_items_qty_pos CHECK (quantity > 0);
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS chk_order_items_subtotal_nonneg;
ALTER TABLE order_items ADD  CONSTRAINT chk_order_items_subtotal_nonneg CHECK (subtotal >= 0);
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS chk_cart_items_qty_pos;
ALTER TABLE cart_items ADD  CONSTRAINT chk_cart_items_qty_pos CHECK (quantity > 0);

-- product_prices / payments: non-negative money.
ALTER TABLE product_prices DROP CONSTRAINT IF EXISTS chk_product_prices_price_nonneg;
ALTER TABLE product_prices ADD  CONSTRAINT chk_product_prices_price_nonneg CHECK (price >= 0);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_amount_nonneg;
ALTER TABLE payments ADD  CONSTRAINT chk_payments_amount_nonneg CHECK (amount >= 0);

-- -----------------------------------------------------------------------------
-- FK constraints for attribution columns (Rule 3 — FKs everywhere).
-- Kept as plain columns in schema.prisma to avoid bloating User with dozens of
-- back-relations; the referential integrity is enforced here.
-- ON DELETE RESTRICT (business data is soft-deleted, never hard-deleted).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('organizations',          'created_by', 'fk_organizations_created_by'),
      ('organizations',          'updated_by', 'fk_organizations_updated_by'),
      ('organization_addresses', 'created_by', 'fk_org_addresses_created_by'),
      ('organization_addresses', 'updated_by', 'fk_org_addresses_updated_by'),
      ('organization_members',   'created_by', 'fk_org_members_created_by'),
      ('organization_members',   'updated_by', 'fk_org_members_updated_by'),
      ('restaurants',            'created_by', 'fk_restaurants_created_by'),
      ('restaurants',            'updated_by', 'fk_restaurants_updated_by'),
      ('vendors',                'created_by', 'fk_vendors_created_by'),
      ('vendors',                'updated_by', 'fk_vendors_updated_by'),
      ('categories',             'created_by', 'fk_categories_created_by'),
      ('categories',             'updated_by', 'fk_categories_updated_by'),
      ('products',               'created_by', 'fk_products_created_by'),
      ('products',               'updated_by', 'fk_products_updated_by'),
      ('vendor_product_offers',  'created_by', 'fk_vendor_offers_created_by'),
      ('vendor_product_offers',  'updated_by', 'fk_vendor_offers_updated_by'),
      ('product_prices',         'created_by', 'fk_product_prices_created_by'),
      ('orders',                 'created_by', 'fk_orders_created_by'),
      ('orders',                 'assigned_by','fk_orders_assigned_by'),
      ('order_status_history',   'changed_by', 'fk_order_status_history_changed_by'),
      ('order_notes',            'created_by', 'fk_order_notes_created_by'),
      ('payments',               'submitted_by','fk_payments_submitted_by'),
      ('payments',               'verified_by', 'fk_payments_verified_by'),
      ('vendor_call_logs',       'called_by',  'fk_vendor_call_logs_called_by'),
      ('documents',              'uploaded_by','fk_documents_uploaded_by')
    ) AS t(table_name, column_name, constraint_name)
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE',
      r.table_name, r.constraint_name, r.column_name
    );
  END LOOP;
END $$;
