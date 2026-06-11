# Database Architecture Specification

## B2B Restaurant Procurement Platform

* **Version:** 2.0
* **Database:** PostgreSQL 15+
* **ORM:** Prisma
* **Status:** Authoritative specification. The Prisma schema MUST match this document. If they ever diverge, this document and the committed migrations are the source of truth — never the other way around.

---

## Purpose

This document defines the complete database architecture for the platform.

The database must support these portals from day one:

* Restaurant Portal
* Vendor Portal
* Operations Portal
* Admin Portal

…while remaining extensible (new tables only, never redesigns) for:

* Farmers
* Warehouses
* Logistics
* Supply Chain
* Credit Systems
* Procurement Planning

The architecture follows:

* PostgreSQL with Prisma ORM
* UUID primary keys (UUID v7 preferred for index locality)
* Soft deletes (`deleted_at`)
* Full auditability (`created_by`, `updated_by`, `audit_logs`)
* Strict normalization (no business data in JSON)
* Forward-only, reviewed migrations
* Future scalability and multi-client (web + mobile) support

---

# GLOBAL CONVENTIONS

These conventions are **mandatory** and apply to every table unless explicitly stated otherwise. They are the most important part of this document.

## C1. Standard Columns

Every business table MUST contain:

```sql
id           UUID         PRIMARY KEY DEFAULT gen_random_uuid()  -- prefer UUID v7
created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()   -- maintained by Prisma @updatedAt
deleted_at   TIMESTAMPTZ  NULL                     -- soft delete marker
```

Tables that represent meaningful business actions SHOULD also contain:

```sql
created_by   UUID NULL REFERENCES users(id)
updated_by   UUID NULL REFERENCES users(id)
```

Pure many-to-many mapping tables (e.g. `role_permissions`, `user_roles`) are exempt from `deleted_at` / `updated_by` but still keep `created_at`.

## C2. Timestamps

* Always use `TIMESTAMPTZ` (timestamp **with** time zone). Never bare `TIMESTAMP`.
* All times are stored in **UTC**. Formatting to a local time zone is a presentation concern handled by the client.

## C3. Identifiers

* Use UUIDs for all primary keys. **Never** use auto-increment integers (they leak volume, complicate sharding, and break in distributed systems).
* Prefer **UUID v7** (time-ordered) for primary keys to preserve B-tree index locality and insert performance.
* Human-facing identifiers (e.g. `order_number`, `vendor_code`, `sku`) are separate, human-readable columns — never the primary key.

## C4. Money

* Store all monetary values as `DECIMAL(14,2)`. **Never** use `FLOAT`/`DOUBLE`/`REAL` for money (rounding errors are unacceptable in financial data).
* Every monetary record that can stand alone carries a `currency` column: `CHAR(3)` ISO-4217 (default `INR`).
* All amounts are stored in the major unit (rupees), not minor units, with 2 decimal places.

## C5. Soft Deletes

* Business records are **never** hard-deleted. Set `deleted_at = now()` instead.
* Every read query MUST filter `WHERE deleted_at IS NULL` unless it explicitly needs deleted rows (e.g. an admin restore view). This is enforced in the repository layer (see `TECHNICAL-DETAILS.MD`).
* Unique constraints that must ignore soft-deleted rows use **partial unique indexes**:

```sql
CREATE UNIQUE INDEX uq_users_email_active
  ON users (lower(email))
  WHERE deleted_at IS NULL;
```

This allows an email to be reused after the original account is soft-deleted, while preventing duplicates among active rows.

## C6. Enums

* Domain enums are implemented as **PostgreSQL native enums** declared in the Prisma schema (compile-time safety + DB-level integrity).
* Reference data that ops/admins must edit at runtime (e.g. `payment_methods`, `settings`) lives in **lookup tables**, not enums.
* Adding a new enum value is a migration; document it here in the same PR.

## C7. Concurrency / Optimistic Locking

* Tables subject to concurrent mutation of a shared numeric value (notably `inventories`, `ledgers`) carry an integer `version` column.
* Updates use optimistic locking: `UPDATE ... SET version = version + 1 WHERE id = ? AND version = ?`. A zero-row result means a conflict → retry or fail with `409 CONFLICT`.

