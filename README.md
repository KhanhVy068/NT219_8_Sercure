# Secure API Gateway with Keycloak

Tai lieu nay huong dan thanh vien trong nhom chay va test phan da lam den moc:

- Chon IdP: Keycloak.
- Trien khai gateway: Express API Gateway verify JWT bang JWKS cua Keycloak.
- Thiet lap moi truong Docker.
- Ghi chu trang thai Kubernetes.
- Tuan 3-4: cau hinh Keycloak, tao clients, thiet ke token flows Authorization Code va Client Credentials.

## 1. Kien Truc Hien Tai

Thanh phan dang co:

| Thanh phan | Cong nghe | Port | Vai tro |
| --- | --- | --- | --- |
| Keycloak | quay.io/keycloak/keycloak:26.1 | 8080 | Identity Provider |
| PostgreSQL | postgres:16-alpine | noi bo Docker | Database cho Keycloak |
| Gateway | Node.js + Express | 3000 | API Gateway verify access token |

Endpoints gateway:

| Endpoint | Bao ve token | Yeu cau role | Mo ta |
| --- | --- | --- | --- |
| `GET /api/public` | Khong | Khong | API public de kiem tra backend |
| `GET /api/secure` | Co | Khong | API can Bearer access token hop le |
| `GET /api/admin` | Co | `admin` | API can Bearer access token co realm role `admin` |

## 2. Yeu Cau Truoc Khi Chay

Can cai:

- Docker Desktop.
- Docker Compose.
- Trinh duyet web.
- PowerShell.
- Neu test Kubernetes: bat Kubernetes trong Docker Desktop va co `kubectl`.

Kiem tra nhanh:

```powershell
docker version
docker compose version
kubectl version --client
```

## 3. Chay Moi Truong Docker

Tai thu muc goc project:

```powershell
cd C:\Users\KhanhVy\D\uit\MMH\DOAN
docker compose up -d
```

Kiem tra container:

```powershell
docker compose ps
```

Ky vong thay:

- `keycloak-db` dang `Up`
- `keycloak` dang `Up`
- `backend-api` dang `Up`

Xem log khi can debug:

```powershell
docker compose logs backend
docker compose logs keycloak
docker compose logs postgres
```

Test gateway public:

```powershell
Invoke-RestMethod http://localhost:3000/api/public
```

Ket qua dung:

```json
{
  "message": "Public API is working!"
}
```

## 4. Dang Nhap Keycloak Admin

Mo:

```text
http://localhost:8080
```

Chon **Administration Console**.

Tai khoan admin mac dinh tu `docker-compose.yml`:

```text
Username: admin
Password: admin
```

Luu y: tai khoan `admin/admin` nay dung de quan tri Keycloak trong realm `master`, khong mac dinh la user dang nhap ung dung trong realm `DOAN`.

## 5. Tao Realm `DOAN`

Trong Keycloak Admin Console:

1. Bam dropdown realm o goc trai tren.
2. Chon **Create realm**.
3. Nhap:

```text
Realm name: DOAN
Enabled: On
```

4. Bam **Create**.

Kiem tra realm:

```text
http://localhost:8080/realms/DOAN/.well-known/openid-configuration
```

Neu hien JSON la realm da ton tai.

## 6. Tao Roles

Chon realm `DOAN`, vao:

```text
Realm roles -> Create role
```

Tao 2 role:

```text
user
admin
```

## 7. Tao Users Test

Chon realm `DOAN`, vao:

```text
Users -> Add user
```

Tao user thuong:

```text
Username: user1
Email verified: On
Enabled: On
```

Sau khi tao, vao tab **Credentials**:

```text
Password: 123456
Temporary: Off
```

Gan role:

```text
Role mapping -> Assign role -> Filter by realm roles -> user -> Assign
```

Tao user admin:

```text
Username: admin1
Password: 123456
Temporary: Off
Role: admin
```

## 8. Tao Client `doan-web` Cho Authorization Code Flow

Client nay dung cho nguoi dung dang nhap qua trinh duyet.

Chon realm `DOAN`, vao:

```text
Clients -> Create client
```

General settings:

```text
Client type: OpenID Connect
Client ID: doan-web
Name: DOAN Web
```

Capability config:

```text
Client authentication: Off
Authorization: Off
Standard flow: On
Direct access grants: Off
Implicit flow: Off
Service accounts roles: Off
```

Login settings:

