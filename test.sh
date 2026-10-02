#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/backend"
.venv/bin/python -m pytest -q backend/tests
(cd frontend && node node_modules/vitest/vitest.mjs run && node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build)
