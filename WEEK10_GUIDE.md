# Tuan 10 - Hardening, Observability, Canary Key Rotation

## 1. Tuan 10 yeu cau gi?

Theo timeline do an, tuan 10 gom 3 nhom viec:

- Harden API Gateway: giam be mat tan cong, chan request bat thuong, them header bao mat, gioi han kich thuoc body va rate limit.
- Observability: co log, metric, trace/request id de theo doi request va loi bao mat.
- Canary key rotation: khong doi khoa JWT dot ngot, ma phat hanh mot ty le nho token bang khoa moi, theo doi loi, sau do promote hoac rollback.

## 2. Cac phan da trien khai

### 2.1 Hardening

File chinh:

- `backend/middleware/securityHardening.js`
- `backend/server.js`

Chinh sach dang co:

- `helmet()` bat security headers co ban.
- Them `cache-control: no-store`, `pragma: no-cache`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
- Gioi han body JSON bang `JSON_BODY_LIMIT` mac dinh `1mb`.
- Chan body lon theo `MAX_BODY_BYTES` mac dinh `1048576`.
- Bat `Content-Type: application/json` cho request ghi co body.
- Rate limit theo IP bang `RATE_LIMIT_WINDOW_MS` va `RATE_LIMIT_MAX`.
- Ghi audit log khi request bi reject.

### 2.2 Observability

File chinh:

- `backend/middleware/tracing.js`
- `backend/middleware/requestLogger.js`
- `backend/services/metrics.js`
- `backend/services/auditLog.js`

Gateway hien co:

- `x-request-id` cho moi request.
- `traceparent` theo W3C Trace Context de lien ket request qua cac service.
- Audit log JSON co `request_id`, `trace_id`, `span_id`.
- `/metrics` tra ve JSON snapshot.
- `/metrics/prometheus` tra ve text format de Prometheus scrape.

Metric dang co:

- `http_requests_total`
- `http_request_duration_ms`
- `jwt_verify_success_total`
- `jwt_verify_fail_total`
- `jwt_verify_duration_ms`
- `request_rejected_total`
- `replay_detected_total`
- `vault_reload_total`
- `vault_reload_duration_ms`
- `canary_token_issued_total`

### 2.3 Canary key rotation

File chinh:

- `backend/services/keyStore.js`
- `scripts/canary-rotation.js`

Y tuong:

- `currentKid`: khoa dang phat token chinh.
- `canaryKid`: khoa moi dang thu nghiem.
- `canaryPercent`: ty le token moi duoc ky bang `canaryKid`.
- Gateway van verify duoc ca khoa chinh va khoa canary neu khoa con active.
- Neu canary on dinh thi `promote`; neu loi thi `rollback`.

## 3. Cach chay demo

Mo CMD va di den thu muc project:

```cmd
cd /d "D:\NAM 2\HK2\NT129-MMH\Project_MMH\NT219_8_Sercure"
```

Khoi dong he thong:

```cmd
docker compose up -d --build
```

Nap key demo vao Vault:

```cmd
node scripts\init-vault-demo.js
```

Kiem tra health va trace header:

```cmd
curl.exe -i http://localhost:3000/health
```

Kiem tra metrics:

```cmd
curl.exe http://localhost:3000/metrics
curl.exe http://localhost:3000/metrics/prometheus
```

Tao token HS256 nhieu lan de xem `kid` hien tai:

```cmd
curl.exe -X POST http://localhost:3000/api/demo/token/hs256
```

Bat canary rotation HS256 voi 10%:

```cmd
node scripts\canary-rotation.js HS256 start 10
curl.exe -X POST http://localhost:3000/api/crypto/reload-keys
```

Tang canary len 50%:

```cmd
node scripts\canary-rotation.js HS256 set 50
curl.exe -X POST http://localhost:3000/api/crypto/reload-keys
```

Khi on dinh, promote canary thanh khoa chinh:

```cmd
node scripts\canary-rotation.js HS256 promote
curl.exe -X POST http://localhost:3000/api/crypto/reload-keys
```

Neu phat hien loi, rollback:

```cmd
node scripts\canary-rotation.js HS256 rollback
curl.exe -X POST http://localhost:3000/api/crypto/reload-keys
```

Xem trang thai khoa:

```cmd
curl.exe http://localhost:3000/api/crypto/key-status
node scripts\canary-rotation.js HS256 status
```

## 4. Test hardening

### 4.1 Test security headers

Lenh:

```cmd
curl.exe -i http://localhost:3000/health
```

Bang chung can chup/man hinh:

```text
Content-Security-Policy: ...
Strict-Transport-Security: ...
x-content-type-options: nosniff
X-Frame-Options: SAMEORIGIN
cache-control: no-store
pragma: no-cache
referrer-policy: no-referrer
x-ratelimit-limit: 120
x-ratelimit-remaining: ...
traceparent: ...
x-request-id: ...
```

Y nghia:

- Cac security headers giup giam rui ro XSS, clickjacking, MIME sniffing va cache token/response nhay cam.
- `x-ratelimit-*` cho thay gateway dang ap dung gioi han request.
- `traceparent` va `x-request-id` dung de truy vet request.

### 4.2 Test chan sai Content-Type

Lenh:

```cmd
curl.exe -i -X POST http://localhost:3000/api/demo/token/hs256 -H "Content-Type: text/plain" -d "abc"
```

Ket qua mong doi:

```text
HTTP/1.1 415 Unsupported Media Type
```

Body mong doi:

```json
{
  "error": "unsupported_media_type",
  "message": "Write requests must use Content-Type: application/json"
}
```

Y nghia:

- Gateway khong nhan request ghi co body sai dinh dang.
- Day la mot lop hardening truoc khi request di vao business logic.

### 4.3 Test rate limit

Kiem tra rate limit header:

```cmd
curl.exe -i http://localhost:3000/health
```

Can thay:

```text
x-ratelimit-limit: 120
x-ratelimit-remaining: ...
x-ratelimit-reset: ...
```

Neu muon demo loi `429 Too Many Requests`, doi tam trong `docker-compose.yml`:

```yaml
RATE_LIMIT_MAX: 3
```

Khoi dong lai:

```cmd
docker compose up -d --build
```

Goi nhieu lan:

```cmd
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/health
curl.exe -i http://localhost:3000/health
```

Ket qua mong doi khi vuot gioi han:

```text
HTTP/1.1 429 Too Many Requests
```

## 5. Noi dung nen dua vao bao cao

- Hardening: mo ta cac lop bao ve request truoc khi vao authentication.
- Observability: log dung de dieu tra su co, metric dung de do latency/error, trace id dung de lien ket cac event.
- Canary rotation: so sanh voi rotation truc tiep; canary giam rui ro vi chi mot phan nho token dung khoa moi.
- Demo bang chung: chup output `/health`, `/metrics/prometheus`, `/api/crypto/key-status`, va audit log co `trace_id`.
