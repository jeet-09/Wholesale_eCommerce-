# Engineering Rules & Development Workflow

These are the binding rules for building and extending this platform. They exist because this codebase is meant to live for years, be worked on by many engineers, and grow far beyond the MVP. **Production-grade is the only acceptable standard.** When in doubt, choose the option that is clearer, safer, and easier to extend — even if it is slightly more work now.

`MUST` = mandatory. `SHOULD` = strong default; deviation requires a written reason in the PR.

---

## 1. The Non-Negotiables (Golden Rules)

1. **No business logic in controllers/routes.** Routes validate input and delegate to services. (See `TECHNICAL-DETAILS.MD`.)
2. **Services never touch Prisma directly.** All data access goes through repositories.
3. **Every async operation uses `async/await` and is properly awaited.** No floating promises. No `.then()` chains mixed with `await`.
4. **Every operation that can fail has explicit error handling.** No empty `catch`. No swallowed errors. Errors are typed and meaningful. (See §5.)
5. **Validate everything at the boundary** with Zod before it reaches business logic.
6. **Never hard-delete business data.** Soft delete only. Preserve data by default.
7. **Money is `DECIMAL`, never float.** Timestamps are `TIMESTAMPTZ` in UTC.
8. **Mutations that span multiple writes run in a transaction.** All-or-nothing.
9. **No secrets in the repo. No `console.log` in production code.**
10. **The API is versioned and documented.** Breaking changes ⇒ a new version, never a silent change.

If a change violates a golden rule, it does not get merged.

---

## 2. How Development Proceeds (Workflow)

Every feature follows the same lifecycle. Do not skip steps.

```text
1. Understand   → Read README.md, DATABASE.md, and the relevant module docs.
2. Design       → Confirm the data model (DATABASE.md) and API contract (README.md) FIRST.
                  If the schema needs to change, update DATABASE.md in the same PR.
3. Schema       → Write/adjust the Prisma schema → create a migration → review it.
4. Contract     → Define Zod schemas (request/response) = the typed API contract.
5. Bottom-up    → repository → service → controller → route → wire into the module.
6. Test         → Unit (service) + integration (repository/API) tests alongside the code.
7. Document     → Update OpenAPI (auto from Zod) + any affected .md docs.
8. Verify       → Lint, typecheck, tests, and a manual smoke test all pass.
9. Review       → Open a small, focused PR. Address review comments.
10. Merge        → Squash-merge with a conventional commit message.
```

**Order of implementation always flows from the data outward:** database → repository → service → API → UI. Never build a UI against an API that isn't defined, and never define an API against a schema that isn't agreed.

---

## 3. Architecture Rules

* Organize backend code by **domain module** (`auth`, `users`, `orders`, …), not by technical type. Each module owns its routes, controller, service, repository, schemas, and types. (See `TECHNICAL-DETAILS.MD` for module anatomy.)
* Strict **layering**, dependencies point inward only:
  `route → controller → service → repository → Prisma`. A lower layer never imports an upper layer.
* **Dependency Injection:** components depend on interfaces, not concrete classes. This keeps services unit-testable with mock repositories.
* **SOLID** is applied deliberately:
  * **S** — one class/module, one reason to change.
  * **O** — extend via new code, not by editing stable code.
  * **L** — implementations are substitutable for their interfaces.
  * **I** — small, focused interfaces over fat ones.
  * **D** — depend on abstractions; wire concretions at the composition root.
* Cross-cutting concerns (auth, logging, error handling, request context) are **Fastify plugins/hooks**, never copy-pasted into handlers.

---

## 4. Coding Standards

* **TypeScript strict mode is on.** `any` is forbidden (use `unknown` + narrowing). No non-null `!` assertions without justification.
* **No implicit returns of `any`**, no untyped function boundaries. Public functions have explicit return types.
* **Naming:** `camelCase` (vars/functions), `PascalCase` (types/classes/components), `UPPER_SNAKE_CASE` (constants), `kebab-case` file names for modules, `snake_case` only in the database.
* **Pure functions where possible.** Side effects are isolated and obvious.
* **Small functions, single responsibility.** If a function needs a comment to explain its sections, split it.
* **Comments explain *why*, not *what*.** No narration comments. Delete dead code instead of commenting it out.
* **No magic numbers/strings** — name them as constants or config.
* **Imports ordered**: node builtins → external → internal; no unused imports.

---

## 5. Error Handling & Async (Mandatory)

> This is called out separately because it is the most common source of production incidents and the user has explicitly required it.

