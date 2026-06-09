# Huong Dan Lab: 1 May Host, 1 May Truy Cap/Tan Cong Qua HTTPS Bang ngrok

Muc tieu:

- May host chay Docker Compose gom Keycloak, Vault, backend API Gateway.
- May thu hai dong vai tro client/attacker, truy cap qua public HTTPS URL.
- Giao thuc tu Internet vao lab la HTTPS thong qua ngrok.

Theo tai lieu ngrok, lenh `ngrok http <port>` tao public HTTPS endpoint va forward ve service local; ngrok agent tao outbound TLS tunnel tu may host len ngrok cloud, nen khong can mo port router/firewall.

Tai lieu tham khao:

- https://ngrok.com/docs/guides/share-localhost/tunnels
- https://ngrok.com/docs/http
- https://ngrok.com/docs/agent/cli

## 1. Mo Hinh Ket Noi

```text
May attacker
  |
  | HTTPS
  v
Public URL ngrok: https://xxxx.ngrok-free.app
  |
  | secure tunnel cua ngrok
  v
May host
  |
  | localhost:3000
  v
Express API Gateway
```

Neu demo OAuth/Keycloak tu may attacker:

```text
May attacker
  | HTTPS
  v
Gateway ngrok URL  -> localhost:3000

May attacker
  | HTTPS
  v
Keycloak ngrok URL -> localhost:8080
```

## 2. Chuan Bi Tren May Host

Can co:

- Docker Desktop.
- Node.js.
- ngrok CLI.
- Tai khoan ngrok va authtoken.

Cau hinh authtoken tren may host:

```powershell
ngrok config add-authtoken <NGROK_AUTHTOKEN_CUA_BAN>
```

Chay project:

```powershell
cd C:\Users\KhanhVy\D\uit\MMH\NT219_8_Sercure
docker compose up -d --build
docker compose ps
```

Kiem tra local:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/api/public
```

## 3. Cach 1: Expose Gateway HTTPS De May Attacker Test API

Cach nay phu hop nhat cho cac demo:

- JWT HS256/ES256.
- Forged token.
- Replay attack.
- HMAC request signing.
- Metrics/hardening.

Tren may host, mo terminal rieng:

```powershell
ngrok http 3000
```

Ngrok se hien URL dang:

```text
Forwarding  https://xxxx.ngrok-free.app -> http://localhost:3000
```

Ghi lai URL, vi du:

```text
$BASE_URL = "https://xxxx.ngrok-free.app"
```

### Test tu may attacker

Tren may attacker:

```powershell
$BASE_URL="https://xxxx.ngrok-free.app"
Invoke-RestMethod "$BASE_URL/health"
Invoke-RestMethod "$BASE_URL/api/public"
```

Tao token HS256 qua HTTPS public URL:

```powershell
$tokenResp = Invoke-RestMethod -Method Post "$BASE_URL/api/demo/token/hs256" `
  -ContentType "application/json" `
  -Body "{}"
$token = $tokenResp.token
```

Goi API secure:

```powershell
Invoke-RestMethod "$BASE_URL/api/secure" -Headers @{
  Authorization = "Bearer $token"
}
```

Test algorithm:

```powershell
Invoke-RestMethod "$BASE_URL/api/crypto/jwt-algorithm" -Headers @{
  Authorization = "Bearer $token"
}
```

## 4. Demo Tan Cong Forgery Qua HTTPS

Tren may attacker, tao forged token neu da co script project:

```powershell
cd <thu_muc_project_neu_copy_repo_sang_may_attacker>
node .\scripts\forge-risk1-token.js
```

Neu khong copy repo, co the tao request voi token sai bat ky:

```powershell
$badToken="abc.def.ghi"
Invoke-RestMethod "$BASE_URL/api/secure" -Headers @{
  Authorization = "Bearer $badToken"
}
```

Ket qua mong doi:

```text
401 invalid_token
```

Y nghia bao cao:

- Request di qua HTTPS public endpoint.
- Gateway van verify JWT signature/alg/kid/issuer/audience.
- Token gia mao bi chan.

## 5. Demo HMAC Request Signing Va Replay Qua HTTPS

Tao token hop le:

```powershell
$tokenResp = Invoke-RestMethod -Method Post "$BASE_URL/api/demo/token/hs256" `
  -ContentType "application/json" `
  -Body "{}"
$token = $tokenResp.token
```

Tao chu ky HMAC:

```powershell
$payload = @{ body = @{ amount = 100; to = "alice" } } | ConvertTo-Json -Depth 5
$signResp = Invoke-RestMethod -Method Post "$BASE_URL/api/crypto/hmac-sign" `
  -ContentType "application/json" `
  -Body $payload
