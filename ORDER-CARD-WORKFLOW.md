# Order Card Workflow — End‑to‑End Architecture

This document explains **exactly how an order "card" is created and how it moves**
from the restaurant placing an order all the way to completion and archival,
with the real code that drives each step.

> **There is no separate "card" entity.** A card *is* a row in the `orders`
> table plus its related rows (`order_items`, `order_status_history`,
> `order_payments`). Every portal (Restaurant / Operations / Vendor / Admin)
> renders the **same** order through a role‑aware UI and acts on it through
> role‑gated API endpoints. "Moving the card to the vendor" simply means
> setting `orders.assigned_vendor_id`, after which the vendor's scoped query
> starts returning that row.

---

## 1. The layers (where everything lives)

Every request flows through the same layered pipeline:

```
HTTP request
   │
   ▼
Route          backend/src/modules/orders/order.routes.ts      ← auth + RBAC + Zod schema
   │
   ▼
Controller     backend/src/modules/orders/order.controller.ts  ← thin HTTP adapter
   │
   ▼
Service        backend/src/modules/orders/order.service.ts      ← ALL business rules + state machine
   │
   ▼
Repository     backend/src/modules/orders/order.repository.ts   ← Prisma queries only
   │
   ▼
PostgreSQL (Prisma)
```

The frontend mirrors this with **hooks → API client → backend**:

```
React page          frontend/src/app/(app)/orders/page.tsx
   │   uses
   ▼
React Query hook    frontend/src/hooks/use-orders.ts
   │   calls
   ▼
API client          frontend/src/lib/api.ts   (attaches JWT, handles refresh)
   │
   ▼
Backend /api/v1/orders…
```

---

## 2. The data model (what a card is made of)

```prisma
// backend/prisma/schema.prisma  (Order — trimmed to the card-relevant fields)
model Order {
  id                    String      @id @default(...)
  orderNumber           String      @unique          // ORD-2026-000001
  restaurantId          String                        // who placed it
  assignedVendorId      String?                       // ← set when routed to a vendor
  status                OrderStatus @default(DRAFT)    // the card's current stage

  // money
  subtotal              Decimal
  gstAmount             Decimal
  deliveryCharges       Decimal
  totalAmount           Decimal
  advancePercent        Decimal
  advanceAmount         Decimal
  remainingAmount       Decimal

  // delivery booking (added for the card workflow)
  requestedDeliveryDate DateTime?   @db.Date
  isSameDayDelivery     Boolean     @default(false)
  sameDayCharge         Decimal     @default(0)

  // dispatch (vendor "in delivery")
  deliveryContactPhone  String?
  dispatchNote          String?
  dispatchedAt          DateTime?

  // restaurant review
  customerRating        Int?                           // 1..5
  customerReview        String?
  ratedAt               DateTime?

  // lifecycle timestamps (one per milestone)
  placedAt        DateTime?
  paymentVerifiedAt DateTime?
  reviewedAt      DateTime?
  assignedAt      DateTime?
  acceptedAt      DateTime?
  readyAt         DateTime?
  deliveredAt     DateTime?
  completedAt     DateTime?
  rejectedAt      DateTime?
  cancelledAt     DateTime?

  items         OrderItem[]
  statusHistory OrderStatusHistory[]
  payments      OrderPayment[]
}

model OrderItem {
  id                String  @id
  orderId           String
  productId         String
  productName       String   // snapshot (price/name frozen at order time)
  quantity          Decimal
  unitPrice         Decimal
  subtotal          Decimal
  deliveredQuantity Decimal? // ← actual amount the vendor sent (partial fulfilment)
}
```

`OrderStatusHistory` is the **audit trail of the card moving** — one row per
transition (old status → new status, who changed it, remarks).

---

## 3. The lifecycle state machine (the rails the card runs on)

Every legal move is declared in one place. The service refuses any transition
that is not in this table (the **only** exception is the Admin override, §10).

