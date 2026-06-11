# Project Overview

A quick orientation for any engineer (or AI agent) joining the **B2B Restaurant Procurement Platform**. Read this first, then `RULES.md`, `TECHNICAL-DETAILS.MD`, and `DATABASE.md`.

---

## What We Are Building

A production-grade B2B procurement platform connecting **restaurants** (buyers) with **vendors** (suppliers). Restaurants discover products, build carts, and place orders; vendors manage catalog, pricing, inventory, and fulfilment; an **operations** team monitors activity and resolves disputes; **admins** manage the platform.

The MVP solves one core loop — **Restaurant → Vendor ordering** — on a foundation explicitly designed to grow into warehousing, logistics, farmers, payments, credit, and supply chain (new tables/modules only, never rewrites).

---

## Architecture at a Glance

```text
Clients (web now; admin, mobile, partners later)
        |  HTTPS, JSON, /api/v1
        v
Fastify API  ──  route → controller → service → repository → Prisma → PostgreSQL
                                                  |
                                       AWS S3 (files) · Outbox worker · Redis (future)
```

* **One versioned API** serves every client. The web app has no privileges a future mobile app won't also have through the same documented contract.
* **Layered architecture** with strict boundaries. Business rules live in services; data access lives in repositories. See `TECHNICAL-DETAILS.MD`.

---

## Repository Layout

This is a two-app workspace (monorepo-style):

```text
Wholesale_eCommerce-/
├── README.md              # Product, architecture, API & security standards
├── OVERVIEW.md            # This file
├── RULES.md               # Engineering rules & development workflow
├── TECHNICAL-DETAILS.MD   # Deep implementation guide
├── DATABASE.md            # Authoritative DB schema & conventions
├── .cursor/rules/         # AI agent guidance (mirrors the docs)
├── backend/               # Fastify + TypeScript + Prisma API
│   └── src/
│       ├── modules/       # Domain modules (auth, users, orders, …)
│       ├── common/        # Shared errors, response helpers, types
│       ├── config/        # Env loading & validation
│       ├── database/      # Prisma client, base repository
│       ├── plugins/       # Fastify plugins (auth, swagger, etc.)
│       ├── middleware/     # Hooks (auth, RBAC, request context)
│       └── utils/
└── frontend/              # Next.js + React + TypeScript web app
    └── src/
        ├── app/           # App Router routes
        ├── components/    # Reusable UI (ShadCN-based)
        ├── features/      # Feature modules (mirror backend domains)
        ├── hooks/
        ├── services/      # Typed API client
        ├── store/         # Zustand stores
        ├── types/
        └── utils/
```

> The actual scaffolding is created in the implementation phase. This layout is the agreed target.

---

## Environments

| Environment | Purpose | Database | Notes |
|---|---|---|---|
| `local` | Day-to-day development | Local Postgres (Docker) | Hot reload, seed data |
| `test` | Automated tests | Ephemeral Postgres (Docker) | Reset per run |
| `staging` | Pre-production verification | AWS RDS (staging) | Mirrors production config |
| `production` | Live | AWS RDS (production) | Secrets from AWS Secrets Manager |

All configuration is supplied via environment variables and validated at startup. Nothing environment-specific is hardcoded.

---

## Local Development (target flow)

> Commands are the intended workflow; exact scripts are finalized during implementation.

1. **Prerequisites:** Node.js LTS, Docker, pnpm (or npm).
2. **Start infra:** `docker compose up -d` (PostgreSQL, and later Redis/S3-compatible storage).
3. **Backend:**
   - Copy `backend/.env.example` → `backend/.env`.
   - Install deps, run `prisma migrate dev`, seed reference data.
   - Start the API; open `/docs` for Swagger UI.
4. **Frontend:**
   - Copy `frontend/.env.example` → `frontend/.env.local`.
   - Install deps and start the Next.js dev server.
5. **Verify:** hit `GET /health` and `GET /ready`; the Swagger UI lists all `/api/v1` routes.

---

## Glossary

| Term | Meaning |
|---|---|
| **Organization** | A business entity (restaurant, vendor, and later farmer/warehouse). The durable owner of business data. |
| **Organization Member** | A user's membership/role within an organization. |
| **Restaurant** | A buyer organization placing orders. |
| **Vendor** | A supplier organization managing catalog, pricing, inventory, and fulfilment. |
| **Operations** | Internal staff monitoring orders and resolving disputes. |
| **Admin** | Internal staff managing organizations, users, permissions, and configuration. |
| **Product** | A sellable item owned by a vendor. |
| **SKU** | A vendor's stock-keeping unit; unique per vendor. |
| **Inventory** | On-hand stock for a product. `sellable = available − reserved`. |
| **Reservation** | Stock committed to an open order but not yet shipped. |
| **Cart** | A restaurant's in-progress selection before checkout. |
| **Order** | An immutable snapshot of a purchase from one vendor. |
| **Order Item** | A line in an order; a frozen snapshot of product + price at order time. |
| **Ledger** | (Future) A running credit balance per organization. |
| **Outbox** | Durable event log written in the same transaction as a business change, published asynchronously. |
| **Idempotency Key** | Client-supplied header that makes a retried write safe (no duplicate orders). |
| **Soft delete** | Marking a row `deleted_at` instead of physically removing it. |

---

## Roadmap (summary)

* **Phase 1 (MVP):** Auth, Organizations, Products, Inventory, Pricing, Cart, Orders.
* **Phase 2:** Analytics, Notifications, Invoices, Advanced search.
* **Phase 3:** Payments, Credit ledger, Procurement reports, Vendor performance.
* **Phase 4:** Farmer portal, Warehousing, Logistics, Quality inspection, Supply chain visibility.

Full detail in `README.md` → Future Roadmap.
