# B2B Restaurant Procurement Platform

A production-grade B2B procurement platform that connects restaurants with vendors, enabling restaurants to discover products, place orders, and manage procurement while allowing vendors to manage inventory, pricing, and order fulfillment.

The platform is designed as a scalable foundation for future expansion into warehousing, logistics, farmer onboarding, quality inspection, procurement planning, and supply chain management.

---

# Documentation Map

Read these in order before writing any code. Together they are the binding contract for how this system is built.

| Document | What it defines |
|---|---|
| `README.md` (this file) | Product scope, architecture, tech stack, API & security standards, roadmap |
| `OVERVIEW.md` | Quick start, environments, glossary, repository layout |
| `RULES.md` | Engineering rules of engagement & the development workflow (human-readable) |
| `TECHNICAL-DETAILS.MD` | Deep implementation guide: layering, error handling, async, DI, module anatomy |
| `DATABASE.md` | Authoritative database schema, conventions, and transaction rules |
| `.cursor/rules/*.mdc` | The same standards encoded as always-on guidance for the AI agent |

If any document contradicts another, the precedence is: `DATABASE.md` (for data) and this `README.md` (for API/architecture) win; raise a PR to fix the inconsistency immediately.

---

# Vision

Build a modern procurement ecosystem similar to Hyperpure, starting with a focused MVP that solves the core problem:

**Restaurant → Vendor Ordering**

The initial version intentionally excludes:

* Supply Chain Tracking
* Farmer Portal
* Warehouse Management
* Logistics Tracking
* Procurement Forecasting

These modules will be added after validating product-market fit.

---

# Core User Roles

## Restaurant

Restaurant users can:

* Browse products
* Search and filter products
* Add products to cart
* Place orders
* Track order status
* Download invoices
* View order history
* Manage organization profile

---

## Vendor

Vendor users can:

* Manage product catalog
* Upload product images
* Manage inventory
* Manage pricing
* Accept or reject orders
* Update order statuses
* View sales analytics

---

## Operations Team

Operations users can:

* View all platform orders
* Monitor procurement activity
* Resolve disputes
* Contact restaurants and vendors
* Access operational dashboards

---

## Admin

Admin users can:

* Manage organizations
* Create and manage users
* Manage permissions
* Monitor platform health
* Access audit logs
* Manage master configurations

---

# Technology Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* ShadCN UI
* React Query (TanStack Query)
* Zustand

---

## Backend

* Node.js (LTS)
* Fastify
* TypeScript (strict mode)
* Prisma ORM
* Zod Validation (single source of truth for request/response schemas)
* JWT Authentication (`@fastify/jwt`) with refresh-token rotation
* Pino Logging (structured JSON, request correlation IDs)
* `@fastify/swagger` + `@fastify/swagger-ui` (auto-generated OpenAPI 3 docs)
* `@fastify/helmet` (security headers)
* `@fastify/cors` (controlled cross-origin access for web + mobile)
* `@fastify/rate-limit` (abuse protection)
* `@fastify/cookie` (refresh-token cookie handling)
* Vitest + Supertest (unit / integration testing)

---

## Database

* PostgreSQL 15+
* Prisma Migrate (forward-only, reviewed migrations)

---

## Infrastructure

* Docker
* Docker Compose
* AWS EC2
* AWS RDS
* AWS S3
* Redis (Future)

---

# High Level Architecture

The backend is a **single versioned API** consumed by many clients. The web app is just the first client; the contract is designed so mobile apps and partners plug into the *same* API without special-casing.

```text
  Next.js Web App     Admin Panel     Mobile App (future)     Partners (future)
        |                  |                  |                     |
        +------------------+--------+---------+---------------------+
                                    |
                                    v
                       Fastify Backend API (/api/v1)
              [ routes -> validation (Zod) -> services -> repositories ]
                                    |
                                    v
                                Prisma ORM
                                    |
                                    v
                                PostgreSQL
                                    |
                  +-----------------+------------------+
                  |                 |                  |
               AWS S3        Outbox Worker         Redis (Future:
            (files/images)  (email/WhatsApp/        cache, queues,
                             webhooks)              rate-limit store)
```

* **Thin routes, fat services, isolated data access** — see Key Design Principles and `TECHNICAL-DETAILS.MD`.
* The API never assumes a specific client; everything a client needs is in the documented contract.

---

# Key Design Principles

