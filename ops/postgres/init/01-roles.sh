#!/bin/sh
# Runs once, on first initialisation of the data volume.
# Three roles with least privilege:
#   app_migrator - owns schema objects, runs migrations (never used at request time)
#   app_runtime  - what the app connects as: DML only, NOSUPERUSER, NOBYPASSRLS so
#                  Row-Level Security policies are ALWAYS enforced (tenant isolation)
#   app_readonly - reporting / exporters (pg_monitor for postgres-exporter)
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migrator_pw="$APP_MIGRATOR_PASSWORD" \
  -v runtime_pw="$APP_RUNTIME_PASSWORD" \
  -v readonly_pw="$APP_READONLY_PASSWORD" \
  -v dbname="$POSTGRES_DB" <<'SQL'
CREATE ROLE app_migrator LOGIN PASSWORD :'migrator_pw' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE app_runtime  LOGIN PASSWORD :'runtime_pw'  NOSUPERUSER NOBYPASSRLS;
CREATE ROLE app_readonly LOGIN PASSWORD :'readonly_pw' NOSUPERUSER NOBYPASSRLS;
GRANT pg_monitor TO app_readonly;

REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO app_migrator, app_runtime, app_readonly;
GRANT CREATE  ON DATABASE :"dbname" TO app_migrator;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