## C8. Naming

* Tables: `snake_case`, plural (`order_items`).
* Columns: `snake_case`.
* Foreign keys: `<referenced_table_singular>_id` (`vendor_id`).
* Booleans: `is_` / `has_` prefix.
* Timestamps: `_at` suffix.
* Indexes: `idx_<table>_<cols>`; unique: `uq_<table>_<cols>`.

---

# DATABASE DESIGN PRINCIPLES

## Rule 1 — Standard columns

Every table follows convention **C1** (id, created_at, updated_at, deleted_at). Pure mapping tables are the only exception.

## Rule 2 — UUID keys

Use UUIDs for all primary keys. Never auto-increment integers. (See C3.)

## Rule 3 — Enforce relationships in the database

Use foreign keys everywhere. The database — not the application — is the final guardian of referential integrity.

## Rule 4 — No business data in JSON

Never store business-critical, queryable, or relational data inside JSON/JSONB columns. Use normalized tables. JSONB is acceptable only for genuinely schemaless, non-relational metadata (e.g. a raw webhook payload kept for debugging).

## Rule 5 — Order history is immutable

Orders and their line items are **snapshots**. Once written, an `order_item` is never updated to reflect later product/price changes. All money and product attributes are copied in at order time. (See the Order Domain.)

## Rule 6 — Append-only history

Price history (`product_prices`), status history (`order_status_history`), ledger entries (`ledger_entries`), and audit logs (`audit_logs`) are **append-only**. Never UPDATE or DELETE rows in these tables.

## Rule 7 — Data preservation by default

This platform preserves data. Prefer adding rows over mutating them. Prefer soft delete over hard delete. Destructive operations require an explicit, reviewed migration and a documented retention/justification.

---

# USER AND AUTHENTICATION DOMAIN

Users are humans. Organizations are businesses.

A user belongs to one or more organizations through `organization_members`. A user can leave or change; the organization remains. Therefore **never attach business data directly to a user** — attach it to the organization or membership.

## TABLE: users

Authentication and identity only.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| first_name | TEXT NOT NULL | |
| last_name | TEXT NOT NULL | |
| email | CITEXT NOT NULL | case-insensitive |
| phone | TEXT NULL | E.164 format |
| password_hash | TEXT NOT NULL | argon2id (preferred) or bcrypt |
| status | user_status NOT NULL DEFAULT 'PENDING' | |
| is_email_verified | BOOLEAN NOT NULL DEFAULT false | |
| is_phone_verified | BOOLEAN NOT NULL DEFAULT false | |
| last_login_at | TIMESTAMPTZ NULL | |
| + standard columns (C1) | | |

