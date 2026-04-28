#!/usr/bin/env bash
set -euo pipefail

echo "[Deploy] Initiating production deploy..."
if [[ -n "${SSH_HOST:-}" && -n "${SSH_USER:-}" && -n "${SSH_KEY:-}" ]]; then
  echo "[Deploy] Using SSH to trigger remote deploy on ${SSH_HOST} as ${SSH_USER}"
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${SSH_USER}@${SSH_HOST} 'bash ~/deploy.sh' && \
    echo "[Deploy] Remote deploy triggered successfully" || \
    echo "[Deploy] Remote deploy failed"
else
  echo "[Deploy] SSH credentials not provided. Set SSH_HOST, SSH_USER, SSH_KEY to enable remote deploy."
  echo "[Deploy] Fallback: perform manual deploy steps on CI or server."
fi
