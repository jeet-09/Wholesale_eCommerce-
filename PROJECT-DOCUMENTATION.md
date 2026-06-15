# B2B Restaurant Procurement Platform — Complete Project Documentation

> A single, authoritative walkthrough of the entire codebase: what it does, how it
> is structured, and exactly how every business flow moves through the system. Read
> this top‑to‑bottom to understand the platform; jump to a section using the table
> of contents when you need a specific detail.

---

## Table of Contents

1. [What this platform is](#1-what-this-platform-is)
2. [Tech stack](#2-tech-stack)
3. [Repository layout](#3-repository-layout)
4. [The four roles & RBAC](#4-the-four-roles--rbac)
5. [Domain model (database)](#5-domain-model-database)
6. [The business lifecycle (end to end)](#6-the-business-lifecycle-end-to-end)
7. [Pricing, advance payment & performance maths](#7-pricing-advance-payment--performance-maths)
8. [Backend architecture](#8-backend-architecture)
9. [Backend module catalog & API reference](#9-backend-module-catalog--api-reference)
10. [Frontend architecture](#10-frontend-architecture)
11. [Cross-cutting concerns](#11-cross-cutting-concerns)
12. [Running it locally](#12-running-it-locally)
13. [Quality gates & testing](#13-quality-gates--testing)
14. [How to extend the system](#14-how-to-extend-the-system)
15. [Glossary](#15-glossary)

---

## 1. What this platform is

A **B2B procurement marketplace** that sits between **restaurants** (buyers) and
**vendors** (suppliers), operated by a central **platform team** (Administration +
Admin). It is *not* a simple storefront — the platform actively controls the catalog,
the prices, vendor selection, and money flow.

The defining characteristics that shape the whole codebase:

- **Platform-controlled master catalog.** Only the Admin creates products. Vendors
  cannot invent products — they only attach **price + stock offers** to existing
  master products.
- **Computed selling price.** The price a restaurant sees is derived from the
  **average of approved vendor offers** plus a **transport markup** (default 20%).
  Admin/Administration can override it.
- **Advance-payment gate.** After placing an order the restaurant pays a **30%
  advance** (PhonePe/UPI), uploads proof, and the platform **manually verifies** it
  before anything else happens.
- **Manual vendor assignment.** Administration reviews each paid order and assigns a
  vendor. Stock is **reserved** at assignment, **fulfilled** on completion, and
  **released** on rejection/cancellation.
- **Vendor accountability.** Every assignment, acceptance, rejection, completion,
  fulfilment time, call outcome, and rating rolls up into a **vendor performance
  scorecard**.

---

## 2. Tech stack

| Layer | Technology |
| --- | --- |
| Backend runtime | **Node.js + TypeScript** |
| HTTP framework | **Fastify** (with `fastify-type-provider-zod`) |
| Validation / docs | **Zod** schemas → request validation + **OpenAPI/Swagger** at `/docs` |
| ORM / DB | **Prisma** + **PostgreSQL** |
| Auth | **JWT** access tokens + refresh tokens, bcrypt password hashing |
| Frontend | **Next.js (App Router) + React 19 + TypeScript** |
| Data fetching | **TanStack React Query** |
| State | **Zustand** (auth session) |
| Styling | **Tailwind CSS** |
| Containerization | **Docker** + `docker-compose` |

---

## 3. Repository layout

```
Wholesale_eCommerce-/
├── backend/                     # Fastify + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma        # The single source of truth for the data model
│   │   ├── migrations/          # SQL migrations (0_init)
│   │   ├── sql/constraints.sql  # Extra DB constraints/indexes
│   │   └── seed.ts              # Demo data (accounts, catalog, offers, prices)
│   └── src/
│       ├── app.ts               # Fastify assembly: plugins + routes + health
│       ├── server.ts            # Network binding / boot
│       ├── container.ts         # Composition root (Dependency Injection)
│       ├── config/              # Env parsing/validation
│       ├── common/              # Shared types, constants, permissions, errors, schemas, pagination
│       ├── database/            # Prisma client wrapper
│       ├── plugins/             # jwt, security, swagger, error-handler, request-context
│       ├── middleware/          # auth (authenticate/authorize), idempotency
│       ├── utils/               # decimal maths, order-number formatting
│       └── modules/             # One folder per business domain (see §9)
├── frontend/                    # Next.js multi-portal web app
│   └── src/
│       ├── app/                 # App Router pages (login, register, (app)/* portal pages)
│       ├── components/          # UI primitives, nav, auth-guard, portal provider
│       ├── hooks/               # React Query hooks (one file per domain)
│       └── lib/                 # api client, auth store, authz, portal config, types, format
├── docker-compose.yml
├── README.md / OVERVIEW.md / DATABASE.md / TECHNICAL-DETAILS.MD / RULES.md / SETUP.md
└── PROJECT-DOCUMENTATION.md     # (this file)
```

### Backend layering (strict, top → bottom)

```
HTTP request
  → route        (path, method, Zod schema, permission guard)
    → controller (parse req, call service, shape HTTP response)
      → service  (business rules, transactions, orchestration)
        → repository (Prisma queries only — no business logic)
          → Prisma → PostgreSQL
```

A layer may only call the layer directly beneath it. Services never touch
`request`/`reply`; they receive a typed `RequestContext`. Repositories never contain
business logic.

---

## 4. The four roles & RBAC

The spec's actors map to four internal roles (`backend/src/common/types.ts`):

| Spec actor | Internal role | What they do |
| --- | --- | --- |
| **Restaurant** | `RESTAURANT` | Browse approved catalog, build a cart, place orders, pay the advance + upload proof, cancel pre-acceptance. |
| **Vendor** | `VENDOR` | Submit/maintain price+stock **offers**, accept/reject assignments, advance fulfilment, view own performance. |
| **Administration** | `OPERATIONS` | Daily operations: review products & offers, verify payments, assign vendors, log calls, complete orders, monitor KPIs. |
| **Admin** | `ADMIN` | Highest authority — **all** permissions (creates the master catalog, can do everything Administration does). |

### Permission model

Permissions are `resource:action` strings defined once in
`backend/src/common/permissions.ts` and seeded into `role_permissions`. Route guards
reference the same constants, so **code and data can never drift**.

Key permission → role grants:

| Permission | RESTAURANT | VENDOR | OPERATIONS | ADMIN |
| --- | :--: | :--: | :--: | :--: |
| `product:view` | ✅ | ✅ | ✅ | ✅ |
| `product:create` / `:update` / `:delete` | | | | ✅ |
| `product:review` (status changes) | | | ✅ | ✅ |
| `offer:create` / `:update` | | ✅ | | ✅ |
| `offer:review` | | | ✅ | ✅ |
| `price:view` | ✅ | | ✅ | ✅ |
| `price:update` (set/override) | | | ✅ | ✅ |
| `cart:manage` | ✅ | | | ✅ |
| `order:create` | ✅ | | | ✅ |
| `order:view` | ✅ (own) | ✅ (assigned) | ✅ | ✅ |
| `order:update` (vendor fulfilment/respond) | | ✅ | ✅ | ✅ |
| `order:assign` | | | ✅ | ✅ |
| `order:review` (reject) | | | ✅ | ✅ |
| `order:complete` | | | ✅ | ✅ |
| `order:cancel` | ✅ | | ✅ | ✅ |
| `payment:submit` | ✅ | | | ✅ |
| `payment:verify` | | | ✅ | ✅ |
| `call:create` / `call:view` | | | ✅ | ✅ |
| `performance:view` | | ✅ (own) | ✅ | ✅ |
| `performance:rate` | | | ✅ | ✅ |
| `analytics:view` | | | ✅ | ✅ |

> The JWT carries the user's roles + resolved permissions and the active
> `vendorId` / `restaurantId`. The `authenticate` hook turns that into a
> `RequestContext`; services use `vendorId`/`restaurantId` for **ownership** checks
> (e.g. a vendor can only act on orders assigned to them).

---

## 5. Domain model (database)

The schema lives in `backend/prisma/schema.prisma`. Below are the tables that matter
most for the business flows (identity/RBAC tables omitted for brevity).

### Catalog & pricing

- **`Product`** — a master-catalog item. Owned by the platform. Has `sku`, `name`,
  `unit`, `brand`, `transportPercent`, and a lifecycle `status`
  (`DRAFT → UNDER_REVIEW → APPROVED → REJECTED / INACTIVE`).
- **`VendorProductOffer`** — a vendor's submission against a product: `vendorPrice`,
  `availableQuantity`, `reservedQuantity`, `status`
  (`PENDING → APPROVED → REJECTED / INACTIVE`), plus a `version` column for
  **optimistic locking**. One active offer per `(vendor, product)`.
- **`ProductPrice`** — append-only selling-price history. The current row
  (`isCurrent = true`) is what restaurants pay. Records whether it was an
  `isOverride`, the `averageVendorPrice`, and the `transportPercent` used.

### Cart & orders

- **`Cart` / `CartItem`** — one active cart per restaurant; items snapshot the price
  at add time and flag if the live price changed.
- **`Order`** — the heart of the system. Carries money fields (`subtotal`,
  `gstAmount`, `deliveryCharges`, `totalAmount`, `advancePercent`, `advanceAmount`,
  `remainingAmount`), the `assignedVendorId`, the lifecycle `status`, and a full set
  of lifecycle timestamps (`placedAt`, `paymentSubmittedAt`, `paymentVerifiedAt`,
  `reviewedAt`, `assignedAt`, `acceptedAt`, `readyAt`, `deliveredAt`, `completedAt`,
  `rejectedAt`, `cancelledAt`).
- **`OrderItem`** — line items, price/qty snapshotted at placement.
- **`OrderStatusHistory`** — append-only audit of every status transition.

### Money & vendor management

- **`Payment`** — advance/balance payments. Tracks `paymentType`, `amount`,
  `status` (`PENDING → SUBMITTED → VERIFIED / REJECTED …`), `proofUrl`,
  `transactionReference`, who submitted/verified, and timestamps.
- **`VendorCallLog`** — Administration ↔ vendor call records with a `CallOutcome`
  (`ACCEPTED / REJECTED / NO_RESPONSE / PARTIAL`).
- **`VendorPerformance`** — one scorecard row per vendor: counters
  (`totalAssigned/Accepted/Rejected/Completed/NoResponse`), `fulfilmentMinutesTotal`,
  `ratingSum`/`ratingCount`, with a `version` for optimistic locking.

### Platform plumbing

- **`Setting`** — typed key/value config (GST %, advance %, transport %, UPI id, QR
  url, delivery charges).
- **`OutboxEvent`** — transactional outbox: domain events written **in the same
  transaction** as the state change, for reliable downstream processing.
- **`AuditLog`** — who-did-what across sensitive actions.
- **`IdempotencyKey`** — dedupes unsafe POSTs (order placement, payment submission).
- **`Notification`**, `Ledger`/`LedgerEntry`, `Document`, identity tables, etc.

---

## 6. The business lifecycle (end to end)

This is the single most important section. Every step below maps to real code in
`backend/src/modules/orders/order.service.ts` and the related modules.

### 6.1 Catalog comes to life

1. **Admin creates a product** (`POST /products`) → status `DRAFT`.
2. **Vendors submit offers** (`POST /offers`) with their price + available stock →
   each offer is `PENDING`.
3. **Administration/Admin review offers** (`PATCH /offers/:id/review`) → `APPROVED`.
4. **Administration/Admin set the selling price** (`POST /products/:id/price`) —
   either accept the **computed** price (avg approved offer + transport markup) or
   **override** it. This writes a new current `ProductPrice` row.
5. **Admin approves the product** (`PATCH /products/:id/status` → `APPROVED`). Only
   `APPROVED` products with a current price appear in the restaurant storefront.

### 6.2 Order placement (Restaurant)

`POST /orders` (requires an `Idempotency-Key`). In **one transaction**
(`OrderService.placeOrder`):

- Reads the active cart; rejects if empty.
- For each item: verifies the product is still `APPROVED` and has a current price,
  snapshots `unitPrice`, and accumulates the subtotal.
- Computes `gstAmount` (default 5%), adds `deliveryCharges`, yields `totalAmount`.
- Computes `advanceAmount = 30% of total` and `remainingAmount`.
- Creates the `Order` in **`PENDING_PAYMENT`**, writes `OrderItem`s, appends the
  initial `OrderStatusHistory`, enqueues an `order.placed` outbox event, writes an
  audit log, and marks the cart `CHECKED_OUT`.

> No vendor is assigned and **no stock is reserved** yet — that only happens after
> payment is verified and Administration assigns a vendor.

### 6.3 Advance payment (Restaurant → Administration)

1. Restaurant pays the 30% advance via the displayed PhonePe/UPI QR, then
   **`POST /orders/:orderId/payments`** with the `proofUrl` (+ optional
   `transactionReference`). This creates a `Payment` in `SUBMITTED` and stamps
   `order.paymentSubmittedAt` (`OrderService.markPaymentSubmitted`). Duplicate open
   advances are blocked.
2. **Administration verifies** (`POST /payments/:id/verify`). Inside the verification
   transaction, `OrderService.markPaymentVerified` moves the order
   **`PENDING_PAYMENT → PAYMENT_RECEIVED → PENDING_ADMIN_REVIEW`** and records both
   transitions + an `order.payment_verified` outbox event.
   - Or **rejects** (`POST /payments/:id/reject`) with a reason; the restaurant can
     re-submit.

### 6.4 Review & vendor assignment (Administration)

`POST /orders/:id/assign` with a `vendorId` (`OrderService.assignVendor`):

- Validates the vendor is active.
- **Reserves stock** for every line item against that vendor's **approved** offer
  using optimistic locking (`reserveForVendor` → `OfferRepository.reserve`). If
  sellable stock is insufficient → `InsufficientStockError`; if a concurrent change
  is detected → `ConflictError` ("please retry").
- Increments the vendor's `totalAssigned` performance counter.
- Transitions the order to **`VENDOR_ASSIGNED`** and stamps `assignedAt`/`reviewedAt`.

Administration can also **log calls** to chase the vendor
(`POST /orders/:orderId/calls`); a `NO_RESPONSE` outcome bumps the vendor's
no-response counter.

### 6.5 Vendor response & fulfilment (Vendor)

- **`POST /orders/:id/respond`** with `accept: true|false`
  (`OrderService.vendorRespond`):
  - **Accept** → `VENDOR_ACCEPTED`, increments `totalAccepted`, stamps `acceptedAt`.
  - **Reject** → releases the reserved stock, increments `totalRejected`, and sends
    the order **back to `PENDING_ADMIN_REVIEW`** so Administration can re-assign.
- **`PATCH /orders/:id/fulfilment`** with the next status
  (`OrderService.updateFulfilment`): `VENDOR_ACCEPTED → PROCESSING →
  READY_FOR_DELIVERY → DELIVERED`, stamping `readyAt`/`deliveredAt` along the way.

### 6.6 Completion (Administration)

`POST /orders/:id/complete` (`OrderService.complete`):

- **Fulfils** the reserved stock (`fulfilForVendor` → decrements available &
  reserved permanently).
- Updates the vendor scorecard: `totalCompleted`, adds the **fulfilment time** (now −
  acceptedAt/assignedAt, in minutes), and applies an optional **1–5 rating**.
- Transitions the order to terminal **`COMPLETED`**.

### 6.7 Rejection & cancellation (with stock release)

- **`POST /orders/:id/reject`** (Administration) → terminal `REJECTED`; releases any
  reserved stock.
- **`POST /orders/:id/cancel`** — a **restaurant** may cancel only while
  `PENDING_PAYMENT`, `PAYMENT_RECEIVED`, or `PENDING_ADMIN_REVIEW`; Administration may
  cancel more broadly. Reserved stock is released.

### 6.8 The state machine

`OrderService` enforces a strict transition table (`ALLOWED_TRANSITIONS`); any illegal
move raises `OrderNotModifiableError`:

```
DRAFT              → PENDING_PAYMENT, CANCELLED
PENDING_PAYMENT    → PAYMENT_RECEIVED, CANCELLED
PAYMENT_RECEIVED   → PENDING_ADMIN_REVIEW, CANCELLED
PENDING_ADMIN_REVIEW → VENDOR_ASSIGNED, REJECTED, CANCELLED
VENDOR_ASSIGNED    → VENDOR_ACCEPTED, PENDING_ADMIN_REVIEW (vendor declined), REJECTED, CANCELLED
VENDOR_ACCEPTED    → PROCESSING, REJECTED, CANCELLED
PROCESSING         → READY_FOR_DELIVERY, CANCELLED
READY_FOR_DELIVERY → DELIVERED, CANCELLED
DELIVERED          → COMPLETED
COMPLETED          → (terminal)
REJECTED           → (terminal)
CANCELLED          → (terminal)
```

Reserved-stock statuses are `VENDOR_ASSIGNED`, `VENDOR_ACCEPTED`, `PROCESSING`,
`READY_FOR_DELIVERY` — rejection/cancellation in any of these releases stock.

---

## 7. Pricing, advance payment & performance maths

All money uses **Prisma `Decimal`** (never JS floats). Helpers live in
`backend/src/utils/decimal.ts`.

### Selling price (computed)

```
averageVendorPrice = mean(vendorPrice of APPROVED offers for the product)
computedPrice      = averageVendorPrice × (1 + transportPercent / 100)
```

- Default `transportPercent = 20%` (per product, configurable).
- `GET /products/:id/price-suggestion` returns `averageVendorPrice`, `transportPercent`,
  `computedPrice`, and the `currentPrice`.
- `POST /products/:id/price` with **no `price`** → accepts `computedPrice`; **with
  `price`** → stores an override. Either way it closes the current `ProductPrice` row
  and inserts a new current one (full history retained).

### Order totals & advance

```
subtotal       = Σ (unitPrice × quantity)
gstAmount      = (subtotal − discount) × GST%      (default 5%)
totalAmount    = subtotal − discount + gstAmount + deliveryCharges
advanceAmount  = totalAmount × advance%            (default 30%)
remainingAmount= totalAmount − advanceAmount
```

### Vendor performance (computed in the mapper, as percentages)

```
acceptanceRate = round(totalAccepted  / totalAssigned  × 100, 1dp)
completionRate = round(totalCompleted / totalAccepted  × 100, 1dp)
successRate    = round(totalCompleted / totalAssigned  × 100, 1dp)
avgFulfilment  = round(fulfilmentMinutesTotal / totalCompleted)   (minutes)
avgRating      = round(ratingSum / ratingCount, 1dp)              (1–5)
```

Defaults (overridable via `Setting`): GST 5%, advance 30%, transport 20%, currency INR.

---

## 8. Backend architecture

### 8.1 Composition root (`container.ts`)

There is **no global singleton or service locator**. `buildContainer()` instantiates
every repository, then every service (injecting the repositories + cross-cutting
services it needs), then every controller. `app.ts` calls `buildContainer()` once and
passes the controllers to the route registrars. This is textbook **dependency
injection**: services depend on constructor-injected abstractions, which makes them
trivially unit-testable (see the order service tests, which inject fakes).

### 8.2 Anatomy of a module

Every domain folder under `src/modules/<domain>/` follows the same shape:

| File | Responsibility |
| --- | --- |
| `*.routes.ts` | Declares paths, HTTP methods, Zod request/response schemas, tags, and `preHandler` guards (`authenticate` + `authorize(permission)`). |
| `*.controller.ts` | Thin HTTP adapter: reads params/body/query + `RequestContext`, calls the service, sends the response envelope. |
| `*.service.ts` | All business logic, transactions, orchestration, state machines. |
| `*.repository.ts` | Prisma queries only. Accepts an optional transaction executor. |
| `*.schemas.ts` | Zod schemas (the single source of truth for validation **and** OpenAPI). |
| `*.types.ts` | Prisma `include` shapes + DTO interfaces. |
| `*.mapper.ts` | Converts Prisma rows (with `Decimal`/relations) → flat JSON-safe DTOs. |

### 8.3 Standard response envelope

Success:

```json
{ "success": true, "data": { ... }, "meta": { "requestId": "…", "timestamp": "…", "pagination": { … } } }
```

Error:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "field": "…", "message": "…" } ] }, "meta": { … } }
```

A typed error hierarchy (`common/errors.ts`) — `ValidationError`, `NotFoundError`,
`ForbiddenError`, `ConflictError`, `InsufficientStockError`,
`OrderNotModifiableError`, `InternalError`, … — is translated into HTTP status codes +
this envelope by the global `error-handler` plugin.

---

## 9. Backend module catalog & API reference

All routes are mounted under the prefix **`/api/v1`**. Interactive docs: **`/docs`**.

### Identity & org
- **auth** — `POST /auth/register`, `/auth/login`, `/auth/logout`, refresh.
- **users**, **organizations**, **vendors**, **restaurants** — profile CRUD/listing.

### Catalog
- **categories** — category CRUD (`category:*`).
- **products** (master catalog)
  - `GET /products`, `GET /products/:id` — browse (`product:view`).
  - `POST /products` (`product:create`, Admin), `PATCH /products/:id`
    (`product:update`), `DELETE /products/:id` (`product:delete`).
  - `PATCH /products/:id/status` (`product:review`, Administration/Admin).
- **pricing**
  - `GET /products/:productId/price` (`price:view`).
  - `GET /products/:productId/price-suggestion` (`price:update`).
  - `GET /products/:productId/price-history` (`price:view`).
  - `POST /products/:productId/price` — set/override (`price:update`).
- **vendor-offers** (`/offers`)
  - `GET /offers`, `GET /offers/:id` (`offer:view`; vendors see only their own).
  - `POST /offers` (`offer:create`, Vendor — upsert per product).
  - `PATCH /offers/:id` (`offer:update`, Vendor — own price/stock).
  - `PATCH /offers/:id/review` (`offer:review`, Administration/Admin).

### Buying & fulfilment
- **cart** — `cart:manage` (Restaurant): get/add/update/remove items, clear.
- **orders**
  - `POST /orders` (`order:create`, **Idempotency-Key**) — place from cart.
  - `GET /orders`, `GET /orders/:id` (`order:view`, scoped to caller).
  - `POST /orders/:id/assign` (`order:assign`, Administration).
  - `POST /orders/:id/respond` (`order:update`, Vendor accept/reject).
  - `PATCH /orders/:id/fulfilment` (`order:update`, Vendor).
  - `POST /orders/:id/complete` (`order:complete`, Administration).
  - `POST /orders/:id/reject` (`order:review`, Administration).
  - `POST /orders/:id/cancel` (`order:cancel`, Restaurant pre-acceptance / Administration).
- **payments**
  - `POST /orders/:orderId/payments` (`payment:submit`, **Idempotency-Key**) — upload proof.
  - `GET /orders/:orderId/payments` (`payment:view`).
  - `GET /payments` (`payment:view`) — Administration verification queue.
  - `POST /payments/:id/verify` (`payment:verify`).
  - `POST /payments/:id/reject` (`payment:verify`).

### Vendor management & insight
- **vendor-calls**
  - `POST /orders/:orderId/calls` (`call:create`), `GET /orders/:orderId/calls`
    (`call:view`), `GET /vendor-calls` (`call:view`).
- **vendor-performance** (`/vendor-performance`)
  - `GET /vendor-performance` (`performance:view`) — scorecard list.
  - `GET /vendor-performance/:vendorId` (`performance:view`) — vendor own / staff any.
  - `POST /vendor-performance/:vendorId/rating` (`performance:rate`).
- **analytics**
  - `GET /analytics/dashboard` — role-scoped summary (any authenticated user).

### Platform
- **notifications**, **audit**, **settings**, plus **idempotency** (middleware) and the
  orders **outbox** (transactional event log).

---

## 10. Frontend architecture

A **single Next.js app** that is re-branded per deployment into four **portals** via
the `PORTAL` env var (`restaurant`, `vendor`, `admin`, `ops`). The same image runs on
different ports as different portals (see `frontend/src/lib/portal.ts`).

**Portal ↔ role enforcement.** Because every portal is the same app, `PortalGuard`
(`components/portal-guard.tsx`, wrapping the authenticated `(app)` layout) blocks
accounts that don't belong to the active portal — a Restaurant account cannot use the
Vendor portal (and vice-versa); Admin may also use the Operations portal. A mismatched
sign-in sees a "wrong portal" screen with a link to the correct one instead of another
role's UI. Self-service **registration** is likewise fixed to the portal's role
(Restaurant portal → buyer accounts, Vendor portal → seller accounts); staff accounts
are provisioned by an administrator. Default local ports: Restaurant `:3000`,
Admin `:3001`, Vendor `:3002`, Operations `:3003`.

### Key building blocks (`frontend/src/lib`)

- **`api.ts`** — typed fetch wrapper. Injects the bearer token, serializes query
  params, unwraps the success/error envelope into `ApiError`, exposes `apiRequest`
  (single) and `apiRequestPaginated` (list + pagination meta).
- **`auth-store.ts`** — Zustand store persisting `accessToken`, `user`, and the auth
  `context` (roles, permissions, `vendorId`, `restaurantId`).
- **`authz.ts`** — `useAuthz()` hook: the single source of truth for UI gating
  (`can(permission)`, `isAdmin/isStaff/isVendor/isRestaurant`). Mirrors backend
  permission keys.
- **`types.ts`** — TypeScript interfaces mirroring every backend DTO.
- **`format.ts`** — `formatMoney` (INR), `formatQuantity`, `formatDate`, `titleCase`.

### Data hooks (`frontend/src/hooks`) — one file per domain

`use-products`, `use-offers`, `use-orders`, `use-payments`, `use-calls`,
`use-performance`, `use-vendors`, `use-dashboard`, `use-cart`, `use-categories`,
`use-auth`. Each wraps React Query with consistent **query keys** and **cache
invalidation** (e.g. completing an order invalidates `['orders']`, `['order', id]`,
and `['dashboard']`).

### Pages (`frontend/src/app/(app)`) and who sees them

The nav (`components/nav.tsx`) renders links **by role + permission**, so each role sees
only what it can use (e.g. the buying storefront and cart appear only for restaurants;
vendors get "Pricing & Inventory"):

| Page | Audience | Purpose |
| --- | --- | --- |
| `/dashboard` | everyone | Role-scoped KPI metrics + orders-by-status. |
| `/products` | **Restaurant only** | Browse the approved catalog and add to cart. The storefront is guarded — vendors/staff get a notice (vendors price via Offers, staff manage via Catalog). |
| `/manage/products` (**Catalog**) | `product:create`/`product:review` (Admin/Administration) | Create products, edit details, change lifecycle status, set/override selling price (with live suggestion), review per-product vendor offers. |
| `/offers` (**Pricing & Inventory** for vendors) | Vendor (own) / `offer:review` (staff review queue) | Vendors select an approved product and set price + available quantity (inventory); staff approve/reject. |
| `/cart` | Restaurant | Review cart, see price-change flags, checkout. |
| `/orders` | everyone (scoped) | The lifecycle cockpit — see below. |
| `/payments` | `payment:verify` (Administration) | Verification queue: view proof, verify/reject. |
| `/vendors` | `performance:view` (staff) | Vendor scorecards + manual rating. |

#### The `/orders` page (role-aware cockpit)

A master/detail view. The detail panel adapts to the viewer:

- **Restaurant** — when `PENDING_PAYMENT`, an advance-payment form (amount shown,
  proof URL + reference) → submit proof; can cancel in early states.
- **Administration/Admin** — verify/reject submitted payments; **assign a vendor**
  (dropdown of active vendors) when in review; **log vendor calls**; **complete**
  delivered orders with an optional rating; **reject**.
- **Vendor** — accept/decline an assignment; advance fulfilment
  (processing → ready → delivered).
- Everyone sees items, totals (incl. advance/balance), payment history, and the full
  status history timeline.

---

## 11. Cross-cutting concerns

- **Authentication** (`plugins/jwt.ts`, `middleware/auth.ts`) — `authenticate`
  verifies the JWT and builds the `RequestContext`; `authorize(permission)` enforces
  RBAC at the route.
- **Validation & OpenAPI** — Zod schemas validate every request and serialize every
  response; the same schemas generate the Swagger spec, so docs never drift.
- **Idempotency** (`middleware/idempotency.ts` + `IdempotencyKey`) — unsafe POSTs
  (order placement, payment submission) require an `Idempotency-Key`; replays return
  the original result instead of double-acting.
- **Transactional outbox** (`OutboxEvent`) — domain events are written in the **same
  DB transaction** as the state change (order placed, payment verified, status
  changed, completed), guaranteeing at-least-once delivery to downstream consumers.
- **Optimistic locking** — `VendorProductOffer` and `VendorPerformance` carry a
  `version` column; concurrent stock reservations / counter updates that lose the race
  raise a `ConflictError` ("please retry") instead of corrupting data.
- **Soft deletes & append-only history** — `deletedAt` flags, append-only
  `ProductPrice` and `OrderStatusHistory`, and `AuditLog` keep a full trail.
- **Decimal money** — all monetary maths uses Prisma `Decimal` with explicit rounding.
- **Health probes** — `GET /` (info), `GET /health` (liveness), `GET /ready`
  (DB-backed readiness) for Docker/K8s/load balancers.

---

## 12. Running it locally

> Full instructions live in `SETUP.md`; this is the quick path.

### Prerequisites
- Node.js (LTS), npm, and either Docker (for Postgres) or a local PostgreSQL.

### Backend

```bash
cd backend
cp .env.example .env          # set DATABASE_URL + JWT secrets
npm install
npm run prisma:generate
npm run prisma:deploy         # apply migrations (or: npm run prisma:migrate in dev)
npm run db:constraints        # extra DB constraints/indexes
npm run db:seed               # demo accounts, catalog, offers, prices
# (npm run db:setup runs deploy + constraints + seed in one go)
npm run dev                   # API on http://localhost:4000 (docs at /docs)
```

### Frontend

```bash
cd frontend
npm install
# Run any/all portals (different ports):
npm run dev:restaurant   # http://localhost:3000
npm run dev:admin        # http://localhost:3001
npm run dev:vendor       # http://localhost:3002
npm run dev:ops          # http://localhost:3003
```

### Or everything via Docker

```bash
docker-compose up --build
```

### Demo accounts (seeded)

Password for all: **`Password123!`** (override with `SEED_DEMO_PASSWORD`).

| Email | Role |
| --- | --- |
| `admin@procurement.local` | ADMIN |
| `ops@procurement.local` | OPERATIONS (Administration) |
| `vendor@demo.local` | VENDOR — Demo Fresh Foods |
| `vendor2@demo.local` | VENDOR — Green Valley Supplies |
| `restaurant@demo.local` | RESTAURANT |

**Suggested demo run:** log in as the restaurant → add catalog items → checkout →
submit payment proof → log in as Administration (`ops`) → verify the payment → assign
`vendor@demo.local` → log in as that vendor → accept → advance to delivered → back as
Administration → complete with a 5★ rating → check the vendor scorecard on `/vendors`
and the `/dashboard` metrics.

---

## 13. Quality gates & testing

- **Type safety** — `npx tsc --noEmit` passes for both backend and frontend.
- **Lint** — backend ESLint and `next lint` are clean.
- **Unit tests** — backend uses **Vitest**; the order service is covered with injected
  fakes (empty-cart guard, placement → `PENDING_PAYMENT`, assignment failing when the
  vendor doesn't supply an item, state-machine transitions).
- **Build** — `next build` produces all portal routes successfully.
- **Schema** — `npx prisma validate` + generated client kept in sync with migrations.

Run them:

```bash
# backend
cd backend && npm run typecheck && npm run lint && npm test
# frontend
cd frontend && npm run typecheck && npm run lint && npm run build
```

---

## 14. How to extend the system

To add a new domain (say, `promotions`):

1. **Schema** — add the model(s) to `prisma/schema.prisma`; `npx prisma migrate dev`.
2. **Permissions** — add `promotion:*` keys to `common/permissions.ts` and grant them
   to roles in `ROLE_PERMISSIONS`.
3. **Module** — create `src/modules/promotions/` with the seven standard files
   (`schemas, types, mapper, repository, service, controller, routes`).
4. **Wire** — register the repo/service/controller in `container.ts` and call
   `registerPromotionRoutes` in `app.ts`; add a swagger tag.
5. **Frontend** — add DTO types in `lib/types.ts`, a `hooks/use-promotions.ts` React
   Query hook, a page under `app/(app)/`, and a permission-gated nav link.
6. **Tests** — add Vitest coverage for the service's rules.

Because every layer is consistent, new modules slot in without touching unrelated code.

---

## 15. Glossary

- **Master catalog** — the platform-owned set of `Product`s. Source of truth for what
  can be sold.
- **Offer** — a vendor's `vendorPrice` + `availableQuantity` for one master product.
- **Computed price** — average approved offer price × (1 + transport %).
- **Advance** — the 30% prepayment a restaurant must submit + have verified before
  fulfilment begins.
- **Assignment** — Administration choosing which vendor fulfils a paid order; reserves
  that vendor's stock.
- **Reserve / fulfil / release** — stock lifecycle: held at assignment, consumed at
  completion, returned on rejection/cancellation.
- **Scorecard** — a vendor's aggregated performance (`VendorPerformance`).
- **Outbox** — events stored transactionally with state changes for reliable delivery.
- **RequestContext** — the per-request, typed identity (user, roles, permissions,
  vendorId/restaurantId) services use for authorization and ownership.

---

*This document reflects the implemented codebase: a master-catalog procurement
platform with vendor offers, computed pricing, a 30% advance-payment gate, manual
vendor assignment with stock reservation, a strict order state machine, and vendor
performance tracking — exposed through a typed Fastify API and a permission-aware
multi-portal Next.js frontend.*
