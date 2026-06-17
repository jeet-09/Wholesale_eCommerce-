# How the Admin Page Is Built — A Step-by-Step, End-to-End Walkthrough

> **Goal:** read this once and you will understand *exactly* how the admin
> screen appears on the page — every file that runs, every function that is
> called, in what order, where the network request goes, how the backend turns
> it into data, and how that data becomes the boxes and tables you see. We trace
> two real journeys with real code:
>
> 1. **The read path** — the **Admin Dashboard** (`/dashboard`), which is the
>    first thing an admin sees after logging in.
> 2. **The write path** — the **Master Catalog** page (`/manage/products`),
>    where an admin *creates/approves* products (the quintessential admin action).
>
> Companion docs: `PROJECT-CODE-UNDERSTANDING.md` (whole-system flow),
> `TECHNICAL-DETAILS.MD` (rules), `DATABASE.md` (schema).

---

## 0. First, an important truth: there is no `AdminPage.tsx`

This app was consolidated into **one** role-based frontend. There is **no
separate admin app, no admin port, and no single "admin page" file**. The admin
experience is the *same* set of pages every role uses, but they look and behave
differently because of two inputs:

- **Identity** — after login the browser holds the admin's `roles` (`["ADMIN"]`)
  and `permissions` (all of them). The UI reads this to decide what to show.
- **Server scoping** — the same API endpoints return *admin-shaped* data because
  the backend branches on the caller's role.

So "building the admin page" really means: **log in as admin → the shared pages
render their admin variant**. We'll see precisely how that happens.

**Log in as admin (seeded demo account):**

```
email:    admin@procurement.local
password: Password123!
```

```ts
// backend/prisma/seed.ts (lines 348–354, 25) — the admin account + its role
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Password123!';
const adminId = await getOrCreateUser({ email: 'admin@procurement.local', /* ... */ passwordHash });
await assignRole(adminId, roleIds.get(ROLES.ADMIN)!, null);   // ← ADMIN role, no org
```

The `ADMIN` role is seeded with **every** permission, which is what unlocks the
admin UI and admin API access:

```ts
// backend/src/common/permissions.ts (lines 159–164)
export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  [ROLES.ADMIN]: ALL_PERMISSIONS,            // ← admin gets all permission strings
  [ROLES.OPERATIONS]: OPERATIONS_PERMISSIONS,
  [ROLES.VENDOR]: VENDOR_PERMISSIONS,
  [ROLES.RESTAURANT]: RESTAURANT_PERMISSIONS,
};
```

---

## 1. The two journeys at a glance

```
JOURNEY 1 — RENDER THE ADMIN DASHBOARD (read)
  type /dashboard ─► Next.js renders the React tree ─► DashboardPage mounts
        ─► useDashboard() fires a GET ─► lib/api.ts adds the Bearer token
        ─► GET /api/v1/analytics/dashboard ─► authenticate ─► controller.dashboard
        ─► analyticsService.getDashboard(ctx) ─► isAdmin(ctx) ─► adminDashboard()
        ─► repository COUNT/SUM/GROUP BY ─► Postgres
        ◄─ { scope:'admin', metrics:[...], ordersByStatus:[...] } in the envelope
        ◄─ React Query caches it ─► DashboardPage re-renders the metric cards

JOURNEY 2 — ADMIN CREATES A PRODUCT (write)
  click "New product" ─► Modal + form ─► create.mutate(body)
        ─► POST /api/v1/products (+Bearer) ─► authenticate ─► authorize('product:create')
        ─► productController.create ─► productService.create() ─► assertAdmin(ctx)
        ─► productRepository.create({ status:'DRAFT' }) ─► Postgres (one transaction)
        ◄─ created Product in the envelope ─► invalidateQueries(['products']) ─► table refetches
```

Keep these two diagrams in mind; the rest of the document is just *zooming in* on
each arrow.

---

## 2. Step-by-step: rendering the Admin Dashboard

### Step 2.0 — Becoming an admin (login produces the token + context)

Before any admin page can render, the browser needs a session. The login page
calls the `useLogin` hook:

```ts
// frontend/src/hooks/use-auth.ts (lines 20–31)
export function useLogin() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (body) => apiRequest<AuthResponse>('/auth/login', { method: 'POST', body }),
    onSuccess: (data) => {
      setSession(data);              // ← store accessToken + user + context
      router.replace('/dashboard');  // ← admin is sent to the dashboard
    },
  });
}
```

On the backend, `login` verifies the password and **assembles the result**,
which includes the access token and the auth *context* (roles, permissions):

```ts
// backend/src/modules/auth/auth.service.ts (lines 325–345) — assembleResult
const ctx = await this.getContext(userId, meta);   // fresh roles + permissions from DB
return {
  accessToken: this.signer.sign({ sub: userId, email }),  // short-lived JWT
  tokenType: 'Bearer',
  user: toUserDto(user),
  context: toContextDto(ctx),       // { roles:['ADMIN'], permissions:[...all...], vendorId:null, restaurantId:null }
  refreshToken, refreshTokenExpiresAt,
};
```

The controller puts the refresh token in an **HttpOnly cookie** and returns the
rest in the body (the refresh token is never in the JSON):

```ts
// backend/src/modules/auth/auth.controller.ts (lines 72–101)
private sendAuth(reply, request, result, status) {
  this.setRefreshCookie(reply, result);                      // Set-Cookie: refresh=...
  void reply.code(status).send(ok({ accessToken: result.accessToken, tokenType: result.tokenType,
    user: result.user, context: result.context }, request.id));
}
login = async (request, reply) => {
  const result = await this.service.login(request.body, buildMeta(request));
  this.sendAuth(reply, request, result, 200);
};
```

