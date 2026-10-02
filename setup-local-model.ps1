param([ValidateSet('qwen3.5:9b','qwen3.5:4b')][string]$Model='qwen3.5:9b')
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
$runtime=Join-Path $PSScriptRoot 'data\runtime\ollama'
$ollamaExe=Join-Path $runtime 'ollama.exe'
$installed=Get-Command ollama -ErrorAction SilentlyContinue
if ($installed) {$ollamaExe=$installed.Source}
if (!(Test-Path -LiteralPath $ollamaExe)) {
    New-Item -ItemType Directory -Force $runtime | Out-Null
    $archive=Join-Path $PSScriptRoot 'data\runtime\ollama-ranged.zip'
    if (!(Test-Path -LiteralPath $archive)) {
        $archive=Join-Path $PSScriptRoot 'data\runtime\ollama-windows-amd64.zip'
        Write-Host '正在下载 Ollama 官方便携运行时；约 1.5GB，首次执行需要时间。'
        Invoke-WebRequest 'https://ollama.com/download/ollama-windows-amd64.zip' -OutFile $archive -Resume -TimeoutSec 1800
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $runtime -Force
}
if (!(Test-Path -LiteralPath '.venv\Scripts\python.exe')) {throw '请先运行 start.ps1 安装项目依赖。'}
$env:OLLAMA_MODELS=Join-Path $PSScriptRoot 'data\models\ollama'
$env:OLLAMA_HOST='127.0.0.1:11434'
$env:OLLAMA_NUM_PARALLEL='1'
$env:OLLAMA_MAX_LOADED_MODELS='1'
$running=$false
try { $null=Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -NoProxy -TimeoutSec 3; $running=$true } catch {}
if (!$running) {
    Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'ollama.out.log') -RedirectStandardError (Join-Path $PSScriptRoot 'ollama.err.log') | Out-Null
    for($i=0;$i -lt 20;$i++) {
        Start-Sleep -Seconds 1
        try {$null=Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -NoProxy -TimeoutSec 2; $running=$true;break} catch {}
    }
}
if (!$running) {throw 'Ollama 服务未启动，请查看 ollama.err.log。'}
$available=Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -NoProxy -TimeoutSec 5
if ($Model -notin @($available.models.name)) {
    & $ollamaExe pull $Model
    if ($LASTEXITCODE -ne 0) {throw '模型下载未完成，可重试；Windows TLS 故障可使用 fetch-local-model.ps1。'}
}
if (!(Test-Path -LiteralPath '.env')) {Copy-Item -LiteralPath '.env.example' -Destination '.env'}
& '.\.venv\Scripts\python.exe' -c "from dotenv import set_key; import sys; set_key('.env','CONSUMER_MODEL_PROVIDER','auto'); set_key('.env','CONSUMER_LOCAL_MODEL',sys.argv[1])" $Model
if ($LASTEXITCODE -ne 0) {throw '模型配置保存失败'}
Write-Host "模型 $Model 已下载。重启后端后生效；实际推理验收请运行 README 中的 --require-model 命令。"
