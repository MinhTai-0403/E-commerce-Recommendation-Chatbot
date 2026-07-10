param(
  [int]$StartSitemap = 0,
  [int]$EndSitemap = 59,
  [int]$InitialConcurrency = 2,
  [int]$InitialDelayMs = 1000,
  [int]$CooldownSeconds = 300,
  [int]$MaxAttemptsPerSitemap = 12,
  [int]$RequestTimeoutMs = 9000,
  [int]$RequestRetries = 1,
  [switch]$IncludeOutOfStock
)

$ErrorActionPreference = "Continue"

$currentConcurrency = [Math]::Max(1, $InitialConcurrency)
$currentDelayMs = [Math]::Max(0, $InitialDelayMs)

for ($index = $StartSitemap; $index -le $EndSitemap; $index++) {
  $attempt = 1

  while ($attempt -le $MaxAttemptsPerSitemap) {
    Write-Host "Scraping CellphoneS product sitemap index $index (attempt $attempt, concurrency=$currentConcurrency, delayMs=$currentDelayMs)..."

    $scrapeArgs = @(
      "--sitemap-start=$index",
      "--sitemap-limit=1",
      "--direct-sitemap",
      "--skip-existing",
      "--concurrency=$currentConcurrency",
      "--delay-ms=$currentDelayMs",
      "--timeout-ms=$RequestTimeoutMs",
      "--retries=$RequestRetries"
    )

    if (-not $IncludeOutOfStock) {
      $scrapeArgs += "--available-or-contact"
    }

    npm run scrape:cellphones -- @scrapeArgs

    if ($LASTEXITCODE -eq 0) {
      $currentConcurrency = [Math]::Max(1, $InitialConcurrency)
      $currentDelayMs = [Math]::Max(0, $InitialDelayMs)
      break
    }

    Write-Warning "Scrape failed at sitemap index $index. Cooling down for $CooldownSeconds seconds before retry."
    Start-Sleep -Seconds $CooldownSeconds

    $currentConcurrency = [Math]::Max(1, $currentConcurrency - 1)
    $currentDelayMs = [Math]::Min(8000, [Math]::Max($currentDelayMs * 2, 1000))
    $attempt += 1
  }

  if ($attempt -gt $MaxAttemptsPerSitemap) {
    throw "Scrape failed at sitemap index $index after $MaxAttemptsPerSitemap attempts"
  }
}

npm run mongo:cellphones:summary
