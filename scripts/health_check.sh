#!/usr/bin/env bash
set -euo pipefail

HOST="${HEALTH_CHECK_HOST:-https://zagros.one}"

echo "[health_check] Host: $HOST"

echo "[health_check] Checking GET /api/health ..."
health=$(curl -fsS "$HOST/api/health" || true)
if [ -z "$health" ]; then
  echo "Health check failed: empty /api/health response"
  exit 1
fi
echo "$health" | (command -v jq >/dev/null 2>&1 && jq -S || cat)
if command -v jq >/dev/null 2>&1; then
  if [ "$(echo "$health" | jq -r '.ok')" != "true" ]; then
    echo "Health check failed: /api/health ok != true"
    exit 1
  fi
fi

echo "[health_check] Checking GET /api/version ..."
version=$(curl -fsS "$HOST/api/version" || true)
if [ -z "$version" ]; then
  echo "Health check failed: empty /api/version response"
  exit 1
fi
echo "$version" | (command -v jq >/dev/null 2>&1 && jq -S || cat)
if command -v jq >/dev/null 2>&1; then
  if [ "$(echo "$version" | jq -r '.ok')" != "true" ]; then
    echo "Health check failed: /api/version ok != true"
    exit 1
  fi
fi

# /api/search-all oturum gerektirir; burada çağırmak her push'ta yanlış alarm (GitHub "failed" e-postaları) üretir.
if [ "${HEALTH_CHECK_INCLUDE_SEARCH_ALL:-0}" = "1" ]; then
  echo "[health_check] Checking GET /api/search-all (HEALTH_CHECK_INCLUDE_SEARCH_ALL=1) ..."
  sampleId="${HEALTH_CHECK_DISCORD_ID:-12345678901234567890}"
  resp=$(curl -sS "$HOST/api/search-all?discord_id=$sampleId" || true)
  echo "$resp" | (command -v jq >/dev/null 2>&1 && jq -S || cat)
  if command -v jq >/dev/null 2>&1; then
    if ! echo "$resp" | jq -e '.ok' >/dev/null 2>&1; then
      echo "Search-all response did not return expected structure."
      exit 1
    fi
  fi
else
  echo "[health_check] Skipping /api/search-all (requires auth). Set HEALTH_CHECK_INCLUDE_SEARCH_ALL=1 to enable."
fi

echo "[health_check] All checks passed."
exit 0
