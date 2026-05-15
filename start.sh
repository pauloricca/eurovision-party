#!/usr/bin/env bash
set -euo pipefail

PUBLIC_HOST="${PUBLIC_HOST:-}"

if [ -z "$PUBLIC_HOST" ] && command -v ipconfig >/dev/null 2>&1; then
  PUBLIC_HOST="$(ipconfig getifaddr en0 2>/dev/null || true)"
  PUBLIC_HOST="${PUBLIC_HOST:-$(ipconfig getifaddr en1 2>/dev/null || true)}"
fi

if [ -z "$PUBLIC_HOST" ] && command -v hostname >/dev/null 2>&1; then
  PUBLIC_HOST="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

if [ -z "$PUBLIC_HOST" ]; then
  PUBLIC_HOST="localhost"
fi

export PUBLIC_HOST
docker compose up -d --build

URL="http://localhost:3000/admin"

if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "$URL"
fi