**Enum `user_status`:** `PENDING`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`.

**Indexes / constraints:**

* `uq_users_email_active` — partial unique on `lower(email)` WHERE `deleted_at IS NULL`.
* `uq_users_phone_active` — partial unique on `phone` WHERE `deleted_at IS NULL AND phone IS NOT NULL`.
* index on `status`.

## TABLE: roles

System roles (seeded reference data).

Records: `ADMIN`, `OPERATIONS`, `VENDOR`, `RESTAURANT`.

Columns: id, `name` (UNIQUE), `description`, + standard columns.

## TABLE: permissions

Fine-grained RBAC permissions, e.g. `product:create`, `product:update`, `order:view`, `order:update`, `user:create`.

Columns: id, `key` (UNIQUE, e.g. `product:create`), `description`, + standard columns.

## TABLE: role_permissions  *(mapping)*

`roles` ↔ `permissions`, many-to-many.

Columns: id, role_id (FK), permission_id (FK), created_at. Unique on (role_id, permission_id).

## TABLE: user_roles  *(mapping)*

`users` ↔ `roles`, many-to-many (allows future multi-role users).

Columns: id, user_id (FK), role_id (FK), `organization_id` (FK, NULL = global role), created_at. Unique on (user_id, role_id, organization_id).

> A user's role can be scoped to an organization (e.g. a person is `VENDOR` admin for one org and a `RESTAURANT` buyer for another).

## TABLE: refresh_tokens  *(required — was missing)*

Backs JWT refresh-token rotation and session management referenced in the README.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | |
| token_hash | TEXT NOT NULL | store a SHA-256 **hash**, never the raw token |
| family_id | UUID NOT NULL | rotation lineage; reuse of a revoked token in a family revokes the whole family |
| user_agent | TEXT NULL | device/session info |
| ip_address | INET NULL | |
| expires_at | TIMESTAMPTZ NOT NULL | |
| revoked_at | TIMESTAMPTZ NULL | |
| replaced_by_id | UUID NULL FK → refresh_tokens | set on rotation |
| created_at | TIMESTAMPTZ NOT NULL | |

Indexes: user_id, family_id, token_hash (unique), expires_at.

## TABLE: password_reset_tokens  *(required — was missing)*

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | |
| token_hash | TEXT NOT NULL | hashed, single-use |
| expires_at | TIMESTAMPTZ NOT NULL | short TTL (e.g. 30 min) |
| used_at | TIMESTAMPTZ NULL | |
| created_at | TIMESTAMPTZ NOT NULL | |

## TABLE: verification_tokens  *(required — was missing)*

Email / phone verification (one-time codes/links). Columns: id, user_id (FK), `channel` (`EMAIL`/`SMS`), token_hash, expires_at, used_at, created_at.

---

# ORGANIZATION DOMAIN

An organization is a company: Restaurant, Vendor, Farmer (future), Warehouse (future).

## TABLE: organizations

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| organization_type | organization_type NOT NULL | |
| gst_number | TEXT NULL | validated format |
| pan_number | TEXT NULL | validated format |
| email | CITEXT NULL | |
| phone | TEXT NULL | |
| website | TEXT NULL | |
| status | organization_status NOT NULL DEFAULT 'PENDING' | |
| + standard columns + created_by/updated_by | | |

**Enum `organization_type`:** `RESTAURANT`, `VENDOR`, `FARMER`, `WAREHOUSE`.
**Enum `organization_status`:** `PENDING`, `ACTIVE`, `SUSPENDED`, `REJECTED`.

Constraints: partial unique on `gst_number` WHERE `deleted_at IS NULL AND gst_number IS NOT NULL`. Index on organization_type, status.

## TABLE: organization_addresses

Multiple addresses per organization.

Columns: id, organization_id (FK), address_line_1, address_line_2, city, state, country (default `IN`), pincode, latitude `DECIMAL(9,6)`, longitude `DECIMAL(9,6)`, `address_type` (`BILLING`/`SHIPPING`/`REGISTERED`), is_primary BOOLEAN, + standard columns.

Constraint: at most one `is_primary = true` per (organization_id, address_type) among non-deleted rows (partial unique index).

## TABLE: organization_members

Users inside an organization (Restaurant Manager, Vendor Sales Executive, Vendor Owner…).

Columns: id, organization_id (FK), user_id (FK), `designation`, `status` (`INVITED`/`ACTIVE`/`SUSPENDED`/`REMOVED`), joined_at, + standard columns.

Constraint: unique (organization_id, user_id) among non-deleted rows.

**Relationships:** Organization 1→Many members; User 1→Many memberships.

---

# RESTAURANT DOMAIN

## TABLE: restaurants

Restaurant-specific profile, 1:1 with an organization of type `RESTAURANT`.

Columns: id, organization_id (FK, UNIQUE), restaurant_name, license_number, cuisine_type, average_monthly_procurement `DECIMAL(14,2)`, status, + standard columns.

---

# VENDOR DOMAIN

## TABLE: vendors

Vendor-specific profile, 1:1 with an organization of type `VENDOR`.

Columns: id, organization_id (FK, UNIQUE), vendor_name, `vendor_code` (UNIQUE), business_category, status, + standard columns.

---

# PRODUCT DOMAIN

The most important catalog module.

## TABLE: categories

Self-referencing tree.

Columns: id, name, description, `slug` (UNIQUE), parent_category_id (FK → categories, NULL = root), `display_order` INT, status, + standard columns.

Examples: Vegetables, Fruits, Dairy, Poultry, Seafood, Groceries.

## TABLE: products

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| vendor_id | UUID FK → vendors | |
| category_id | UUID FK → categories | |
| sku | TEXT NOT NULL | unique per vendor |
| name | TEXT NOT NULL | |
| description | TEXT NULL | |
| unit | product_unit NOT NULL | |
| brand | TEXT NULL | |
| status | product_status NOT NULL DEFAULT 'DRAFT' | |
| is_featured | BOOLEAN NOT NULL DEFAULT false | |
| + standard columns + created_by/updated_by | | |

**Enum `product_unit`:** `KG`, `GRAM`, `LITER`, `ML`, `PIECE`, `BOX`, `PACKET`.
**Enum `product_status`:** `DRAFT`, `ACTIVE`, `INACTIVE`, `OUT_OF_STOCK`, `ARCHIVED`.

Constraints: partial unique on (vendor_id, sku) WHERE `deleted_at IS NULL`. Indexes on vendor_id, category_id, status, and a full-text/trigram index on `name` for search.

## TABLE: product_images

Columns: id, product_id (FK), image_url, `alt_text`, display_order INT, is_primary BOOLEAN, + standard columns.

> Store the S3 object key/URL only. Files live in S3; the DB stores references.

## TABLE: product_prices

**Append-only** price history (Rule 6).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| product_id | UUID FK → products | |
| price | DECIMAL(14,2) NOT NULL | |
| currency | CHAR(3) NOT NULL DEFAULT 'INR' | |
| effective_from | TIMESTAMPTZ NOT NULL | |
| effective_to | TIMESTAMPTZ NULL | NULL = open-ended |
| is_current | BOOLEAN NOT NULL DEFAULT true | |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ NOT NULL | |

**Rule:** never overwrite a price. To change a price, close the current row (`effective_to = now()`, `is_current = false`) and insert a new row — inside one transaction.

Constraint: partial unique on (product_id) WHERE `is_current = true` — guarantees exactly one current price per product.

---

# INVENTORY DOMAIN

Inventory is separated from products so stock can evolve independently and (later) be split across warehouses.

## TABLE: inventories

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| product_id | UUID FK → products (UNIQUE) | one inventory row per product (per warehouse in future) |
| available_quantity | DECIMAL(14,3) NOT NULL DEFAULT 0 | physical on-hand stock |
| reserved_quantity | DECIMAL(14,3) NOT NULL DEFAULT 0 | committed to open orders |
| minimum_quantity | DECIMAL(14,3) NOT NULL DEFAULT 0 | reorder threshold |
| maximum_quantity | DECIMAL(14,3) NULL | |
| version | INT NOT NULL DEFAULT 0 | optimistic lock (C7) |
| + standard columns | | |

Quantities are `DECIMAL(14,3)` because units like KG/LITER are fractional.

## INVENTORY FORMULA  *(corrected)*

The amount a buyer can actually order is **sellable stock**:

```text
sellable_quantity = available_quantity - reserved_quantity
```

> The previous specification stated `available_quantity * reserved_quantity` (multiplication). That was **incorrect** and is fixed here. Sellable stock is on-hand minus what is already committed.

**Invariants (enforced in the service layer + CHECK constraints):**

```sql
CHECK (available_quantity >= 0)
CHECK (reserved_quantity  >= 0)
CHECK (reserved_quantity  <= available_quantity)
```

* **Reserve** (order placed): `reserved_quantity += qty` (only if `sellable_quantity >= qty`).
* **Release** (order cancelled/rejected): `reserved_quantity -= qty`.
* **Fulfil** (order delivered): `available_quantity -= qty` and `reserved_quantity -= qty`.

All mutations use optimistic locking on `version` and run inside the order transaction.

---

# CART DOMAIN

## TABLE: carts

Columns: id, restaurant_id (FK), `status` (`ACTIVE`/`CHECKED_OUT`/`ABANDONED`), + standard columns.

Constraint: partial unique on (restaurant_id) WHERE `status = 'ACTIVE' AND deleted_at IS NULL` — one active cart per restaurant.

## TABLE: cart_items

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| cart_id | UUID FK → carts | |
| product_id | UUID FK → products | |
| quantity | DECIMAL(14,3) NOT NULL | |
| unit_price_snapshot | DECIMAL(14,2) NOT NULL | price shown when added; re-validated at checkout |
| subtotal | DECIMAL(14,2) NOT NULL | quantity × unit_price_snapshot |
| + standard columns | | |

Constraint: unique (cart_id, product_id) among non-deleted rows.

> The cart snapshot is for display/UX only. The **authoritative** price is re-read and re-validated at checkout; never trust the cart's snapshot for the final order.

---

# ORDER DOMAIN

The core business process. Orders are immutable snapshots (Rule 5).

> **One order = one vendor.** A cart may contain products from multiple vendors; at checkout it is split into one order per vendor. This keeps fulfilment, acceptance, and settlement per-vendor and matches the `orders.vendor_id` column.

## TABLE: orders

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_number | TEXT NOT NULL (UNIQUE) | human-readable, e.g. `ORD-2026-000123` |
| restaurant_id | UUID FK → restaurants | |
| vendor_id | UUID FK → vendors | |
| status | order_status NOT NULL DEFAULT 'PENDING' | |
| currency | CHAR(3) NOT NULL DEFAULT 'INR' | |
| subtotal | DECIMAL(14,2) NOT NULL | Σ order_items.subtotal |
| discount_amount | DECIMAL(14,2) NOT NULL DEFAULT 0 | |
| gst_amount | DECIMAL(14,2) NOT NULL DEFAULT 0 | |
| delivery_charges | DECIMAL(14,2) NOT NULL DEFAULT 0 | |
| total_amount | DECIMAL(14,2) NOT NULL | see formula |
| placed_at | TIMESTAMPTZ NULL | |
| accepted_at | TIMESTAMPTZ NULL | |
| delivered_at | TIMESTAMPTZ NULL | |
| cancelled_at | TIMESTAMPTZ NULL | |
| + standard columns + created_by | | |

**Enum `order_status`:** `PENDING`, `ACCEPTED`, `PROCESSING`, `READY_FOR_DISPATCH`, `DELIVERED`, `CANCELLED`, `REJECTED`.

**Order total formula:**

```text
total_amount = subtotal - discount_amount + gst_amount + delivery_charges
```

Indexes: order_number (unique), restaurant_id, vendor_id, status, created_at, and composite (vendor_id, status), (restaurant_id, status).

## TABLE: order_items

The immutable order snapshot (Rule 5).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| product_id | UUID FK → products | reference only |
| product_name | TEXT NOT NULL | snapshot |
| sku | TEXT NOT NULL | snapshot |
| unit | product_unit NOT NULL | snapshot |
| unit_price | DECIMAL(14,2) NOT NULL | snapshot |
| quantity | DECIMAL(14,3) NOT NULL | |
| subtotal | DECIMAL(14,2) NOT NULL | quantity × unit_price |
| created_at | TIMESTAMPTZ NOT NULL | |

**Important:** never read historical product data from `products` for an existing order. Always read the order snapshot. Product names/prices change; the order must show what was actually bought.

## TABLE: order_status_history

**Append-only** timeline (Rule 6).

Columns: id, order_id (FK), old_status (nullable), new_status, changed_by (FK → users), remarks, created_at.

## TABLE: order_notes

Internal communication on an order.

Columns: id, order_id (FK), created_by (FK → users), note, `visibility` (`INTERNAL`/`SHARED`), created_at + standard columns.

## TABLE: idempotency_keys  *(required — was missing)*

Prevents duplicate side effects (e.g. double-charged / double-placed orders) when mobile or web clients retry a request. **Essential for unreliable mobile networks.**

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| key | TEXT NOT NULL | client-supplied `Idempotency-Key` header |
| user_id | UUID FK → users | scope |
| endpoint | TEXT NOT NULL | method + route |
| request_hash | TEXT NOT NULL | hash of request body; mismatch ⇒ `409` |
| response_status | INT NULL | cached response |
| response_body | JSONB NULL | cached response |
| status | idempotency_status NOT NULL DEFAULT 'IN_PROGRESS' | |
| expires_at | TIMESTAMPTZ NOT NULL | e.g. 24h TTL |
| created_at | TIMESTAMPTZ NOT NULL | |

**Enum `idempotency_status`:** `IN_PROGRESS`, `COMPLETED`. Unique on (user_id, key).

---

# RELIABLE MESSAGING DOMAIN

## TABLE: outbox_events  *(recommended for production)*

Transactional outbox: write domain events in the **same transaction** as the business change, then a background worker publishes them (email, WhatsApp, webhooks, analytics). Guarantees no event is lost if the process crashes after commit.

Columns: id, `aggregate_type` (e.g. `ORDER`), `aggregate_id`, `event_type` (e.g. `ORDER_PLACED`), `payload` JSONB, `status` (`PENDING`/`PROCESSED`/`FAILED`), `attempts` INT, `available_at` TIMESTAMPTZ, processed_at, created_at.

Index on (status, available_at).

---

# PAYMENT DOMAIN  *(Phase 3 — design now, implement later)*

## TABLE: payment_methods  *(lookup table)*

Columns: id, name (UNIQUE), `code` (UNIQUE), status, + standard columns. Examples: UPI, Bank Transfer, Credit, Cash.

## TABLE: payments

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK → orders | |
| payment_method_id | UUID FK → payment_methods | |
| amount | DECIMAL(14,2) NOT NULL | |
| currency | CHAR(3) NOT NULL DEFAULT 'INR' | |
| status | payment_status NOT NULL DEFAULT 'PENDING' | |
| transaction_reference | TEXT NULL | gateway ref |
| paid_at | TIMESTAMPTZ NULL | |
| + standard columns | | |

**Enum `payment_status`:** `PENDING`, `SUCCESS`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`.

