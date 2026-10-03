#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f .env ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    value="${value%$'\r'}"
    value="${value%\"}"; value="${value#\"}"
    export "$key=$value"
  done < .env
fi
python3 -m venv .venv
.venv/bin/python -m pip install -q -r backend/requirements.txt
export PYTHONPATH="$PWD/backend"
.venv/bin/python -m app.db.seed
(cd frontend && pnpm install)
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
api_pid=$!
node chat/server/index.mjs &
chat_pid=$!
trap 'kill "$api_pid" "$chat_pid" 2>/dev/null || true' EXIT
echo 'API: http://127.0.0.1:8000/api/health'
echo 'Chat: http://127.0.0.1:8000/api/chat-health'
echo 'Web: http://127.0.0.1:5173/'
(cd frontend && pnpm dev)
