# Logistics & Commerce Operations Platform

Multi-tenant logistics/commerce backend: NestJS modular monolith, PostgreSQL (RLS),
Redis, Kafka, RabbitMQ, BullMQ, OpenTelemetry. Built phase by phase; see `docs/`.

**Status: Phase 2 (skeleton) complete and verified on Docker.** Boots, health/error/logging/validation
contracts tested. Infrastructure clients arrive in Phase 3.

## Process types (one codebase, three entrypoints)

| Process | Entrypoint | Port | Role |
|---|---|---|---|
| api | `src/entrypoints/api.ts` | `PORT` (3000) | REST, Swagger (non-prod) |
| worker | `src/entrypoints/worker.ts` | `OPS_PORT` (9100) | Kafka/RabbitMQ consumers, BullMQ workers (Phase 3+) |
| relay | `src/entrypoints/relay.ts` | `OPS_PORT` (9100) | Transactional-outbox publisher (Phase 6) |

## Run locally (no Docker)

```bash
npm ci
npm run verify          # typecheck, lint, format, architecture rules, build, 123 tests
npm run verify:boot     # boots all 3 processes and asserts the contract (12 checks)
npm run build && PORT=3000 npm run start:api
curl localhost:3000/health/live ; curl localhost:3000/api/v1/system/info
```

## Run with Docker Compose

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build          # core
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile messaging --profile dev up   # + Kafka/RabbitMQ/Mailpit
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile observability up            # + Prometheus/Grafana/Jaeger
curl localhost:8080/health/live   # through nginx
```

WSL2: the full stack needs roughly 6-8 GB. Cap WSL in `%UserProfile%\.wslconfig`
(`[wsl2] memory=8GB`) and use profiles; enable `observability` only when needed.

**Compose status:** verified on a real Docker host (Phase 2): images pull and build,
Postgres initialises (roles script runs), both Redis instances, `objectstore`, `api`,
`worker`, `relay` and `nginx` start, and `/health/live` answers through nginx.
`kafka`, `rabbitmq` and the observability stack are defined but not exercised until Phase 3 / 7.

Setup notes:
- `cp .env.example .env` first. If you copied an older `.env`, make sure it has `S3_ACCESS_KEY`
  and `S3_SECRET_KEY` (compose refuses to start without them).
- **Object storage is RustFS** (`objectstore` service, S3-compatible, console on :9001 in dev).
  MinIO removed its public Docker images in Sept 2026. The app will use a `FileStorage` port, so
  the backend can be swapped (Garage, SeaweedFS, AWS S3) without touching business code.
- Run `docker compose ... pull` first to surface any image-tag problem before `up`.
- Dev containers recompile on save (`tsc --watch` + `node --watch`); the dev image chowns
  `dist/` to the `node` user so watch mode can write.

### Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `pull access denied for minio/minio` | Old compose file; use `objectstore` (RustFS) |
| `refers to undefined volume` | A service volume is not listed under top-level `volumes:` |
| `container ... has no healthcheck configured` | A service used in `depends_on: service_healthy` lacks a `healthcheck` |
| `TS5033 EACCES` in dev logs | `dist/` owned by root; rebuild with the `chown` line in the Dockerfile `dev` stage |

## Conventions
- ESM + `nodenext`: relative imports end in `.js`.
- Never `import type` an injected class (it erases the DI token under `emitDecoratorMetadata`).
- Module boundaries are enforced by `npm run deps:check` (`.dependency-cruiser.cjs`).
- Errors: `{ success:false, error:{code,message,details}, requestId }`. Domain code throws
  `DomainError` (HTTP-agnostic); only the filter knows HTTP.
- Unversioned API paths are 404 by design: always `/api/v1/...`.
