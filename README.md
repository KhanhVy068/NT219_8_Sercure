# Secure API Gateway with Cryptographic Enforcement

Đồ án môn NT219 xây dựng API Gateway an toàn sử dụng Kong, Keycloak, JWT, HMAC và HashiCorp Vault. Hệ thống hỗ trợ xác thực, phân quyền, request signing, chống replay, key rotation, logging và benchmark hiệu năng.

## Chức năng chính

- Đăng nhập và cấp JWT qua Keycloak/OIDC.
- Xác thực JWT HS256, ES256 và RS256.
- Phân quyền RBAC.
- HMAC-SHA256 request signing.
- Chống replay bằng timestamp và nonce.
- Quản lý secret/key bằng Vault.
- Rate limit, security headers và request logging.
- Metrics qua Prometheus/Grafana.
- Benchmark HS256, ES256, HMAC, introspection và Vault.

## Kiến trúc

Client → HTTPS/ngrok → Nginx Firewall → Kong → Gateway Auth → Backend Services

Keycloak cung cấp danh tính và JWKS. Vault lưu secret/key. Prometheus và Grafana thu thập, hiển thị metrics.

![Deployment architecture](outputs/secure-api-gateway-deployment-architecture.svg)

![Network topology](outputs/secure-api-gateway-network-topology-zoned.svg)

## Công nghệ

| Thành phần | Công nghệ |
|---|---|
| API Gateway | Kong 3.8 |
| Identity Provider | Keycloak 26.1 |
| Backend | Node.js/Express |
| Firewall | Nginx |
| Secret Management | HashiCorp Vault |
| Database | PostgreSQL |
| Monitoring | Prometheus, Grafana |
| Deployment | Docker Compose, Kubernetes |

## Yêu cầu

- Git
- Docker Desktop
- Node.js
- PowerShell
- Python và matplotlib nếu cần tạo biểu đồ
- ngrok nếu demo qua Internet

## Clone repository

```powershell
git clone <URL_REPOSITORY> NT219_8_Sercure
Set-Location .\NT219_8_Sercure
```

## Khởi động hệ thống

Tạo `.env` từ file mẫu:

```powershell
Copy-Item .env.example .env
```

Khởi động:

```powershell
docker compose up -d --build
docker compose ps
```

Gateway local:

```text
https://localhost:3001
```

Keycloak local:

```text
http://localhost:8081
```

## Demo qua ngrok

```powershell
ngrok http https://localhost:3001
```

Các endpoint:

| Endpoint | Mô tả |
|---|---|
| `GET /health` | Kiểm tra gateway |
| `GET /api/public` | API công khai |
| `GET /api/secure` | Yêu cầu JWT |
| `GET /api/admin` | Yêu cầu role admin |
| `POST /api/crypto/hmac-sign` | Tạo chữ ký HMAC |
| `POST /api/crypto/hmac-verify` | Kiểm tra HMAC/replay |
| `GET /metrics/prometheus` | Metrics |

Hướng dẫn demo chi tiết:

- [Ngrok HTTPS attack lab](docs/ngrok-https-attack-lab.md)
- [Attacker playbook](docs/attacker-playbook-ngrok.md)

## Chạy benchmark

Smoke test:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile quick
```

Benchmark báo cáo:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile report
```

Benchmark Vault:

```powershell
docker compose up -d vault vault-seed

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile report `
  -IncludeVault
```

Hướng dẫn đầy đủ: [Benchmark runbook](docs/benchmark-runbook.md).

Kết quả được lưu tại:

```text
results/benchmark-YYYYMMDD-HHMMSS/
```

## Security tests

```powershell
$env:BASE_URL="https://<NGROK_DOMAIN>"
node .\scripts\security-attacks.js --url=$env:BASE_URL
```

Các test gồm:

- JWT fake signature.
- JWT modified payload.
- `alg=none`.
- HMAC replay.
- Token reuse after revocation.

## Cấu trúc repository

```text
backend/        Backend API và middleware bảo mật
gateway-auth/   Xác thực JWT trước backend
services/       Các domain service
infra/          Kong, Nginx, Vault, Prometheus, Grafana
k8s/            Kubernetes manifests
scripts/        Benchmark, attack và rotation scripts
tests/          Runbook kiểm thử
docs/           Tài liệu kiến trúc và hướng dẫn
results/        Kết quả benchmark
outputs/        Sơ đồ và minh chứng
```

## Lưu ý bảo mật

Cấu hình hiện tại dành cho demo/lab:

- Vault chạy dev mode.
- Mật khẩu và secret mẫu không dùng trong production.
- Không commit `.env`, private key hoặc access token.
- Tắt ngrok sau khi demo.
- Production cần mTLS, Redis nonce store và Vault production.