---

# CREDIT DOMAIN  *(future — design now)*

## TABLE: ledgers

Columns: id, organization_id (FK, UNIQUE), current_balance `DECIMAL(14,2)`, credit_limit `DECIMAL(14,2)`, currency, `version` INT (C7), + standard columns.

## TABLE: ledger_entries

**Append-only** (Rule 6). Double-entry friendly.

Columns: id, ledger_id (FK), amount `DECIMAL(14,2)`, entry_type (`DEBIT`/`CREDIT`), `reference_type` (e.g. `ORDER`/`PAYMENT`), `reference_id`, description, `balance_after` `DECIMAL(14,2)`, created_at.

---

# DOCUMENT DOMAIN

## TABLE: documents

Invoices and uploaded files. Columns: id, organization_id (FK), document_type, file_url (S3 key), `file_name`, `mime_type`, `size_bytes`, uploaded_by (FK → users), + standard columns.

**Enum `document_type`:** `GST`, `PAN`, `INVOICE`, `LICENSE`, `AGREEMENT`.

---

# NOTIFICATION DOMAIN

## TABLE: notifications

Columns: id, user_id (FK), title, message, `type`, `data` JSONB (deep-link metadata only), is_read BOOLEAN DEFAULT false, read_at TIMESTAMPTZ NULL, created_at + standard columns.