* **Always `await`** async calls. A function that calls async code is `async`. Never leave a promise unhandled (a "floating promise").
* **Wrap fallible operations in `try/catch`** at the layer that can meaningfully react. Do not wrap everything blindly — wrap where you add value (translate, enrich, or recover).
* **Never swallow errors.** Empty `catch {}` is forbidden. If you catch, you either: recover, rethrow a typed error, or log-and-rethrow at the boundary.
* **Use typed, domain errors** (e.g. `NotFoundError`, `ValidationError`, `ConflictError`, `InsufficientStockError`) — not raw `throw new Error('...')` in business code.
* **One global error handler** (Fastify `setErrorHandler`) maps domain errors → the standard error envelope + correct HTTP status. Handlers throw; they do not format error responses themselves.
* **Never leak internals** (stack traces, SQL, secrets) to clients. Log details server-side with the request ID; return a safe message + stable `error.code`.
* **Clean up resources** in `finally` (or rely on transaction rollback) so failures never leak connections, locks, or reservations.

```typescript
// BAD — floating promise, swallowed error, leaks internals
function placeOrder(input) {
  orderService.create(input).catch(() => {}); // ❌ never await, error lost
}

// GOOD — awaited, typed error, mapped centrally
async function placeOrder(req, reply) {
  const dto = createOrderSchema.parse(req.body);     // throws ValidationError
  const order = await orderService.create(dto);      // throws domain errors
  return reply.code(201).send(ok(order));            // global handler maps any throw
}
```

---

## 6. Database & Data Rules

* The Prisma schema **must** match `DATABASE.md`. Schema changes and doc changes ship together.
* **Every schema change is a reviewed Prisma migration.** Never `prisma db push` to shared environments.
* Migrations are **forward-only** and follow expand → migrate → contract for anything potentially breaking (protects live clients during rollout).
* Repository layer always filters `deleted_at IS NULL` unless explicitly fetching deleted rows.
* Append-only tables (price history, status history, ledger entries, audit logs) are **never** updated or deleted.
* Multi-write operations use `prisma.$transaction`. **No network/IO inside a transaction** — use the outbox.

---

## 7. API Rules

* All routes under `/api/v1`. Breaking changes ⇒ `/api/v2`; never mutate a shipped contract.
* Every endpoint: Zod-validated input, standard response envelope, correct status code, OpenAPI documented (auto from Zod).
* List endpoints are paginated (default 20, max 100), filterable, and sortable per documented fields.
* Money in responses is a decimal string with an explicit `currency`. Timestamps are ISO-8601 UTC.
* Write endpoints with side effects honor the `Idempotency-Key` header.
* Clients branch on `error.code`, never on human messages — keep the code catalog stable.

---

## 8. Security Rules

* **Default-deny:** every route is authenticated + authorized unless explicitly public.
* RBAC enforced centrally; resource ownership checked on every access.
* Passwords hashed with argon2id (or bcrypt). Tokens stored **hashed**. Refresh tokens rotate.
* Validate and sanitize all input; never build raw SQL.
* Helmet, CORS allow-list, and rate limiting are always on. Auth endpoints are rate-limited harder.
* Secrets only from env/secret manager, validated at startup. Never logged, never committed.
* Never log PII or credentials (Pino redaction configured).

---

## 9. Testing Rules

* New code ships with tests; **every bug fix ships with a regression test.**
* Services are unit-tested with mocked repositories; repositories/APIs are integration-tested against a real test database.
* Tests are deterministic and self-isolating (seed + teardown their own data).
* Transactions are tested for **rollback** (prove no partial writes / leaked reservations).
* Target 80%+ coverage on business-critical modules (orders, inventory, pricing, auth).

---

## 10. Git & Collaboration

**Branches**

```text
feature/<module>-<short-desc>     feature/order-creation
bugfix/<short-desc>               bugfix/inventory-negative-stock
hotfix/<short-desc>               hotfix/login-500
chore/<short-desc>                chore/upgrade-prisma
```

**Commits** — Conventional Commits, imperative mood, scoped:

```text
feat(orders): add order creation endpoint
fix(inventory): correct sellable stock to available - reserved
refactor(auth): extract token service
docs(database): document idempotency keys table
test(orders): cover transaction rollback on stock failure
chore(deps): bump fastify to latest
```

**Pull Requests**

* Small and focused — one logical change. Large PRs get split.
* PR description states *what* and *why*, links the issue, and lists how it was tested.
* CI (lint + typecheck + tests) must be green before review.
* At least one approving review before merge. Squash-merge to keep history clean.

**Definition of Done**

- [ ] Meets the golden rules (§1).
- [ ] Schema/docs updated if the data model or API changed.
- [ ] Zod validation + standard envelope + OpenAPI on any new endpoint.
- [ ] Tests written and passing; coverage maintained on critical paths.
- [ ] Lint + typecheck clean; no `console.log`, no `any`, no swallowed errors.
- [ ] Manually smoke-tested.

---

## 11. Extensibility Mindset

Every feature is built assuming **more will be added later** (mobile apps, new portals, payments, logistics):

* Prefer additive changes; never break an existing contract or table.
* Code to interfaces so new implementations slot in without edits.
* Keep modules independent — a new domain should be a new module, not edits scattered across old ones.
* When you find yourself special-casing one client, stop — fix the shared contract instead.

> Build for the team that maintains this in two years and the mobile app that ships next quarter.
