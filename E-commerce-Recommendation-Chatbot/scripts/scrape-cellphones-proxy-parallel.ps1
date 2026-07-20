param(
  [int]$StartSitemap = 0,
  [int]$EndSitemap = 59,
  [int]$BatchSize = 15,
  [int]$Concurrency = 6,
  [int]$DelayMs = 150,
  [int]$CooldownSeconds = 120,
  [int]$MaxAttemptsPerSitemap = 8,
  [int]$RequestTimeoutMs = 9000,
  [int]$RequestRetries = 1,
  [switch]$IncludeOutOfStock
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$jobs = @()

function Quote-Argument {
  param([string]$Value)
  '"' + ($Value -replace '"', '\"') + '"'
}

for ($rangeStart = $StartSitemap; $rangeStart -le $EndSitemap; $rangeStart += $BatchSize) {
  $rangeEnd = [Math]::Min($EndSitemap, $rangeStart + $BatchSize - 1)
  $name = "cellphones-proxy-$rangeStart-$rangeEnd-$timestamp"
  $outLog = Join-Path $logsDir "$name.out.log"
  $errLog = Join-Path $logsDir "$name.err.log"
  $cmdLog = Join-Path $logsDir "$name.cmd.txt"
  $argumentParts = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", (Quote-Argument (Join-Path $PSScriptRoot "scrape-cellphones-adaptive.ps1")),
    "-StartSitemap", $rangeStart,
    "-EndSitemap", $rangeEnd,
    "-InitialConcurrency", $Concurrency,
    "-InitialDelayMs", $DelayMs,
    "-CooldownSeconds", $CooldownSeconds,
    "-MaxAttemptsPerSitemap", $MaxAttemptsPerSitemap,
    "-RequestTimeoutMs", $RequestTimeoutMs,
    "-RequestRetries", $RequestRetries
  )

  if ($IncludeOutOfStock) {
    $argumentParts += "-IncludeOutOfStock"
  }

  $arguments = ($argumentParts -join " ")
  "powershell.exe $arguments" | Set-Content -Path $cmdLog

  $process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $arguments `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden `
    -PassThru

  $jobs += [pscustomobject]@{
    Range = "$rangeStart-$rangeEnd"
    Pid = $process.Id
    OutLog = $outLog
    ErrLog = $errLog
    CmdLog = $cmdLog
  }
}

$jobs | Format-Table -AutoSize