```

Goi verify hop le:

```powershell
Invoke-RestMethod -Method Post "$BASE_URL/api/crypto/hmac-verify" `
  -ContentType "application/json" `
  -Headers @{
    Authorization = "Bearer $token"
    "x-timestamp" = $signResp.headers.'x-timestamp'
    "x-nonce" = $signResp.headers.'x-nonce'
    "x-signature" = $signResp.headers.'x-signature'
  } `
  -Body $payload
```

Replay lai dung request tren lan 2:

```powershell
Invoke-RestMethod -Method Post "$BASE_URL/api/crypto/hmac-verify" `
  -ContentType "application/json" `
  -Headers @{
    Authorization = "Bearer $token"
    "x-timestamp" = $signResp.headers.'x-timestamp'
    "x-nonce" = $signResp.headers.'x-nonce'
    "x-signature" = $signResp.headers.'x-signature'
  } `
  -Body $payload
```

Ket qua mong doi lan 2:

```text
401 replay_detected
```

## 6. Demo Hardening Va Observability Qua HTTPS

Kiem tra security headers:

```powershell
curl.exe -i "$BASE_URL/health"
```

Kiem tra metrics:

```powershell
Invoke-RestMethod "$BASE_URL/metrics"
curl.exe "$BASE_URL/metrics/prometheus"
```

Tren may host, xem audit log:

```powershell
Get-Content .\backend\logs\security-audit.log -Tail 50
```

Khi viet bao cao, chup bang chung:

- URL HTTPS cua ngrok.
- Response `/health`.
- Response `/api/secure`.
- Loi `401` voi token gia mao.
- Loi `401 replay_detected` khi replay nonce.
- `/metrics/prometheus` co counter tang.

## 7. Cach 2: Expose Ca Keycloak Neu Muon OAuth Tu May Attacker

Neu may attacker can mo trang login Keycloak, can expose them port 8080.

Terminal 1 tren host:

```powershell
ngrok http 3000
```

Terminal 2 tren host:

```powershell
ngrok http 8080
```

Ghi lai:

```text
GATEWAY_URL=https://gateway-xxxx.ngrok-free.app
KEYCLOAK_URL=https://keycloak-xxxx.ngrok-free.app
```

Trong Keycloak Admin Console, realm `DOAN`, client `doan-web`:

```text
Valid redirect URIs: https://gateway-xxxx.ngrok-free.app/*
Web origins: https://gateway-xxxx.ngrok-free.app
```

Neu token duoc phat tu public Keycloak URL thi issuer se la:

```text
https://keycloak-xxxx.ngrok-free.app/realms/DOAN
```

Luc do backend can verify dung issuer. Cach de chay backend local khong Docker:

```powershell
cd C:\Users\KhanhVy\D\uit\MMH\NT219_8_Sercure
$env:PORT="3000"
$env:KEYCLOAK_ISSUER="https://keycloak-xxxx.ngrok-free.app/realms/DOAN"
$env:KEYCLOAK_JWKS_URI="http://localhost:8080/realms/DOAN/protocol/openid-connect/certs"
$env:DEMO_JWT_ISSUER="https://gateway-xxxx.ngrok-free.app/demo-idp"
$env:DEMO_JWT_AUDIENCE="secure-api"
node .\backend\server.js
```

Neu van chay backend trong Docker, can sua bien moi truong trong `docker-compose.yml` roi restart:

```yaml
KEYCLOAK_ISSUER: https://keycloak-xxxx.ngrok-free.app/realms/DOAN
KEYCLOAK_JWKS_URI: http://keycloak:8080/realms/DOAN/protocol/openid-connect/certs
DEMO_JWT_ISSUER: https://gateway-xxxx.ngrok-free.app/demo-idp
```

Sau do:

```powershell
docker compose up -d --build
```

Luu y: URL ngrok mien phi co the doi moi lan restart tunnel. Neu URL doi, cap nhat lai Keycloak client redirect URI va bien moi truong issuer.

## 8. Khuyen Nghi Khi Demo Bao Ve An Toan

- Chi expose khi demo; xong thi Ctrl+C ngrok.
- Khong public admin password that.
- Khong dung Vault dev root token cho moi truong that.
- Neu can URL on dinh, dung static domain cua ngrok va chay:

```powershell
ngrok http --domain=<static-domain-cua-ban> 3000
```

- Trong bao cao ghi ro: HTTPS ket thuc TLS tai ngrok edge, sau do ngrok forward ve local `http://localhost:3000` qua secure tunnel cua agent.

