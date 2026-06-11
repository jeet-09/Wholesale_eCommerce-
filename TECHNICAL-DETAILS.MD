# Technical Implementation Guide

The concrete, code-level blueprint for building this platform. `README.md` defines *what*; this defines *how*. All examples are the agreed conventions — follow them so every module looks the same and the codebase stays predictable as it grows.

---

## 1. Layered Architecture

Strict, one-directional layering. Each layer has exactly one job and depends only on the layer below it.

```text
HTTP Request
   │
   ▼
Route        registers path + method, attaches schema, hooks (auth/RBAC), calls controller
   │
   ▼
Controller   parses/validates input → calls service → maps result to the response envelope
   │           (NO business logic, NO data access)
   ▼
Service      business rules, orchestration, transactions, domain errors
   │           (NO HTTP, NO Prisma — talks to repositories)
   ▼
Repository   the ONLY place that talks to Prisma; encapsulates queries + soft-delete filtering
   │
   ▼
Prisma → PostgreSQL
```

**Rules**
* A lower layer never imports an upper layer.
* Controllers never call Prisma. Services never see `req`/`reply`. Repositories never contain business rules.
* Cross-cutting concerns (auth, logging, error mapping, request context) are Fastify plugins/hooks, applied once.

---

## 2. Backend Module Anatomy

Organize by **domain**, not by technical type. Every module is self-contained and looks identical:

```text
src/modules/orders/
├── order.routes.ts        # path + method + schema + hooks → controller
├── order.controller.ts    # HTTP in/out only
├── order.service.ts       # business logic, transactions, domain errors
├── order.repository.ts    # Prisma access for orders
├── order.schemas.ts       # Zod schemas (request, response, params, query)
├── order.types.ts         # DTOs / interfaces inferred from schemas
├── order.errors.ts        # module-specific domain errors (optional)
└── __tests__/             # unit + integration tests
```

Shared building blocks live outside modules:

```text
src/common/      → AppError hierarchy, response helpers, pagination, base repository
src/config/      → env loading & validation
src/database/    → Prisma client singleton
src/plugins/     → fastify plugins (swagger, jwt, helmet, cors, rate-limit, error handler)
src/middleware/   → hooks (authenticate, authorize, requestContext)
src/utils/       → pure helpers
```

---

## 3. The Response Envelope

One shape for everything (matches `README.md` → API Standards). Centralize it so no handler hand-rolls JSON.

```typescript
// src/common/responses.ts
export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export function ok<T>(data: T, meta?: Partial<ResponseMeta>) {
  return { success: true as const, data, meta: buildMeta(meta) };
}

export function paginated<T>(data: T[], pagination: PaginationMeta, meta?: Partial<ResponseMeta>) {
  return { success: true as const, data, meta: buildMeta({ ...meta, pagination }) };
}
```

Controllers return `ok(...)` / `paginated(...)`. Errors are produced by *throwing* and handled centrally (§5).

---

## 4. Validation with Zod (single source of truth)

Schemas define the contract once; types, runtime validation, and OpenAPI all derive from them.

```typescript
// src/modules/products/product.schemas.ts
import { z } from 'zod';

export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  unit: z.enum(['KG', 'GRAM', 'LITER', 'ML', 'PIECE', 'BOX', 'PACKET']),
  price: z.coerce.number().positive(),       // validated; stored as DECIMAL
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
```

* Register Zod with the Fastify type provider so request/response are validated *and* typed end-to-end, and OpenAPI is generated automatically.
* Unknown fields are stripped. Validation failure ⇒ `ValidationError` ⇒ `422` with field-level `details`.

---

## 5. Error Handling (the most important section)

> Mirrors `RULES.md` §5. This is where most production incidents are prevented.

### 5.1 A typed error hierarchy

```typescript
// src/common/errors.ts
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;          // stable, machine-readable (see README catalog)
  readonly details: { field: string; message: string }[];

  constructor(message: string, details: { field: string; message: string }[] = []) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError { statusCode = 422; code = 'VALIDATION_ERROR'; }
export class NotFoundError extends AppError { statusCode = 404; code = 'NOT_FOUND'; }
export class ConflictError extends AppError { statusCode = 409; code = 'CONFLICT'; }
export class UnauthenticatedError extends AppError { statusCode = 401; code = 'UNAUTHENTICATED'; }
export class ForbiddenError extends AppError { statusCode = 403; code = 'FORBIDDEN'; }
export class InsufficientStockError extends AppError { statusCode = 409; code = 'INSUFFICIENT_STOCK'; }
```