```ts
// backend/src/modules/orders/order.service.ts
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT:                ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT:      ['PAYMENT_RECEIVED', 'CANCELLED'],
  PAYMENT_RECEIVED:     ['PENDING_ADMIN_REVIEW', 'CANCELLED'],
  PENDING_ADMIN_REVIEW: ['VENDOR_ASSIGNED', 'REJECTED', 'CANCELLED'],
  VENDOR_ASSIGNED:      ['VENDOR_ACCEPTED', 'PENDING_ADMIN_REVIEW', 'REJECTED', 'CANCELLED'],
  VENDOR_ACCEPTED:      ['PROCESSING', 'REJECTED', 'CANCELLED'],
  PROCESSING:           ['READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DELIVERY:   ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY:     ['DELIVERED', 'CANCELLED'],
  DELIVERED:            ['COMPLETED'],
  COMPLETED:            [],   // terminal
  REJECTED:             [],   // terminal
  CANCELLED:            [],   // terminal
};

// Terminal statuses → the card moves to the "Archived" board.
const ARCHIVED_STATUSES: OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];
```

Visual flow:

```
RESTAURANT          RESTAURANT        OPERATIONS         OPERATIONS        VENDOR            VENDOR              VENDOR              VENDOR             RESTAURANT
places order   →    pays advance  →   verifies pay   →   assigns vendor →  accepts        →  processing/ready →  out for delivery →  delivered       →  completes + ⭐
PENDING_PAYMENT     (proof)           PENDING_ADMIN_    VENDOR_ASSIGNED    VENDOR_ACCEPTED   PROCESSING /        OUT_FOR_DELIVERY    DELIVERED          COMPLETED
                    PAYMENT_RECEIVED  REVIEW                                                 READY_FOR_DELIVERY  (+phone, +partial)                     (+rating/review)
                                                                                                                                                        → ARCHIVED
```

---

## 4. The heart of every move: `recordTransition`

**This single private method is what "moves the card."** Every status change
(place is the one exception — it *creates* the card) goes through it, so each
move always (a) updates the status + milestone fields, (b) appends a history
row, (c) emits an outbox event, and (d) writes an audit log — atomically.

```ts
// backend/src/modules/orders/order.service.ts
private async recordTransition(
  order: OrderWithRelations,
  newStatus: OrderStatus,
  data: Prisma.OrderUpdateInput,
  ctx: RequestContext,
  tx: PrismaExecutor,
  opts: { remarks?: string | null; event: string; auditAction: string; auditNew?: Record<string, unknown> },
): Promise<void> {
  // (a) status + any milestone timestamp/field changes
  await this.orders.updateStatusFields(order.id, { ...data, status: newStatus }, tx);

  // (b) history row — this is the visible "card moved" trail
  await this.orders.appendStatus(
    { orderId: order.id, oldStatus: order.status, newStatus, changedBy: ctx.userId, remarks: opts.remarks ?? null },
    tx,
  );

  // (c) outbox event (reliable async notifications / projections)
  await this.outbox.enqueue(
    { aggregateType: OUTBOX_AGGREGATE_ORDER, aggregateId: order.id, eventType: opts.event,
      payload: { orderId: order.id, from: order.status, to: newStatus } },
    tx,
  );

  // (d) audit log (who did what)
  await this.audit.record(
    { userId: ctx.userId, entityType: 'order', entityId: order.id, action: opts.auditAction,
      oldValue: { status: order.status }, newValue: { status: newStatus, ...(opts.auditNew ?? {}) },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, requestId: ctx.requestId },
    tx,
  );
}
```

---

## 5. STEP 1 — The card is born (Restaurant places the order)

### 5a. Frontend: cart with the delivery‑date picker

The restaurant picks a delivery date (today … +20 days). Choosing **today**
shows the same‑day surcharge warning.

