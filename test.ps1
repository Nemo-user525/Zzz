$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:PYTHONPATH = Join-Path $PSScriptRoot 'backend'
& '.\.venv\Scripts\python.exe' -m pytest -q backend\tests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$pnpmCmd = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (!$pnpmCmd) { $pnpmCmd = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' }
Push-Location frontend
try { & $pnpmCmd build } finally { Pop-Location }
exit $LASTEXITCODE