**Enum `notification_type`:** `SYSTEM`, `ORDER`, `PAYMENT`, `INVENTORY`.

Index on (user_id, is_read).

---

# AUDIT DOMAIN  *(mandatory)*

## TABLE: audit_logs

**Append-only** (Rule 6). Records who did what, when, and what changed.

Columns: id, user_id (FK, NULL = system), entity_type, entity_id, action, old_value JSONB, new_value JSONB, ip_address INET, `user_agent`, `request_id`, created_at.

Examples of `action`: `PRODUCT_UPDATED`, `PRICE_CHANGED`, `ORDER_ACCEPTED`, `USER_SUSPENDED`.

Indexes: (entity_type, entity_id), user_id, created_at.

---

# SYSTEM CONFIGURATION DOMAIN

## TABLE: settings  *(lookup table)*

Runtime-editable configuration.

Columns: id, key (UNIQUE), value, `value_type` (`STRING`/`NUMBER`/`BOOLEAN`/`JSON`), description, + standard columns.

Examples: `GST_PERCENTAGE`, `DEFAULT_CURRENCY`, `MAX_ORDER_VALUE`.

---

# FUTURE SUPPLY CHAIN TABLES

**DO NOT IMPLEMENT YET.** The schema must support adding these as **new tables only**:

`warehouses`, `warehouse_inventory`, `farmers`, `procurement_orders`, `supplier_quotes`, `purchase_requests`, `deliveries`, `delivery_tracking`, `quality_checks`, `vehicles`, `drivers`, `supply_chain_events`.