Business code throws these — never a bare `throw new Error('...')`.

### 5.2 One global error handler

```typescript
// src/plugins/errorHandler.ts
app.setErrorHandler((err, req, reply) => {
  const requestId = req.id;

  if (err instanceof AppError) {
    req.log.warn({ err, code: err.code, requestId }, 'handled domain error');
    return reply.code(err.statusCode).send(fail(err.code, err.message, err.details, requestId));
  }
  if (err instanceof ZodError) {
    const details = err.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
    return reply.code(422).send(fail('VALIDATION_ERROR', 'Validation failed', details, requestId));
  }
  if (isPrismaUniqueViolation(err)) {
    return reply.code(409).send(fail('DUPLICATE_RESOURCE', 'Resource already exists', [], requestId));
  }

  // Unknown: log full detail server-side, return a SAFE generic message.
  req.log.error({ err, requestId }, 'unhandled error');
  return reply.code(500).send(fail('INTERNAL_ERROR', 'Something went wrong', [], requestId));
});
```

Handlers therefore stay clean: they `throw`, the handler formats. Internals are never leaked to clients.

### 5.3 Async discipline

* Every function calling async code is `async` and **awaits** it. No floating promises.
* Lint enforces `@typescript-eslint/no-floating-promises` and `no-misused-promises`.
* Concurrency uses `Promise.all` (fail-fast) or `Promise.allSettled` (collect results) deliberately — never fire-and-forget.

```typescript
// GOOD
const [vendor, inventory] = await Promise.all([
  vendorRepo.findById(vendorId),
  inventoryRepo.findByProduct(productId),
]);
if (!vendor) throw new NotFoundError('Vendor not found');
```

---

## 6. Repository Pattern & Soft Deletes

Repositories are the **only** Prisma callers. A base repository centralizes soft-delete handling so it can never be forgotten.

```typescript
// src/modules/products/product.repository.ts
export class ProductRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string) {
    return this.db.product.findFirst({ where: { id, deletedAt: null } });
  }

  async list({ skip, take, where }: ListArgs) {
    const [items, total] = await this.db.$transaction([
      this.db.product.findMany({ where: { ...where, deletedAt: null }, skip, take, orderBy: { createdAt: 'desc' } }),
      this.db.product.count({ where: { ...where, deletedAt: null } }),
    ]);
    return { items, total };
  }

  softDelete(id: string, userId: string) {
    return this.db.product.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: userId } });
  }
}
```

* `deletedAt: null` is applied on every read. Forgetting it is a review blocker.
* List queries return `{ items, total }` so the service can build pagination meta.

---

## 7. Transactions, Inventory & Idempotency

Multi-write operations are atomic. No external IO inside a transaction — emit an outbox event instead.

```typescript
// src/modules/orders/order.service.ts (sketch — see DATABASE.md "Order Creation Flow")
async create(dto: CreateOrderDto, ctx: RequestContext) {
  return this.db.$transaction(async (tx) => {
    const cart = await this.cartRepo.getActive(tx, ctx.restaurantId);
    if (!cart) throw new NotFoundError('No active cart');

    // Always re-read CURRENT prices/stock — never trust the cart snapshot.
    for (const item of cart.items) {
      const inv = await this.inventoryRepo.lockByProduct(tx, item.productId);
      const sellable = inv.availableQuantity.minus(inv.reservedQuantity); // available - reserved
      if (sellable.lessThan(item.quantity)) {
        throw new InsufficientStockError(`Not enough stock for ${item.productId}`);
      }
      await this.inventoryRepo.reserve(tx, inv, item.quantity); // optimistic lock on `version`
    }

    const order = await this.orderRepo.create(tx, /* computed totals + snapshots */);
    await this.orderStatusRepo.append(tx, order.id, null, 'PENDING', ctx.userId);
    await this.outboxRepo.enqueue(tx, 'ORDER', order.id, 'ORDER_PLACED', { orderId: order.id });
    await this.cartRepo.markCheckedOut(tx, cart.id);
    return order;
  });
}
```

* **Optimistic locking**: inventory updates use `WHERE id = ? AND version = ?`; a 0-row update ⇒ retry or `409`.
* **Idempotency**: an `Idempotency-Key` middleware checks `idempotency_keys` before the handler runs; on replay it returns the cached response instead of re-executing.
* **Totals**: `total = subtotal − discount + gst + delivery` (see `DATABASE.md`).

---

## 8. Dependency Injection & Composition Root

Services depend on interfaces and receive dependencies via the constructor — never `new` their own repositories. This keeps them unit-testable.