The frontend stores all of that in a **persisted zustand store** (survives page
reloads via `localStorage` key `procurement-auth`):

```ts
// frontend/src/lib/auth-store.ts (lines 15–35)
export const useAuthStore = create<AuthState>()(persist((set) => ({
  accessToken: null, user: null, context: null,
  setSession: ({ accessToken, user, context }) => set({ accessToken, user, context }),
  clear: () => set({ accessToken: null, user: null, context: null }),
}), { name: 'procurement-auth', partialize: (s) => ({ accessToken: s.accessToken, user: s.user, context: s.context }) }));
```

> **Why this matters for "the admin page":** the `context.roles = ['ADMIN']` and
> `context.permissions = [...all...]` stored here are *the entire reason* the
> admin UI looks different. Every gate downstream reads this object.

### Step 2.1 — The URL resolves into a React tree (Next.js App Router)

When the browser is at `/dashboard`, Next.js composes a nested tree of layouts
and the page. Here is the exact nesting and the order things run:

```
RootLayout            (app/layout.tsx)          ← <html><body>, wraps everything
 └─ Providers         (app/providers.tsx)        ← React Query context ('use client')
     └─ AppLayout     (app/(app)/layout.tsx)      ← the authenticated shell
         └─ AuthGuard (components/auth-guard.tsx)  ← redirect to /login if no token
             └─ Nav   (components/nav.tsx)          ← the admin's tab bar
             └─ <main> DashboardPage (app/(app)/dashboard/page.tsx)  ← the page itself
```

**Root layout** (a Server Component — no `'use client'`) just sets up the HTML
shell and mounts the providers:

```tsx
// frontend/src/app/layout.tsx (lines 11–19)
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body><Providers>{children}</Providers></body></html>
  );
}
```

**Providers** is a Client Component (note `'use client'`) that creates the React
Query client once and shares it with the whole app — this is what lets any page
use `useQuery`/`useMutation`:

```tsx
// frontend/src/app/providers.tsx (lines 6–21)
export function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

The `(app)` **route group** layout is the "logged-in shell": it gates everything
behind `AuthGuard` and renders the `Nav` + a `<main>` for the page:

```tsx
// frontend/src/app/(app)/layout.tsx (lines 4–13)
export default function AppLayout({ children }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
```

**AuthGuard** waits for the persisted store to rehydrate, then bounces to
`/login` if there's no token. (If you opened `/dashboard` directly without
logging in, this is what sends you to login.)

```tsx
// frontend/src/components/auth-guard.tsx (lines 8–28)
const token = useAuthStore((s) => s.accessToken);
const [hydrated, setHydrated] = useState(false);
useEffect(() => setHydrated(true), []);                       // store rehydrates on client
useEffect(() => { if (hydrated && !token) router.replace('/login'); }, [hydrated, token, router]);
if (!hydrated || !token) return <div>…Loading…</div>;          // no flash of protected UI
return <>{children}</>;
```

> **Concept — Server vs Client Components.** `layout.tsx` (root) and `(app)/layout.tsx`
> have no `'use client'`, so they're rendered on the server and shipped as static
> HTML. Everything that uses hooks/state/the store (`providers`, `auth-guard`,
> `nav`, `dashboard/page`) declares `'use client'` and runs in the browser. The
> data fetch happens **client-side** via React Query, not during SSR.

### Step 2.2 — `DashboardPage` mounts and calls its hooks

This is the page component. The moment React mounts it, three hooks run **in
order, top to bottom**:

```tsx
// frontend/src/app/(app)/dashboard/page.tsx (lines 150–154)
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);        // 1. who am I (for the greeting)
  const authz = useAuthz();                          // 2. role/permission booleans
  const { data, isLoading, isError, error } = useDashboard();  // 3. fetch the dashboard data
  const isStaff = authz.isStaff;                     // admin or operations
  // ...render below...
}
```

`useAuthz()` turns the stored `context` into convenient booleans. For our admin,
`isAdmin` and `isStaff` are `true`; `isVendor`/`isRestaurant` are `false`:

```ts
// frontend/src/lib/authz.ts (lines 47–62)
const roles = context?.roles ?? []; const permissionSet = new Set(context?.permissions ?? []);
return {
  isAdmin: roles.includes('ADMIN'),                                   // true for admin
  isStaff: roles.includes('ADMIN') || roles.includes('OPERATIONS'),   // true for admin
  isVendor: Boolean(context?.vendorId),                               // false
  isRestaurant: Boolean(context?.restaurantId),                       // false
  can: (permission) => permissionSet.has(permission),
};
```

`useDashboard()` is a thin React Query wrapper. It declares: "cache this under
the key `['dashboard']`, and to fetch it, call `apiRequest('/analytics/dashboard')`":

```ts
// frontend/src/hooks/use-dashboard.ts (lines 9–15)
export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<Dashboard>('/analytics/dashboard'),
    enabled,
  });
}
```

> **Concept — React Query lifecycle.** On first mount the query has no cached
> data, so React Query calls `queryFn` and the hook returns `{ isLoading: true,
> data: undefined }`. The page renders a "Loading dashboard…" line. When the
> promise resolves, React Query stores the result under `['dashboard']`,
> re-renders the component, and now `{ isLoading: false, data: {...} }`. If the
> promise throws, `{ isError: true, error }`.

### Step 2.3 — The request leaves the browser (`lib/api.ts`)

`apiRequest('/analytics/dashboard')` is where the actual HTTP call is built. It:
attaches the admin's bearer token, sends the request, transparently refreshes on
a `401`, and finally unwraps the response envelope so the hook gets clean data.

```ts
// frontend/src/lib/api.ts (lines 74–89) — build the request, attach the token
async function rawRequest(path, options) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = useAuthStore.getState().accessToken;     // ← the admin's JWT
  if (token) headers.Authorization = `Bearer ${token}`;  // ← Authorization: Bearer eyJ...
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  return fetch(buildUrl(path, options.query), { method: options.method ?? 'GET', headers,
    credentials: 'include', body: options.body === undefined ? undefined : JSON.stringify(options.body) });
}
```

`buildUrl` prepends the API base, so `'/analytics/dashboard'` becomes
`http://localhost:4000/api/v1/analytics/dashboard`:

