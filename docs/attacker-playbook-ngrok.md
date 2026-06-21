# Playbook May Tan Cong Qua HTTPS ngrok

Chi dung guide nay voi lab/do an cua ban. Vi du trong tai lieu dung:

```powershell
$BASE_URL="https://shower-trickily-equity.ngrok-free.dev"
```

Neu ngrok sinh URL khac, thay lai `$BASE_URL`.

## 0. Kiem Tra Ket Noi Tu May Attacker

Tren may host phai dang mo:

```text
ngrok http 3000
```

Tren may attacker:

```powershell
$BASE_URL="https://shower-trickily-equity.ngrok-free.dev"

curl.exe -i "$BASE_URL/health" -H "ngrok-skip-browser-warning: true"
curl.exe -i "$BASE_URL/api/public" -H "ngrok-skip-browser-warning: true"
```

Neu thay `HTTP/1.1 200` va JSON thi tunnel HTTPS da hoat dong.

Tao token hop le de lam baseline:

```powershell
$tokenResp = Invoke-RestMethod -Method Post "$BASE_URL/api/demo/token/hs256" `
  -Headers @{ "ngrok-skip-browser-warning" = "true" } `
  -ContentType "application/json" `
  -Body "{}"

$TOKEN = $tokenResp.token
$TOKEN
```

Goi API secure voi token hop le:

```powershell
curl.exe -i "$BASE_URL/api/secure" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 200 OK
```

## 1. JWT Forgery: Sua Chu Ky Token

Muc tieu: gia lap attacker sua signature cua JWT.

```powershell
$parts = $TOKEN -split "\."
$last = $parts[2].Substring($parts[2].Length - 1)
if ($last -eq "a") {
  $fakeSig = $parts[2].Substring(0, $parts[2].Length - 1) + "b"
} else {
  $fakeSig = $parts[2].Substring(0, $parts[2].Length - 1) + "a"
}
$FAKE_SIGNATURE_TOKEN = "$($parts[0]).$($parts[1]).$fakeSig"

curl.exe -i "$BASE_URL/api/crypto/jwt-algorithm" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $FAKE_SIGNATURE_TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
invalid_token
```

Giai thich: payload/header co the van doc duoc, nhung chu ky khong khop nen gateway chan.

## 2. JWT Forgery: Sua Payload Len Role Admin

Muc tieu: attacker sua payload JWT de tu gan role `admin`.

Them helper Base64URL trong PowerShell:

```powershell
function ConvertTo-Base64UrlFromText($text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function ConvertFrom-Base64UrlToText($text) {
  $base64 = $text.Replace("-", "+").Replace("_", "/")
  switch ($base64.Length % 4) {
    2 { $base64 += "==" }
    3 { $base64 += "=" }
  }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($base64))
}
```

Sua payload:

```powershell
$parts = $TOKEN -split "\."
$payload = ConvertFrom-Base64UrlToText $parts[1] | ConvertFrom-Json
$payload.preferred_username = "attacker"
$payload.realm_access.roles = @("admin")
$newPayloadJson = $payload | ConvertTo-Json -Compress -Depth 10
$newPayload = ConvertTo-Base64UrlFromText $newPayloadJson
$TAMPERED_PAYLOAD_TOKEN = "$($parts[0]).$newPayload.$($parts[2])"

curl.exe -i "$BASE_URL/api/admin" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $TAMPERED_PAYLOAD_TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
invalid_token
```

Giai thich: payload bi sua thi signature cu khong con hop le.

## 3. Algorithm Confusion / Downgrade: `alg:none`

Muc tieu: tao token co header `alg:none` de thu bypass chu ky.

```powershell
$parts = $TOKEN -split "\."
$noneHeader = ConvertTo-Base64UrlFromText '{"alg":"none","typ":"JWT"}'
$ALG_NONE_TOKEN = "$noneHeader.$($parts[1])."

