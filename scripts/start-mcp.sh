#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "${PLUGIN_ROOT}/dist/index.js" ]; then
  echo "[ACM] Error: dist/index.js not found. Run 'npm run build' first." >&2
  exit 1
fi

if [ ! -d "${PLUGIN_ROOT}/node_modules" ]; then
  echo "[ACM] Installing dependencies..." >&2
  if ! npm install --prefix "${PLUGIN_ROOT}" --omit=dev --quiet; then
    echo "[ACM] Error: npm install failed. Check network connectivity and permissions." >&2
    exit 1
  fi
fi

exec node "${PLUGIN_ROOT}/dist/index.js"
