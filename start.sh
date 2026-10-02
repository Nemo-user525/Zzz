#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install -q -r backend/requirements.txt
export PYTHONPATH="$PWD/backend"
.venv/bin/python -m app.prepare
(cd frontend && pnpm install)
api_args=()
if [ -f .env ]; then api_args+=(--env-file .env); fi
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 "${api_args[@]}" &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT
echo 'API: http://127.0.0.1:8000/api/health'
echo 'Web: http://127.0.0.1:5173/'
(cd frontend && pnpm dev)
