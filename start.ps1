param([switch]$SkipInstall, [switch]$Demo)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if (!(Test-Path '.venv\Scripts\python.exe')) { python -m venv .venv }
if (!$SkipInstall) { & '.\.venv\Scripts\python.exe' -m pip install -q -r 'backend\requirements.txt' }
$env:PYTHONPATH = Join-Path $PSScriptRoot 'backend'
& '.\.venv\Scripts\python.exe' -m app.prepare
if ($LASTEXITCODE -ne 0) { throw '数据导入失败' }
$pnpmCmd = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (!$pnpmCmd) {
  $fallback = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
  if (Test-Path $fallback) { $pnpmCmd = $fallback }
}
if (!$pnpmCmd) { throw '需要 pnpm；请安装 Node.js 与 pnpm。' }
Push-Location 'frontend'
try {
  if (!$SkipInstall) { & $pnpmCmd install }
  if ($LASTEXITCODE -ne 0) { throw '前端依赖安装失败' }
} finally { Pop-Location }
if ($Demo) {
  Push-Location 'frontend'
  try {
    & node node_modules/typescript/bin/tsc -b
    if ($LASTEXITCODE -ne 0) { throw '前端 TypeScript 构建失败' }
    & node node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { throw '前端页面构建失败' }
  } finally { Pop-Location }
  Write-Host '分析页面: http://127.0.0.1:8086/'
  & '.\.venv\Scripts\python.exe' -m uvicorn app.public_demo:app --env-file .env --host 127.0.0.1 --port 8086
  exit $LASTEXITCODE
}
$apiArgs = @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000')
if (Test-Path -LiteralPath '.env') { $apiArgs += @('--env-file','.env') }
$api = Start-Process -FilePath (Join-Path $PSScriptRoot '.venv\Scripts\python.exe') -ArgumentList $apiArgs -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'backend.out.log') -RedirectStandardError (Join-Path $PSScriptRoot 'backend.err.log')
try {
  Write-Host 'API: http://127.0.0.1:8000/api/health'
  Write-Host 'Web: http://127.0.0.1:5173/'
  Push-Location 'frontend'
  try { & $pnpmCmd dev } finally { Pop-Location }
} finally {
  if (!$api.HasExited) { Stop-Process -Id $api.Id -Force }
}