curl.exe -i "$BASE_URL/api/crypto/jwt-algorithm" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $ALG_NONE_TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
unsupported_alg
```

Giai thich: gateway chi chap nhan `RS256`, `HS256`, `ES256`.

## 4. Token Sai Issuer / Sai Audience

Muc tieu: ky token bang secret demo dung, nhung dat `iss` hoac `aud` sai de gateway chan.

Them helper ky HS256 trong PowerShell:

```powershell
function New-Hs256Jwt($payload, $secret, $kid) {
  $headerJson = @{ alg = "HS256"; typ = "JWT"; kid = $kid } | ConvertTo-Json -Compress
  $payloadJson = $payload | ConvertTo-Json -Compress -Depth 10
  $header = ConvertTo-Base64UrlFromText $headerJson
  $body = ConvertTo-Base64UrlFromText $payloadJson
  $data = "$header.$body"
  $keyBytes = [Text.Encoding]::UTF8.GetBytes($secret)
  $hmac = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
  $sigBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($data))
  $sig = [Convert]::ToBase64String($sigBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  return "$data.$sig"
}
```

Tao token sai issuer:

```powershell
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$payloadWrongIssuer = @{
  sub = "attacker-issuer"
  preferred_username = "attacker"
  realm_access = @{ roles = @("user") }
  scope = "read write"
  client_id = "gateway-client"
  iss = "https://evil.example/issuer"
  aud = "secure-api"
  iat = $now
  exp = $now + 600
}

$WRONG_ISSUER_TOKEN = New-Hs256Jwt $payloadWrongIssuer "khoa-bi-mat-24byte-cho-hs256!!" "hs256-v1"

curl.exe -i "$BASE_URL/api/secure" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $WRONG_ISSUER_TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
unexpected "iss" claim value
```

Tao token sai audience:

```powershell
$payloadWrongAud = @{
  sub = "attacker-aud"
  preferred_username = "attacker"
  realm_access = @{ roles = @("user") }
  scope = "read write"
  client_id = "gateway-client"
  iss = "$BASE_URL/demo-idp"
  aud = "wrong-api"
  iat = $now
  exp = $now + 600
}

$WRONG_AUD_TOKEN = New-Hs256Jwt $payloadWrongAud "khoa-bi-mat-24byte-cho-hs256!!" "hs256-v1"

curl.exe -i "$BASE_URL/api/secure" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $WRONG_AUD_TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
unexpected "aud" claim value
```

Luu y: neu host dang chay Docker voi `DEMO_JWT_ISSUER=http://localhost:3000/demo-idp`, token hop le duoc tao boi endpoint demo se van pass vi backend ky va verify cung issuer noi bo. Phan test sai issuer/audience nay dung de chung minh gateway co enforce claim khi attacker tu ky token.

## 5. Token Het Han

Tao token da expired:

```powershell
$payloadExpired = @{
  sub = "attacker-expired"
  preferred_username = "attacker"
  realm_access = @{ roles = @("user") }
  scope = "read write"
  client_id = "gateway-client"
  iss = "$BASE_URL/demo-idp"
  aud = "secure-api"
  iat = $now - 7200
  exp = $now - 3600
}

$EXPIRED_TOKEN = New-Hs256Jwt $payloadExpired "khoa-bi-mat-24byte-cho-hs256!!" "hs256-v1"

curl.exe -i "$BASE_URL/api/secure" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $EXPIRED_TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
exp claim timestamp check failed
```

## 6. Token Bi Revoke

Tao token hop le moi:

```powershell
$tokenResp2 = Invoke-RestMethod -Method Post "$BASE_URL/api/demo/token/hs256" `
  -Headers @{ "ngrok-skip-browser-warning" = "true" } `
  -ContentType "application/json" `
  -Body "{}"

$REVOKE_TOKEN = $tokenResp2.token
```

Kiem tra truoc revoke:

```powershell
curl.exe -i "$BASE_URL/api/secure" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $REVOKE_TOKEN"
```

Revoke token:

```powershell
curl.exe -i -X POST "$BASE_URL/oauth/revoke" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Content-Type: application/json" `
  -d "{`"token`":`"$REVOKE_TOKEN`"}"
```

Dung lai token da revoke:

```powershell
curl.exe -i "$BASE_URL/api/secure" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $REVOKE_TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
revoked_token
```

## 7. Replay Attack Voi HMAC Request Signing

Tao token hop le:

```powershell
$tokenResp3 = Invoke-RestMethod -Method Post "$BASE_URL/api/demo/token/hs256" `
  -Headers @{ "ngrok-skip-browser-warning" = "true" } `
  -ContentType "application/json" `
  -Body "{}"

$HMAC_TOKEN = $tokenResp3.token
```

