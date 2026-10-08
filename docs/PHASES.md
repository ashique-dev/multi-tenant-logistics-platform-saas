# Phase plan: complete task register

Single source of truth for what is built when. Every requirement of the original brief
(sections 1-40) is mapped to a phase below. Tick items as they ship. Nothing may be dropped
silently: if a task moves or is cut, record why in "Change log" at the bottom.

## Definition of done (applies to EVERY phase)
1. Complete end-to-end run **from a clean start**: install, typecheck, lint, format, architecture
   rules, build, unit, integration, e2e, failure/chaos, boot of all processes. Re-run all earlier
   phases' tests (no regressions). Fix, then re-run from the beginning.
2. Test classes covered: should-pass, should-fail, intermediate, complete, incomplete, concurrency, chaos.
3. Report honestly what ran against real services vs doubles; give a script for what the sandbox cannot run.
4. Update `README.md` (capabilities, run/test commands, setup notes, troubleshooting, true status).
5. Provide a commit message (same format as Phase 2).
6. Provide the architectural review (Architecture, Correctness, Security, Scalability, Reliability,
   Observability, Maintainability, Testability, Operational complexity, Cost; Excellent/Good/Needs
   Improvement/Critical) and the technical-debt list.
7. For each significant file: explain the problem solved, where it belongs, why the dependency direction
   is correct, how it connects, how to run/test, expected output, failure scenarios, production notes.
   Teach each new concept: what, why, where, problem solved, alternatives, when NOT to use.
8. Deliver as tarball + updated README; update project memory.
9. Seed data grows with the schema; `docs/TEST-MATRIX.md` updated.

## Phase 1: Architecture  [DONE, approved]
Requirements, module boundaries, data ownership, event architecture, infra, Docker, security,
observability. Key approved decisions: modular monolith with api/worker/relay processes; TypeORM +
hand-written SQL migrations + RLS; shared schema + tenant_id; UUIDv7; Kafka=facts, RabbitMQ=commands,
BullMQ=scheduled jobs; transactional outbox; durable idempotency in Postgres; two Redis instances.

## Phase 2: Repository skeleton  [DONE, verified on Docker]
Structure, Compose (base/dev/prod), Dockerfile, bootstrap, config, lint/format/test, error/ID/log/health
contracts, 123 tests + 12 boot checks. RustFS replaces MinIO (service `objectstore`).

## Phase 3: Infrastructure  [NEXT]
- [ ] Config schema: DATABASE_URL (runtime + migrator), REDIS_CACHE_URL, REDIS_QUEUE_URL, KAFKA_BROKERS, RABBITMQ_URL, S3_*; validated at boot
- [ ] PostgreSQL via TypeORM: pool sizing per process type, statement_timeout, idle_in_transaction timeout
- [ ] SQL migrations (up + down), migration create/run/revert scripts, rollback strategy, seed framework; never synchronize
- [ ] Schemas per module; roles (migrator/runtime/readonly) grants + default privileges
- [ ] TenantTransaction: `SELECT set_config('app.tenant_id', $1, true)` per transaction, RLS policies, base repository injecting tenant_id from RequestContext, non-owner role without BYPASSRLS
- [ ] Postgres ErrorMapper: 23505->409, 23503->422, 40001/40P01->bounded retry, pool exhaustion->503 Retry-After, statement timeout->504
- [ ] Isolation levels + retry helper for serialization failures/deadlocks (jitter, 3 attempts)
- [ ] Redis cache port + adapter: cache-aside, TTL, invalidation, single-flight stampede protection, distributed lock; correct when Redis is down
- [ ] BullMQ connection on redis-queue (noeviction) + queue/worker factory; failed-job retention
- [ ] Kafka: producer/consumer adapters behind ports, topic init job (auto-create is OFF), 6 partitions, key=aggregateId, consumer groups, manual offset commit, retry topics (5s, 1m) + DLT, event envelope + versioned contracts in `src/contracts/events`
- [ ] RabbitMQ: topology (direct exchange, quorum queues), publisher confirms, manual ack, prefetch, retry via TTL wait queues, DLX/DLQ
- [ ] S3 `FileStorage` port + adapter (objectstore), bucket bootstrap
- [ ] Resilience primitives: timeout, retry+backoff+jitter, circuit breaker, bulkhead; retry policy documented (what/how many/backoff/after final failure)
- [ ] Readiness checks registered: Postgres critical; Redis/Kafka/RabbitMQ non-critical; liveness unchanged
- [ ] Ports: Cache, EventBus, MessagePublisher, FileStorage, (repositories later); business code imports no SDKs
- [ ] Non-HTTP ALS scope (ClsService.run) for consumers/workers
- [ ] Verify `messaging`, `observability`, `dev` compose profiles start; confirm objectstore health
- [ ] Tests: integration per dependency; chaos (Postgres/Redis/Kafka/RabbitMQ down, latency); RLS leak test; migration up/down; duplicate message; pool exhaustion; deadlock
- [ ] Docs: DATABASE.md (start), README, TEST-MATRIX

