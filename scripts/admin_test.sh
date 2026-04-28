#!/usr/bin/env bash
set -euo pipefail

HOST="https://zagros.one"
PASSWORD="zagros31ceyn"
DISCORD_ID="12345678901234567890"

echo "[TEST] Admin login (password) -> cookies.txt"
curl -sS -c cookies.txt -X POST "$HOST/api/login" -H "Content-Type: application/json" -d "{\"password\":\"$PASSWORD\"}" | cat

echo "[TEST] Run admin scenario (discord_id)"
curl -sS -b cookies.txt "$HOST/api/scenario-run?discord_id=$DISCORD_ID" | jq

echo "[TEST] Health check"
curl -sS "$HOST/api/health" | jq

echo "[TEST] Version check"
curl -sS "$HOST/api/version" | jq
