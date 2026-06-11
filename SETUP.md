# SETUP & CONFIGURATION

This is the **single source of truth** for everything you must fill in to run the
B2B Restaurant Procurement Platform. Work top-to-bottom. Anything you must provide
is marked **`<FILL_ME>`**.

> TL;DR: copy the two env files, paste your database URL, generate three secrets,
> then either run `docker compose up --build` (everything) or follow the manual
> steps. Demo logins are at the bottom.

---

## 0) What you must provide (checklist)

| # | Value | File | Variable | Required? | Where to get it |
|---|-------|------|----------|-----------|-----------------|
| 1 | PostgreSQL connection URL | `backend/.env` | `DATABASE_URL` | **Yes** | Your Postgres / cloud DB (e.g. Neon, Supabase, AWS RDS) — or the bundled Docker DB |
| 2 | JWT access secret | `backend/.env` | `JWT_ACCESS_SECRET` | **Yes** | Generate (≥32 chars) — see below |
| 3 | JWT refresh secret | `backend/.env` | `JWT_REFRESH_SECRET` | **Yes** | Generate (≥32 chars) |
| 4 | Cookie signing secret | `backend/.env` | `COOKIE_SECRET` | **Yes** | Generate (≥32 chars) |
| 5 | Allowed CORS origins | `backend/.env` | `CORS_ORIGINS` | **Yes** | Your frontend URL(s), comma-separated |
| 6 | Frontend → API base URL | `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | **Yes** | URL where the backend is reachable from the browser |
| 7 | S3 region/bucket/keys | `backend/.env` | `AWS_*`, `S3_PUBLIC_BASE_URL` | Optional | Only if you wire image uploads later |
| 8 | Demo seed password | `backend/.env` | `SEED_DEMO_PASSWORD` | Optional | Defaults to `Password123!` |

Generate the three secrets (run three times, paste each):

```bash
openssl rand -base64 48
```

---

## 1) Prerequisites

- **Node.js ≥ 20** and **npm** (only for the manual / non-Docker path)
- **Docker + Docker Compose** (for the one-command path)
- **PostgreSQL 15+** (only if you are NOT using the bundled Docker database)

---

## 2) Configure the backend

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and set:

### `DATABASE_URL` (item #1)
Pick ONE:

- **Bundled Docker DB** (default — already matches `docker-compose.yml`):
  ```
  DATABASE_URL=postgresql://procurement:procurement@localhost:5432/procurement?schema=public
  ```
  > Inside Docker Compose the host is `db`, not `localhost`. Compose injects the
  > correct value automatically, so you can leave the localhost value for local runs.

- **Your own / cloud Postgres** (Neon, Supabase, RDS, …):
  ```
  DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public&sslmode=require
  ```
  Most managed providers require `sslmode=require`.

### Secrets (items #2–#4)
```
JWT_ACCESS_SECRET=<FILL_ME>      # openssl rand -base64 48
JWT_REFRESH_SECRET=<FILL_ME>     # openssl rand -base64 48
COOKIE_SECRET=<FILL_ME>          # openssl rand -base64 48
```

### CORS (item #5)
```
CORS_ORIGINS=http://localhost:3000
```
Add every origin that will call the API, comma-separated. **Never use `*` in production.**

### Optional — S3 uploads (item #7)
Leave blank unless/until you wire file uploads:
```
AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=
```

The backend **validates env at boot and refuses to start** if a required value is
missing or malformed (fail-fast). The full list of variables with inline docs is
in [`backend/.env.example`](backend/.env.example).

---

## 3) Configure the frontend

```bash
cd frontend
cp .env.example .env.local
```

Set (item #6):
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```
This is the URL the **browser** uses to reach the API. In Docker Compose it stays
`http://localhost:4000` because the backend port is published to your host.

---

## 4) Run it

### Option A — Docker (recommended, one command)

From the repository root:

```bash
docker compose up --build
```

This will, in order:
1. start **Postgres** and wait until healthy,
2. run the **migrate** one-shot (applies migrations → raw SQL constraints → seed),
3. start the **backend** on http://localhost:4000,
4. start **four role portals** (same image, different `PORTAL` env), one per port:
   - Restaurant → http://localhost:3000
   - Admin      → http://localhost:3001
   - Vendor     → http://localhost:3002
   - Operations → http://localhost:3003

