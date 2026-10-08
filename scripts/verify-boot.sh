#!/usr/bin/env bash
# Boots api + worker + relay from dist/ and asserts the Phase 2 contract.
# Usage: npm run build && bash scripts/verify-boot.sh
set -u
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }
wait_for(){ for _ in $(seq 1 80); do curl -sf "$1" >/dev/null 2>&1 && return 0; sleep 0.25; done; return 1; }

export LOG_LEVEL=silent
PORT=3100 node dist/entrypoints/api.js & API=$!
OPS_PORT=9101 node dist/entrypoints/worker.js & WRK=$!
OPS_PORT=9102 node dist/entrypoints/relay.js & REL=$!
trap 'kill $API $WRK $REL 2>/dev/null; wait 2>/dev/null' EXIT

echo "== boot"
check "api live"    "wait_for localhost:3100/health/live"
check "worker live" "wait_for localhost:9101/health/live"
check "relay live"  "wait_for localhost:9102/health/live"
echo "== api contract"
check "readiness 200"              "[ \"\$(curl -s -o /dev/null -w '%{http_code}' localhost:3100/health/ready)\" = 200 ]"
check "/api/v1/system/info 200"    "curl -sf localhost:3100/api/v1/system/info | grep -q logistics-platform"
check "request id echoed"          "curl -si -H 'X-Request-Id: smoke-test-0001' localhost:3100/health/live | grep -qi 'x-request-id: smoke-test-0001'"
check "unknown route -> envelope"  "curl -s localhost:3100/api/v1/nope | grep -q '\"code\":\"ROUTE_NOT_FOUND\"'"
check "no x-powered-by"            "! curl -si localhost:3100/health/live | grep -qi x-powered-by"
check "swagger json served"        "curl -sf localhost:3100/api/docs-json | grep -q openapi"
echo "== refuses invalid config"
PORT=notaport node dist/entrypoints/api.js >/tmp/badcfg.log 2>&1; RC=$?
check "invalid PORT exits non-zero" "[ $RC -ne 0 ]"
check "error names PORT"            "grep -q PORT /tmp/badcfg.log"
echo "== graceful shutdown"
kill -TERM $API; sleep 1.5
check "api exits on SIGTERM" "! kill -0 $API 2>/dev/null"
echo; echo "Result: $PASS passed, $FAIL failed"; [ $FAIL -eq 0 ]
