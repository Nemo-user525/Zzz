#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/backend"
.venv/bin/python -m pytest -q backend/tests
(cd frontend && pnpm build)