Designing inventory keyed by product (with room for a `warehouse_id`) and orders per-vendor today means logistics/warehousing slot in later **without** changing existing order architecture.

---

# INDEXING STRATEGY

Create indexes on every foreign key and on common filter/sort columns:

`email`, `phone`, `organization_id`, `vendor_id`, `restaurant_id`, `product_id`, `category_id`, `order_id`, `user_id`, `status`, `created_at`, `order_number`, `sku`.

Add **composite** indexes for real query patterns, e.g. `(vendor_id, status)`, `(restaurant_id, status)`, `(user_id, is_read)`. Add a trigram/full-text index on `products.name` for search. Review with `EXPLAIN ANALYZE`; do not add speculative indexes (they slow writes).

---

# CONSTRAINTS & INTEGRITY RULES

* Foreign keys everywhere (Rule 3).
* `CHECK` constraints for domain invariants (non-negative quantities/money, `reserved <= available`, `total_amount` consistency where practical).
* Partial unique indexes for soft-delete-aware uniqueness (C5).
* `NOT NULL` is the default; nullable columns must be justified.

---

# CASCADE RULES

* Soft delete is the default; business data is never cascade-deleted.
* **Allowed:** `ON UPDATE CASCADE`.
* **Forbidden:** `ON DELETE CASCADE` on business data. Use `ON DELETE RESTRICT` (or `NO ACTION`) and handle removal via soft delete in the service layer.
* Child rows of a genuinely dependent, non-business aggregate (e.g. `cart_items` under a hard-deleted cart) may cascade — but carts are soft-deleted in practice.