```text
Root URL: http://localhost:3000
Home URL: http://localhost:3000
Valid redirect URIs: http://localhost:3000/*
Valid post logout redirect URIs: http://localhost:3000/*
Web origins: http://localhost:3000
```

Save client.

## 9. Tao Client `doan-api` Cho Client Credentials Flow

Client nay dung cho backend/service lay token bang `client_id` va `client_secret`.

Chon realm `DOAN`, vao:

```text
Clients -> Create client
```

General settings:

```text
Client type: OpenID Connect
Client ID: doan-api
Name: DOAN API
```

Capability config:

```text
Client authentication: On
Authorization: Off
Standard flow: Off
Direct access grants: On
Implicit flow: Off
Service accounts roles: On
```

Save client.

Lay client secret:

```text
Clients -> doan-api -> Credentials -> Client Secret
```

Copy secret nay de test. Khong dung password user `123456` lam client secret.

## 10. Test Authorization Code Flow

Flow nay dai dien cho user dang nhap.

Mo URL sau tren trinh duyet:

```text
http://localhost:8080/realms/DOAN/protocol/openid-connect/auth?client_id=doan-web&response_type=code&scope=openid%20profile%20email&redirect_uri=http://localhost:3000/callback
```

Dang nhap bang user trong realm `DOAN`, vi du:

```text
user1 / 123456
```

Sau khi dang nhap, trinh duyet se redirect ve URL dang:

```text
http://localhost:3000/callback?session_state=...&iss=...&code=...
```

Neu thay:

```text
Cannot GET /callback
```

thi van binh thuong trong giai doan test thu cong, vi gateway chua co route `/callback`. Viec can lam la copy gia tri sau `code=` tren thanh dia chi.

Vi du:

```text
http://localhost:3000/callback?session_state=123&code=abc123
```

Thi code la:

```text
abc123
```

Doi code lay token:

```powershell
$body = @{
  grant_type   = "authorization_code"
  client_id    = "doan-web"
  code         = "<PASTE_CODE_O_DAY>"
  redirect_uri = "http://localhost:3000/callback"
}

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/realms/DOAN/protocol/openid-connect/token" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body $body
```

Ket qua dung se co:

- `access_token`
- `id_token`
- `refresh_token`
- `token_type`
- `expires_in`

Luu y: authorization code chi dung duoc 1 lan va het han nhanh. Neu gap `invalid_grant`, hay login lai de lay code moi.

## 11. Test Client Credentials Flow

Flow nay dai dien cho service/backend, khong dai dien cho user.

Dung client secret cua `doan-api`:

```powershell
$body = @{
  grant_type    = "client_credentials"
  client_id     = "doan-api"
  client_secret = "<CLIENT_SECRET_CUA_DOAN_API>"
}

$tokenResponse = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8080/realms/DOAN/protocol/openid-connect/token" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body $body

$tokenResponse.access_token
```

Ket qua dung se co `access_token`.

Loi thuong gap:

| Loi | Nguyen nhan |
| --- | --- |
| `Realm does not exist` | Dung sai realm. Project nay dung `DOAN`, khong phai `doan` |
| `Invalid client credentials` | Sai `client_secret` hoac client khong ton tai trong realm `DOAN` |
| `unauthorized_client` | Chua bat `Service accounts roles` cho `client_credentials` |

## 12. Test Gateway Bang Access Token

Gan token vua lay duoc vao bien:

```powershell
$token = "<PASTE_ACCESS_TOKEN_O_DAY>"
```

Test API secure:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/secure" `
  -Headers @{ Authorization = "Bearer $token" }
```

Neu token hop le:

```json
{
  "message": "Secure API is working!"
}
```

Test API admin:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/admin" `
  -Headers @{ Authorization = "Bearer $token" }
```

Neu token khong co role `admin`, ket qua dung la bi chan:

```json
{
  "error": "forbidden",
  "message": "Required role: admin"
}
```

De test thanh cong `/api/admin`, hay dang nhap bang user co role `admin`, vi du `admin1`.

## 13. Thiet Ke Token Flows

Dung trong project:

| Nhu cau | Client | Flow | Ghi chu |
| --- | --- | --- | --- |
| User dang nhap tren browser | `doan-web` | Authorization Code | Dung cho frontend/app co user |
| Backend/service lay token | `doan-api` | Client Credentials | Dung cho service-to-service |
| Test nhanh user/password | `doan-api` | Password Grant | Chi nen dung de test, khong khuyen nghi cho production |

Luon goi API gateway bang header:

```text
Authorization: Bearer <access_token>
```

Gateway se verify:

- JWT signature bang JWKS cua Keycloak.
- Issuer: `http://localhost:8080/realms/DOAN`.
- Role `admin` cho endpoint `/api/admin`.