```typescript
// composition (per-request or per-app), e.g. via fastify-awilix or manual wiring
const productRepo = new ProductRepository(prisma);
const productService = new ProductService(productRepo, logger);
const productController = new ProductController(productService);
```

In tests, inject a fake repository:

```typescript
const fakeRepo = { findById: vi.fn().mockResolvedValue(null) } as unknown as ProductRepository;
const service = new ProductService(fakeRepo, testLogger);
await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundError);
```

---

## 9. Auth, RBAC & Request Context

* `authenticate` hook verifies the JWT, loads the user, and attaches a typed `RequestContext` (`userId`, `organizationId`, `roles`) to the request.
* `authorize(permission)` hook enforces RBAC; default-deny. Resource ownership is verified inside services.
* Access token ~15 min; refresh token ~30 days with **rotation** (store hashed; reuse of a revoked token revokes the whole family — see `refresh_tokens` in `DATABASE.md`).

```typescript
app.get('/api/v1/orders/:id', {
  preHandler: [app.authenticate, app.authorize('order:view')],
  schema: { params: orderIdParam, response: { 200: orderResponse } },
}, orderController.getById);
```

---

## 10. Configuration (fail fast)

Validate env at startup; refuse to boot if anything is missing/malformed.

```typescript
// src/config/env.ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().transform(s => s.split(',')),
});
export const env = envSchema.parse(process.env); // throws → process exits
```

A committed `backend/.env.example` lists every variable (no values).

---

## 11. Logging & Operability

* Pino with a request-id; one log line per request (method, route, status, duration, userId).
* Redact secrets/PII via Pino `redact`. No `console.log`.
* `GET /health` (liveness) and `GET /ready` (DB reachable + migrations applied).
* Graceful shutdown on `SIGTERM`: stop intake → drain → `prisma.$disconnect()` → exit.

---

## 12. Frontend Conventions (Next.js)

* **App Router** + Server Components by default; Client Components only when interactivity is needed.
* **Feature folders** mirror backend domains (`features/orders`, `features/products`).
* **Typed API client** in `src/services` wraps `fetch`, injects auth, and parses the standard envelope into typed data or throws a typed client error. Generated from the OpenAPI spec where possible — so the frontend types track the backend automatically.
* **Server state** via TanStack Query (caching, retries, invalidation). **Client/UI state** via Zustand. Do not duplicate server state into Zustand.
* **Components**: ShadCN UI + Tailwind; presentational components are pure; data fetching lives in hooks (`useOrders`, `useCreateOrder`).
* **Error & loading states** are first-class for every async view (skeletons, empty states, error boundaries) — never leave a spinner that can hang forever.
* **Forms** validated with the **same Zod schemas** shared from/with the backend contract where feasible, so client and server agree.

```typescript
// src/features/orders/useOrders.ts
export function useOrders(params: OrderQuery) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => api.get('/api/v1/orders', params), // returns typed, envelope-unwrapped data
    staleTime: 30_000,
  });
}
```

---

## 13. Testing Patterns

* **Vitest** for unit/integration; **Supertest** to drive the booted Fastify app.
* Unit-test services with mocked repositories (§8). Integration-test repositories/routes against a **real** Postgres test DB (Docker), reset per run.
* Always test the unhappy paths: validation failures, not-found, forbidden, conflict, and **transaction rollback** (assert no partial writes / no leaked reservations).
* Each test seeds and tears down its own data; tests are order-independent.

```typescript
it('rolls back and reserves nothing when stock is insufficient', async () => {
  await expect(orderService.create(bigOrder, ctx)).rejects.toBeInstanceOf(InsufficientStockError);
  const inv = await inventoryRepo.findByProduct(productId);
  expect(inv.reservedQuantity.toNumber()).toBe(0); // proof of rollback
});
```

---

## 14. Definition of "Production-Grade" (checklist)

For every module:

- [ ] Layered: route → controller → service → repository; no leaks across layers.
- [ ] Zod validation on every input; standard envelope on every output; OpenAPI generated.
- [ ] Domain errors only; central error handler; no swallowed errors; no leaked internals.
- [ ] All async awaited; no floating promises (lint-enforced).
- [ ] Multi-write paths are transactional; inventory uses optimistic locking; writes are idempotent.
- [ ] Soft deletes respected; append-only history honored; money DECIMAL, time TIMESTAMPTZ/UTC.
- [ ] RBAC + ownership enforced; secrets from env; nothing sensitive logged.
- [ ] Unit + integration tests, including rollback and authz tests; 80%+ on critical paths.
- [ ] Docs/schema updated in the same PR.