```tsx
// frontend/src/app/(app)/cart/page.tsx (trimmed)
const MAX_DELIVERY_DAYS_AHEAD = 20;
const [deliveryDate, setDeliveryDate] = useState('');
const isSameDay = deliveryDate !== '' && deliveryDate === todayStr;

<Label htmlFor="delivery-date">Delivery date</Label>
<Input id="delivery-date" type="date" min={todayStr} max={maxStr}
       value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
{isSameDay && <div>…Same-day delivery: a rush surcharge will be added…</div>}

const onCheckout = () => {
  if (!deliveryDate) { setPlaceError('Please choose a delivery date.'); return; }
  placeOrder.mutate({ requestedDeliveryDate: deliveryDate }, { onSuccess: () => router.push('/orders') });
};
```

> **If you don't see the date box:** you're running a stale frontend bundle.
> Rebuild/restart the dev server (`npm run dev` in `frontend/`) — see §13.

### 5b. Hook → API call

```ts
// frontend/src/hooks/use-orders.ts
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { requestedDeliveryDate: string; notes?: string }) =>
      apiRequest<Order>('/orders', { method: 'POST', body, idempotencyKey: newIdempotencyKey() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });      // refresh the board
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });   // refresh metrics
    },
  });
}
```

### 5c. Route (auth + RBAC + idempotency + Zod)

```ts
// backend/src/modules/orders/order.routes.ts
router.post('/orders', {
  schema: { body: placeOrderSchema, response: { 201: successEnvelope(orderResponseSchema) } },
  preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_CREATE), app.idempotent()],
}, controller.place);
```

```ts
// placeOrderSchema requires the delivery date (YYYY-MM-DD)
export const placeOrderSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
  requestedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Delivery date must be in YYYY-MM-DD format'),
});
```

### 5d. Service: `placeOrder` — this is **where the card is created**

```ts
// backend/src/modules/orders/order.service.ts (key parts)
async placeOrder(ctx, input): Promise<OrderDto> {
  const restaurantId = requireRestaurantId(ctx);

  // 1. validate the delivery date against the server clock (today..+20d)
  const { date: deliveryDate, isSameDay } = resolveDeliveryDate(input.requestedDeliveryDate, new Date());

  // 2. read the restaurant's active cart (snapshot prices)
  const cart = await this.carts.getActiveByRestaurant(restaurantId);
  if (!cart || cart.items.length === 0) throw new ValidationError('Your cart is empty');

  // 3. compute money: subtotal → GST → delivery (+ same-day surcharge) → total → 30% advance
  const sameDayCharge = isSameDay ? await this.settings.getNumber(SETTING_KEYS.SAME_DAY_DELIVERY_SURCHARGE, …) : 0;
  // … totals computed with Prisma.Decimal …

  // 4. CREATE THE CARD inside one transaction
  const orderId = await this.db.$transaction(async (tx) => {
    const number = await this.orders.nextOrderNumber(tx);
    const order = await this.orders.create({
      orderNumber: formatOrderNumber(number),
      restaurantId,
      status: 'PENDING_PAYMENT',          // ← the card's first real state
      requestedDeliveryDate: deliveryDate,
      isSameDayDelivery: isSameDay,
      sameDayCharge,
      /* …money fields…, placedAt: new Date() */
    }, tx);

    await this.orders.createItems(order.id, lineItems, tx);            // snapshot lines
    await this.orders.appendStatus({ orderId: order.id, oldStatus: null, newStatus: 'PENDING_PAYMENT', changedBy: ctx.userId }, tx);
    await this.outbox.enqueue({ /* ORDER_PLACED */ }, tx);            // → operations gets notified
    await this.carts.updateStatus(cart.id, 'CHECKED_OUT', tx);        // empty the cart
    return order.id;
  });

  return this.requireDto(orderId); // returns the full card
}
```

Date validation helper:

```ts
// backend/src/modules/orders/order.service.ts
function resolveDeliveryDate(input: string, now: Date): { date: Date; isSameDay: boolean } {
  // parse YYYY-MM-DD, reject malformed / past / beyond +20 days
  // returns isSameDay = (date === today)
}
```