```ts
// frontend/src/lib/api.ts (lines 4–5, 32–42)
const API_BASE = `${API_ROOT}/api/v1`;            // API_ROOT = NEXT_PUBLIC_API_URL or http://localhost:4000
function buildUrl(path, query) { const url = new URL(`${API_BASE}${path}`); /* + query params */ return url.toString(); }
```

`send` runs the request and, if the access token expired (`401`), does **one**
silent refresh and retries before giving up:

```ts
// frontend/src/lib/api.ts (lines 108–123)
async function send(path, options) {
  let res = await rawRequest(path, options);
  if (res.status === 401 && !options._isRetry && !path.startsWith('/auth/')) {
    const refreshed = await attemptRefresh();                       // uses the HttpOnly cookie
    if (refreshed) res = await rawRequest(path, { ...options, _isRetry: true });
    else useAuthStore.getState().clear();                            // refresh failed ⇒ logged out
  }
  if (!res.ok) await parseError(res);                                // throw ApiError(status, code, message)
  return res;
}
```

Finally `apiRequest` strips the envelope and returns just `data` (so the hook
gets a `Dashboard`, not the whole `{success,data,meta}`):

```ts
// frontend/src/lib/api.ts (lines 126–131)
export async function apiRequest<T>(path, options = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as SuccessEnvelope<T>;
  return json.data;             // ← the hook receives this
}
```

### Step 2.4 — The request arrives at the backend (the pipeline)

The request hits the Fastify server. Before the route handler runs, the per-route
**preHandlers** execute. For the dashboard, that is **`authenticate` only** —
there is deliberately *no* `authorize(...)` here, because every logged-in role is
allowed to see *their own* dashboard; the differentiation happens in the service.

```ts
// backend/src/modules/analytics/analytics.routes.ts (lines 14–26)
router.get('/analytics/dashboard', {
  schema: { tags: ['analytics'], summary: 'Role-scoped dashboard summary (...)',
    security: [{ bearerAuth: [] }],
    response: { 200: successEnvelope(dashboardResponseSchema), ...commonErrorResponses } },
  preHandler: [app.authenticate],                       // ← verify JWT + load ctx; NO authorize
}, controller.dashboard);
```

`authenticate` verifies the JWT and loads a **fresh** `RequestContext` (roles,
permissions, vendorId, restaurantId) from the DB, attaching it to `request.ctx`:

```ts
// backend/src/middleware/auth.ts (lines 38–55)
app.decorate('authenticate', async function authenticate(request) {
  await request.jwtVerify();                                   // 401 if token bad/expired
  const ctx = await loader.load(request.user.sub, { requestId: request.id, /* ip, ua */ });
  if (!ctx) throw new UnauthenticatedError('Session is no longer valid');
  request.ctx = ctx;                                           // ← roles:['ADMIN'], permissions:[...]
});
```

That `ctx` is built here, mapping the DB rows to roles + permissions + org bindings:

```ts
// backend/src/modules/auth/auth-context.service.ts (lines 37–48)
return {
  userId: user.id, email: user.email,
  roles: Array.from(roles) as RoleName[],          // ['ADMIN']
  permissions: Array.from(permissions),            // every permission
  organizationId: organization?.id ?? null,        // null for the platform admin
  vendorId: organization?.vendor?.id ?? null,       // null
  restaurantId: organization?.restaurant?.id ?? null,// null
  /* requestId, ip, userAgent */
};
```

The controller is tiny — it pulls `ctx` and asks the service for the dashboard,
then wraps the result in the standard envelope:

```ts
// backend/src/modules/analytics/analytics.controller.ts (lines 10–13)
dashboard = async (request, reply) => {
  const data = await this.service.getDashboard(getRequestContext(request));  // ctx in
  await reply.code(200).send(ok(data, request.id));                          // envelope out
};
```

### Step 2.5 — The service decides what an admin sees

This is the brain of "the admin page." `getDashboard` branches on identity. Our
admin satisfies `isAdmin(ctx)`, so it calls `adminDashboard()`:

```ts
// backend/src/modules/analytics/analytics.service.ts (lines 54–71)
async getDashboard(ctx: RequestContext): Promise<DashboardResponse> {
  if (isAdmin(ctx))      return this.adminDashboard();        // ← ADMIN lands here
  if (isPrivileged(ctx)) return this.operationsDashboard();   // OPERATIONS
  if (ctx.vendorId)      return this.vendorDashboard(ctx.vendorId);
  if (ctx.restaurantId)  return this.restaurantDashboard(ctx.restaurantId);
  throw new ForbiddenError('No dashboard is available for this account');
}
```

`adminDashboard()` runs a batch of cheap aggregate queries in parallel and shapes
them into labelled, formatted metrics + an orders-by-status breakdown:

