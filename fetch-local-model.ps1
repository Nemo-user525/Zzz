param([ValidateSet('9b','4b')][string]$Size='9b')
# Optional Windows fallback when the native Ollama downloader has TLS problems.
# All bytes come from the official public registry; every blob is SHA256 verified.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Set-Location $PSScriptRoot
$scratch=Join-Path $PSScriptRoot ('data\runtime\qwen3.5-'+$Size)
$blobs=Join-Path $PSScriptRoot 'data\models\ollama\blobs'
New-Item -ItemType Directory -Force $scratch,$blobs | Out-Null
$manifestFile=Join-Path $scratch 'manifest.json'
Invoke-WebRequest "https://registry.ollama.ai/v2/library/qwen3.5/manifests/$Size" -OutFile $manifestFile -TimeoutSec 60
$manifest=Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
foreach($blob in @($manifest.config)+@($manifest.layers)) {
    if ($blob.digest -notmatch '^sha256:[0-9a-f]{64}$') {throw 'Invalid official digest'}
    $digest=$blob.digest
    $blobPath=Join-Path $blobs ($digest.Replace(':','-'))
    if ((Test-Path $blobPath) -and (Get-FileHash $blobPath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $digest.Substring(7)) {continue}
    $url='https://registry.ollama.ai/v2/library/qwen3.5/blobs/'+$digest
    $length=[long]$blob.size
    if ($length -lt 8MB) {
        Invoke-WebRequest $url -OutFile ($blobPath+'.partial') -TimeoutSec 120
    } else {
        # Resolve the public CDN redirect once instead of repeating registry handshakes.
        # The registry HEAD stays at the registry; only GET redirects to the blob CDN.
        $head=Invoke-WebRequest $url -Headers @{Range='bytes=0-0'} -TimeoutSec 60
        $url=$head.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
        $chunkSize=8MB
        $count=[int][Math]::Ceiling($length/$chunkSize)
        $parts=Join-Path $scratch $digest.Substring(7)
        New-Item -ItemType Directory -Force $parts | Out-Null
        0..($count-1) | ForEach-Object -Parallel {
            $ProgressPreference='SilentlyContinue'
            $start=[long]$_*$using:chunkSize
            $end=[Math]::Min($start+$using:chunkSize-1,$using:length-1)
            $part=Join-Path $using:parts "$_.part"
            for($attempt=0;$attempt -lt 6;$attempt++) {
                if ((Test-Path $part) -and (Get-Item $part).Length -eq ($end-$start+1)) {break}
                try {Invoke-WebRequest $using:url -Headers @{Range="bytes=$start-$end"} -OutFile $part -TimeoutSec 120 -ErrorAction Stop} catch {Start-Sleep -Seconds 2}
            }
            if (!(Test-Path $part) -or (Get-Item $part).Length -ne ($end-$start+1)) {throw "Model download incomplete: part $_"}
            if ($_ % 50 -eq 0) {Write-Output "Downloaded model segment $_ / $using:count"}
        } -ThrottleLimit 24
        $output=[IO.File]::Create($blobPath+'.partial')
        try {for($i=0;$i -lt $count;$i++) {$inputFile=[IO.File]::OpenRead((Join-Path $parts "$i.part"));try{$inputFile.CopyTo($output)}finally{$inputFile.Dispose()}}} finally {$output.Dispose()}
    }
    if ((Get-FileHash ($blobPath+'.partial') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest.Substring(7)) {throw 'Model SHA256 mismatch; nothing activated'}
    Move-Item -LiteralPath ($blobPath+'.partial') -Destination $blobPath -Force
    Write-Host 'Verified model blob'
}
$manifestDir=Join-Path $PSScriptRoot 'data\models\ollama\manifests\registry.ollama.ai\library\qwen3.5'
New-Item -ItemType Directory -Force $manifestDir | Out-Null
Copy-Item -LiteralPath $manifestFile -Destination (Join-Path $manifestDir $Size)
Write-Host "Official qwen3.5:$Size model downloaded and SHA256 verified."
