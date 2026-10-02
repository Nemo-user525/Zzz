$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:PYTHONPATH = Join-Path $PSScriptRoot 'backend'
$python = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (!(Test-Path $python)) { throw 'Run start.ps1 once to install dependencies first.' }
$steps = @(
    @('restore'), @('fetch', '--resume', '--max-documents', '2000'),
    @('extract', '--resume'), @('validate'), @('build-labels'),
    @('build-comparisons'), @('export-demo')
)
foreach ($step in $steps) {
    & $python -X utf8 -m app.data_pipeline @step
    if ($LASTEXITCODE -ne 0) { throw "Research rebuild stopped (exit $LASTEXITCODE): $step. Inspect manifests and retry this step." }
}