## 14. Trien Khai Gateway

Phan gateway hien nam trong:

```text
backend/server.js
```

Gateway dung:

- `express`: tao API.
- `cors`: cho phep client goi API.
- `helmet`: them cac HTTP security headers co ban.
- `jose`: verify JWT bang JWKS cua Keycloak.

Dependencies trong `backend/package.json`:

```json
{
  "cors": "^2.8.6",
  "express": "^4.18.2",
  "helmet": "^8.1.0",
  "jose": "^6.2.3"
}
```

### 14.1. Cau Hinh Gateway Trong Docker Compose

Service gateway la `backend` trong `docker-compose.yml`:

```yaml
backend:
  image: node:18-alpine
  container_name: backend-api
  working_dir: /app
  volumes:
    - ./backend:/app
  command: sh -c "npm install && node server.js"
  ports:
    - "3000:3000"
  environment:
    KEYCLOAK_ISSUER: http://localhost:8080/realms/DOAN
    KEYCLOAK_JWKS_URI: http://keycloak:8080/realms/DOAN/protocol/openid-connect/certs
  networks:
    - public
```

Co 2 URL Keycloak can phan biet:

| Bien | Gia tri | Ly do |
| --- | --- | --- |
| `KEYCLOAK_ISSUER` | `http://localhost:8080/realms/DOAN` | Phai khop voi `iss` trong token ma browser/PowerShell nhan duoc |
| `KEYCLOAK_JWKS_URI` | `http://keycloak:8080/realms/DOAN/protocol/openid-connect/certs` | Backend chay trong Docker nen goi Keycloak bang service name `keycloak` |

Neu doi realm name, phai doi ca 2 bien tren.

### 14.2. Logic Verify Token

Gateway doc header:

```text
Authorization: Bearer <access_token>
```

Sau do:

1. Lay token sau chuoi `Bearer `.
2. Tai public keys tu JWKS endpoint cua Keycloak.
3. Verify chu ky JWT.
4. Verify issuer la `http://localhost:8080/realms/DOAN`.
5. Gan payload vao `req.user`.
6. Cho request di tiep neu token hop le.

Neu khong co token:

```json
{
  "error": "missing_token",
  "message": "Missing Authorization: Bearer token"
}
```

Neu token sai, het han, sai issuer, hoac verify that bai:

```json
{
  "error": "invalid_token"
}
```

### 14.3. Logic Phan Quyen Role

Endpoint `/api/admin` dung role check:

```text
realm_access.roles
```

Token phai co role:

```text
admin
```

Neu token hop le nhung khong co role `admin`, gateway tra:

```json
{
  "error": "forbidden",
  "message": "Required role: admin"
}
```

### 14.4. Restart Gateway Sau Khi Sua Code

Neu sua `backend/server.js`, restart container:

```powershell
docker compose restart backend
```

Xem log gateway:

```powershell
docker compose logs backend
```

Neu gateway chay dung, log co:

```text
Gateway running on port 3000
```

Neu can rebuild lai moi truong tu dau:

```powershell
docker compose down
docker compose up -d
```

Khong dung `docker compose down -v` neu khong muon mat data Keycloak.

### 14.5. Test Gateway Public

Endpoint public khong can token:

```powershell
Invoke-RestMethod http://localhost:3000/api/public
```

Ket qua dung:

```json
{
  "message": "Public API is working!"
}
```

### 14.6. Test Gateway Chan Request Khong Co Token

Goi endpoint secure khong kem token:

```powershell
Invoke-RestMethod http://localhost:3000/api/secure
```

Ket qua mong doi la bi chan voi HTTP `401`.

PowerShell se hien loi, nhung body loi tu gateway la:

```json
{
  "error": "missing_token",
  "message": "Missing Authorization: Bearer token"
}
```

### 14.7. Test Gateway Voi Access Token

Lay access token bang Authorization Code Flow hoac Client Credentials Flow, sau do gan vao bien:

```powershell
$token = "<PASTE_ACCESS_TOKEN_O_DAY>"
```

Goi endpoint secure:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/secure" `
  -Headers @{ Authorization = "Bearer $token" }
