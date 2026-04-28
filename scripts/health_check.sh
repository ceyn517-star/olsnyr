#!/usr/bin/env bash
set -euo pipefail

HOST="https://zagros.one"

echo "[health_check] Checking /api/health ..."
health=$(curl -sS "$HOST/api/health" || true)
echo "$health" | {
  if command -v jq >/dev/null 2>&1; then
    jq -S
    if [ "$(echo "$health" | jq -r '.ok')" != "true" ]; then
      echo "Health check failed: ok != true"
      exit 1
    fi
  else
    echo "(jq not installed; skipping strict ok check)"
  fi
}
if command -v jq >/dev/null 2>&1; then
  if echo "$health" | jq -e '.ok' >/dev/null 2>&1; then
    true
  else
    echo "Health check failed: invalid JSON"; exit 1
  fi
fi
if [ -z "$health" ]; then
  echo "Health check failed: empty response"; exit 1
fi
echo "Health check passed"; 

echo "[health_check] Checking /api/search-all with sample discord_id ..."
sampleId="12345678901234567890"
resp=$(curl -sS "$HOST/api/search-all?discord_id=$sampleId" || true)
echo "$resp" | jq -S
if echo "$resp" | jq -e '.ok' >/dev/null 2>&1; then
  echo "Search-all response received. OK."
else
  echo "Search-all response did not return expected structure."
  exit 1
fi

echo "Health checks passed."
exit 0
