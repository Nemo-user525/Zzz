param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (Test-Path '.env') {
  Get-Content '.env' | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $varName = $Matches[1]
      $varValue = $Matches[2].Trim().Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable($varName, $varValue, 'Process')
    }
  }
}
if (!(Test-Path '.venv\Scripts\python.exe')) { python -m venv .venv }
if (!$SkipInstall) { & '.\.venv\Scripts\python.exe' -m pip install -q -r 'backend\requirements.txt' }
$env:PYTHONPATH = Join-Path $PSScriptRoot 'backend'
& '.\.venv\Scripts\python.exe' -m app.db.seed
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
$api = Start-Process -FilePath (Join-Path $PSScriptRoot '.venv\Scripts\python.exe') -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000' -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'backend.out.log') -RedirectStandardError (Join-Path $PSScriptRoot 'backend.err.log')
$nodeCmd = (Get-Command node -ErrorAction Stop).Source
$chat = Start-Process -FilePath $nodeCmd -ArgumentList 'chat/server/index.mjs' -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'chat.out.log') -RedirectStandardError (Join-Path $PSScriptRoot 'chat.err.log')
try {
  Write-Host 'API: http://127.0.0.1:8000/api/health'
  Write-Host 'Chat: http://127.0.0.1:8000/api/chat-health'
  Write-Host 'Web: http://127.0.0.1:5173/'
  Push-Location 'frontend'
  try { & $pnpmCmd dev } finally { Pop-Location }
} finally {
  if (!$api.HasExited) { Stop-Process -Id $api.Id -Force }
  if (!$chat.HasExited) { Stop-Process -Id $chat.Id -Force }
}