```

Ket qua dung:

```json
{
  "message": "Secure API is working!",
  "user": "...",
  "issuer": "http://localhost:8080/realms/DOAN"
}
```

### 14.8. Test Gateway Voi Role `admin`

Dang nhap bang user co role `admin`, vi du:

```text
admin1 / 123456
```

Lay access token moi, gan vao bien:

```powershell
$adminToken = "<PASTE_ADMIN_ACCESS_TOKEN_O_DAY>"
```

Goi:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/admin" `
  -Headers @{ Authorization = "Bearer $adminToken" }
```

Ket qua dung:

```json
{
  "message": "Admin API is working!",
  "user": "admin1"
}
```

Neu dung token cua `user1` chi co role `user`, ket qua dung la HTTP `403`.

### 14.9. Cach Kiem Tra Token Co Role Hay Khong

Copy `access_token` va paste vao:

```text
https://jwt.io
```

Trong payload, tim:

```json
{
  "realm_access": {
    "roles": [
      "admin"
    ]
  }
}
```

Neu khong thay role `admin`, kiem tra lai:

```text
Keycloak Admin -> realm DOAN -> Users -> admin1 -> Role mapping
```

### 14.10. Loi Thuong Gap Khi Test Gateway

| Loi | Nguyen nhan | Cach xu ly |
| --- | --- | --- |
| `missing_token` | Khong gui header Authorization | Them `Authorization: Bearer <token>` |
| `invalid_token` | Token sai, het han, sai issuer, hoac JWKS khong lay duoc | Lay token moi va kiem tra `KEYCLOAK_ISSUER` |
| `forbidden` | Token hop le nhung thieu role | Gan role dung cho user trong Keycloak |
| `connect ECONNREFUSED keycloak:8080` | Gateway khong ket noi duoc Keycloak trong Docker network | Kiem tra container `keycloak` co `Up` khong |
| `issuer claim mismatch` | Realm/issuer trong token khong khop config gateway | Dung realm `DOAN` va URL `http://localhost:8080/realms/DOAN` |

### 14.11. Viec Can Lam Tiep Cho Gateway

Phan hien tai da du de demo JWT verification va role-based access control.

Viec tiep theo co the lam:

1. Tach middleware auth ra file rieng, vi du `backend/middleware/auth.js`.
2. Them route mau cho service that cua nhom.
3. Them `.env` de quan ly config thay vi hardcode trong `docker-compose.yml`.
4. Them Dockerfile rieng cho backend thay vi dung truc tiep `node:18-alpine`.
5. Them health check endpoint, vi du `GET /health`.
6. Them Kubernetes manifests cho gateway.

## 15. Trang Thai Kubernetes

Hien tai Docker Compose da la moi truong chay chinh.

Kubernetes can lam tiep:

1. Bat Kubernetes trong Docker Desktop:

```text
Docker Desktop -> Settings -> Kubernetes -> Enable Kubernetes
```

2. Kiem tra:

```powershell
kubectl config current-context
kubectl get nodes
```

Ky vong context:

```text
docker-desktop
```

3. Tao manifests trong thu muc `k8s/`:

```text
k8s/
  namespace.yaml
  postgres.yaml
  keycloak.yaml
  backend.yaml
```

4. Can dong goi backend thanh Docker image rieng truoc khi deploy len Kubernetes.

Ket luan: Kubernetes chua phai phan chay chinh trong repo hien tai. Nhom tiep theo co the tiep tuc bang cach viet manifests va build image backend.

## 16. Checklist Cho Thanh Vien Test

Lam theo thu tu:

1. `docker compose up -d`
2. `docker compose ps` thay 3 container `Up`
3. Mo Keycloak admin: `http://localhost:8080`
4. Tao realm `DOAN`
5. Tao roles `user`, `admin`
6. Tao users `user1`, `admin1`
7. Tao client `doan-web`
8. Tao client `doan-api`
9. Test Authorization Code Flow lay token
10. Test Client Credentials Flow lay token
11. Goi `GET /api/secure` bang Bearer token
12. Goi `GET /api/admin` bang token cua user co role `admin`

## 17. Lenh Don Dep

Dung container:

```powershell
docker compose down
```

Dung container va xoa volume Keycloak/Postgres:

```powershell
docker compose down -v
```

Can than: `docker compose down -v` se xoa data Keycloak, bao gom realm, users, clients da tao.