* SOLID Principles (see `TECHNICAL-DETAILS.MD` for concrete application)
* Clean / Layered Architecture: `route → controller → service → repository → Prisma`
* Domain Driven Design concepts (modules organized by business domain)
* Thin controllers — no business logic in route handlers
* Business logic lives in services; data access lives in repositories
* Repository Pattern (services never call Prisma directly)
* Dependency Injection (depend on interfaces/abstractions, not concretions)
* Type Safety end-to-end (strict TypeScript, Zod-validated boundaries)
* Explicit, structured error handling — no swallowed errors, no empty `catch`
* Correct `async/await` discipline — no floating promises
* Auditability, Scalability, Extensibility

---

# Core Modules

## Authentication Module

Features:

* Login
* Logout
* Refresh Token
* Password Reset
* Role-Based Authorization
* Session Management

---

## Organization Module

Supports:

* Restaurants
* Vendors
* Future Farmers
* Future Warehouses

Organizations are treated as first-class entities to support multiple users per organization.

---

## User Management Module

Features:

* User Creation
* User Invitations
* Role Assignment
* Profile Management
* Account Activation

---

## Product Module

Features:

* Product Creation
* Product Updates
* Product Images
* Product Categories
* Product Status Management

---

## Inventory Module

Features:

* Stock Management
* Stock Reservations
* Stock Tracking
* Inventory Auditing

---

## Pricing Module

Features:

* Price Management
* Historical Pricing
* Future Price Scheduling

---

## Cart Module

Features:

* Add to Cart
* Update Quantity
* Remove Items
* Cart Validation

---

## Order Module

Features:

* Order Creation
* Order Approval
* Order Status Updates
* Order History
* Order Tracking

---

## Notification Module

Features:

* In-App Notifications
* Email Notifications
* Future WhatsApp Integration

---

## Audit Module

Tracks:

* User Actions
* Order Changes
* Price Updates
* Inventory Changes
* Administrative Activities

---

# Database Architecture

The system follows a normalized relational database design using PostgreSQL.

Core entities:

```text
Organization
|
+-- OrganizationMember
|
+-- User

Vendor
|
+-- Product
      |
      +-- ProductPrice
      |
      +-- Inventory
      |
      +-- ProductImage

Restaurant
|
+-- Cart
|
+-- Order
      |
      +-- OrderItem
      |
      +-- OrderStatusHistory

Notification

AuditLog
```

---

# Project Structure

## Backend

```text
backend/
|
+-- src/
    |
    +-- modules/
    |   |
    |   +-- auth/
    |   +-- users/
    |   +-- organizations/
    |   +-- restaurants/
    |   +-- vendors/
    |   +-- products/
    |   +-- inventory/
    |   +-- pricing/
    |   +-- cart/
    |   +-- orders/
    |   +-- notifications/
    |   +-- audit/
    |
    +-- common/
    +-- config/
    +-- database/
    +-- plugins/
    +-- middleware/
    +-- utils/
```

---

## Frontend

```text
frontend/
|
+-- src/
    |
    +-- app/
    +-- components/
    +-- features/
    +-- hooks/
    +-- services/
    +-- store/
    +-- types/
    +-- utils/
```

---

# API Standards

These standards exist so that **multiple independent clients (web app, admin panel, future iOS/Android apps, partner integrations)** can rely on a stable, predictable, self-documenting contract.

## API Versioning  *(mandatory)*

Every route is namespaced under a version prefix. This lets us evolve the API without breaking already-shipped mobile apps that cannot be force-updated.

```http
/api/v1/products
/api/v2/products   <- introduced only for breaking changes
```

* `v1` is frozen once a mobile app ships against it. Breaking changes go in a new version.
* Additive, backwards-compatible changes (new optional field, new endpoint) stay within the current version.
* Deprecations are announced via the `Deprecation` and `Sunset` response headers before removal.

## RESTful Conventions

* Nouns, plural, lower-case, kebab where needed: `/api/v1/purchase-orders`.
* Use the right verbs: `GET` (read, safe), `POST` (create), `PATCH` (partial update), `PUT` (full replace, rare), `DELETE` (soft delete).
* Nest only one level deep; prefer query filters over deep nesting: `GET /api/v1/orders?vendorId=...` not `/vendors/:id/orders/:id/items`.

```http
GET    /api/v1/products
GET    /api/v1/products/:id
POST   /api/v1/products
PATCH  /api/v1/products/:id
DELETE /api/v1/products/:id
```

## OpenAPI / Swagger  *(mandatory)*

* The API is self-documenting via `@fastify/swagger`, generated from the Zod schemas — so docs can never drift from the code.
* Interactive docs served at `/docs`; the raw spec at `/docs/json`.
* The committed OpenAPI spec is the contract handed to frontend and mobile teams, and can generate typed client SDKs.

