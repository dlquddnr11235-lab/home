$ErrorActionPreference = 'Stop'

$apiKey = $env:CHEONGYAK_API_KEY
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw 'CHEONGYAK_API_KEY repository secret is required.'
}

try { $seoul = [TimeZoneInfo]::FindSystemTimeZoneById('Asia/Seoul') }
catch [TimeZoneNotFoundException] { $seoul = [TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time') }
$today = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $seoul)
$fromDate = $today.AddDays(-90).ToString('yyyy-MM-dd')
$base = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/'
$endpoints = @(
  @{ Path = 'getAPTLttotPblancDetail'; Type = 'APT' },
  @{ Path = 'getRemndrLttotPblancDetail'; Type = '무순위·잔여세대' }
)
$items = [System.Collections.Generic.List[object]]::new()

foreach ($endpoint in $endpoints) {
  for ($page = 1; $page -le 10; $page++) {
    $query = 'page={0}&perPage=100&returnType=JSON&cond%5BRCRIT_PBLANC_DE%3A%3AGTE%5D={1}&serviceKey={2}' -f $page, $fromDate, [Uri]::EscapeDataString($apiKey)
    try {
      $response = Invoke-RestMethod -Uri ($base + $endpoint.Path + '?' + $query) -TimeoutSec 30
    } catch {
      throw "Could not refresh $($endpoint.Type) notices."
    }
    if ($null -eq $response.data) { throw "Unexpected $($endpoint.Type) API response." }
    $rows = @($response.data)
    foreach ($row in $rows) { $items.Add(@{ type = $endpoint.Type; item = $row }) }
    if ($rows.Count -lt 100) { break }
  }
}

$payload = @{ updatedAt = [DateTime]::UtcNow.ToString('o'); items = @($items) } | ConvertTo-Json -Depth 12 -Compress
$repoRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $repoRoot 'data/notices.js'
New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
[IO.File]::WriteAllText($outputPath, 'window.CHEONGYAK_NOTICE_DATA=' + $payload + ';', [Text.UTF8Encoding]::new($false))
Write-Output ("Saved {0} public notices." -f $items.Count)