## Phase 4: Identity
- [ ] Modules: identity (users, credentials, sessions, refresh_tokens, external_identities), tenancy (tenants, memberships, teams, roles, permissions, role_permissions)
- [ ] Argon2id (+pepper from secret store); account status (active/locked/disabled); brute-force counters, progressive lockout, uniform errors (no user enumeration)
- [ ] Access JWT asymmetric (EdDSA/RS256), ~10 min, claims sub/tid/sid/jti/iss/aud, JWKS endpoint, kid rotation
- [ ] Refresh: opaque 256-bit, SHA-256 hashed at rest, rotation every use, family_id reuse detection -> revoke family; logout, logout-all; session/device list
- [ ] Revocation: sid checked via Redis revoked-set with Postgres fallback
- [ ] AuthenticationProvider port (local adapter now; OAuth2/OIDC later without rewrite)
- [ ] Guards: AuthGuard, TenantGuard, RolesGuard, PermissionsGuard (no per-role guards); decorators @Roles @Permissions @CurrentUser @CurrentTenant; permissions resolved from Redis keyed (tenant,user,permissionsVersion) with DB fallback
- [ ] Resource/ownership policies in application layer (PolicyService); 401 vs 403; cross-tenant -> 404
- [ ] Rate limiting: Redis distributed; pre-auth by IP+route (stricter on login), post-auth by user/tenant/endpoint; 429 + Retry-After; fail-open general, in-memory fallback for login
- [ ] Interceptors: request/response logging, timing, audit; audit module (user.login, user.logout, user.permission_changed) without secrets
- [ ] Tenant onboarding, invitations, tenant switching (new token)
- [ ] RLS on all tenant tables; seed: 3 tenants (one suspended), users per role, locked user, multi-tenant user
- [ ] Swagger bearer auth; API v1 for auth/users/tenants/roles
- [ ] Tests: login ok/wrong password/locked/suspended tenant; refresh rotation; old-token reuse revokes family; expired/invalid/tampered JWT; missing permission; cross-tenant read/update/delete; RLS with forgotten filter; brute force; concurrency on refresh; Redis down
- [ ] SECURITY.md (start)

## Phase 5: Core business modules
- [ ] parties (customers, merchants); inventory (warehouses, skus, stock_levels, reservations, stock_movements ledger); pricing (rate cards, fees, tax/discount rules); orders; shipments (delivery agents, assignments, tracking events); payments (+invoices, refunds, webhook_events); notifications (templates, log); documents (waybill/invoice PDFs to objectstore)
- [ ] HTTP DTO -> command/query -> domain; Create/Update/Query/pagination/filter/response DTOs; no entities exposed
- [ ] Order state machine PENDING->RESERVED->CONFIRMED->FULFILLING->COMPLETED; REJECTED, PAYMENT_FAILED, CANCELLED; illegal transitions rejected
- [ ] Atomic stock reservation (conditional UPDATE), sorted-SKU locking, optimistic `version`, soft delete where appropriate, audit columns
- [ ] Offset + cursor (keyset) pagination, filtering, sorting; indexes; N+1 prevention
- [ ] Idempotency-Key on order/payment/shipment creation (durable table)
- [ ] Payment gateway port + simulated provider (timeouts, 500s, declines) behind circuit breaker
- [ ] Full seed dataset (orders in every state, shipments at each status, payments authorized/captured/failed/refunded, outbox rows, DLQ messages)
- [ ] Audit: order.created, order.cancelled, payment.completed, shipment.assigned
- [ ] Modules stay facade-only (dependency rules enforced)
- [ ] Tests: each state transition (valid/invalid), out-of-stock, concurrent reservations never oversell, cancel from each state, pagination boundaries, tenant isolation per resource, permission matrix