**Result:** a new card now exists in `PENDING_PAYMENT`. Because operations/admin
are *privileged* (see §8), it immediately appears on their **Orders** board and
bumps their dashboard counters.

---

## 6. STEP 2 — Advance payment (Restaurant submits, Operations verifies)

The card needs its 30% advance verified before it can be routed.

```ts
// backend/src/modules/orders/order.service.ts
// Restaurant uploads proof (called by the payments module in its txn):
async markPaymentSubmitted(orderId, ctx, tx) {
  // status stays PENDING_PAYMENT, sets paymentSubmittedAt, emits ORDER_PAYMENT_SUBMITTED
}

// Operations verifies the proof → advances the card two hops:
async markPaymentVerified(orderId, ctx, tx) {
  // PENDING_PAYMENT → PAYMENT_RECEIVED → PENDING_ADMIN_REVIEW
  // appends two history rows + emits ORDER_PAYMENT_VERIFIED
}
```

The card is now in `PENDING_ADMIN_REVIEW`, waiting for a vendor to be assigned.

---

## 7. STEP 3 & 4 — Routing the card to a vendor

### 7a. Operations assigns a vendor (the card "goes to" the vendor)

This is the step people miss: **a vendor sees nothing until Operations assigns
the order.** Assignment also *reserves* the vendor's offer stock.

```ts
// backend/src/modules/orders/order.service.ts
async assignVendor(id, input, ctx): Promise<OrderDto> {
  const order = await this.orders.findByIdWithRelations(id);
  this.assertTransitionAllowed(order.status, 'VENDOR_ASSIGNED'); // must be PENDING_ADMIN_REVIEW

  const vendor = await this.vendors.findById(input.vendorId);
  if (!vendor || vendor.status !== 'ACTIVE') throw new ValidationError('Vendor is not active');

  await this.db.$transaction(async (tx) => {
    await this.reserveForVendor(order, input.vendorId, tx);   // ← requires APPROVED offers + stock
    await this.performance.increment(input.vendorId, { totalAssigned: { increment: 1 } }, tx);
    await this.recordTransition(order, 'VENDOR_ASSIGNED', {
      assignedVendor: { connect: { id: input.vendorId } },     // ← assigned_vendor_id is SET here
      assignedBy: ctx.userId, assignedAt: now,
    }, ctx, tx, { event: OUTBOX_EVENTS.ORDER_VENDOR_ASSIGNED, auditAction: AUDIT_ACTIONS.ORDER_VENDOR_ASSIGNED });
  });
  return this.requireDto(id);
}
```

> `reserveForVendor` throws `Vendor does not supply "X"` if the chosen vendor has
> no **APPROVED** offer for every line item. That's the usual reason an
> assignment fails and the card "doesn't reach" the vendor.

### 7b. Why the vendor now sees the card (data isolation)

The vendor's **Orders** query is scoped server‑side. A vendor can only ever read
orders where `assigned_vendor_id === their own vendorId` — so two vendors never
see each other's cards.

```ts
// backend/src/modules/orders/order.service.ts — list() scoping
if (isPrivileged(ctx)) {                 // ADMIN / OPERATIONS → see everything
  if (query.vendorId)     where.assignedVendorId = query.vendorId;
  if (query.restaurantId) where.restaurantId    = query.restaurantId;
} else if (ctx.vendorId) {               // VENDOR → only its assigned cards
  where.assignedVendorId = ctx.vendorId;
} else if (ctx.restaurantId) {           // RESTAURANT → only its own cards
  where.restaurantId = ctx.restaurantId;
} else {
  throw new ForbiddenError('No vendor or restaurant profile is associated with this account');
}
```

`ctx.vendorId` comes from the logged‑in user's organization:

```ts
// backend/src/modules/auth/auth-context.service.ts
const membership   = user.memberships[0] ?? null;
const organization = membership?.organization ?? null;
return {
  …,
  vendorId:     organization?.vendor?.id ?? null,     // ← a vendor user's identity
  restaurantId: organization?.restaurant?.id ?? null,
};
```