Tao chu ky HMAC:

```powershell
$payload = '{"body":{"amount":100000,"to":"alice"}}'

$signResp = Invoke-RestMethod -Method Post "$BASE_URL/api/crypto/hmac-sign" `
  -Headers @{ "ngrok-skip-browser-warning" = "true" } `
  -ContentType "application/json" `
  -Body $payload

$timestamp = $signResp.headers.'x-timestamp'
$nonce = $signResp.headers.'x-nonce'
$signature = $signResp.headers.'x-signature'
```

Gui lan 1:

```powershell
curl.exe -i -X POST "$BASE_URL/api/crypto/hmac-verify" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $HMAC_TOKEN" `
  -H "x-timestamp: $timestamp" `
  -H "x-nonce: $nonce" `
  -H "x-signature: $signature" `
  -d $payload
```

Gui lai y het lan 2:

```powershell
curl.exe -i -X POST "$BASE_URL/api/crypto/hmac-verify" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $HMAC_TOKEN" `
  -H "x-timestamp: $timestamp" `
  -H "x-nonce: $nonce" `
  -H "x-signature: $signature" `
  -d $payload
```

Ket qua mong doi lan 2:

```text
HTTP/1.1 401 Unauthorized
replay_detected
```

## 8. Request Tampering Sau Khi Ky

Dung timestamp/nonce/signature cua request vua ky, nhung sua body:

```powershell
$tamperedPayload = '{"body":{"amount":999999,"to":"mallory"}}'

curl.exe -i -X POST "$BASE_URL/api/crypto/hmac-verify" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer $HMAC_TOKEN" `
  -H "x-timestamp: $timestamp" `
  -H "x-nonce: tamper-$nonce" `
  -H "x-signature: $signature" `
  -d $tamperedPayload
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
verified:false
```

Giai thich: body da bi sua nen hash/canonical request khong khop voi signature.

## 9. Introspection: Token Inactive / Revoked

Tao token va goi introspection endpoint:

```powershell
$tokenResp4 = Invoke-RestMethod -Method Post "$BASE_URL/api/demo/token/hs256" `
  -Headers @{ "ngrok-skip-browser-warning" = "true" } `
  -ContentType "application/json" `
  -Body "{}"

$INTRO_TOKEN = $tokenResp4.token

curl.exe -i "$BASE_URL/api/secure-introspection" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $INTRO_TOKEN"
```

Revoke token:

```powershell
curl.exe -i -X POST "$BASE_URL/oauth/revoke" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Content-Type: application/json" `
  -d "{`"token`":`"$INTRO_TOKEN`"}"
