$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:PYTHONPATH = Join-Path $PSScriptRoot 'backend'
& '.\.venv\Scripts\python.exe' -m pytest -q backend\tests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Push-Location frontend
try {
  node node_modules/vitest/vitest.mjs run
  if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
  node node_modules/typescript/bin/tsc -b
  if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
  node node_modules/vite/bin/vite.js build
} finally { Pop-Location }
exit $LASTEXITCODE
