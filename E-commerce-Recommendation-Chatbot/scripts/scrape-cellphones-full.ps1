param(
  [int]$StartSitemap = 0,
  [int]$EndSitemap = 59,
  [int]$Concurrency = 5,
  [int]$DelayMs = 250
)

$ErrorActionPreference = "Stop"

for ($index = $StartSitemap; $index -le $EndSitemap; $index++) {
  Write-Host "Scraping CellphoneS product sitemap index $index..."
  npm run scrape:cellphones -- --sitemap-start=$index --sitemap-limit=1 --skip-existing --concurrency=$Concurrency --delay-ms=$DelayMs

  if ($LASTEXITCODE -ne 0) {
    throw "Scrape failed at sitemap index $index"
  }
}

npm run mongo:cellphones:summary
