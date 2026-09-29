$ErrorActionPreference = 'Stop'

$base = 'https://cryptomainly.co.uk'
$prices = Invoke-RestMethod "$base/api/prices"
if (-not $prices.ok) { throw "Price API failed: $($prices.error)" }
if (-not $prices.rows -or $prices.rows.Count -lt 10) { throw "Price API returned too few rows" }

$global = Invoke-RestMethod "$base/api/metrics/global"
if (-not $global.ok) { throw "Global metrics API failed: $($global.error)" }

Write-Host "PASS: prices=$($prices.rows.Count), global=ok"