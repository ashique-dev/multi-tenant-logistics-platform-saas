# Architecture (Phase 1, approved)

```mermaid
flowchart TD
  Client --> Nginx[Nginx edge]
  Nginx --> API
  API --> PG[(PostgreSQL + RLS)]
  API --> RC[(Redis cache)]
  API -- outbox row, same tx --> PG
  Relay -- poll SKIP LOCKED --> PG
  Relay --> Kafka
  Relay --> RabbitMQ
  Relay --> BQ[(Redis queue / BullMQ)]
  Kafka --> Worker
  RabbitMQ --> Worker
  BQ --> Worker
  Worker --> PG
  API & Worker & Relay --> OTel[OTel Collector] --> Jaeger
  Prometheus --> API & Worker & Relay
```

Decisions: modular monolith with `api`/`worker`/`relay` processes; TypeORM + hand-written
SQL migrations; shared schema + `tenant_id` + RLS (transaction-local `set_config`);
UUIDv7 ids; Kafka = facts, RabbitMQ = commands, BullMQ = scheduled/delayed jobs;
transactional outbox; durable idempotency in Postgres; two Redis instances.
Full rationale: Phase 1 review in the project chat.
