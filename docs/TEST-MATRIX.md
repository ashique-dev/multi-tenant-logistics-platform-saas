# Test matrix and seed plan

Every behavior is classified so nothing is only tested on the happy path.

Legend: **PASS** = must succeed, **FAIL** = must be rejected, **MID** = intermediate/pending state,
**DONE** = completes end-to-end, **INCOMPLETE** = stops partway (compensation/DLQ), **CONC** = concurrency,
**CHAOS** = dependency failure. Status: ✅ implemented and passing, ⏳ lands with its phase.

## Phase 2 (implemented: 123 automated tests + 12 boot checks)

| Area | Cases | Class | Status |
|---|---|---|---|
| Config | defaults, CSV, coercion, Swagger default per env, 8 invalid values, all-issues report | PASS/FAIL | ✅ |
| Error mapping | 9 domain kinds, mapper precedence, validation, route-vs-resource 404, 5xx masking, body-parser errors, 5 unknown throwables never leak | PASS/FAIL | ✅ |
| Request/trace IDs | valid kept, 7 malformed replaced (incl. header/log injection), W3C traceparent, memoisation, 60-way concurrency isolation | PASS/FAIL/CONC | ✅ |
| Validation | valid, multi-field, nested path, unknown props (mass-assignment), type confusion, empty, bad JSON, 413, UUID/Int pipes, malformed %-encoding | PASS/FAIL | ✅ |
| Health | live independent of deps, ready ok/degraded/unavailable, no error text leak, hung dep timeout, parallel checks | PASS/FAIL/CHAOS | ✅ |
| Security | helmet headers, no x-powered-by, CORS deny/allow, Swagger off in prod, tenant context fails closed | PASS/FAIL | ✅ |
| Logging | base fields, 9 redaction cases, no over-redaction | PASS/FAIL | ✅ |
| Architecture | boundary rules catch 3 deliberate violations | FAIL | ✅ |
| Boot | 3 processes, invalid config exits non-zero, SIGTERM drains | PASS/FAIL | ✅ |
| Mutation check | breaking redaction / leaking messages makes 5 tests fail | meta | ✅ |

## Seed dataset (deterministic IDs, `npm run db:seed`, arrives with schema in Phases 3-5)

- **Tenants:** `acme` (large, active), `bolt` (small, active), `cedar` (SUSPENDED: login must fail).
- **Users per tenant:** owner, ops-manager, warehouse-staff, dispatcher, 3 delivery agents, merchant, customer, auditor; one LOCKED user; one user belonging to both acme and bolt (tenant switching).
- **Inventory:** 3 warehouses; 40 SKUs including zero-stock, exactly-enough, low-stock, and a hot SKU for concurrency tests.
- **Orders in every state:** PENDING, RESERVED, CONFIRMED, FULFILLING, COMPLETED, REJECTED, PAYMENT_FAILED, CANCELLED, plus one stuck PENDING for reservation-expiry.
- **Other:** shipments at each status, assignments, payments (authorized/captured/failed/refunded), completed idempotency keys, outbox rows (PENDING/PUBLISHED/FAILED), poison messages in DLQ.

## Planned matrix (⏳)

| Phase | Scenarios (class) |
|---|---|
| 3 Infra | PG/Redis/Kafka/RabbitMQ/BullMQ connect + readiness; Redis down → API still serves (CHAOS); Kafka down → publish deferred (CHAOS) |
| 4 Identity | login ok / wrong password / locked / suspended tenant (PASS/FAIL); refresh rotation; **reuse of old refresh token revokes family**; expired/invalid/tampered JWT → 401; missing permission → 403; cross-tenant read/update/delete → 404; RLS blocks query with forgotten filter |
| 5 Business | order create ok / out-of-stock → REJECTED / cancel from each state (allowed vs illegal) ; optimistic-lock conflict → 409; cursor pagination boundaries |
| 6 Workflows | full saga DONE; payment fail → compensation (INCOMPLETE); duplicate HTTP key → same response; same key different body → 422; duplicate Kafka/RabbitMQ message → one effect; consumer crash mid-handler; poison → DLQ and replay; outbox relay crash/restart; deadlock retry; 100 concurrent reservations on the hot SKU never oversell (CONC) |
| 7-9 | trace spans link HTTP→DB→Kafka→worker; metrics emitted; dependency outage matrix from the spec |