```ts
// backend/src/modules/analytics/analytics.service.ts (lines 74–110)
private async adminDashboard(): Promise<DashboardResponse> {
  const monthStart = startOfMonth();
  const [ordersByStatus, totalOrders, completedOrders, totalRevenue, monthRevenue,
         activeVendors, totalRestaurants, approvedProducts] = await Promise.all([
    this.analytics.ordersByStatus({}),
    this.analytics.countOrders({ status: { notIn: [...CLOSED_OR_DEAD] } }),
    this.analytics.countOrders({ status: 'COMPLETED' }),
    this.analytics.sumOrderTotal({ status: 'COMPLETED' }),
    this.analytics.sumOrderTotal({ status: 'COMPLETED', completedAt: { gte: monthStart } }),
    this.analytics.countVendors({ status: 'ACTIVE' }),
    this.analytics.countRestaurants({}),
    this.analytics.countProducts({ status: 'APPROVED' }),
  ]);
  const avgOrderValue = completedOrders > 0 ? money(totalRevenue / completedOrders) : 0;
  const metrics: DashboardMetric[] = [
    { key: 'totalOrders',     label: 'Total orders',      value: totalOrders,        format: 'number' },
    { key: 'totalRevenue',    label: 'Total revenue',     value: money(totalRevenue),format: 'currency', hint: 'Completed orders' },
    { key: 'monthRevenue',    label: 'Revenue this month',value: monthRevenue,       format: 'currency' },
    { key: 'avgOrderValue',   label: 'Avg order value',   value: avgOrderValue,      format: 'currency' },
    { key: 'completedOrders', label: 'Completed orders',  value: completedOrders,    format: 'number' },
    { key: 'activeVendors',   label: 'Active vendors',    value: activeVendors,      format: 'number' },
    { key: 'totalRestaurants',label: 'Restaurants',       value: totalRestaurants,   format: 'number' },
    { key: 'approvedProducts',label: 'Catalog products',  value: approvedProducts,   format: 'number', hint: 'Approved' },
  ];
  return { scope: 'admin', generatedAt: new Date().toISOString(), metrics, ordersByStatus };
}
```

Each `this.analytics.*` call is a repository method — **the only layer allowed to
touch Prisma** — and each is a plain COUNT / SUM / GROUP BY so the dashboard stays
fast no matter how much data exists:

```ts
// backend/src/modules/analytics/analytics.repository.ts (lines 15–35)
async ordersByStatus(where): Promise<StatusCount[]> {
  const rows = await this.db.order.groupBy({ by: ['status'], where: { ...where, ...this.notDeleted }, _count: { _all: true } });
  return rows.map((row) => ({ status: row.status, count: row._count._all }));
}
countOrders(where) { return this.db.order.count({ where: { ...where, ...this.notDeleted } }); }
async sumOrderTotal(where) {
  const result = await this.db.order.aggregate({ where: { ...where, ...this.notDeleted }, _sum: { totalAmount: true } });
  return result._sum.totalAmount ? result._sum.totalAmount.toNumber() : 0;
}
```

Prisma turns those into SQL against PostgreSQL and returns the numbers. The
service assembles the final object: `{ scope:'admin', metrics:[8 cards], ordersByStatus:[...] }`.

### Step 2.6 — The response travels back and lands in the cache

The controller wrapped the result with `ok(data, requestId)`:

```ts
// backend/src/common/responses.ts (lines 44–46)
export function ok<T>(data, requestId) { return { success: true, data, meta: buildMeta(requestId) }; }
```

So the wire payload is:

```json
{
  "success": true,
  "data": {
    "scope": "admin",
    "metrics": [
      { "key": "totalOrders", "label": "Total orders", "value": 0, "format": "number" },
      { "key": "totalRevenue", "label": "Total revenue", "value": 0, "format": "currency", "hint": "Completed orders" }
    ],
    "ordersByStatus": []
  },
  "meta": { "requestId": "…", "timestamp": "…" }
}
```

Back in the browser, `apiRequest` returns `json.data` (the inner `Dashboard`
object). React Query stores it under `['dashboard']` and re-renders
`DashboardPage`, now with `data` populated and `isLoading === false`.

### Step 2.7 — The page renders the admin view

Now the component body runs again with `data` present. The admin sees: a greeting
+ scope label, a grid of metric cards, an "Orders by status" panel, and — because
`isStaff` is true — a two-column row with **Recent orders (with the restaurant
column)** and **Top vendors**.

```tsx
// frontend/src/app/(app)/dashboard/page.tsx (lines 156–214, trimmed)
return (
  <div>
    <h1>{user ? `Welcome back, ${user.firstName}` : 'Dashboard'}</h1>
    <p>{data ? SCOPE_LABELS[data.scope] : 'Overview'}</p>     {/* 'Platform analytics' for admin */}

    {isLoading && <p>Loading dashboard…</p>}
    {isError && <p className="...text-red-700">{error instanceof ApiError ? error.message : 'Failed to load dashboard'}</p>}

    {data && (
      <div className="space-y-6">
        <div className="grid grid-cols-2 ... lg:grid-cols-4">
          {data.metrics.map((metric) => <MetricCard key={metric.key} metric={metric} />)}   {/* the 8 admin cards */}
        </div>

        <Card><CardBody>
          <h2>Orders by status</h2>
          {data.ordersByStatus.map((entry) => (
            <div key={entry.status}><StatusBadge status={entry.status} /><span>{entry.count}</span></div>
          ))}
        </CardBody></Card>

        <div className={isStaff ? 'grid grid-cols-1 gap-6 lg:grid-cols-2' : ''}>
          <RecentOrders showParty={isStaff} />     {/* admin sees the Restaurant column */}
          {isStaff && <TopVendors />}              {/* admin-only panel */}
        </div>
      </div>
    )}
  </div>
);
```