Each vendor is its **own organization** with its **own login**, so isolation is
automatic. (See §11 for how the two demo vendors and admin‑created vendors get
their credentials.)

---

## 8. STEP 5 — Vendor moves the card (accept → dispatch → delivered)

```ts
// backend/src/modules/orders/order.service.ts
// Accept / decline the assignment:
async vendorRespond(id, input, ctx) {
  const vendorId = requireVendorId(ctx);
  if (order.assignedVendorId !== vendorId) throw new ForbiddenError('This order is not assigned to you');
  // accept → VENDOR_ACCEPTED ; decline → back to PENDING_ADMIN_REVIEW (stock released)
}

// Advance fulfilment: PROCESSING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED
async updateFulfilment(id, input, ctx) {
  const vendorId = requireVendorId(ctx);
  if (order.assignedVendorId !== vendorId) throw new ForbiddenError('This order is not assigned to you');
  this.assertTransitionAllowed(order.status, input.status);

  if (input.status === 'OUT_FOR_DELIVERY') {       // "in delivery"
    data.dispatchedAt = now;
    data.deliveryContactPhone = input.deliveryContactPhone ?? null;   // required at dispatch
    data.dispatchNote = input.dispatchNote ?? null;
  } else if (input.status === 'DELIVERED') {
    data.deliveredAt = now;
  }

  await this.db.$transaction(async (tx) => {
    for (const line of (input.deliveredItems ?? [])) {                 // partial fulfilment
      await this.orders.setItemDeliveredQuantity(order.id, line.orderItemId, new Prisma.Decimal(line.deliveredQuantity), tx);
    }
    await this.recordTransition(order, input.status, data, ctx, tx, { /* event + audit */ });
  });
}
```

The dispatch form (frontend) collects the **delivery person's phone**, an
optional note, and—if stock was short—the **actual quantity sent** per item:

```tsx
// frontend/src/app/(app)/orders/page.tsx (VendorActions → dispatch)
fulfil.mutate({
  id: order.id,
  status: 'OUT_FOR_DELIVERY',
  deliveryContactPhone: phone.trim(),
  dispatchNote: note.trim() || undefined,
  deliveredItems: deliveredItems.length > 0 ? deliveredItems : undefined,
});
```

---

## 9. STEP 6 — Restaurant completes + 5‑star review → card archives

```ts
// backend/src/modules/orders/order.service.ts
async complete(id, input, ctx) {
  const actingAsRestaurant = !isPrivileged(ctx);
  if (actingAsRestaurant) {
    if (order.restaurantId !== ctx.restaurantId) throw new ForbiddenError('You can only complete your own orders');
    if (!input.rating) throw new ValidationError('Please rate your order (1-5 stars) to complete it');
  }
  this.assertTransitionAllowed(order.status, 'COMPLETED');  // only from DELIVERED

  const completionData = { completedAt: now };
  if (input.rating) { completionData.customerRating = input.rating; completionData.customerReview = input.review ?? null; completionData.ratedAt = now; }

  await this.db.$transaction(async (tx) => {
    await this.fulfilForVendor(order, vendorId, tx);                  // consume reserved stock
    await this.performance.increment(vendorId, { totalCompleted: { increment: 1 }, /* rating */ }, tx);
    await this.recordTransition(order, 'COMPLETED', completionData, ctx, tx, { event: OUTBOX_EVENTS.ORDER_COMPLETED, … });
  });
}
```

Because `COMPLETED ∈ ARCHIVED_STATUSES`, the card now appears under the
**Archived** tab and drops off the **Active** board. The customer review renders
on the card for everyone.

---

## 10. Admin super‑powers

### 10a. Override any status (out‑of‑band correction)

The Admin can force a stuck/mis‑routed card to (almost) any status, bypassing the
state machine — but it is still fully audited and recorded in history.