## Standard Response Envelope

Every response uses one consistent shape. Clients always parse the same structure.

**Success (single resource):**

```json
{
  "success": true,
  "data": { },
  "meta": { "requestId": "01J...", "timestamp": "2026-06-11T06:00:00Z" }
}
```

**Success (paginated list):**

```json
{
  "success": true,
  "data": [ ],
  "meta": {
    "requestId": "01J...",
    "timestamp": "2026-06-11T06:00:00Z",
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 137,
      "totalPages": 7,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": [
      { "field": "email", "message": "Invalid email address" }
    ]
  },
  "meta": { "requestId": "01J...", "timestamp": "2026-06-11T06:00:00Z" }
}
```

* `requestId` is the correlation ID (also returned in the `x-request-id` header) and appears in logs — make support/debugging trivial across clients.
* `details` is always an array (empty if not applicable) so clients never branch on its presence.

## HTTP Status Codes

| Code | When |
|---|---|
| 200 | Successful GET / PATCH / PUT |
| 201 | Resource created (POST) |
| 204 | Successful DELETE / no body |
| 400 | Malformed request |
| 401 | Missing / invalid authentication |
| 403 | Authenticated but not authorized (role/permission) |
| 404 | Resource not found (or soft-deleted) |
| 409 | Conflict (duplicate, version conflict, idempotency mismatch) |
| 422 | Validation failed |
| 429 | Rate limit exceeded |
| 500 | Unhandled server error (never leak internals) |

## Error Code Catalog

Stable, machine-readable `error.code` values. Clients (and mobile apps) switch on these, **not** on human messages (which may be localized later):

```text
VALIDATION_ERROR
UNAUTHENTICATED
TOKEN_EXPIRED
FORBIDDEN
NOT_FOUND
CONFLICT
DUPLICATE_RESOURCE
INSUFFICIENT_STOCK
ORDER_NOT_MODIFIABLE
IDEMPOTENCY_KEY_REUSED
RATE_LIMITED
INTERNAL_ERROR
```

This list is the canonical catalog; add new codes here in the same PR that introduces them.

## Pagination, Filtering, Sorting

* All list endpoints are paginated. Default `pageSize` 20, maximum 100 (see Performance Standards).
* Query params: `?page=1&pageSize=20&sort=-createdAt&status=ACTIVE`.
* `sort` uses `-` prefix for descending. Filtering is explicit per documented field.

## Idempotency  *(mandatory for non-idempotent writes)*

* `POST` endpoints that create money/inventory side effects (e.g. order creation, payments) require an `Idempotency-Key` header.
* The server stores the key + request hash (see `idempotency_keys` in `DATABASE.md`) and replays the original response on retry — so a mobile client on a flaky network can safely retry without creating duplicate orders.

## Dates, IDs, and Types

* All timestamps in responses are ISO-8601 UTC strings (`2026-06-11T06:00:00Z`).
* All IDs are UUID strings.
* Money is returned as a string-safe decimal (e.g. `"1499.00"`) with an explicit `currency` field — never a float — to avoid client-side rounding errors.

---

# Security Standards

## Authentication

* JWT Access Tokens
* Refresh Tokens
* Token Rotation

Access Token:

```text
15 Minutes
```

Refresh Token:

```text
30 Days
```

---

## Password Security

* bcrypt hashing
* Never store plaintext passwords
* Password strength validation

---

## Authorization

Supported roles:

```text
ADMIN
OPERATIONS
VENDOR
RESTAURANT
```

* Role-Based Access Control is mandatory and enforced in a central `preHandler` hook — never ad-hoc inside handlers.
* Authorization is checked on **every** protected route. Default-deny: a route is private unless explicitly marked public.
* Resource-level ownership is verified (a vendor can only mutate their own products; a restaurant can only see their own orders).

---

## Transport & Network Security

* **Helmet** sets secure HTTP headers on every response.
* **CORS** is configured with an explicit allow-list of origins (web app, admin, mobile web) — never `*` in production.
* **Rate limiting** is applied globally and tightened on auth endpoints (login, password reset) to blunt brute-force and abuse.
* HTTPS/TLS is terminated at the load balancer; the app trusts `X-Forwarded-*` only from the proxy.
* Refresh tokens are delivered as `HttpOnly`, `Secure`, `SameSite` cookies for web clients; mobile clients use secure device storage.

---

## Input Validation & Output Safety