Each metric is rendered by `MetricCard`, which formats the value based on the
`format` hint the backend sent (`currency` → ₹, `percent` → `%`, `rating` →
`x / 5`, else a localized number):

```tsx
// frontend/src/app/(app)/dashboard/page.tsx (lines 22–48)
function formatMetric(metric) {
  if (metric.value === null) return metric.format === 'rating' ? 'No ratings' : '—';
  switch (metric.format) {
    case 'currency': return formatMoney(String(metric.value));
    case 'percent':  return `${metric.value}%`;
    case 'rating':   return `${metric.value} / 5`;
    default:         return metric.value.toLocaleString('en-IN');
  }
}
function MetricCard({ metric }) {
  return (<Card><CardBody>
    <p className="text-xs uppercase ...">{metric.label}</p>
    <p className="mt-1 text-2xl font-bold ...">{formatMetric(metric)}</p>
    {metric.hint && <p className="text-xs text-gray-400">{metric.hint}</p>}
  </CardBody></Card>);
}
```

The two admin-only sub-panels fire **their own** queries when they mount — i.e.
the dashboard makes *three* API calls total for an admin:

```tsx
// frontend/src/app/(app)/dashboard/page.tsx (lines 51–53, 102–106)
function RecentOrders({ showParty }) {
  const { data } = useOrders({ page: 1, pageSize: 5, sort: '-createdAt' });   // GET /orders
  const orders = data?.data ?? [];
  // ...table; shows the Restaurant column only when showParty (admin/ops)...
}
function TopVendors() {
  const { data } = useVendorPerformanceList({ page: 1, pageSize: 50, sort: '-totalCompleted' }); // GET /vendor-performance
  // ...sorts client-side by successRate, shows the top 5...
}
```

> **So "the admin dashboard" = `dashboard/page.tsx` + admin data + `isStaff`
> branches.** A restaurant hitting the same page gets `scope:'restaurant'`
> metrics, no Restaurant column, and no Top vendors panel — same component,
> different inputs.

**Network tab summary for an admin loading `/dashboard`:**

| Request | Triggered by | Backend route | Returns |
|---|---|---|---|
| `GET /api/v1/analytics/dashboard` | `useDashboard` | analytics → `adminDashboard()` | 8 metric cards + ordersByStatus |
| `GET /api/v1/orders?page=1&pageSize=5&sort=-createdAt` | `RecentOrders` → `useOrders` | orders (scoped: admin sees all) | latest 5 orders |
| `GET /api/v1/vendor-performance?...` | `TopVendors` → `useVendorPerformanceList` | vendor-performance | scorecards |

---

## 3. How the admin's navigation bar is built

The tabs an admin sees are computed in `Nav` from `useAuthz()`. An admin (all
permissions, but `isRestaurant`/`isVendor` are false) gets: **Dashboard,
Catalog, Offers, Orders, Payments, Vendors** — and a "Admin" role badge.

```tsx
// frontend/src/components/nav.tsx (lines 33–61)
const roleLabel = authz.isAdmin ? 'Admin' : authz.isStaff ? 'Operations' : authz.isVendor ? 'Vendor' : authz.isRestaurant ? 'Restaurant' : (context?.roles?.[0] ?? '');

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  ...(authz.isRestaurant ? [{ href: '/products', label: 'Products' }] : []),                 // ✗ admin (storefront is restaurant-only)
  ...(authz.can(PERMISSIONS.PRODUCT_CREATE) || authz.can(PERMISSIONS.PRODUCT_REVIEW)
      ? [{ href: '/manage/products', label: 'Catalog' }] : []),                              // ✓ admin
  ...(authz.isVendor ? [{ href: '/offers', label: 'Pricing & Inventory' }]
      : authz.can(PERMISSIONS.OFFER_REVIEW) ? [{ href: '/offers', label: 'Offers' }] : []),  // ✓ admin → 'Offers'
  ...(authz.isRestaurant ? [{ href: '/cart', label: 'Cart' }] : []),                          // ✗ admin
  { href: '/orders', label: 'Orders' },                                                       // ✓ everyone
  ...(authz.can(PERMISSIONS.PAYMENT_VERIFY) ? [{ href: '/payments', label: 'Payments' }] : []),// ✓ admin
  ...(authz.can(PERMISSIONS.PERFORMANCE_VIEW) ? [{ href: '/vendors', label: 'Vendors' }] : []),// ✓ admin
];
```

| Tab | Shown when | Admin? | Why |
|---|---|:--:|---|
| Dashboard | always | ✓ | landing page |
| Products (storefront) | `isRestaurant` | ✗ | buying is a restaurant action |
| Catalog | `product:create` OR `product:review` | ✓ | admin owns the master catalog |
| Offers | `isVendor` (→"Pricing & Inventory") else `offer:review` | ✓ (label "Offers") | admin reviews offers |
| Cart | `isRestaurant` | ✗ | only restaurants have carts |
| Orders | always | ✓ | admin reviews/assigns/completes |
| Payments | `payment:verify` | ✓ | admin verifies advances |
| Vendors | `performance:view` | ✓ | admin monitors scorecards |

> **Remember:** hiding a tab is **convenience only**. Even if you navigate to a
> hidden URL, the page guard + backend permission check still apply. UI gating is
> never the security boundary.

---

## 4. Step-by-step: an admin write action (Catalog → create a product)