> Each portal is a separate origin, so log in on each one independently — you can
> be a restaurant on :3000 and a vendor on :3002 **at the same time** and drive a
> full order back-and-forth. See [§7 Portals](#7-portals-multiple-roles-at-once).

> Compose reads `backend/.env`. You can tune ports/credentials with a root `.env`
> (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `BACKEND_PORT`,
> `RESTAURANT_PORT`, `ADMIN_PORT`, `VENDOR_PORT`, `OPS_PORT`).

### Option B — Manual (no Docker)

You need a running Postgres and a valid `DATABASE_URL`.

```bash
# 1. Backend
cd backend
npm install
npm run prisma:generate         # generate the Prisma client
npm run prisma:deploy           # apply migrations  (creates all tables/enums)
npm run db:constraints          # apply partial indexes, CHECK constraints, audit FKs, sequences
npm run db:seed                 # roles, permissions, payment methods, settings + demo data
npm run dev                     # API on http://localhost:4000  (Swagger at /docs)

# 2. Frontend (second terminal) — pick the portal you want
cd frontend
npm install
npm run dev                     # restaurant portal on http://localhost:3000

# Or run several portals at once, each in its own terminal:
npm run dev:restaurant          # http://localhost:3000
npm run dev:admin               # http://localhost:3001
npm run dev:vendor              # http://localhost:3002
npm run dev:ops                 # http://localhost:3003
```

> First time only: the initial migration lives in
> `backend/prisma/migrations/0_init`. If you change `schema.prisma` later, create a
> new migration with `npm run prisma:migrate -- --name <change>`.

There is also a convenience target that does deploy + constraints + seed in one go:
```bash
npm run db:setup
```

---

## 5) Verify

- API health: http://localhost:4000/health → `{ "status": "ok" }`
- API readiness (checks DB): http://localhost:4000/ready → `{ "status": "ready" }`
- API docs (OpenAPI/Swagger UI): http://localhost:4000/docs
- Restaurant portal: http://localhost:3000
- Admin portal: http://localhost:3001
- Vendor portal: http://localhost:3002
- Operations portal: http://localhost:3003

---

## 6) Demo credentials (created by the seed)

All demo accounts share the same password: **`Password123!`**
(or whatever you set in `SEED_DEMO_PASSWORD`).

| Role | Email |
|------|-------|
| Admin | `admin@procurement.local` |
| Operations | `ops@procurement.local` |
| Vendor | `vendor@demo.local` |
| Restaurant | `restaurant@demo.local` |

The seed also creates demo categories and products under the demo vendor, so the
restaurant account can immediately browse, add to cart, and place an order.

---

## 7) Portals (multiple roles at once)

The web app is shipped as **one image** that is branded for a single role at
runtime via the `PORTAL` env var. Docker Compose starts four instances so each
role gets its own port:

| Portal      | Port | `PORTAL` value | Pre-filled demo login        |
|-------------|------|----------------|------------------------------|
| Restaurant  | 3000 | `restaurant`   | `restaurant@demo.local`      |
| Admin       | 3001 | `admin`        | `admin@procurement.local`    |
| Vendor      | 3002 | `vendor`       | `vendor@demo.local`          |
| Operations  | 3003 | `ops`          | `ops@procurement.local`      |

**Why ports (not just tabs):** your login token is stored per-origin in the
browser. Different ports = different origins = independent sessions, so you can be
signed in as **all four roles at the same time**. Server data (catalog, carts,
orders) lives in the backend DB and is shared across every portal.

**Typical end-to-end demo:**
1. On **:3000** (Restaurant) browse Products → add to cart → place an order.
2. On **:3002** (Vendor) open Orders → accept / advance the order's status.
3. Watch the order update on **:3000** when you refresh — same backend, same data.

> The role-specific UI (e.g. Cart only for restaurants, status controls for
> vendors) is driven by **who you log in as**, not by the port — the port just
> brands the portal and pre-fills the matching demo account. You can log into any
> portal with any account.

To change a port without touching compose, set it in a root `.env`:
`RESTAURANT_PORT`, `ADMIN_PORT`, `VENDOR_PORT`, `OPS_PORT`.

---

## 8) Production notes

- Put real secrets in a secrets manager — never commit `.env`.
- Set `NODE_ENV=production`, a strict `CORS_ORIGINS` allow-list, and consider
  `SWAGGER_ENABLED=false`.
- Cookies become `Secure` + `SameSite=None` automatically in production, so the API
  must be served over HTTPS.
- Run the backend behind a reverse proxy / load balancer; `/health` and `/ready`
  are provided for probes.
