param(
  [ValidateSet('Start','Status','Watch','Stop','InstallAutoStart','RemoveAutoStart')]
  [string]$Action = 'Start',
  [ValidateRange(1024,65535)][int]$Port = 8086,
  [switch]$Rebuild
)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$runtime = Join-Path $taskRoot 'data\runtime'
$stateFile = Join-Path $runtime "local-$Port.json"
$taskName = "Jianwei-Local-$Port"
$url = "http://127.0.0.1:$Port/"
$python = Join-Path $taskRoot '.venv\Scripts\python.exe'
$pwsh = (Get-Process -Id $PID).Path
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
Set-Location -LiteralPath $taskRoot

function Read-State {
  if (Test-Path -LiteralPath $stateFile) {
    try { return Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } catch { return $null }
  }
  return $null
}
function Healthy {
  try {
    $health = Invoke-RestMethod -Uri ($url + 'api/health') -NoProxy -TimeoutSec 3
    return $health.status -eq 'ok' -and $health.database_ready -eq $true
  } catch { return $false }
}
function Owned-Process([int]$ProcessId, [string]$Signature) {
  if ($ProcessId -le 0) { return $null }
  $entry = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if ($entry -and $entry.CommandLine -and $entry.CommandLine.Contains($taskRoot) -and $entry.CommandLine.Contains($Signature)) {
    return Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  }
  return $null
}
function Stop-Owned([int]$ProcessId, [string]$Signature) {
  $owned = Owned-Process $ProcessId $Signature
  if ($owned) { $owned.Kill($true); $owned.WaitForExit(5000) | Out-Null }
}

if ($Action -eq 'Status') {
  $state = Read-State
  [pscustomobject]@{Url=$url;Healthy=(Healthy);SupervisorPid=$state.supervisor_pid;OwnedServerPid=$state.server_pid;TaskInstalled=[bool](Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)}
  exit 0
}
if ($Action -eq 'RemoveAutoStart') {
  $scheduled = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($scheduled) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  Write-Host '已移除登录自启动；当前服务继续运行。'
  exit 0
}
if ($Action -eq 'Stop') {
  $scheduled = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($scheduled) { Stop-ScheduledTask -TaskName $taskName }
  $state = Read-State
  if ($state) {
    Stop-Owned $state.supervisor_pid 'start-local.ps1'
    Stop-Owned $state.server_pid 'app.public_demo:app'
    Remove-Item -LiteralPath $stateFile -ErrorAction SilentlyContinue
  }
  Write-Host '已停止此脚本管理的服务；其他终端启动的服务请在原终端关闭。'
  exit 0
}
if (!(Test-Path -LiteralPath $python)) { throw '请先运行 pwsh -File .\start.ps1 -Demo，安装项目依赖。' }
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if ($Rebuild) {
  $env:PYTHONPATH = Join-Path $taskRoot 'backend'
  & $python -m app.prepare
  if ($LASTEXITCODE -ne 0) { throw '数据准备失败' }
  Push-Location -LiteralPath (Join-Path $taskRoot 'frontend')
  try {
    & node node_modules/typescript/bin/tsc -b
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript 检查失败' }
    & node node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
  } finally { Pop-Location }
}
if (!(Test-Path -LiteralPath 'frontend\dist\index.html')) { throw '请先运行 pwsh -File .\start-local.ps1 -Rebuild。' }
if ($Action -eq 'InstallAutoStart') {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $arguments = '-NoProfile -WindowStyle Hidden -File "' + $PSCommandPath + '" -Action Watch -Port ' + $Port
  $scheduledAction = New-ScheduledTaskAction -Execute $pwsh -Argument $arguments -WorkingDirectory $taskRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
  $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $scheduledAction -Trigger $trigger -Principal $principal -Settings $settings -Description '见微本地页面：登录后启动，异常退出后自动恢复。' -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host "已安装当前用户登录自启动：$url"
  exit 0
}
if ($Action -eq 'Start') {
  $state = Read-State
  if (!$state -or !(Owned-Process $state.supervisor_pid 'start-local.ps1')) {
    $arguments = @('-NoProfile','-WindowStyle','Hidden','-File',('"' + $PSCommandPath + '"'),'-Action','Watch','-Port',"$Port")
    Start-Process -FilePath $pwsh -ArgumentList $arguments -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime "local-$Port-watch.out.log") -RedirectStandardError (Join-Path $runtime "local-$Port-watch.err.log") | Out-Null
  }
  for ($attempt=0; $attempt -lt 20; $attempt++) {
    if (Healthy) { Write-Host "本地页面已就绪：$url"; exit 0 }
    Start-Sleep -Seconds 1
  }
  throw "启动失败，请检查 data/runtime/local-$Port-*.log。"
}

# A mutex also covers logon tasks, repeated clicks and simultaneous start commands.
$digest = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($taskRoot))).Substring(0,12)
$mutex = [Threading.Mutex]::new($false, "Local\Jianwei-$digest-$Port")
$locked = $false
$server = $null
try {
  try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (!$locked) { exit 0 }
  $failures = 0
  while ($true) {
    if (Healthy) { $failures = 0 } else {
      $failures++
      if ($server -and !$server.HasExited -and $failures -ge 3) {
        Stop-Owned $server.Id 'app.public_demo:app'
      }
      if (!$server -or $server.HasExited) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $server = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.public_demo:app','--app-dir','backend','--env-file','.env','--host','127.0.0.1','--port',"$Port") -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime "local-$Port-$stamp.out.log") -RedirectStandardError (Join-Path $runtime "local-$Port-$stamp.err.log") -PassThru
        $failures = 0
      }
    }
    @{supervisor_pid=$PID;server_pid=$(if ($server) {$server.Id} else {0});port=$Port;url=$url} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    Start-Sleep -Seconds 5
  }
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