The dashboard is read-only. The clearest admin *write* is the Master Catalog at
`/manage/products`. Let's trace clicking **"New product"** → typing → **"Create
product"**.

### Step 4.1 — The page guards itself, then renders the table

`ManageProductsPage` first checks the admin can manage the catalog; otherwise it
shows a friendly notice (this is what a vendor would see if they forced the URL):

```tsx
// frontend/src/app/(app)/manage/products/page.tsx (lines 524–556, trimmed)
export default function ManageProductsPage() {
  const authz = useAuthz();
  const canCreate = authz.can(PERMISSIONS.PRODUCT_CREATE);
  const canManage = canCreate || authz.can(PERMISSIONS.PRODUCT_REVIEW);
  // ...state: page, statusFilter, creating, editingId...
  const { data, isLoading, isError, error } = useProducts({ page, pageSize: PAGE_SIZE, status: statusFilter || undefined, sort: '-createdAt' });

  if (!canManage) {
    return <div>The catalog is managed by the Admin and Administration teams. ...</div>;  // ← non-admins stop here
  }
  // ...renders the toolbar (status filter + "New product"), the products table, and modals...
}
```

`useProducts` is the read that fills the table (`GET /products`), cached under
`['products', filters]`:

```ts
// frontend/src/hooks/use-products.ts (lines 20–26)
export function useProducts(filters) {
  return useQuery({ queryKey: ['products', filters],
    queryFn: () => apiRequestPaginated<Product>('/products', { query: filters }),
    placeholderData: keepPreviousData });   // keep old rows visible while paging
}
```

### Step 4.2 — Clicking "New product" opens a modal with a form

The button just flips a state flag; when `creating` is true the page renders a
`Modal` containing `CreateProductForm`:

```tsx
// frontend/src/app/(app)/manage/products/page.tsx (lines 581–585, 668–672)
{canCreate && (<Button onClick={() => setCreating(true)} disabled={noCategories}>New product</Button>)}
// ...
{creating && (
  <Modal title="New product" onClose={() => setCreating(false)}>
    <CreateProductForm categories={categories} onClose={() => setCreating(false)} />
  </Modal>
)}
```

The form keeps its fields in local `useState`, validates on submit, and calls the
`useCreateProduct` mutation. On success it closes the modal; on error it shows the
server's message:

```tsx
// frontend/src/app/(app)/manage/products/page.tsx (lines 94–117) — CreateProductForm.onSubmit
const onSubmit = (e) => {
  e.preventDefault();
  if (!form.name.trim() || !form.sku.trim() || !form.categoryId) { setFeedback({ type:'err', message:'Name, SKU and category are required.' }); return; }
  create.mutate(
    { name: form.name.trim(), sku: form.sku.trim(), categoryId: form.categoryId, unit: form.unit,
      brand: form.brand.trim() || null, description: form.description.trim() || null,
      transportPercent: Number(form.transportPercent) || 0, isFeatured: form.isFeatured },
    { onSuccess: () => onClose(),
      onError: (err) => setFeedback({ type: 'err', message: errMessage(err) }) },
  );
};
```

### Step 4.3 — The mutation sends `POST /products` and refreshes the table

`useCreateProduct` posts to `/products`; on success it invalidates the
`['products']` cache, which makes `useProducts` automatically refetch so the new
row appears:

```ts
// frontend/src/hooks/use-products.ts (lines 51–58)
export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductBody) => apiRequest<Product>('/products', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),   // ← table refetches
  });
}
```

### Step 4.4 — The backend route requires the `product:create` permission

Unlike the dashboard, this route has a real **authorize** guard. A non-admin
token is rejected with `403` here, before any handler runs:

```ts
// backend/src/modules/products/product.routes.ts (lines 60–73)
router.post('/products', {
  schema: { tags: ['products'], summary: 'Create a master-catalog product (Admin only)',
    security: [{ bearerAuth: [] }], body: createProductSchema,
    response: { 201: successEnvelope(productResponseSchema), ...commonErrorResponses } },
  preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRODUCT_CREATE)],   // ← gate
}, controller.create);
```

### Step 4.5 — Controller → service (with a second, role-level check)

The controller forwards to the service:

```ts
// backend/src/modules/products/product.controller.ts (lines 33–39)
create = async (request, reply) => {
  const product = await this.service.create(request.body, getRequestContext(request));
  await reply.code(201).send(ok(product, request.id));
};
```

The service enforces **`assertAdmin(ctx)`** — a *belt-and-suspenders* check on top
of the route permission (only the top-level Admin may create catalog products,
even though Operations also has some catalog permissions). Then it validates the
category, enforces a unique SKU, and creates the product as `DRAFT` inside a
transaction with an audit record:

```ts
// backend/src/modules/products/product.service.ts (lines 90–119, trimmed)
async create(input: CreateProductInput, ctx: RequestContext): Promise<ProductDto> {
  assertAdmin(ctx);                                          // ← only ADMIN, else ForbiddenError(403)
  const category = await this.categories.findById(input.categoryId);
  if (!category) throw new NotFoundError('Category not found');
  if (await this.products.existsSku(input.sku))
    throw new DuplicateResourceError('A product with this SKU already exists', [{ field: 'sku', message: 'SKU must be unique across the catalog' }]);

  const created = await this.db.$transaction(async (tx) => {
    const product = await this.products.create({ categoryId: input.categoryId, sku: input.sku, name: input.name,
      description: input.description ?? null, unit: input.unit, brand: input.brand ?? null,
      status: 'DRAFT',                                       // ← new products always start as DRAFT
      isFeatured: input.isFeatured, createdBy: ctx.userId, updatedBy: ctx.userId /* ... */ }, tx);
    await this.audit.record({ action: AUDIT_ACTIONS.PRODUCT_CREATED, entityId: product.id, /* ... */ }, tx);
    return product; /* ...mapped to DTO below... */
  });
  // ...returns toProductDto(created)...
}
```