```ts
// backend/src/modules/orders/order.service.ts
async overrideStatus(id, input, ctx): Promise<OrderDto> {
  const order = await this.orders.findByIdWithRelations(id);
  if (order.status === input.status) throw new ValidationError('Order is already in that status');

  await this.db.$transaction(async (tx) => {
    // release reserved stock when leaving a reserved status for a non-reserved one
    if (order.assignedVendorId && RESERVED_STATUSES.includes(order.status) && !RESERVED_STATUSES.includes(input.status)) {
      await this.releaseForVendor(order, order.assignedVendorId, tx);
    }
    await this.recordTransition(order, input.status, this.overrideTimestamps(input.status, order, now), ctx, tx, {
      remarks: input.remarks ?? 'Status overridden by admin',
      event: OUTBOX_EVENTS.ORDER_STATUS_CHANGED,
      auditAction: AUDIT_ACTIONS.ORDER_STATUS_OVERRIDDEN,
      auditNew: { status: input.status, from: order.status, override: true },
    });
  });
  return this.requireDto(id);
}
```

```ts
// Route — Admin-only (order:override is auto-granted to ADMIN, not OPERATIONS)
router.patch('/orders/:id/status', {
  schema: { body: overrideStatusSchema, response: { 200: successEnvelope(orderResponseSchema) } },
  preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_OVERRIDE)],
}, controller.overrideStatus);
```

> **Boundary:** overriding *into* `VENDOR_ASSIGNED` does **not** pick a vendor or
> reserve stock. To route a card to a vendor, always use **Assign** (§7a).

The UI exposes this only to admins, in `OrderDetail`:

```tsx
// frontend/src/app/(app)/orders/page.tsx
{isStaff && <AdminActions key={order.id} order={order} />}
{isAdmin && <AdminOverride key={`override-${order.id}`} order={order} />}
```

### 10b. Account management (`/manage/accounts`, Admin‑only)

| Action               | Endpoint                          | Permission           |
| -------------------- | --------------------------------- | -------------------- |
| List all accounts    | `GET  /users` (roles + org incl.) | `user:view`          |
| Suspend account      | `POST /users/:id/suspend`         | `user:suspend`       |
| Reactivate account   | `POST /users/:id/reactivate`      | `user:suspend`       |
| Set a new password   | `POST /users/:id/password`        | `user:reset-password`|
| Create vendor + login| `POST /vendors`                   | `vendor:create`      |

Creating a vendor account provisions the whole graph in one transaction
(mirrors self‑registration, but admin‑initiated):

```ts
// backend/src/modules/vendors/vendor.service.ts
async createAccount(input, ctx): Promise<VendorDto> {
  if (await this.users.existsByEmail(input.email)) throw new DuplicateResourceError(…);
  const role = await this.roles.findByName(ROLES.VENDOR);
  const passwordHash = await this.hasher.hash(input.password);

  return this.db.$transaction(async (tx) => {
    const user = await this.users.create({ …, status: 'ACTIVE' }, tx);          // login
    const org  = await this.organizations.create({ …, organizationType: 'VENDOR' }, tx);
    await this.organizations.update(org.id, { status: 'ACTIVE' }, tx);
    const vendor = await this.vendors.create({ organizationId: org.id, vendorName: input.vendorName, vendorCode: generateVendorCode(), status: 'ACTIVE' }, tx);
    await this.members.create({ organizationId: org.id, userId: user.id, designation: 'Owner', status: 'ACTIVE' }, tx);
    await this.roles.assignRoleToUser({ userId: user.id, roleId: role.id, organizationId: org.id }, tx);  // ← VENDOR role
    await this.audit.record({ action: AUDIT_ACTIONS.VENDOR_CREATED, … }, tx);
    return vendor;
  });
}
```

Because the new vendor is its **own org with the VENDOR role**, the list‑scoping
in §7b automatically isolates its data.

---

