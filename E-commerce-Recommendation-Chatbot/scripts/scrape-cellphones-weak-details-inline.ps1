param(
  [int]$BatchLimit = 5000,
  [int]$Concurrency = 40,
  [int]$MaxRounds = 10,
  [double]$MaxLogicalDatabaseMB = 490,
  [int]$Shards = 1,
  [int]$ShardIndex = 0
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if ([string]::IsNullOrWhiteSpace($env:SCRAPER_PROXIES)) {
  throw "SCRAPER_PROXIES is required. Set it in the parent process before starting this runner."
}
if ($Shards -lt 1 -or $ShardIndex -lt 0 -or $ShardIndex -ge $Shards) {
  throw "ShardIndex must be between 0 and Shards - 1."
}

$failureFile = Join-Path $repoRoot "logs\weak-details-failures-shard-$ShardIndex.txt"

for ($round = 1; $round -le $MaxRounds; $round += 1) {
  $beforeRaw = & node "src/tools/inspect-cellphones-details.js"
  if ($LASTEXITCODE -ne 0) { throw "Cannot inspect product detail coverage." }
  $before = $beforeRaw | ConvertFrom-Json

  Write-Host (
    "[shard {0}/{1} round {2}/{3}] total={4} rich={5} weak={6} logicalDB={7:N2}MB" -f `
      $ShardIndex, $Shards, $round, $MaxRounds, $before.total, $before.rich, $before.weak, $before.databaseSizeMB.logicalTotal
  )

  if ([int]$before.weak -eq 0) {
    Write-Host "[done] No weak detail records remain."
    break
  }

  if ([double]$before.databaseSizeMB.logicalTotal -ge $MaxLogicalDatabaseMB) {
    Write-Warning "Stopping before Atlas reaches the configured logical size ceiling."
    break
  }

  $limit = [Math]::Min($BatchLimit, [int]$before.weak)
  $failuresBefore = if (Test-Path -LiteralPath $failureFile) {
    @(Get-Content -LiteralPath $failureFile).Count
  } else {
    0
  }
  & node "src/scrapers/scrape-cellphones-details.js" `
    "--from-weak-details" `
    "--limit=$limit" `
    "--concurrency=$Concurrency" `
    "--batch-size=50" `
    "--retries=1" `
    "--timeout-ms=20000" `
    "--min-json-bytes=5000" `
    "--failure-file=$failureFile" `
    "--shards=$Shards" `
    "--shard-index=$ShardIndex" `
    "--inline-gzip" `
    "--include-html" `
    "--no-sync-products"

  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Crawler exited with code $LASTEXITCODE. The next run will resume from records still marked weak."
    break
  }

  $afterRaw = & node "src/tools/inspect-cellphones-details.js"
  if ($LASTEXITCODE -ne 0) { throw "Cannot inspect product detail coverage after round $round." }
  $after = $afterRaw | ConvertFrom-Json
  $improved = [int]$before.weak - [int]$after.weak
  $failuresAfter = if (Test-Path -LiteralPath $failureFile) {
    @(Get-Content -LiteralPath $failureFile).Count
  } else {
    0
  }
  $newFailures = $failuresAfter - $failuresBefore

  Write-Host (
    "[shard {0}/{1} round {2}] improved={3} unavailableAdded={4} remaining={5} logicalDB={6:N2}MB" -f `
      $ShardIndex, $Shards, $round, $improved, $newFailures, $after.weak, $after.databaseSizeMB.logicalTotal
  )

  if ($improved -le 0 -and $newFailures -le 0) {
    Write-Warning "No additional rich details were produced; stopping to avoid an endless retry loop."
    break
  }
}
