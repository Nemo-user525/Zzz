param([int]$Port = 8086)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$localUrl = "http://127.0.0.1:$Port/"
try {
  $response = Invoke-WebRequest -Uri $localUrl -TimeoutSec 5
  if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
} catch {
  throw "本机分析页未启动：$localUrl。请先在另一个终端运行 pwsh -File .\start.ps1 -Demo。"
}

$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (!$cloudflared) {
  $runtimeDir = Join-Path $PSScriptRoot 'data\runtime\cloudflared'
  $cloudflared = Join-Path $runtimeDir 'cloudflared.exe'
  if (!(Test-Path -LiteralPath $cloudflared)) {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Write-Host '正在从 Cloudflare 官方 GitHub 下载 cloudflared...'
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
  }
}

Write-Host "正在为 $localUrl 创建临时 HTTPS 地址；下方日志中的 https://*.trycloudflare.com 可在其他网络打开。"
Write-Host '保持本终端和分析页终端运行；按 Ctrl+C 关闭公网入口。'
& $cloudflared tunnel --url "http://127.0.0.1:$Port" --no-autoupdate
exit $LASTEXITCODE