## 11. Identity & multi‑vendor isolation

* A **user** logs in (JWT). On every request the context loader rebuilds their
  roles + `vendorId`/`restaurantId` from their organization membership
  (`auth-context.service.ts`, §7b) — so RBAC changes take effect immediately.
* A **vendor** = one organization with `organizationType = VENDOR` + a `vendor`
  row. Two vendors are two organizations ⇒ two `vendorId`s ⇒ complete data
  isolation via the scoped query.
* Vendors are created **three** ways: self‑registration (`POST /auth/register`),
  the **seed** (two demo vendors), or **Admin** (`POST /vendors`, §10b).

Seeded demo logins (password `Password123!`):

| Email                    | Role        | Notes                         |
| ------------------------ | ----------- | ----------------------------- |
| `admin@procurement.local`| ADMIN       | super‑admin (all permissions) |
| `ops@procurement.local`  | OPERATIONS  | verify pay, assign vendors    |
| `vendor@demo.local`      | VENDOR      | Demo Fresh Foods              |
| `vendor2@demo.local`     | VENDOR      | Green Valley Supplies         |
| `restaurant@demo.local`  | RESTAURANT  | Demo Bistro                   |

---

## 12. How dashboards stay in sync

Two mechanisms keep every portal's metrics live:

1. **Frontend cache invalidation** — every order mutation invalidates the
   `['orders']` and `['dashboard']` query keys, so the board and the metrics
   refetch (see `useOrderMutation` / `usePlaceOrder` in `use-orders.ts`).
2. **Backend aggregation** — the analytics service computes role‑scoped counts
   directly from the `orders` table, so the numbers always reflect the current
   card states (`analytics.service.ts`). `OUT_FOR_DELIVERY` is counted as
   in‑progress.

---

## 13. Running it (so the new fields actually exist)

The card workflow added DB columns/enum values, so a migration is required.
After pulling these changes:

```bash
# backend/
npm install
npx prisma generate
npx prisma migrate deploy      # or: npx prisma migrate dev   (creates + applies)
npm run seed                   # demo accounts + catalog (idempotent)
npm run dev                    # restart the API

# frontend/  (in a second terminal)
npm install
npm run dev                    # rebuild — this is what surfaces the delivery-date picker
```

> If the delivery‑date box or the vendor cards "don't show up," it's almost
> always a **stale build** (frontend not rebuilt) or an **unapplied migration**
> (backend). Re‑run the steps above.

---

## 14. Endpoint cheat‑sheet (the whole card lifecycle)

| Stage                | Method & path                 | Who           | Service method        |
| -------------------- | ----------------------------- | ------------- | --------------------- |
| Create card          | `POST  /orders`               | Restaurant    | `placeOrder`          |
| Submit advance proof | `POST  /payments`             | Restaurant    | `markPaymentSubmitted`|
| Verify advance       | `POST  /payments/:id/verify`  | Operations    | `markPaymentVerified` |
| Assign vendor        | `POST  /orders/:id/assign`    | Operations    | `assignVendor`        |
| Accept / decline     | `POST  /orders/:id/respond`   | Vendor        | `vendorRespond`       |
| Process → dispatch   | `PATCH /orders/:id/fulfilment`| Vendor        | `updateFulfilment`    |
| Complete + review    | `POST  /orders/:id/complete`  | Restaurant    | `complete`            |
| Reject               | `POST  /orders/:id/reject`    | Operations    | `reject`              |
| Cancel               | `POST  /orders/:id/cancel`    | Restaurant/Ops| `cancel`              |
| **Override status**  | `PATCH /orders/:id/status`    | **Admin**     | `overrideStatus`      |
| List (scoped board)  | `GET   /orders`               | All           | `list`                |
| Card detail          | `GET   /orders/:id`           | All (scoped)  | `getById`             |

Every mutating call funnels through `recordTransition` (§4), so the status
history, outbox events, and audit log always tell the complete story of how the
card got from "placed" to "archived."