---

# TRANSACTION RULES

The following operations are **mandatory single transactions** — all-or-nothing:

* Order creation (reserve inventory + create order + items + status history + outbox event)
* Inventory reservation / release / fulfilment
* Order cancellation (release inventory + status history + outbox event)
* Price changes (close current + insert new)
* Payment processing
* Ledger postings
* Future procurement flows

Use `prisma.$transaction`. Keep transactions short. Do not perform network/IO calls (email, S3, gateway) **inside** a transaction — enqueue them via `outbox_events` and let a worker do the IO after commit.

---

# ORDER CREATION FLOW  *(reference implementation order)*

All steps run inside **one** transaction:

1. Validate the authenticated user and their restaurant membership.
2. Validate the cart and that it is `ACTIVE`.
3. Re-read **current** product prices and product status (never trust cart snapshots).
4. Validate inventory: `sellable_quantity >= requested quantity` for every item.
5. Split items by vendor → one order per vendor.
6. Reserve inventory (optimistic lock on `version`).
7. Create the order(s) with computed totals.
8. Create immutable `order_items` snapshots.
9. Write `order_status_history` (`PENDING`).
10. Write `outbox_events` (`ORDER_PLACED`) for notifications.
11. Mark cart `CHECKED_OUT`.
12. Commit.

Any failure → **roll back the entire transaction**. The `Idempotency-Key` guard (above) ensures a client retry does not create duplicate orders.

---

# DATA RETENTION & MIGRATIONS

* **Migrations:** managed by Prisma Migrate, forward-only, reviewed in PRs. Never run `prisma db push` against staging/production. Every schema change ships as a committed migration.
* **Backwards compatibility:** prefer additive changes (new nullable column, new table). Renames/drops are done in expand→migrate→contract phases so running app versions never break — important for zero-downtime deploys and live mobile clients.
* **Retention:** business data is preserved indefinitely unless a documented retention policy says otherwise. Append-only history tables are never purged without an explicit, reviewed migration.
* **Seeds:** roles, permissions, payment methods, and base settings are seeded idempotently.

---

# GOLDEN RULE

The database must be designed so that adding **Farmer, Warehouse, Logistics, Payments, Credit, Procurement, or Quality Inspection** requires **only new tables and relationships — never redesigning existing tables.**