`assertAdmin` is the exact line that turns a non-admin into a 403:

```ts
// backend/src/common/authz.ts (lines 13–25)
export function isAdmin(ctx) { return ctx.roles.includes(ROLES.ADMIN); }
export function assertAdmin(ctx) { if (!isAdmin(ctx)) throw new ForbiddenError('Only an Admin can perform this action'); }
```

The repository performs the only Prisma write, and the result bubbles all the way
back up: service → controller (`ok(...)`, 201) → `apiRequest` unwraps →
`onSuccess` invalidates `['products']` → `useProducts` refetches → the new row
renders in the table.

### Step 4.6 — The rest of the admin catalog lifecycle (same pattern)

Inside the "Manage" modal (`EditProductPanel`), each admin action is the same
shape — a permission-gated mutation hook → a guarded route → a service method:

| Admin action (UI) | Hook | Endpoint | Permission | Service guard |
|---|---|---|---|---|
| Save details | `useUpdateProduct` | `PATCH /products/:id` | `product:update` | `assertAdmin` |
| Change lifecycle status | `useChangeProductStatus` | `PATCH /products/:id/status` | `product:review` | (status rules) |
| Use computed / override price | `useSetPrice` | `POST /products/:id/price` | `price:update` | pricing service |
| Approve / reject a vendor offer | `useReviewOffer` | `PATCH /offers/:id/review` | `offer:review` | offer service |
| Delete product | `useDeleteProduct` | `DELETE /products/:id` | `product:delete` | `assertAdmin` (soft delete) |

The UI even hides each control behind the matching permission, mirroring the
backend so the admin only sees what they can actually do:

```tsx
// frontend/src/app/(app)/manage/products/page.tsx (lines 338–342)
const canEdit   = authz.can(PERMISSIONS.PRODUCT_UPDATE);
const canReview = authz.can(PERMISSIONS.PRODUCT_REVIEW);
const canPrice  = authz.can(PERMISSIONS.PRICE_UPDATE);
const canDelete = authz.can(PERMISSIONS.PRODUCT_DELETE);
```

> **The business arc** (why DRAFT?): an admin **creates** a product (`DRAFT`) →
> vendors **submit price offers** → the admin **approves offers** and **sets a
> selling price** (average of vendor prices + transport markup, or a manual
> override) → the admin **approves the product** (`APPROVED`) → only then does it
> appear in the restaurant storefront. The Catalog page is the cockpit for that
> whole arc.

---

## 5. The function call map (who calls whom)

**Read (dashboard):**

```
DashboardPage()                                   frontend/.../dashboard/page.tsx
  ├─ useAuthStore(s => s.user)                     lib/auth-store.ts
  ├─ useAuthz()                                    lib/authz.ts        → {isAdmin,isStaff,...}
  └─ useDashboard()                                hooks/use-dashboard.ts
        └─ apiRequest('/analytics/dashboard')      lib/api.ts
              └─ send() → rawRequest() → fetch()   (Authorization: Bearer <jwt>)
                    │  HTTP GET /api/v1/analytics/dashboard
                    ▼
              app.authenticate                     middleware/auth.ts  → request.ctx
              AnalyticsController.dashboard         analytics.controller.ts
                └─ AnalyticsService.getDashboard(ctx)        analytics.service.ts
                     └─ isAdmin(ctx) → adminDashboard()      analytics.service.ts
                          └─ AnalyticsRepository.{ordersByStatus,countOrders,sumOrderTotal,
                             countVendors,countRestaurants,countProducts}()  analytics.repository.ts
                               └─ Prisma → PostgreSQL
                     ◄─ { scope:'admin', metrics, ordersByStatus }
                └─ ok(data, requestId)             common/responses.ts
        ◄─ apiRequest returns json.data
  └─ React Query caches ['dashboard'] → DashboardPage re-renders
        ├─ MetricCard × 8
        ├─ Orders by status panel
        ├─ RecentOrders → useOrders() → GET /orders
        └─ TopVendors  → useVendorPerformanceList() → GET /vendor-performance   (isStaff only)
```

**Write (create product):**

```
"New product" onClick → setCreating(true) → <CreateProductForm>
  └─ onSubmit → create.mutate(body)
       └─ useCreateProduct.mutationFn → apiRequest('/products', POST)   hooks/use-products.ts
             └─ fetch POST /api/v1/products (Authorization: Bearer)
                   ▼
             app.authenticate → app.authorize('product:create')    middleware/auth.ts (403 if missing)
             ProductController.create                              product.controller.ts
               └─ ProductService.create(body, ctx)                 product.service.ts
                    ├─ assertAdmin(ctx)                            common/authz.ts (403 if not ADMIN)
                    ├─ categories.findById / products.existsSku
                    └─ db.$transaction → products.create({status:'DRAFT'}) + audit.record
                         └─ Prisma → PostgreSQL
               └─ ok(product, requestId) → 201
       └─ onSuccess → queryClient.invalidateQueries(['products'])
  └─ useProducts refetches → GET /products → table re-renders with the new row
```

---

## 6. File-by-file reference for the admin page