* Every request body, query, and param is validated with **Zod** before reaching a handler. Reject-by-default; unknown fields are stripped.
* All identifiers are validated as UUIDs.
* Prisma parameterizes all queries (no string-concatenated SQL); raw SQL is forbidden unless reviewed and parameterized.
* Never reflect raw user input into errors or logs without sanitization.

---

## Secrets & Configuration

* **No secrets in the repository.** All config comes from environment variables, validated with Zod at startup; the app refuses to boot if required vars are missing or malformed.
* A committed `.env.example` documents every variable (without values).
* Secrets in production come from a secrets manager (e.g. AWS Secrets Manager / SSM), never plaintext `.env` files on servers.

---

# Performance Standards

## Pagination

Required on all list APIs.

Default:

```text
20 records
```

Maximum:

```text
100 records
```

---

## Database Indexing

Indexes required for:

* Email
* Phone
* Organization ID
* Vendor ID
* Restaurant ID
* Order ID
* Status
* Created At

---

# Logging & Observability

Uses Pino structured (JSON) logging.

Every request logs:

* Request ID (correlation ID, propagated to responses and downstream calls)
* User ID (when authenticated)
* Endpoint (method + route)
* Duration (ms)
* Status Code

Rules:

* **No `console.log` in production code.** Use the injected logger. (Enforced by lint + Cursor rules.)
* **Never log secrets or PII** — passwords, tokens, full card/bank data are redacted via Pino redaction paths.
* Log levels: `error` (actionable failure), `warn` (recoverable/degraded), `info` (lifecycle + requests), `debug` (local only).
* Errors are logged once, at the boundary, with the correlation ID and stack — not at every layer they bubble through.

---

# Operability

The service must be safe to run under Docker, AWS, and an orchestrator/load balancer.

## Health & Readiness

```http
GET /health   -> liveness:  process is up (no dependencies checked)
GET /ready    -> readiness: DB reachable, migrations applied, ready for traffic
```

## Graceful Shutdown

On `SIGTERM`/`SIGINT`: stop accepting new connections, drain in-flight requests, then close the Prisma connection pool and exit. No request is killed mid-flight during a deploy.

## Configuration

* 12-factor: all configuration via environment variables, validated at startup (fail fast).
* Differentiated config per environment: `local`, `test`, `staging`, `production`.

## Database Migrations

* Managed by **Prisma Migrate**, committed to source control, applied automatically on deploy.
* **Forward-only and reviewed.** Never `prisma db push` against staging/production.
* Schema changes follow expand → migrate → contract so a running app version (or a live mobile client) never breaks during a rollout.

---

# Testing Strategy

Required test layers (the "testing pyramid"):

* **Unit tests** — pure functions, services with mocked repositories. Fast, the majority of tests.
* **Repository / integration tests** — run against a real PostgreSQL test database (Docker), not mocks.
* **API integration tests** — boot the Fastify app in-memory (Supertest) and assert the full request → response contract, including the response envelope and status codes.
* **Critical-path E2E** — order creation, inventory reservation, auth flows.

Rules:

* Every bug fix ships with a regression test.
* Tests must be deterministic and isolated (each test seeds and tears down its own data; no shared mutable state).
* Transactions like order creation must have tests proving **rollback** on failure (no partial writes, no leaked inventory reservations).

Target:

```text
80%+ coverage on business-critical modules (orders, inventory, pricing, auth)
```

---

# Development Workflow

## Branch Naming

```text
feature/product-module
feature/order-module
bugfix/order-status
hotfix/payment-issue
```

---

## Commit Convention

```text
feat:
fix:
refactor:
docs:
test:
chore:
```

Examples:

```text
feat: add product creation endpoint

fix: resolve inventory deduction issue

refactor: optimize order service
```

---

# Future Roadmap

Phase 1

* Authentication
* Organizations
* Products
* Inventory
* Pricing
* Cart
* Orders

---

Phase 2

* Analytics
* Notifications
* Invoice Generation
* Advanced Search

---

Phase 3

* Online Payments
* Credit Ledger
* Procurement Reports
* Vendor Performance Tracking

---

Phase 4

* Farmer Portal
* Warehouse Management
* Logistics Tracking
* Quality Inspection
* Supply Chain Visibility

---

# Engineering Philosophy

This platform prioritizes:

* Scalability over shortcuts
* Maintainability over quick fixes
* Consistency over complexity
* Simplicity over premature optimization

Every feature should be built with future expansion in mind while keeping the current implementation clean, understandable, and production-ready.
