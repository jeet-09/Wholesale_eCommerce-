# Project Code Understanding — From Button Click to Database and Back

> **Who this is for:** anyone who needs to *debug* this platform. After reading
> this you should be able to take any symptom ("the Add-to-cart button does
> nothing", "vendor gets a 403", "order stuck in `PENDING_PAYMENT`") and walk
> straight to the exact file, layer, and line where the problem lives.
>
> This is the **flow + patterns** companion to the other docs:
> - `PROJECT-DOCUMENTATION.md` — what the product is and the domain model.
> - `TECHNICAL-DETAILS.MD` — the rules/standards each layer must follow.
> - `DATABASE.md` — the schema and data-integrity constraints.
> - `SETUP.md` — how to run it locally.

---

## Table of contents

1. [The 30-second mental model](#1-the-30-second-mental-model)
2. [Tech stack & where each thing runs](#2-tech-stack--where-each-thing-runs)
3. [Repository map (every folder, what lives there)](#3-repository-map-every-folder-what-lives-there)
4. [The backend request pipeline (the conveyor belt)](#4-the-backend-request-pipeline-the-conveyor-belt)
5. [The layered architecture (route → controller → service → repository → Prisma)](#5-the-layered-architecture-route--controller--service--repository--prisma)
6. [Cross-cutting patterns (and how to debug each)](#6-cross-cutting-patterns-and-how-to-debug-each)
7. [The frontend request pipeline (entry → page → hook → API client)](#7-the-frontend-request-pipeline-entry--page--hook--api-client)
8. [End-to-end traces: click → DB → screen](#8-end-to-end-traces-click--db--screen)
9. [Where the routes differ (the role divergence table)](#9-where-the-routes-differ-the-role-divergence-table)
10. [Entry points & per-role journeys (the "portals" question)](#10-entry-points--per-role-journeys-the-portals-question)
11. [Debugging playbook (symptom → layer → file)](#11-debugging-playbook-symptom--layer--file)
12. [Quick reference (codes, statuses, env, commands)](#12-quick-reference-codes-statuses-env-commands)

---

## 1. The 30-second mental model

There is **one frontend** (Next.js, `http://localhost:3000`) and **one backend**
(Fastify, `http://localhost:4000`). Every screen for every role is served by the
same app; every API call for every role hits the same `/api/v1/*` routes. What
makes a "Restaurant" experience different from a "Vendor" experience is **not a
different app or port** — it is:

- **on the frontend:** which nav links and buttons render (`useAuthz()`), and
- **on the backend:** which permission a route requires (`app.authorize(...)`)
  and how the service *scopes* the query/mutation to your `vendorId` /
  `restaurantId` (or lets privileged staff act across everyone).

```
 BROWSER (one app, role-aware UI)                 SERVER (one API, role-scoped)
┌──────────────────────────────┐                 ┌───────────────────────────────────────┐
│ page.tsx (button onClick)    │                 │ plugins  → authenticate → authorize     │
│   └─ hook (React Query)       │   HTTP + JWT    │   → idempotent (writes) → controller     │
│       └─ lib/api.ts  ─────────┼───────────────► │     → service (business rules + tx)      │
│           (adds Bearer token, │   JSON envelope │       → repository (ONLY Prisma caller)  │
│            Idempotency-Key)   │ ◄───────────────┼─────────── PostgreSQL (Prisma)           │
└──────────────────────────────┘                 └───────────────────────────────────────┘
```

Two golden rules that explain 90% of the code:

1. **Repositories are the only layer that touches Prisma.** Services orchestrate;
   controllers translate HTTP↔service; routes declare contracts + guards.
2. **Every response is the same envelope.** Success → `{ success:true, data, meta }`.
   Failure → `{ success:false, error:{code,message,details}, meta }`. Handlers
   never hand-roll JSON, and they never format errors — they *throw* typed errors
   and one global handler does the rest.

---

## 2. Tech stack & where each thing runs

| Concern | Backend | Frontend |
|---|---|---|
| Language | TypeScript (strict) | TypeScript (strict) |
| Runtime/framework | Node.js + **Fastify** | **Next.js** (App Router) + React |
| Data | **PostgreSQL** via **Prisma** | — (talks to API only) |
| Validation | **Zod** (`fastify-type-provider-zod`) | TS types mirrored from API |
| AuthN | JWT access token + HttpOnly refresh cookie | token in `zustand` store |
| AuthZ | permission strings on each route | `useAuthz()` gating |
| Server state | — | **TanStack React Query** |
| Styling | — | Tailwind CSS |
| Default URL | `http://localhost:4000` (`/api/v1`, `/docs`) | `http://localhost:3000` |

The frontend learns the API base from `NEXT_PUBLIC_API_URL` and always appends
`/api/v1`:

```ts
// frontend/src/lib/api.ts (lines 4–5)
const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const API_BASE = `${API_ROOT}/api/v1`;
```

---

## 3. Repository map (every folder, what lives there)

### 3.1 Backend — `backend/src/`

```
backend/src/
├── server.ts                 # PROCESS ENTRY POINT. Loads env, connects Prisma, listens, graceful shutdown.
├── app.ts                    # buildApp(): registers plugins + routes. Reused by tests (no network bind).
├── container.ts              # COMPOSITION ROOT (DI). The ONLY place concrete classes are wired together.
│
├── config/
│   └── env.ts                # Zod-validated environment. Boot fails fast on a bad/missing var.
│
├── common/                   # Cross-cutting building blocks (no business logic)
│   ├── constants.ts          # API_PREFIX (/api/v1), header names, default %s, setting keys, outbox event names.
│   ├── errors.ts             # Typed AppError hierarchy + ERROR_CODES. Business code throws these.
│   ├── responses.ts          # ok() / paginated() / fail() envelope builders.
│   ├── schemas.ts            # successEnvelope(), paginatedEnvelope(), commonErrorResponses, uuidParamSchema.
│   ├── pagination.ts         # parseSort(), toPaginationArgs(), buildPaginationMeta().
│   ├── permissions.ts        # RBAC CATALOG: every "<resource>:<action>" + role→permissions map.
│   ├── authz.ts              # isPrivileged/isAdmin + requireVendorId/requireRestaurantId + assert*Access.
│   ├── http.ts               # getRequestContext(request): pull the authed context inside a controller.
│   └── types.ts              # ROLES, RequestContext (the per-request identity object), ListResult.
│
├── database/
│   ├── prisma.ts             # PrismaClient singleton + Database / PrismaExecutor types.
│   └── base.repository.ts    # BaseRepository: exec(tx) + notDeleted soft-delete helper.
│
├── plugins/                  # Fastify plugins (registered in app.ts, order matters)
│   ├── error-handler.ts      # GLOBAL error handler: every throw → correct status + envelope.
│   ├── request-context.ts    # x-request-id header + one structured access log per request.
│   ├── security.ts           # helmet, CORS, rate limit (registered with env).
│   ├── swagger.ts            # OpenAPI generation + /docs UI from the Zod schemas.
│   └── jwt.ts                # @fastify/jwt + @fastify/cookie (sign/verify access token).
│
├── middleware/               # Cross-cutting *route guards* (decorators)
│   ├── auth.ts               # app.authenticate (verify JWT + load ctx) and app.authorize(permission).
│   └── idempotency.ts        # app.idempotent() for safe write retries.
│
├── types/
│   └── fastify.d.ts          # Module augmentation: request.ctx, app.authenticate, app.idempotent, etc.
│
├── utils/                    # Pure, framework-free helpers (unit-tested)
│   ├── decimal.ts            # Money math: lineSubtotal, orderTotal, percentOf, sellableQuantity.
│   ├── password.ts           # BcryptPasswordHasher.
│   ├── crypto.ts             # hashRequestPayload (idempotency fingerprint), token hashing.
│   ├── order-number.ts       # formatOrderNumber(seq, year).
│   ├── duration.ts / slug.ts # misc helpers.
│
└── modules/                  # ONE folder per business domain. Same shape every time.
    ├── auth/                 # login/register/refresh/logout/me + AuthContextService (builds RequestContext).
    ├── users/                # users + roles (role.repository.ts).
    ├── organizations/        # orgs, members, addresses.
    ├── vendors/              # vendor profiles.
    ├── restaurants/          # restaurant profiles.
    ├── categories/           # product categories.
    ├── products/             # MASTER catalog (Admin-owned). product.mapper.ts builds the DTO.
    ├── pricing/              # selling price (avg of offers + transport markup, admin override).
    ├── vendor-offers/        # vendor price/stock offers. offer.repository.ts = optimistic-lock stock.
    ├── cart/                 # restaurant cart.
    ├── orders/               # THE BIG ONE: order lifecycle state machine + outbox.repository.ts.
    ├── payments/             # 30% advance: submit proof + verify/reject (calls into OrderService).
    ├── vendor-performance/   # scorecards (assigned/accepted/completed, ratings, fulfilment time).
    ├── vendor-calls/         # Administration↔Vendor call logs.
    ├── analytics/            # role-scoped dashboard summaries.
    ├── notifications/        # in-app notifications.
    ├── settings/             # key/value platform settings (GST %, advance %, delivery charges).
    ├── audit/                # append-only audit trail (audit.service.record()).
    └── idempotency/          # persistence backend for the idempotency guard.
```

**Anatomy of a module** (memorize this — every module is the same):

| File | Responsibility | May import |
|---|---|---|
| `*.routes.ts` | Declare HTTP method + path + Zod schema + **permission guard** + which controller method | controller (type), schemas, permissions |
| `*.controller.ts` | Translate HTTP ↔ service. Read `params/body/query/ctx`, call service, wrap in `ok()/paginated()` | service (type), responses, http |
| `*.service.ts` | **Business rules**, transactions, authorization decisions, orchestration | repositories (types), other services, errors, utils |
| `*.repository.ts` | **Only** place that calls Prisma. CRUD + queries | `database/*`, prisma types |
| `*.schemas.ts` | Zod request/response schemas → also feed OpenAPI | zod |
| `*.mapper.ts` | DB row (with `Prisma.Decimal`, relations) → clean JSON DTO | prisma types |
| `*.types.ts` | DTOs, `include` shapes, internal types | prisma types |

### 3.2 Frontend — `frontend/src/`

```
frontend/src/
├── app/
│   ├── layout.tsx                 # Root layout: fonts, <Providers>. (Portal-agnostic.)
│   ├── providers.tsx              # QueryClientProvider (React Query).
│   ├── page.tsx                   # "/" → redirect to /dashboard (if token) or /login.
│   ├── login/page.tsx             # Public. Calls useLogin().
│   ├── register/page.tsx          # Public. Account-type dropdown (RESTAURANT/VENDOR) → useRegister().
│   └── (app)/                     # AUTHENTICATED AREA (route group). layout wraps these in AuthGuard + Nav.
│       ├── layout.tsx             # <AuthGuard><Nav/>{children}</AuthGuard>
│       ├── dashboard/page.tsx     # Role-scoped metrics (useDashboard()).
│       ├── products/page.tsx      # Restaurant storefront (browse + Add to cart).
│       ├── cart/page.tsx          # Restaurant cart + Place order.
│       ├── orders/page.tsx        # Role-aware order lifecycle actions.
│       ├── offers/page.tsx        # Vendor "Pricing & Inventory"; staff offer review.
│       ├── payments/page.tsx      # Administration payment-verification queue.
│       ├── vendors/page.tsx       # Vendor performance scorecards.
│       └── manage/products/page.tsx # Admin/Ops master-catalog manager.
│
├── components/
│   ├── auth-guard.tsx             # Redirects to /login if no token (after store hydration).
│   ├── nav.tsx                    # Role-based nav links + role badge.
│   └── ui/                        # button.tsx, input.tsx, card.tsx (presentational).
│
├── hooks/                         # ONE React Query hook file per domain. The bridge UI→API.
│   ├── use-auth.ts                # useLogin/useRegister/useLogout.
│   ├── use-products.ts use-cart.ts use-orders.ts use-offers.ts
│   ├── use-payments.ts use-performance.ts use-calls.ts use-vendors.ts
│   ├── use-categories.ts use-dashboard.ts
│
└── lib/
    ├── api.ts                     # THE HTTP CLIENT. token, refresh-on-401, envelope unwrap, idempotency.
    ├── auth-store.ts              # zustand (persisted): accessToken, user, context.
    ├── authz.ts                   # useAuthz(): isAdmin/isStaff/isVendor/isRestaurant + can(permission).
    ├── types.ts                   # TS types mirrored from the API DTOs.
    ├── format.ts                  # formatMoney/formatQuantity/titleCase.
    └── cn.ts                      # className combiner.
```

---

## 4. The backend request pipeline (the conveyor belt)

The whole server is assembled in **one function**, `buildApp()`. This is the file
to open first when "a request isn't even reaching my handler".

```ts
// backend/src/app.ts (lines 79–122) — assembly order MATTERS
await app.register(errorHandlerPlugin);     // 1. catches everything thrown later
await app.register(requestContextPlugin);   // 2. x-request-id + access log
await app.register(securityPlugin, { env });// 3. helmet, CORS, rate limit
await app.register(swaggerPlugin, { env }); // 4. /docs
await app.register(jwtPlugin, { env });     // 5. decorates request.jwtVerify()

const container = buildContainer({ db, env, logger: app.log, signer: {...} });

await app.register(authPlugin, { loader: container.authContextLoader }); // 6. authenticate/authorize
await app.register(idempotencyPlugin, { store: container.idempotencyStore }); // 7. idempotent()

registerHealthRoutes(app, db);              // GET / /health /ready (NO auth)

await app.register(async (api) => {         // 8. all domain routes under /api/v1
  const c = container.controllers;
  registerAuthRoutes(api, c.auth, { authRateLimitMax: env.AUTH_RATE_LIMIT_MAX });
  registerOrderRoutes(api, c.orders);
  // ...one register*Routes per module...
}, { prefix: API_PREFIX });
```

**Per-request order of operations** for a protected write like
`POST /api/v1/orders`:

```
onRequest: request-context sets x-request-id
   │
   ▼
preHandler chain (declared on the route):
   app.authenticate ──► verify JWT, load fresh RequestContext into request.ctx
   app.authorize('order:create') ──► 403 unless ctx.permissions includes it
   app.idempotent() ──► first call: record key IN_PROGRESS; retry: replay cached response
   │
   ▼
controller.place ──► service.placeOrder(ctx, body) ──► repositories ──► Postgres
   │
   ▼
onSend: idempotency stores the success body (or releases the slot on failure)
onResponse: request-context logs {method, route, status, durationMs, userId}
   │
   ▼  (if anything threw at any point)
setErrorHandler: maps the throw to {status, envelope}
```

### 4.1 What each guard actually does

**`authenticate`** verifies the bearer token, then *re-loads* roles/permissions
from the DB on every request (so a permission change takes effect immediately):

```ts
// backend/src/middleware/auth.ts (lines 38–55)
app.decorate('authenticate', async function authenticate(request) {
  await request.jwtVerify(); // throws FST_JWT_* → mapped to 401 centrally
  const ctx = await loader.load(request.user.sub, {
    requestId: request.id, ipAddress: request.ip ?? null, userAgent: ...,
  });
  if (!ctx) throw new UnauthenticatedError('Session is no longer valid');
  request.ctx = ctx; // <-- everything downstream reads this
});
```

**`authorize(permission)`** is a pure string check against `ctx.permissions`:

```ts
// backend/src/middleware/auth.ts (lines 57–66)
app.decorate('authorize', function authorizeFactory(permission) {
  return async function authorize(request) {
    if (!request.ctx) throw new UnauthenticatedError();
    if (!request.ctx.permissions.includes(permission))
      throw new ForbiddenError(`Missing required permission: ${permission}`);
  };
});
```

The `RequestContext` that the rest of the code relies on is built here:

```ts
// backend/src/modules/auth/auth-context.service.ts (lines 37–48)
return {
  requestId: meta.requestId,
  userId: user.id,
  email: user.email,
  roles: Array.from(roles) as RoleName[],
  permissions: Array.from(permissions),
  organizationId: organization?.id ?? null,
  vendorId: organization?.vendor?.id ?? null,       // ← set ONLY for vendor orgs
  restaurantId: organization?.restaurant?.id ?? null,// ← set ONLY for restaurant orgs
  ipAddress: meta.ipAddress, userAgent: meta.userAgent,
};
```

> **Debug tip:** if a vendor user is being treated like "no vendor", check that
> their org membership resolves `organization.vendor.id` here. `vendorId`/
> `restaurantId` being `null` is the root of most "wrong scope" bugs.

---

## 5. The layered architecture (route → controller → service → repository → Prisma)

We'll use the **orders** module as the worked example because it exercises every
pattern. Follow one method, `place`, down all five layers.

### 5.1 Layer 1 — Route: the contract + the guards

```ts
// backend/src/modules/orders/order.routes.ts (lines 38–53)
router.post<{ Body: PlaceOrderInput }>('/orders', {
  schema: {
    tags: ['orders'],
    summary: 'Place an order from the active cart',
    security: [{ bearerAuth: [] }],
    body: placeOrderSchema,                                   // request validation
    response: { 201: successEnvelope(orderResponseSchema), ...commonErrorResponses },
  },
  preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_CREATE), app.idempotent()],
}, controller.place);
```

Everything that makes this route *different* from another route is on this
object: the **path**, the **permission** (`ORDER_CREATE`), whether it is
**idempotent**, and the **schemas**. To understand any endpoint, read its route
declaration first.

### 5.2 Layer 2 — Controller: HTTP ↔ service, nothing else

```ts
// backend/src/modules/orders/order.controller.ts (lines 21–27)
place = async (request, reply) => {
  const order = await this.service.placeOrder(getRequestContext(request), request.body);
  await reply.code(201).send(ok(order, request.id));
};
```

Controllers are deliberately boring: pull `ctx`/`body`, call one service method,
wrap the result in `ok()`/`paginated()`. **No business logic, no Prisma, no error
formatting.** If you see an `if` about business rules here, it's in the wrong place.

### 5.3 Layer 3 — Service: business rules + the transaction boundary

This is where the real work happens. `placeOrder` resolves the caller's
restaurant, reads settings, snapshots prices, computes money, creates the order +
items + status history + outbox event + audit record — **all in one Prisma
transaction** so it's all-or-nothing:

```ts
// backend/src/modules/orders/order.service.ts (lines 101–243, trimmed)
async placeOrder(ctx, input) {
  const restaurantId = requireRestaurantId(ctx);            // scope: must be a restaurant
  const orderId = await this.db.$transaction(async (tx) => {
    const cart = await this.carts.getActiveByRestaurant(restaurantId, tx);
    if (!cart || cart.items.length === 0) throw new ValidationError('Your cart is empty');

    const gstPercent     = await this.settings.getNumber(SETTING_KEYS.GST_PERCENTAGE, DEFAULT_GST_PERCENT, tx);
    const advancePercent = await this.settings.getNumber(SETTING_KEYS.ADVANCE_PERCENTAGE, DEFAULT_ADVANCE_PERCENT, tx);

    // ... snapshot each line at the CURRENT selling price (prices can change later) ...
    const totalAmount   = orderTotal({ subtotal, discountAmount, gstAmount, deliveryCharges }).toDecimalPlaces(2);
    const advanceAmount = percentOf(totalAmount, advancePercent);   // the 30%

    const order = await this.orders.create({ status: 'PENDING_PAYMENT', /* ...money... */ }, tx);
    await this.orders.createItems(lineItems.map((l) => ({ ...l, orderId: order.id })), tx);
    await this.orders.appendStatus({ orderId: order.id, oldStatus: null, newStatus: 'PENDING_PAYMENT', ... }, tx);
    await this.outbox.enqueue({ eventType: OUTBOX_EVENTS.ORDER_PLACED, /* ... */ }, tx); // same tx!
    await this.audit.record({ action: AUDIT_ACTIONS.ORDER_PLACED, ... }, tx);
    await this.carts.updateStatus(cart.id, 'CHECKED_OUT', tx);
    return order.id;
  });
  return this.requireDto(orderId);
}
```

Key things to notice (they recur everywhere):
- **`requireRestaurantId(ctx)`** is the scope gate — a vendor calling this throws 403.
- **`this.db.$transaction(async (tx) => …)`** — the `tx` is threaded into every
  repository call so they all commit/rollback together.
- **No vendor is assigned and no stock is reserved at placement.** That happens
  later, after Administration review (see the state machine below).

### 5.4 Layer 4 — Repository: the only Prisma caller

Repositories extend `BaseRepository`, which gives them two superpowers: pick the
right executor (`tx` or root client) and never forget the soft-delete filter.

```ts
// backend/src/database/base.repository.ts (lines 13–25)
export abstract class BaseRepository {
  constructor(protected readonly db: Database) {}
  protected exec(tx?: PrismaExecutor): PrismaExecutor { return tx ?? this.db; }
  protected get notDeleted(): { deletedAt: null } { return { deletedAt: null }; }
}
```

So a query inside a transaction looks like `this.exec(tx).vendorProductOffer.findFirst({ where: { id, ...this.notDeleted } })`.
**If you ever see `prisma.` or `this.db.<model>` outside a `*.repository.ts`, that's an architecture violation and a likely bug.**

### 5.5 Layer 5 — Prisma / Postgres

`database/prisma.ts` owns the single client (one connection pool per process) and
exposes the `PrismaExecutor` type that lets the same repository code run in or out
of a transaction:

```ts
// backend/src/database/prisma.ts (lines 7–14)
export type TransactionClient = Prisma.TransactionClient;
/** Either the root client or a tx client — repositories accept this. */
export type PrismaExecutor = Database | TransactionClient;
```

### 5.6 How the layers are wired: the composition root

Nobody `new`s their own dependencies. `buildContainer()` constructs every
repository, then every service (injecting the repos it needs), then every
controller, exactly once:

```ts
// backend/src/container.ts (lines 211–222) — OrderService gets its collaborators
const orderService = new OrderService(
  db, orderRepository, cartRepository, offerRepository, performanceRepository,
  vendorRepository, outboxRepository, settingRepository, auditService, logger,
);
```

> **Debug tip:** "Cannot read properties of undefined (reading 'x')" inside a
> service at boot usually means a dependency wasn't passed in `container.ts`, or
> the constructor parameter order doesn't match. This file is the single source
> of truth for wiring.

---

## 6. Cross-cutting patterns (and how to debug each)

### 6.1 The response envelope

```ts
// backend/src/common/responses.ts (lines 44–67)
export function ok<T>(data, requestId)            { return { success: true, data, meta: buildMeta(requestId) }; }
export function paginated<T>(data, pagination, requestId) { return { success: true, data, meta: buildMeta(requestId, pagination) }; }
export function fail(code, message, details, requestId)   { return { success: false, error: { code, message, details }, meta: buildMeta(requestId) }; }
```

The frontend `api.ts` **unwraps** this so components only ever see `data`:

```ts
// frontend/src/lib/api.ts (lines 126–150)
export async function apiRequest<T>(path, options = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as SuccessEnvelope<T>;
  return json.data;                                   // <-- component gets .data
}
export async function apiRequestPaginated<T>(path, options = {}) {
  const json = (await send(path, options).then(r => r.json())) as SuccessEnvelope<T[]>;
  return { data: json.data, pagination: json.meta.pagination ?? EMPTY_PAGINATION };
}
```

> **Debug tip:** a paginated hook must read `result.data` (the array) — *not*
> `result.items`. Mixing these up is a classic frontend bug; `apiRequestPaginated`
> returns `{ data, pagination }`.

### 6.2 Typed errors → one global handler

Business code throws a typed error; it never builds an HTTP response.

```ts
// backend/src/common/errors.ts (lines 67–83) — each error carries its status + code
export class ForbiddenError extends AppError { readonly statusCode = 403; readonly code = ERROR_CODES.FORBIDDEN; }
export class NotFoundError  extends AppError { readonly statusCode = 404; readonly code = ERROR_CODES.NOT_FOUND; }
```

The global handler maps **every** throw — typed errors, Zod errors, Fastify
validation, JWT errors, Prisma `P2002/P2025/P2003`, rate limits, and unknown
errors (logged server-side, returned as a safe generic 500):

```ts
// backend/src/plugins/error-handler.ts (lines 44–116, trimmed)
if (isAppError(error))             return reply.code(error.statusCode).send(fail(error.code, error.message, error.details, requestId));
if (error instanceof ZodError)     return reply.code(422).send(fail(VALIDATION_ERROR, 'Validation failed', zodIssuesToDetails(error), requestId));
if (isJwtError(error))             return reply.code(401).send(fail(expired ? TOKEN_EXPIRED : UNAUTHENTICATED, ...));
if (error instanceof Prisma.PrismaClientKnownRequestError) {
  if (error.code === 'P2002')      return reply.code(409).send(fail(DUPLICATE_RESOURCE, ...)); // unique violation
  if (error.code === 'P2025')      return reply.code(404).send(fail(NOT_FOUND, ...));          // record not found
}
request.log.error({ err: error, requestId }, 'unhandled error');                                // last resort
return reply.code(500).send(fail(INTERNAL_ERROR, 'Something went wrong', [], requestId));
```

> **Debug tip:** to find why a request returned 500, grep the logs for the
> `requestId` (it's in the `x-request-id` response header). The handler logs the
> **full** error server-side even though the client only sees "Something went wrong".

### 6.3 Validation (Zod is the single source of truth)

Each route declares Zod schemas for `body`/`querystring`/`params` and the
response. The same schemas generate the OpenAPI docs at `/docs`. A bad body never
reaches your controller — it's rejected with `422 VALIDATION_ERROR` and a
`details[]` array naming the offending fields.

> **Debug tip:** "my new field is always undefined in the service" → it's missing
> from the module's `*.schemas.ts`. Fastify strips/validates against the schema
> before the controller runs.

### 6.4 AuthN + RBAC + resource scoping (three different things)

- **AuthN** = "who are you" → `app.authenticate` (JWT) builds `request.ctx`.
- **RBAC** = "are you allowed to call this endpoint at all" → `app.authorize('order:assign')`.
- **Scoping** = "which rows may you see/touch" → service-level helpers:

```ts
// backend/src/common/authz.ts (lines 8–10, 52–57)
export function isPrivileged(ctx) { return ctx.roles.some((r) => ['ADMIN','OPERATIONS'].includes(r)); }
export function requireVendorId(ctx) { if (!ctx.vendorId) throw new ForbiddenError('This action requires a vendor account'); return ctx.vendorId; }
```

The catalog of permissions and the role→permission mapping lives in one file:

```ts
// backend/src/common/permissions.ts (lines 159–164)
export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  [ROLES.ADMIN]: ALL_PERMISSIONS,            // Admin gets everything
  [ROLES.OPERATIONS]: OPERATIONS_PERMISSIONS,// "Administration" daily-ops team
  [ROLES.VENDOR]: VENDOR_PERMISSIONS,
  [ROLES.RESTAURANT]: RESTAURANT_PERMISSIONS,
};
```

> **Debug tip — 403 vs scoping:** if a user gets `FORBIDDEN: Missing required
> permission` they fail at `authorize` (RBAC) — fix the role→permission map or the
> route's guard. If they get `You can only access your own …` they passed RBAC but
> failed scoping inside the service — that's `requireVendorId`/`assert*Access`.

### 6.5 Idempotency (safe retries for writes)

Writes that must not run twice (e.g. placing an order) require an
`Idempotency-Key` header. The guard records the key, fingerprints the body, and on
retry either **replays** the cached response (same body) or **rejects** a reused
key with a different body:

```ts
// backend/src/middleware/idempotency.ts (lines 96–119, trimmed)
const requestHash = hashRequestPayload(request.body);
const existing = await store.find(request.ctx.userId, key);
if (existing) {
  if (existing.requestHash !== requestHash) throw new IdempotencyKeyReusedError();      // 409
  if (existing.status === 'COMPLETED') { /* replay */ await reply.send(existing.responseBody); return; }
  throw new ConflictError('A request with this Idempotency-Key is already in progress');// 409
}
await store.create({ userId, key, endpoint, requestHash, expiresAt });
```

The frontend generates a fresh key per place-order attempt:

```ts
// frontend/src/hooks/use-orders.ts (lines 55–69)
export function usePlaceOrder() {
  return useMutation({
    mutationFn: (body: { notes?: string }) =>
      apiRequest<Order>('/orders', { method: 'POST', body, idempotencyKey: newIdempotencyKey() }),
    ...
  });
}
```

> **Debug tip:** `IDEMPOTENCY_KEY_REUSED` means the same key was sent with a
> *different* payload. `Missing required Idempotency-Key header` (422) means a
> route has `app.idempotent()` but the client forgot the header.

### 6.6 Transactional outbox (reliable events)

Domain events are written to an `outbox_events` table **inside the same
transaction** as the state change, so there's no "DB updated but event lost" gap.
A relay/worker delivers them later.

```ts
// backend/src/modules/orders/outbox.repository.ts (lines 14–31)
enqueue(input, tx?) {
  return this.exec(tx).outboxEvent.create({ data: {
    aggregateType: input.aggregateType, aggregateId: input.aggregateId,
    eventType: input.eventType, payload: input.payload,
  }});
}
```

### 6.7 Optimistic locking (no oversell)

Vendor stock is mutated with a version-guarded `updateMany`. If a concurrent
request changed the row, `count` is 0, the service sees `false`, and the whole
transaction rolls back with a retryable conflict — so stock can't be reserved twice.

```ts
// backend/src/modules/vendor-offers/offer.repository.ts (lines 78–89)
async reserve(offer, quantity, tx?) {
  const result = await this.exec(tx).vendorProductOffer.updateMany({
    where: { id: offer.id, version: offer.version },                 // ← guard on version
    data:  { reservedQuantity: offer.reservedQuantity.plus(quantity), version: { increment: 1 } },
  });
  return result.count === 1;                                          // false ⇒ conflict
}
```

```ts
// backend/src/modules/orders/order.service.ts (lines 650–653) — service reaction
const reserved = await this.offers.reserve(offer, item.quantity, tx);
if (!reserved) throw new ConflictError('Vendor stock changed during assignment, please retry');
```

### 6.8 Soft deletes, money, pagination, audit, correlation

- **Soft delete:** rows carry `deletedAt`; reads spread `...this.notDeleted`. A
  "missing" record might just be soft-deleted.
- **Money:** never use JS `number` for currency. Use `Prisma.Decimal` and the
  helpers in `utils/decimal.ts` (`lineSubtotal`, `orderTotal`, `percentOf`).
  Mappers convert Decimals to fixed strings for JSON.
- **Pagination/sorting:** `parseSort(query.sort, SORTABLE_FIELDS)` whitelists
  sortable columns (anything else is ignored — a security + stability measure);
  `toPaginationArgs` → `{ skip, take }`; `buildPaginationMeta` → the `meta.pagination`.
- **Audit:** state-changing services call `auditService.record({...}, tx)` in the
  same transaction (append-only trail).
- **Correlation:** every response carries `x-request-id`; one structured log line
  per request includes it plus `userId`, `route`, `status`, `durationMs`
  (`plugins/request-context.ts`). This id is your thread to pull when debugging.

---

## 7. The frontend request pipeline (entry → page → hook → API client)

### 7.1 The component tree on every authenticated page

```
app/layout.tsx (Providers = QueryClientProvider)
  └─ app/(app)/layout.tsx
       └─ AuthGuard  ── no token? redirect to /login (after store hydration)
            └─ <Nav/>  ── renders links based on useAuthz()
            └─ page.tsx  ── renders UI; buttons call hooks
```

```tsx
// frontend/src/components/auth-guard.tsx (lines 16–26)
useEffect(() => { if (hydrated && !token) router.replace('/login'); }, [hydrated, token, router]);
if (!hydrated || !token) return <div>…Loading…</div>;  // avoids a flash before the store rehydrates
```

### 7.2 `lib/api.ts` — the one place all HTTP happens

Responsibilities, in order:
1. **Attach auth + headers.** Reads the token from the zustand store and sets
   `Authorization: Bearer …`; sets `Content-Type` only when there's a body; sets
   `Idempotency-Key` when provided.

```ts
// frontend/src/lib/api.ts (lines 74–89)
const token = useAuthStore.getState().accessToken;
if (token) headers.Authorization = `Bearer ${token}`;
if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
return fetch(buildUrl(path, options.query), { method, headers, credentials: 'include', body: ... });
```

2. **Refresh-on-401 (single-flight).** On a `401` (expired access token) it tries
   the refresh cookie exactly once, updates the store, and retries the original
   request. Concurrent 401s share one refresh promise so you don't get a storm.

```ts
// frontend/src/lib/api.ts (lines 108–123)
if (res.status === 401 && !options._isRetry && !path.startsWith('/auth/')) {
  const refreshed = await attemptRefresh();
  if (refreshed) res = await rawRequest(path, { ...options, _isRetry: true });
  else useAuthStore.getState().clear();          // refresh failed ⇒ log out
}
if (!res.ok) await parseError(res);              // turn error envelope into ApiError(status, code, message)
```

3. **Unwrap the envelope** (`apiRequest` → `data`; `apiRequestPaginated` → `{data,pagination}`).
4. **Normalize errors** into `ApiError` so UI can show `err.message`/`err.code`.

> **Debug tip:** if calls 401 then immediately log you out, the refresh cookie
> isn't being sent/accepted — check `credentials: 'include'`, CORS
> `Access-Control-Allow-Credentials`, and that the cookie domain is `localhost`.

### 7.3 Auth state (zustand, persisted)

```ts
// frontend/src/lib/auth-store.ts (lines 15–35) — persisted under "procurement-auth"
export const useAuthStore = create<AuthState>()(persist((set) => ({
  accessToken: null, user: null, context: null,
  setSession: ({ accessToken, user, context }) => set({ accessToken, user, context }),
  clear: () => set({ accessToken: null, user: null, context: null }),
}), { name: 'procurement-auth', partialize: (s) => ({ accessToken: s.accessToken, user: s.user, context: s.context }) }));
```

`context` carries `roles`, `permissions`, `vendorId`, `restaurantId` — the same
shape the backend computed. That's what powers `useAuthz()`.

### 7.4 Role gating in the UI

```ts
// frontend/src/lib/authz.ts (lines 47–62)
const roles = context?.roles ?? []; const permissionSet = new Set(context?.permissions ?? []);
return {
  isAdmin: roles.includes('ADMIN'),
  isStaff: roles.includes('ADMIN') || roles.includes('OPERATIONS'),  // "Administration"
  isVendor: Boolean(context?.vendorId),
  isRestaurant: Boolean(context?.restaurantId),
  can: (permission) => permissionSet.has(permission),
};
```

```tsx
// frontend/src/components/nav.tsx (lines 46–61) — which tabs each role sees
const links = [
  { href: '/dashboard', label: 'Dashboard' },
  ...(authz.isRestaurant ? [{ href: '/products', label: 'Products' }] : []),       // storefront = restaurant only
  ...(authz.can(PERMISSIONS.PRODUCT_CREATE) || authz.can(PERMISSIONS.PRODUCT_REVIEW) ? [{ href: '/manage/products', label: 'Catalog' }] : []),
  ...(authz.isVendor ? [{ href: '/offers', label: 'Pricing & Inventory' }] : authz.can(PERMISSIONS.OFFER_REVIEW) ? [{ href: '/offers', label: 'Offers' }] : []),
  ...(authz.isRestaurant ? [{ href: '/cart', label: 'Cart' }] : []),
  { href: '/orders', label: 'Orders' },
  ...(authz.can(PERMISSIONS.PAYMENT_VERIFY) ? [{ href: '/payments', label: 'Payments' }] : []),
  ...(authz.can(PERMISSIONS.PERFORMANCE_VIEW) ? [{ href: '/vendors', label: 'Vendors' }] : []),
];
```

> **Security note:** UI gating is **convenience, not security**. Even if someone
> forces a hidden route, the backend `authorize(...)` + service scoping still
> rejects it. Never rely on `useAuthz()` alone to protect data.

### 7.5 The hook pattern (the UI→API bridge)

Every domain has a hooks file. **Reads** use `useQuery` (cached by a `queryKey`);
**writes** use `useMutation` and then invalidate the relevant query keys so the UI
refetches.

```ts
// frontend/src/hooks/use-cart.ts (lines 16–23) — a write that updates the cache
export function useAddToCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { productId: string; quantity: number }) =>
      apiRequest<Cart>('/cart/items', { method: 'POST', body }),
    onSuccess: (data) => queryClient.setQueryData(['cart'], data),
  });
}
```

> **Debug tip:** "I did an action but the list didn't update" → the mutation
> didn't `invalidateQueries`/`setQueryData` for that key. See
> `useOrderMutation` in `use-orders.ts` which invalidates `['orders']` and
> `['dashboard']` after every order action.

---

## 8. End-to-end traces: click → DB → screen

Each trace lists the exact files in order. Use them as breakpoints.

### Trace A — Login

```
login/page.tsx  (submit)
  → hooks/use-auth.ts  useLogin().mutate({ email, password })
  → lib/api.ts  apiRequest('/auth/login', POST)            ── no token yet
  → [SERVER] auth.routes.ts  POST /auth/login  (authRateLimit; NO authenticate guard)
  → auth.controller.ts login → auth.service.ts (verify password, sign access token, set refresh cookie)
  → envelope { data: { accessToken, user, context } }
  → [CLIENT] useLogin onSuccess: useAuthStore.setSession(data); router.replace('/dashboard')
```

```ts
// frontend/src/hooks/use-auth.ts (lines 20–31)
export function useLogin() {
  return useMutation({
    mutationFn: (body) => apiRequest<AuthResponse>('/auth/login', { method: 'POST', body }),
    onSuccess: (data) => { setSession(data); router.replace('/dashboard'); },
  });
}
```

Note `POST /auth/login` carries **no** `authenticate` guard and a tighter
**rate limit** (`config: authRateLimit`) — the only routes shaped like this are
the public auth endpoints:

```ts
// backend/src/modules/auth/auth.routes.ts (lines 46–58)
router.post('/auth/login', { config: authRateLimit, schema: { body: loginSchema, ... } }, controller.login);
```

### Trace B — Restaurant clicks "Add to cart"

```
products/page.tsx  ProductCard onAdd() → addToCart.mutate({ productId, quantity })
  → hooks/use-cart.ts  POST /cart/items
  → lib/api.ts (Bearer token attached)
  → [SERVER] cart.routes.ts  POST /cart/items  preHandler [authenticate, authorize('cart:manage')]
  → cart.controller → cart.service (validate product APPROVED + price exists) → cart.repository (Prisma)
  → envelope { data: Cart }
  → [CLIENT] onSuccess: queryClient.setQueryData(['cart'], data); card shows "Added to cart"
```

The button itself:

```tsx
// frontend/src/app/(app)/products/page.tsx (lines 86–92)
<Button onClick={onAdd} disabled={addToCart.isPending || outOfStock || !price} className="flex-1">
  {outOfStock ? 'Out of stock' : 'Add to cart'}
</Button>
```

Because the whole storefront only renders for restaurants (`canBuy`/`isRestaurant`)
and `authorize('cart:manage')` is restaurant-only, a vendor can neither see nor
call this. (This is the exact bug that was fixed when consolidating to one app.)

### Trace C — Restaurant clicks "Place order" (idempotency + transaction + outbox)

```
cart/page.tsx  → usePlaceOrder().mutate({ notes })
  → lib/api.ts POST /orders  with Idempotency-Key header
  → [SERVER] order.routes.ts POST /orders  preHandler [authenticate, authorize('order:create'), idempotent()]
  → order.controller.place → order.service.placeOrder(ctx, body)
        $transaction: read cart → snapshot prices → compute totals + 30% advance
                      → orders.create(PENDING_PAYMENT) → createItems → appendStatus
                      → outbox.enqueue(ORDER_PLACED) → audit.record → cart → CHECKED_OUT
  → 201 { data: Order }   (idempotency onSend caches this body)
  → [CLIENT] invalidate ['cart'] and ['orders']
```

See [§5.3](#53-layer-3--service-business-rules--the-transaction-boundary) for the
service code. The order is created with **no vendor** and **no stock reserved** —
that's the whole point of the procurement flow.

### Trace D — Advance payment: restaurant submits proof → Administration verifies

This trace crosses **two modules** (payments → orders) and shows the status
machine advancing through a *service-to-service* call.

```
[Restaurant] submit proof → POST /orders/:orderId/payments  authorize('payment:submit') + idempotent()
   → payment.controller.submit → payment.service  (record proof)
        → orderService.markPaymentSubmitted(orderId, ctx, tx)   [same tx]

[Administration] payments/page.tsx → verify → POST /payments/:id/verify  authorize('payment:verify')
   → payment.controller.verify → payment.service  → $transaction:
        orderService.markPaymentVerified(orderId, ctx, tx)
```

> Note the asymmetry that trips people up: the restaurant **submits** proof under
> the order (`POST /orders/:orderId/payments`, idempotent), but staff act on the
> payment by its own id (`POST /payments/:id/verify` and `/reject`). The
> verification queue is `GET /payments` (guarded by `payment:view`).

```ts
// backend/src/modules/orders/order.service.ts (lines 513–557, trimmed)
async markPaymentVerified(orderId, ctx, tx) {
  const order = await this.orders.findById(orderId, tx);
  if (order.status !== 'PENDING_PAYMENT') throw new OrderNotModifiableError('Order is not awaiting payment');
  await this.orders.updateStatusFields(orderId, { status: 'PAYMENT_RECEIVED', paymentVerifiedAt: new Date() }, tx);
  await this.orders.appendStatus({ oldStatus: 'PENDING_PAYMENT', newStatus: 'PAYMENT_RECEIVED', ... }, tx);
  await this.orders.updateStatusFields(orderId, { status: 'PENDING_ADMIN_REVIEW' }, tx);  // auto-advance
  await this.orders.appendStatus({ oldStatus: 'PAYMENT_RECEIVED', newStatus: 'PENDING_ADMIN_REVIEW', ... }, tx);
  await this.outbox.enqueue({ eventType: OUTBOX_EVENTS.ORDER_PAYMENT_VERIFIED, ... }, tx);
}
```

> **Debug tip:** "order stuck in PENDING_PAYMENT" → either the proof was never
> submitted, or verification threw before commit. Check the `order_status_history`
> rows and the audit trail for this order id; both are written in the same tx as
> the status change, so their absence tells you the tx rolled back.

### Trace E — Administration assigns a vendor (RBAC + state machine + optimistic lock)

```
orders/page.tsx (staff) → useAssignVendor().mutate({ id, vendorId })
  → POST /orders/:id/assign  authorize('order:assign')   ← Administration/Admin only
  → order.service.assignVendor:
       assertTransitionAllowed(status → VENDOR_ASSIGNED)
       $transaction: reserveForVendor (optimistic lock per item)
                     performance.increment(totalAssigned)
                     recordTransition(→ VENDOR_ASSIGNED)  (status + history + outbox + audit)
```

```ts
// backend/src/modules/orders/order.service.ts (lines 58–71) — the legal transitions
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT:                ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT:      ['PAYMENT_RECEIVED', 'CANCELLED'],
  PAYMENT_RECEIVED:     ['PENDING_ADMIN_REVIEW', 'CANCELLED'],
  PENDING_ADMIN_REVIEW: ['VENDOR_ASSIGNED', 'REJECTED', 'CANCELLED'],
  VENDOR_ASSIGNED:      ['VENDOR_ACCEPTED', 'PENDING_ADMIN_REVIEW', 'REJECTED', 'CANCELLED'],
  VENDOR_ACCEPTED:      ['PROCESSING', 'REJECTED', 'CANCELLED'],
  PROCESSING:           ['READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DELIVERY:   ['DELIVERED', 'CANCELLED'],
  DELIVERED:            ['COMPLETED'],
  COMPLETED: [], REJECTED: [], CANCELLED: [],   // terminal
};
```

> **Debug tip:** a `409 ORDER_NOT_MODIFIABLE: Cannot change order from X to Y`
> means the requested transition isn't in this table. This is the first place to
> look for any "I can't move this order forward" report.

### Trace F — Vendor responds / advances fulfilment

```
orders/page.tsx (vendor) → useVendorRespond({ id, accept }) → POST /orders/:id/respond authorize('order:update')
  → order.service.vendorRespond:
       requireVendorId(ctx)  AND  order.assignedVendorId === vendorId  (else 403)
       accept  → VENDOR_ACCEPTED (+performance.totalAccepted)
       reject  → release stock, performance.totalRejected, back to PENDING_ADMIN_REVIEW
  later: useUpdateFulfilment({ id, status }) → PATCH /orders/:id/fulfilment (PROCESSING→READY→DELIVERED)
```

```ts
// backend/src/modules/orders/order.service.ts (lines 337–342) — vendor scope check
if (order.assignedVendorId !== vendorId) throw new ForbiddenError('This order is not assigned to you');
if (order.status !== 'VENDOR_ASSIGNED')  throw new OrderNotModifiableError('This order is not awaiting your response');
```

### Trace G — Administration completes a delivered order (performance rollup)

`POST /orders/:id/complete` (`order:complete`) fulfils the reserved stock and rolls
the vendor's scorecard (completion count, fulfilment minutes, optional rating) —
all in one transaction (`order.service.ts` `complete`, lines 411–449).

### Trace H — A role-scoped read: `GET /orders`

Same route, **different rows per caller** — this is the cleanest example of
backend scoping:

```ts
// backend/src/modules/orders/order.service.ts (lines 263–276)
if (isPrivileged(ctx)) {                       // Admin/Operations: optional filters, sees ALL
  if (query.vendorId) where.assignedVendorId = query.vendorId;
  if (query.restaurantId) where.restaurantId = query.restaurantId;
} else if (ctx.vendorId) {                      // Vendor: forced to its own assigned orders
  where.assignedVendorId = ctx.vendorId;
} else if (ctx.restaurantId) {                  // Restaurant: forced to its own orders
  where.restaurantId = ctx.restaurantId;
} else {
  throw new ForbiddenError('No vendor or restaurant profile is associated with this account');
}
```

> **Debug tip:** "a vendor sees another vendor's orders" would be a serious bug —
> and this is the exact code that prevents it. Any list endpoint that leaks data
> is failing to apply a block like this in its service.

---

## 9. Where the routes differ (the role divergence table)

Every route is `https://<api>/api/v1<path>`. "Guard" is the permission passed to
`app.authorize(...)`. "Service scoping" is the extra ownership logic *inside* the
service beyond the permission check. Routes with **Idem** require an
`Idempotency-Key`.

| Method & path | Guard (permission) | Who has it | Idem | Service scoping / notable logic |
|---|---|---|:--:|---|
| `POST /auth/login`,`/register`,`/refresh` | *(public)* | everyone | — | rate-limited; sets refresh cookie |
| `GET /auth/me` | `authenticate` only | any logged-in | — | returns fresh roles/permissions/ctx |
| `GET /products` | `product:view` | all roles | — | restaurant storefront filters to `APPROVED` |
| `POST/PATCH/DELETE /products` | `product:create/update/delete` | **Admin** | — | `assertAdmin(ctx)` — master catalog is Admin-only |
| `PATCH /products/:id/status` | `product:review` | Admin, Ops | — | lifecycle (review/approve) |
| `POST /offers` | `offer:create` | **Vendor** | — | `requireVendorId`; one offer per vendor+product |
| `PATCH /offers/:id` | `offer:update` | Vendor | — | vendor may edit **only its own** offer |
| `PATCH /offers/:id/review` | `offer:review` | Admin, Ops | — | approve/reject vendor offers |
| `POST /cart/items` | `cart:manage` | **Restaurant** | — | scoped to caller's active cart |
| `POST /orders` | `order:create` | **Restaurant** | ✅ | `requireRestaurantId`; snapshot prices + 30% advance |
| `GET /orders` | `order:view` | all | — | **scoped** (see Trace H): staff=all, vendor=assigned, restaurant=own |
| `POST /orders/:id/assign` | `order:assign` | Admin, Ops | — | reserve stock (optimistic lock) → `VENDOR_ASSIGNED` |
| `POST /orders/:id/respond` | `order:update` | Vendor | — | must be the **assigned** vendor; accept/reject |
| `PATCH /orders/:id/fulfilment` | `order:update` | Vendor | — | assigned vendor advances PROCESSING→READY→DELIVERED |
| `POST /orders/:id/complete` | `order:complete` | Admin, Ops | — | fulfil stock + performance rollup |
| `POST /orders/:id/reject` | `order:review` | Admin, Ops | — | terminal; releases reserved stock |
| `POST /orders/:id/cancel` | `order:cancel` | Restaurant (pre-accept), staff | — | restaurant limited to early statuses |
| `POST /orders/:orderId/payments` | `payment:submit` | Restaurant | ✅ | submit advance proof; calls `markPaymentSubmitted` |
| `GET /payments` | `payment:view` | Admin, Ops | — | verification queue (staff) |
| `POST /payments/:id/verify` | `payment:verify` | Admin, Ops | — | calls `markPaymentVerified` → `PENDING_ADMIN_REVIEW` |
| `POST /payments/:id/reject` | `payment:verify` | Admin, Ops | — | reject the submitted proof |
| `GET /vendors` | `vendor:view` | Admin, Ops (+vendor self) | — | used by staff for the assignment dropdown |
| `GET /vendor-performance` | `performance:view` | Admin, Ops | — | scorecards list |
| `GET /vendor-performance/:vendorId` | `performance:view` | Admin, Ops, Vendor | — | vendor sees **only its own** scorecard |
| `POST /vendor-performance/:vendorId/rating` | `performance:rate` | Admin, Ops | — | manual 1–5 rating |
| `POST /calls` | `call:create` | Admin, Ops | — | log Administration↔Vendor calls |
| `GET /analytics/dashboard` | `authenticate` only | all | — | **role-branched** summary (see below); no `authorize` |
| `GET /audit` | `audit:view` | Admin, Ops | — | append-only trail |

**The single biggest "where do routes differ" answer:** they don't differ by
*URL per role* — they differ by **(a)** the `app.authorize('<perm>')` on the route
declaration and **(b)** the scoping branch inside the service. Open the module's
`*.routes.ts` to see (a); open its `*.service.ts` and look for `isPrivileged` /
`requireVendorId` / `requireRestaurantId` / `assert*Access` to see (b).

The analytics dashboard is the clearest example of one route returning four
different payloads — the service branches on role:

```
analytics.service.ts  getDashboard(ctx) dispatches on identity:
  isAdmin(ctx)      → adminDashboard()        (platform-wide revenue, orders, vendors)
  isPrivileged(ctx) → operationsDashboard()   (queues: payments to verify, orders to assign)
  ctx.vendorId      → vendorDashboard(id)      (my assigned/accepted/score/rating)
  ctx.restaurantId  → restaurantDashboard(id)  (my orders, monthly spend)
  else              → ForbiddenError('No dashboard is available for this account')
```

---

## 10. Entry points & per-role journeys (the "portals" question)

> **Short answer:** there is exactly **one entry point per side**, not one per
> role. The four roles are *not* separate portals/ports anymore — they share one
> frontend and one backend. (Earlier the project ran four frontend containers on
> different ports; that was consolidated into a single role-based app.)

**Process / network entry points**

| Side | Entry file | What it starts | URL |
|---|---|---|---|
| Backend | `backend/src/server.ts` → `buildApp()` in `app.ts` | the Fastify API (all roles, all routes) | `http://localhost:4000` (`/api/v1`, `/docs`) |
| Frontend | `frontend/src/app/layout.tsx` → `app/page.tsx` | the Next.js app (all roles) | `http://localhost:3000` |

**Frontend "entry" for a user**: `/` decides where you go, then the role-aware UI
takes over.

```
app/page.tsx        "/"  → token ? /dashboard : /login
login/page.tsx      sets session, → /dashboard
app/(app)/layout.tsx  AuthGuard (redirect if no token) + <Nav/>
  Nav + each page read useAuthz() → render the role's links/buttons
```

So a **Restaurant** lands on `/dashboard`, sees `Products / Cart / Orders`; a
**Vendor** sees `Pricing & Inventory / Orders`; **Administration/Admin** see
`Catalog / Orders / Payments / Vendors`. Same code, different `useAuthz()` result.

**Backend "entry" for a role**: identical — every role calls the same
`/api/v1/*` routes. Identity is established once in
`auth-context.service.ts` (roles, permissions, `vendorId`/`restaurantId`), and
each route/service uses it to authorize and scope. There is no per-role router,
no per-role server, no per-role port.

**Why this is the right design** (vs. four apps): one auth/session model, one API
contract, no cross-portal redirect bugs, shared components, and security enforced
centrally (a hidden link can't bypass `authorize` + service scoping).

---

## 11. Debugging playbook (symptom → layer → file)

| Symptom | Most likely layer | Where to look first |
|---|---|---|
| Button click does nothing | Frontend hook/UI | the page's `onClick` → is the mutation called? is the button `disabled`? check `hook.isPending`/`isError` |
| `401 UNAUTHENTICATED` / kicked to login | AuthN / token | `lib/api.ts` refresh path; is `Authorization` header set? did refresh cookie work (`credentials:'include'`, CORS)? |
| `403 FORBIDDEN: Missing required permission` | RBAC | route's `app.authorize('<perm>')` + `common/permissions.ts` role map |
| `403 You can only access your own …` | Service scoping | service's `requireVendorId`/`assert*Access`; is `ctx.vendorId/restaurantId` set? (`auth-context.service.ts`) |
| `422 VALIDATION_ERROR` (with `details[]`) | Zod schema | module `*.schemas.ts`; field name in `details` tells you which |
| New field is `undefined` in service | Zod schema | field missing from `body`/`query` schema → Fastify stripped it |
| `409 ORDER_NOT_MODIFIABLE` | Order state machine | `ALLOWED_TRANSITIONS` in `order.service.ts` |
| `409 IDEMPOTENCY_KEY_REUSED` | Idempotency | same key + different body; generate a fresh key per attempt (`use-orders.ts`) |
| `409 ...stock changed, please retry` | Optimistic lock | `offer.repository.ts` reserve/release/fulfil returned `false` (concurrent change) |
| `500 Something went wrong` | Anywhere (unknown throw) | grep server logs for the `x-request-id`; the handler logs the real error |
| List didn't refresh after action | React Query cache | mutation's `onSuccess` must `invalidateQueries`/`setQueryData` the key |
| Paginated list empty but data exists | Frontend unwrap | read `result.data` (not `.items`) from `apiRequestPaginated` |
| Record "missing" that should exist | Soft delete | repo read includes `...this.notDeleted`; row may have `deletedAt` |
| CORS error in browser | Security plugin / env | `CORS_ORIGINS` in backend `.env` must include `http://localhost:3000` |
| Boot crash / "service didn't start" | Env or migrations | `config/env.ts` (bad var) or Prisma migrations (stale `pgdata` volume) |
| Wrong dashboard numbers | Analytics service | role branch in `analytics.service.ts`; verify the `where` filters |

**Universal technique:** every response has `x-request-id`. Copy it from the
browser's Network tab → search the backend logs for that id → you'll see the one
access-log line (`route`, `status`, `durationMs`, `userId`) and, for 500s, the
full stack trace. That single id ties the UI action to the exact server execution.

**Where to set breakpoints for an order action** (in order):
1. `frontend/src/hooks/use-orders.ts` — confirm the request fires with the right body/key.
2. `backend/src/modules/orders/order.routes.ts` — confirm the guard/permission.
3. `backend/src/modules/orders/order.controller.ts` — confirm `ctx` + body arrive.
4. `backend/src/modules/orders/order.service.ts` — the business decision (transitions, scoping, tx).
5. `backend/src/modules/orders/order.repository.ts` / `offer.repository.ts` — the actual SQL via Prisma.

---

## 12. Quick reference (codes, statuses, env, commands)

**Error codes** (`backend/src/common/errors.ts`): `VALIDATION_ERROR` (422),
`UNAUTHENTICATED`/`TOKEN_EXPIRED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`CONFLICT`/`DUPLICATE_RESOURCE`/`INSUFFICIENT_STOCK`/`ORDER_NOT_MODIFIABLE`/`IDEMPOTENCY_KEY_REUSED` (409),
`RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

**Order status flow** (`ALLOWED_TRANSITIONS`):
`DRAFT → PENDING_PAYMENT → PAYMENT_RECEIVED → PENDING_ADMIN_REVIEW → VENDOR_ASSIGNED → VENDOR_ACCEPTED → PROCESSING → READY_FOR_DELIVERY → DELIVERED → COMPLETED`,
with `REJECTED` / `CANCELLED` as terminal off-ramps (a vendor *rejection* returns
the order to `PENDING_ADMIN_REVIEW` for re-assignment).

**Roles → meaning:** `ADMIN` = Admin (full access), `OPERATIONS` = "Administration"
(daily ops: review/assign/verify), `VENDOR` = supplier (offers + fulfilment),
`RESTAURANT` = buyer (browse/order/pay advance).

**Key env vars:** backend — `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_ACCESS_EXPIRES_IN`, `COOKIE_SECRET`, `CORS_ORIGINS`, `PORT` (4000),
`AUTH_RATE_LIMIT_MAX`; frontend — `NEXT_PUBLIC_API_URL` (→ `http://localhost:4000`).

**Run locally** (see `SETUP.md` for full detail):
- Docker: `docker compose up -d --build` (db + migrate + backend on 4000 + frontend on 3000).
- Manual: backend `npm run dev` (after `prisma migrate`/`seed`), frontend `npm run dev`.
- API docs: `http://localhost:4000/docs`. Health: `/health`, `/ready`.

---

### Final orientation

When in doubt, read in this order for any feature: **route** (contract + guard) →
**controller** (plumbing) → **service** (the decision you're debugging) →
**repository** (the SQL). On the frontend: **page** (button) → **hook** (request)
→ **`lib/api.ts`** (transport). The envelope, the typed errors, and the
`x-request-id` are the three threads that connect them — pull any one and the
whole flow unravels in front of you.