| Layer | File | Role in the admin page |
|---|---|---|
| HTML shell | `frontend/src/app/layout.tsx` | `<html><body>`, mounts Providers |
| Providers | `frontend/src/app/providers.tsx` | React Query client (enables all hooks) |
| Redirect | `frontend/src/app/page.tsx` | `/` → `/dashboard` (if token) else `/login` |
| Auth shell | `frontend/src/app/(app)/layout.tsx` | wraps pages in `AuthGuard` + `Nav` |
| Guard | `frontend/src/components/auth-guard.tsx` | redirect to `/login` if not authed |
| Nav | `frontend/src/components/nav.tsx` | computes the admin's tabs from `useAuthz` |
| Dashboard page | `frontend/src/app/(app)/dashboard/page.tsx` | the admin landing screen (metrics, recent orders, top vendors) |
| Catalog page | `frontend/src/app/(app)/manage/products/page.tsx` | admin create/approve/price products |
| Identity store | `frontend/src/lib/auth-store.ts` | persists token + roles/permissions |
| Authz | `frontend/src/lib/authz.ts` | `isAdmin/isStaff/can()` |
| HTTP client | `frontend/src/lib/api.ts` | token, refresh, envelope unwrap |
| Hooks | `frontend/src/hooks/use-dashboard.ts`, `use-orders.ts`, `use-performance.ts`, `use-products.ts`, `use-offers.ts`, `use-auth.ts` | UI→API bridges |
| UI atoms | `frontend/src/components/ui/{card,button,input}.tsx` | `Card`/`CardBody`, `StatusBadge`, `Button`, `Input`/`Label`/`Select` (the `MetricCard` and `Modal` wrappers are defined locally in the page files) |
| Route (read) | `backend/src/modules/analytics/analytics.routes.ts` | `GET /analytics/dashboard` (authenticate only) |
| Controller (read) | `backend/src/modules/analytics/analytics.controller.ts` | calls service, wraps `ok()` |
| Service (read) | `backend/src/modules/analytics/analytics.service.ts` | `getDashboard` → `adminDashboard()` |
| Repository (read) | `backend/src/modules/analytics/analytics.repository.ts` | COUNT/SUM/GROUP BY |
| Route (write) | `backend/src/modules/products/product.routes.ts` | `POST /products` (`product:create`) |
| Controller (write) | `backend/src/modules/products/product.controller.ts` | `create` |
| Service (write) | `backend/src/modules/products/product.service.ts` | `create` (`assertAdmin`) |
| Auth | `backend/src/middleware/auth.ts`, `modules/auth/*`, `common/authz.ts`, `common/permissions.ts` | who the admin is + what they can do |
| Seed | `backend/prisma/seed.ts` | creates `admin@procurement.local` with the ADMIN role |

---

## 7. Debugging the admin page (symptom → where to look)

| Symptom | Most likely cause | Where to look |
|---|---|---|
| `/dashboard` bounces to `/login` | no token / store not rehydrated | `auth-guard.tsx`; check `localStorage['procurement-auth']` has `accessToken` |
| Dashboard shows "Failed to load dashboard" | the `GET /analytics/dashboard` errored | Network tab → response `error.code`; copy `x-request-id` → backend logs |
| All metrics are `0` / "Orders by status" empty | fresh DB (no completed orders yet) — **not a bug** | `adminDashboard()` filters (`status:'COMPLETED'`, etc.); seed/exercise data |
| Admin sees the *restaurant* dashboard | identity wrong — `isAdmin` false | `auth-context.service.ts` (roles), `authz.ts`; verify `context.roles` includes `ADMIN` |
| Admin missing the Catalog/Payments/Vendors tabs | permission missing on the role | `nav.tsx` gates + `common/permissions.ts` `ADMIN: ALL_PERMISSIONS` |
| "New product" → `403` | route or service rejected | `product.routes.ts` `authorize('product:create')`, then `assertAdmin` in `product.service.ts` |
| "New product" → `409 SKU exists` | duplicate SKU | `product.service.ts` `existsSku` check |
| Created product but table didn't update | cache not invalidated | `useCreateProduct.onSuccess` must `invalidateQueries(['products'])` |
| New product not visible to restaurants | it's still `DRAFT`/not `APPROVED` | change status to `APPROVED` in the Manage modal; restaurants only see `APPROVED` (`product.service.list`) |
| `401` mid-session, then logged out | refresh failed | `api.ts` `attemptRefresh`; check the refresh cookie + CORS credentials |

**The universal trick:** open DevTools → Network, click the failing call, read
the JSON `error.code`/`message`, and copy the `x-request-id` response header. Then
search the backend logs for that id — you'll find the exact line that failed,
even for a generic `500`.

---

## 8. One-paragraph recap

There is no dedicated admin page file. You log in as `admin@procurement.local`;
the backend hands back a JWT plus a `context` saying `roles:['ADMIN']` with every
permission, which the browser persists. Next.js renders the shared shell
(`layout → providers → AuthGuard → Nav → page`), and `DashboardPage` mounts and
calls `useDashboard()`, which `apiRequest`s `GET /api/v1/analytics/dashboard` with
the admin's bearer token. The backend authenticates (no extra permission needed
for one's own dashboard), and `AnalyticsService.getDashboard` branches on
`isAdmin(ctx)` to run `adminDashboard()`, whose repository COUNT/SUM/GROUP BY
queries produce the platform metrics. The response comes back in the standard
envelope, React Query caches it, and the page renders the metric cards plus the
admin-only Recent Orders + Top Vendors panels. Admin *writes* (like creating a
catalog product) follow the same path but add an `authorize('product:create')`
route guard and an `assertAdmin(ctx)` service check, then invalidate the relevant
React Query cache so the UI refreshes. Every admin difference is just **identity +
server-side branching**, never a separate app.