```

Goi lai introspection endpoint:

```powershell
curl.exe -i "$BASE_URL/api/secure-introspection" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Authorization: Bearer $INTRO_TOKEN"
```

Ket qua mong doi:

```text
HTTP/1.1 401 Unauthorized
revoked_token
```

## 10. Brute Force / Request Flood Muc Co Ban

Muc tieu: kich hoat rate limit cua gateway. Chi chay voi lab cua ban.

```powershell
1..150 | ForEach-Object {
  curl.exe -s -o NUL -w "%{http_code}`n" "$BASE_URL/health" `
    -H "ngrok-skip-browser-warning: true"
}
```

Ket qua mong doi:

- Ban dau nhieu request tra `200`.
- Khi vuot `RATE_LIMIT_MAX`, gateway tra `429`.

Neu khong thay `429`, host co the dang dat `RATE_LIMIT_MAX` cao. Giam tam trong `docker-compose.yml`, restart, roi test lai.

## 11. Request Body Qua Lon

Tao body lon hon gioi han lab:

```powershell
$big = "A" * 1200000
$bigJson = @{ data = $big } | ConvertTo-Json

curl.exe -i -X POST "$BASE_URL/api/demo/token/hs256" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Content-Type: application/json" `
  --data-binary $bigJson
```

Ket qua mong doi:

```text
413 Payload Too Large
```

## 12. Sai Content-Type

Gui POST co body nhung `Content-Type: text/plain`:

```powershell
curl.exe -i -X POST "$BASE_URL/api/demo/token/hs256" `
  -H "ngrok-skip-browser-warning: true" `
  -H "Content-Type: text/plain" `
  -d "abc"
```

Ket qua mong doi:

```text
415 Unsupported Media Type
unsupported_media_type
```

## 13. Security Headers

Kiem tra headers:

```powershell
curl.exe -i "$BASE_URL/health" -H "ngrok-skip-browser-warning: true"
```

Can chup bang chung cac header:

```text
Content-Security-Policy
X-Frame-Options
X-Content-Type-Options
Cache-Control: no-store
Referrer-Policy
x-request-id
traceparent
```

Y nghia:

- Giam clickjacking.
- Giam MIME sniffing.
- Khong cache response nhay cam.
- Co trace id de dieu tra.

## 14. Key Compromise / Rotation Demo

Phan nay lam tren may host vi can truy cap Vault/dev secret.

Tren host:

```powershell
node .\scripts\init-vault-demo.js
curl.exe -X POST http://localhost:3000/api/crypto/reload-keys
curl.exe http://localhost:3000/api/crypto/key-status
```

Bat canary rotation:

```powershell
node .\scripts\canary-rotation.js HS256 start 10
curl.exe -X POST http://localhost:3000/api/crypto/reload-keys
curl.exe http://localhost:3000/api/crypto/key-status
```

Promote hoac rollback:

```powershell
node .\scripts\canary-rotation.js HS256 promote
curl.exe -X POST http://localhost:3000/api/crypto/reload-keys

node .\scripts\canary-rotation.js HS256 rollback
curl.exe -X POST http://localhost:3000/api/crypto/reload-keys
```

Bang chung can chup:

- `canaryKid`
- `canaryPercent`
- `currentKid`
- token moi co `kid` khac nhau theo ty le canary

## 15. Observability Sau Khi Tan Cong

Tren may attacker:

```powershell
curl.exe -i "$BASE_URL/metrics" -H "ngrok-skip-browser-warning: true"
curl.exe -i "$BASE_URL/metrics/prometheus" -H "ngrok-skip-browser-warning: true"
```

Tren may host:

```powershell
Get-Content .\backend\logs\security-audit.log -Tail 80
```

Bang chung can chup:

- `jwt_verify_fail_total`
- `replay_detected_total`
- `revoked_token_total`
- `request_rejected_total`
- audit log co `trace_id`, `request_id`, `reason`

## 16. Chay Test Tu Dong Neu May Attacker Co Copy Repo

Neu may attacker co Node.js va copy repo sang may do:

```powershell
cd C:\Users\KhanhVy\D\uit\MMH\NT219_8_Sercure
$env:BASE_URL="https://shower-trickily-equity.ngrok-free.dev"
node .\scripts\security-attacks.js --url=$env:BASE_URL
```

Ket qua mong doi:

```text
jwt_fake_signature                 pass=True
jwt_modified_payload_admin_role    pass=True
jwt_alg_none                       pass=True
hmac_replay_nonce                  pass=True
revoked_token_reuse                pass=True
```

## 17. Bang Ket Luan Dua Vao Bao Cao

| Tan cong | Endpoint test | Ket qua dung |
|---|---|---|
| JWT fake signature | `/api/crypto/jwt-algorithm` | `401 invalid_token` |
| Sua payload admin | `/api/admin` | `401 invalid_token` |
| `alg:none` | `/api/crypto/jwt-algorithm` | `401 unsupported_alg` |
| Wrong issuer/audience | `/api/secure` | `401 invalid_token` |
| Expired token | `/api/secure` | `401 invalid_token` |
| Revoked token | `/api/secure` | `401 revoked_token` |
| Replay HMAC | `/api/crypto/hmac-verify` | lan 2 `401 replay_detected` |
| Tamper body | `/api/crypto/hmac-verify` | `401 verified:false` |
| Inactive/revoked introspection | `/api/secure-introspection` | `401 revoked_token` |
| Request flood co ban | `/health` | `429 Too Many Requests` |
| Body qua lon | POST endpoint | `413 Payload Too Large` |
| Sai Content-Type | POST endpoint | `415 Unsupported Media Type` |
| Security headers | `/health` | co hardening headers |
| Observability | `/metrics`, audit log | metric/log tang theo attack |