## Phase 6: Distributed workflows
- [ ] Transactional outbox: table, relay (SKIP LOCKED, sharded by hash(aggregate_id), advisory-lock leader per shard), retry/backoff, status, failure handling, pruning, destinations (Kafka/RabbitMQ/BullMQ)
- [ ] Inbox table; idempotent consumers (unique (consumer,event_id) in same tx as effects)
- [ ] Kafka events: OrderCreated/Confirmed/Cancelled, InventoryReserved/Failed/Released, PaymentAuthorized/Completed/Failed, ShipmentCreated/Assigned/Delivered, UserRegistered; versioning/schema evolution; contract tests
- [ ] RabbitMQ commands: payments.authorize, shipments.assign-agent, documents.render with retries + DLQ + poison handling
- [ ] BullMQ queues: email/sms (jobId=notificationId, backoff, limiter, priority), reports, maintenance (repeatable: reservation expiry, prune outbox/idempotency/tokens), reconciliation; failed-job handling + admin requeue
- [ ] Choreography saga with compensation; reservation expiry (15 min delayed job); API exposes intermediate states
- [ ] DLQ/DLT replay CLI; retry policy table per integration
- [ ] Optional WebSocket for live shipment status
- [ ] Consistency boundaries documented (strong vs eventual)
- [ ] Tests: full saga DONE; payment-fail compensation (INCOMPLETE); duplicate HTTP key; same key different body 422; duplicate Kafka/RabbitMQ message; consumer crash mid-handler; relay crash/restart; poison -> DLQ -> replay; deadlock retry; 100 concurrent reservations on hot SKU; broker outages while API keeps serving
- [ ] EVENTS.md

## Phase 7: Observability
- [ ] Structured logs complete incl. userId/tenantId everywhere; Loki/Promtail (optional)
- [ ] `/metrics`: HTTP count/latency/error rate, DB latency, pool usage, cache hit/miss, Kafka lag, RabbitMQ depth, BullMQ failures, auth failures, rate-limit events, outbox backlog/age, business counters
- [ ] OpenTelemetry SDK; trace HTTP -> DB -> Redis -> outbox -> Kafka/RabbitMQ/BullMQ -> worker; traceparent through outbox headers
- [ ] Grafana dashboards (RED per route, outbox lag, consumer lag, DLQ depth, per-tenant volume); Prometheus targets green; alert rules
- [ ] Health re-verified; OBSERVABILITY.md
- [ ] Tests: metrics present, trace linkage across async hops, log redaction under load

## Phase 8: Security hardening
- [ ] Review: authN/Z, tenant isolation, headers/CSP/CORS, input sanitization, mass assignment, SQL injection, secrets handling (env now, secrets-manager design), JWT/refresh security, rate limits, audit completeness, dependency audit
- [ ] SECURITY.md complete; findings with severity and fixes

## Phase 9: Testing
- [ ] Unit/integration/E2E full suites; failure suite covering ALL of: PostgreSQL/Redis/Kafka/RabbitMQ unavailable, consumer crash, duplicate Kafka event, duplicate RabbitMQ message, BullMQ worker crash, transaction failure, external API timeout/500, network latency, stale cache, deadlock, duplicate HTTP request, invalid JWT, expired JWT, cross-tenant access, insufficient permission
- [ ] Concurrency, authorization matrix, tenant-isolation, contract tests; expected behavior documented per scenario; reproducible via Docker

## Phase 10: Production readiness
- [ ] Review scaling, DB, caching, Kafka, RabbitMQ, BullMQ, containers, resource limits, security, observability, backup/recovery, DR, deployment
- [ ] Pin image versions (no `:latest`), PgBouncer, 3-broker Kafka profile, TLS at edge, CI pipeline, backup/PITR plan, RUNBOOK.md
- [ ] Gateway-vs-service responsibility doc; microservice evolution per module (why in monolith, why it could split, API/event boundary, data ownership)

## Documentation deliverables (final set)
README.md (every phase), ARCHITECTURE.md (Mermaid), SECURITY.md (4/8), OBSERVABILITY.md (7), EVENTS.md (6),
DATABASE.md (3+), RUNBOOK.md (10). Include Kafka-vs-RabbitMQ-vs-BullMQ explanation.

## Carried technical debt (from Phase 2)
1. `:latest` image tags (pin in Phase 10)  2. No CI pipeline file yet  3. Noisy Nest startup logs
4. e2e MaxListeners warning  5. Kafka topic init job (Phase 3)  6. Seed + full matrix unbuilt until schema exists
7. Unverified: `messaging`/`observability`/`dev` profiles, objectstore health

## Environment notes
- User works in Windows/WSL2; full stack ~6-8 GB; use compose profiles.
- Sandbox has no Docker: try apt Postgres/Redis; Kafka/RabbitMQ likely doubles; always state real vs double.
- NestJS 12 is ESM-only: relative imports end in `.js`; never `import type` an injected class.
- Do NOT use `pkill -f` with a pattern that appears in the same command line.

## Change log
- Phase 2: MinIO -> RustFS (`objectstore`) because MinIO withdrew public images (Sept 2026).
