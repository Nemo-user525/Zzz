#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PYTHONPATH="$PWD/backend"
python_bin=".venv/bin/python"
if [[ ! -x "$python_bin" ]]; then echo "Run start.sh once to install dependencies first." >&2; exit 1; fi
"$python_bin" -m app.data_pipeline restore
"$python_bin" -m app.data_pipeline fetch --resume --max-documents 2000
"$python_bin" -m app.data_pipeline extract --resume
"$python_bin" -m app.data_pipeline validate
"$python_bin" -m app.data_pipeline build-labels
"$python_bin" -m app.data_pipeline build-comparisons
"$python_bin" -m app.data_pipeline export-demo
