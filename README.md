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
## 14.11.1. Tách middleware auth ra file riêng
### Mục đích
Tách logic xác thực token (JWT validation) từ file `server.js` ra file riêng để:
- Dễ quản lý và bảo trì code
- Tái sử dụng middleware cho nhiều route
- Code gọn gàng, rõ ràng hơn
### Cấu trúc thư mục sau khi tách
backend/

├── middleware/

│ └── auth.js # Chứa logic xác thực token

├── server.js # Chỉ chứa định nghĩa route

└── package.json

**Các hàm export từ auth.js:**  dòng 83-87 của file auth.js


|Hàm	|Mô tả|
|---------|------|
|authenticateToken|	Middleware kiểm tra token hợp lệ|
|requireRealmRole(role)|	Middleware kiểm tra user có role chỉ định|
|initializeJWT()|	Khởi tạo JWKS và hàm verify token|


### Kiểm tra hoạt động

#### Bước 1: Build lại Docker sau khi thay đổi code

<pre>
cd DOAN
docker compose build backend
docker compose up -d </pre>

#### Bước 2: Kiểm tra API secure không có token (phải bị chặn)
`http://localhost:3000/api/secure`

**kết quả mong đợi**:
`{"error":"missing_token","message":"Missing Authorization: Bearer token"}`

#### Bước 3: Lấy token từ Keycloak (dùng Client Credentials Flow)
<pre> $body = @{
    grant_type = "client_credentials"
    client_id = "doan-api"
    client_secret = "LKvgkBgD3ry2v02VV2FjYiIOKvl6r05J"
}
$tokenResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/realms/DOAN/protocol/openid-connect/token" -ContentType "application/x-www-form-urlencoded" -Body $body
$token = $tokenResponse.access_token
Write-Host "Token: $token"</pre>
#### Bước 4: Kiểm tra API secure với token hợp lệ
Chạy trong powershell:

`curl -X GET http://localhost:3000/api/secure -H "Authorization: Bearer <token>"`
(Thay <token> bằng token vừa lấy được)

**Kết quả mong đợi:**

`
json
{
    "message": "Secure API is working!",
    "user": "doan-api",
    "issuer": "http://localhost:8080/realms/DOAN"
}`
#### Bước 5: Kiểm tra API admin với token không có role admin (phải bị chặn)
`curl -X GET http://localhost:3000/api/admin -H "Authorization: Bearer <token>"`

**Kết quả mong đợi:**
<pre>
json
{
    "error": "forbidden",
    "message": "Required role: admin"
} </pre>

**Giải thích kết quả sau khi tách middle auth ra file riêng:**
|API	|Token	|Kết quả|	Lý do|
|--------|----------|--------|-------|
|/api/secure	|Không có|	401 missing_token|	Thiếu token|
|/api/secure|	Có (client token)|	200 OK	|Token hợp lệ|
|/api/admin	|Có (client token)	|403 forbidden	|Client token không có role admin|

## 14.11.2. Thêm route mẫu cho service thật của nhóm
**Nơi thêm  code:** file server.js dòng 51-78

**Giải thích:**
|Thành phần|Giá trị|Ý Nghĩa|
|-------|--------|---------|
|Đường dẫn|`/api/myinfo`|API lấy thông tin user|
|Middleware|`auth.authenticateToken`|Yêu cầu token hợp lệ|
|`req.user.sub`|ID của user|Lấy từ token|
|`req.user.preferred_username`|Tên đăng nhập|Lấy từ token|
|`req.user.email`|Email|Lấy từ token|

**TEST:**
* Trong powershell:
<pre> $body = @{
    grant_type = "client_credentials"
    client_id = "doan-api"
    client_secret = "lay_clientsecret_tren_doan-api" 
}</pre>

* Sau đó: Lấy token
<pre>$tokenResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/realms/DOAN/protocol/openid-connect/token" -ContentType "application/x-www-form-urlencoded" -Body $body</pre>

* Gắn token vào biến:
`$token = $tokenResponse.access_token`
* Xem token(neumuon): `$token`
* Gọi API /api/myinfo: 
<pre>Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/myinfo" -Headers $headers | ConvertTo-Json -Depth 10 </pre>

**Kết quả mong đợi:**
<pre>{
    "success": true,
    "data": {
        "userId": "e76540b1-8dbe-4104-b712-f360a4e0dc9c",
        "username": null,
        "email": null,
        "fullName": null,
        "roles": [],
        "issuedAt": "2026-05-20T...",
        "expiresAt": "2026-05-20T..."
    }
} </pre>
*Lưu ý*:
Token từ Client Credentials không có preferred_username và email, nên các trường đó sẽ null.
## 14.11.3. Them .env de quan ly config thay vi hardcode trong docker-compose.yml
### Mục đích
Thay vì viết trực tiếp (hardcode) các giá trị cấu hình như mật khẩu, URL vào file `docker-compose.yml`, ta dùng file `.env` để:
- **Bảo mật hơn**: Không commit mật khẩu lên GitHub
- **Dễ thay đổi**: Chỉ cần sửa 1 file, không động vào docker-compose.yml
- **Linh hoạt**: Mỗi môi trường (dev, staging, prod) có thể có file `.env` riêng

### Cấu trúc thư mục
DOAN/

├── docker-compose.yml # VD: đổi thành POSTGRES_DB: ${POSTGRES_DB} vì đã chuyển giá trị thật sang .env

├── .env # Chứa biến môi trường (KHÔNG commit lên Git)

└── .env.example # File mẫu hướng dẫn (commit lên Git)


### *Ngoài ra*: còn có file **.gitignore** vơi mục đích
Tránh commit các file không cần thiết lên GitHub:
- File cấu hình local (`.vs/`, `.vscode/`)
- Thư mục chứa thư viện (`node_modules/`)
- File chứa mật khẩu (`.env`, `*.pem`)
- Dữ liệu database (`postgres_data/`)

### Kiểm tra cấu hình:

#### Bước 1: Kiểm tra Docker có đọc được .env không
<pre>cd DOAN
docker compose config</pre>

--> Lệnh này sẽ hiển thị file docker-compose.yml sau khi đã thay thế các biến ${...} bằng giá trị từ .env.

**Kết quả mong đợi:** Các dòng như POSTGRES_DB: keycloak (đã được thay thế, không còn ${...})

#### Bước 2: Khởi động lại container
<pre>docker compose down
docker compose up -d</pre>
#### Bước 3: Kiểm tra container hoạt động bình thường:
`docker ps`

`http://localhost:3000/api/public`



## 14.11.4. Them Dockerfile rieng cho backend thay vi dung truc tiep node:18-alpine.
## Thêm Dockerfile riêng cho backend

### Mục đích
Thay vì dùng trực tiếp image `node:18-alpine` và chạy `npm install` mỗi lần start container, ta tự xây dựng image riêng để:
- **Tăng tốc độ khởi động**: `npm install` chỉ chạy 1 lần khi build image
- **Kiểm soát phiên bản**: Biết chính xác dependencies đã cài
- **Dễ dàng deploy**: Có thể push image lên Docker Hub hoặc registry riêng
- **Tùy chỉnh**: Thêm các bước xử lý riêng (tạo user non-root, cài thêm tool)

### Cấu trúc thư mục
backend/

├── Dockerfile # Định nghĩa cách build image

├── .dockerignore # File/thư mục bỏ qua khi build

├── server.js

├── middleware/

│ └── auth.js

├── package.json

└── package-lock.json

**Đã sửa: file docker-compose.yml** # dòng 44 

Từ: 
`
backend:
  image: node:18-alpine `(dùng trực tiếp image)
  
   thành 
  
   `backend:
    build: ./backend  `(dùng dockerfile)

#### Cách build và chạy
#### Bước 1: Build image

<pre>
cd DOAN
docker compose build backend</pre>

#### Bước 2: Chạy container

`docker compose up -d`
#### Bước 3: Kiểm tra container đã chạy

`docker ps`
#### Bước 4: Kiểm tra hoạt động
`http://localhost:3000/api/public`

### Lưu ý khi sửa code
Vì code đã được copy vào image, mỗi lần sửa code cần rebuild:
<pre>
docker compose build backend
docker compose up -d </pre>
### Kiểm tra log sau khi chạy

`docker logs backend-api`

**Kết quả mong đợi:**

Gateway running on port 3000

### Xóa image cũ (nếu cần dọn dẹp)

`docker rmi nt219_8_sercure-backend`

### Xóa toàn bộ container và image
`docker compose down --rmi all`
## 14.11.5. Them health check endpoint 
- Thêm code ở server.js, dòng 20-26

### Mục đích
Thêm endpoint `/health` để kiểm tra gateway có đang hoạt động bình thường hay không. Health check giúp:
- **Docker**: Kiểm tra container còn sống (liveness probe)
- **Kubernetes**: Tự động restart pod khi gateway bị lỗi
- **Debug**: Nhanh chóng biết gateway có đang chạy không
- **Monitoring**: Thu thập thông tin uptime của service

## Kiểm tra hoạt động
#### Bước 1: Build lại Docker

<pre>
cd DOAN
docker compose build backend
docker compose up -d </pre>
#### Bước 2: Gọi endpoint: Kiểm tra health endpoint
`http://localhost:3000/health`
### Kết quả trả về: 
<pre>{
  "status": "healthy",
  "timestamp": "2026-05-20T10:30:00.000Z",
  "uptime": 123.45
}</pre>

|Trường|	Ý nghĩa	|Ví dụ|
|------|-------|------|
|status	|Trạng thái hoạt động|	"healthy"|
|timestamp	|Thời điểm kiểm tra	|ISO 8601 format|
|uptime|	Thời gian container đã chạy (giây)|	123.45|



## 14.11.6. Thêm Kubernetes manifests cho gateway

### Mục đích
Triển khai API Gateway lên Kubernetes để có thể:
- **Tự động mở rộng** (scale): Chạy nhiều bản sao gateway
- **Tự động phục hồi** (self-healing): Khi gateway bị lỗi, K8s tự động restart
- **Quản lý tập trung**: Dễ dàng deploy, cập nhật, rollback
- **Sẵn sàng cho cloud**: Có thể deploy lên AWS EKS, GCP GKE, Azure AKS

### Cấu trúc thư mục
k8s/

├── namespace.yml # Tạo không gian riêng để deploy các resource, tránh xung đột

├── postgres.yml # Deploy PostgreSQL làm database cho Keycloak, có persistent volume để lưu dữ liệu.

├── keycloak.yml #  Deploy Keycloak làm Identity Provider, kết nối với PostgreSQL.

└── backend.yml # Deploy API Gateway

Deploy gateway với 2 replicas (2 bản sao)

Có livenessProbe (kiểm tra còn sống) và readinessProbe (kiểm tra sẵn sàng)

Service type NodePort để truy cập từ bên ngoài

### Các bước triển khai
#### Bước 1: Build Docker image cho backend
<pre>
cd DOAN
docker compose build backend </pre>
#### Bước 2: Bật Kubernetes trong Docker Desktop
<pre>Mở Docker Desktop

Settings → Kubernetes

Enable Kubernetes

Apply & Restart

Chờ Kubernetes khởi động (3-5 phút) </pre>

**Kiểm tra:**
`kubectl config current-context` 
**Kết quả mong đợi:**
` docker-desktop`

**Kiểm tra:**
`kubectl get nodes`

**Kết quả mong đợi:**

|NAME      |       STATUS |  ROLES    |      AGE  | VERSION|
|-----------|-------------|------------|---------|-----------|
|docker-desktop |  Ready   | control-plane|   2m  |  v1.30.0|

#### Bước 3: Deploy lên Kubernetes
<pre>
cd k8s
kubectl apply -f namespace.yml
kubectl apply -f postgres.yml
kubectl apply -f keycloak.yml
kubectl apply -f backend.yml </pre>
#### Bước 4: Kiểm tra trạng thái 
bash
#### Xem tất cả resource
kubectl get all -n api-gateway

#### Xem pod (phải là Running)
kubectl get pods -n api-gateway

#### Xem service
kubectl get services -n api-gateway

#### Bước 5: Test gateway
#### Cách 1: Dùng port-forward (khuyến nghị cho Docker Desktop)

#### Chạy port-forward (giữ nguyên cửa sổ terminal)
`kubectl port-forward -n api-gateway service/gateway 3000:3000`

Mở terminal mới và test:

<pre>
http://localhost:3000/api/public
http://localhost:3000/health </pre>
#### Cách 2: Dùng NodePort (nếu hỗ trợ) 

**Tìm cổng NodePort được gán:**

`kubectl get services -n api-gateway`

Kết quả ví dụ: gateway NodePort 10.96.70.105 <none> 3000:31619/TCP

**Test với cổng đó:**
`http://localhost:31619/api/public`


### Giải thích các thành phần trong manifest
|Thành phần	|Ý nghĩa|
|--------|--------|
|replicas: 2	|Chạy 2 bản sao gateway (tăng khả năng chịu lỗi)|
|livenessProbe|	Kiểm tra gateway còn sống không (30s sau khi start, mỗi 10s gọi /health)|
|readinessProbe|	Kiểm tra gateway đã sẵn sàng nhận traffic chưa|
|NodePort|	Mở cổng để truy cập từ bên ngoài cluster|
|namespace	|Cách ly resource với các ứng dụng khác|
#### Lợi ích của việc deploy lên Kubernetes
|Lợi ích|	Mô tả|
|----|-------|
|High Availability|	2 replicas, nếu 1 pod chết, pod kia vẫn phục vụ|
|Tự động phục hồi|	Pod bị lỗi, K8s tự động restart|
|Dễ dàng scale|Chỉ cần sửa replicas: 3 và kubectl apply|
|Zero-downtime update|	Cập nhật image mới mà không cần ngưng service|

#### Dọn dẹp (khi không dùng nữa)
<pre>
kubectl delete -f backend.yml
kubectl delete -f keycloak.yml
kubectl delete -f postgres.yml
kubectl delete -f namespace.yml </pre>
**Kết luận**
Gateway đã được container hóa và có thể deploy lên Kubernetes, cho phép tự động scale và self-healing trong môi trường cloud-native.


# Tiếp tục tuần 5-6: phần tích hợp JWT validation (HS256, ES256). Implement request signing verification.
## 18. Test JWT Validation (HS256, ES256)
## 18.1. Mục đích
Kiểm tra gateway có thể xác thực token với các thuật toán RS256 (Keycloak), HS256 và ES256.
## 18.2. Chuẩn bị
Docker đang chạy với lệnh docker compose up -d

Đã build lại backend sau khi sửa code:

<pre>cd DOAN
docker compose build backend
docker compose up -d </pre>

## 18.2.1. Test TC1: JWT Validation với HS256
### Các bước thực hiện
#### Bước 1: Lấy token HS256 từ API demo
**Chạy trong PowerShell:**

`Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/demo/token/hs256" 
$response.token `

**Kết quả trả về:**
<pre> {
    "algorithm": "HS256",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}</pre>

**Copy token**
#### Bước 2: Dùng token để gọi API kiểm tra
<pre>$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # Thay bằng token thật
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/crypto/jwt-algorithm" -Headers $headers </pre>
**Kết quả thành công:**
<pre>
{
    "message": "JWT validation successful",
    "algorithm": "HS256",
    "payload": {
        "username": "demouser",
        "roles": []
    }
}</pre>

## 18.2.2. Test TC1: JWT Validation với ES256
### Tạo cặp khóa ES256 cho JWT validation

ES256 sử dụng cặp khóa bất đối xứng (public/private key) để ký và xác thực token.

#### Tạo file `backend/generate-es256-keys.js`
**Chạy lệnh tạo khóa**  
<pre>cd backend
node generate-es256-keys.js </pre>
**Kết quả**
Tạo ra 2 file trong thư mục backend/:

es256-private.pem - KHÔNG commit lên Git (thêm vào .gitignore)

es256-public.pem - có thể commit (là khóa công khai)

**Thêm vào .gitignore**

##### Khóa ES256 (không commit private key)
`es256-private.pem`

**sau đó Sửa server.js (đọc private key từ file)**
- thêm 2 dòng ở đầu file server.js:
<pre>const fs = require('fs');
const ES256_PRIVATE_KEY = fs.readFileSync('./es256-private.pem', 'utf8');</pre>

**và sửa auth.js (đọc public key từ file)**
- Thêm 2 dòng ở đâu auth.js: 
<pre>const fs = require('fs');
const ES256_PUBLIC_KEY = fs.readFileSync('./es256-public.pem', 'utf8');</pre>

**Build Docker**
<pre>docker compose build backend 
docker compose up -d </pre>

### Test 
#### Bước 1: Lấy token ES256
<pre>$response = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/demo/token/es256"
$response.token </pre>

**Kết quả trả về:**
<pre>{
    "algorithm": "ES256",
    "token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vLXVzZXItZXMyNTYiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJkZW1vdXNlciIsInJlYWxtX2FjY2VzcyI6eyJyb2xlcyI6WyJ1c2VyIl19LCJpYXQiOjE3MTYyMTE5MjIsImV4cCI6MTcxNjIxNTUyMn0.xxxxx"
} </pre>
- Lưu ý: Dùng $response.token để xem token đầy đủ, tránh bị PowerShell cắt ngắn
#### Bước 2: Dùng token để gọi API kiểm tra
<pre>$token = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9..."  # Thay bằng token thật
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/crypto/jwt-algorithm" -Headers $headers</pre>

hoặc dùng trực tiếp biến respone:
<pre>$headers = @{ Authorization = "Bearer $($response.token)" }
Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/crypto/jwt-algorithm" -Headers $headers </pre>

**Kết quả thành công**
<pre>{
    "message": "JWT validation successful",
    "algorithm": "ES256",
    "payload": {
        "username": "demouser",
        "roles": []
    }
} </pre>
## 19. Implement request signing verification
## 19.1 Test TC3 - Tạo chữ ký HMAC
**Mục đích**
Kiểm tra API tạo chữ ký HMAC hoạt động, trả về signature để dùng cho các test case sau (TC4, TC5, TC6, TC7, TC8).

**Các bước thực hiện**
#### Bước 1. Tạo chữ ký cho Message:
<pre> $body = @{
    message = @{ amount = 100; to = "Nam" }
    secret = "my-secret-key"
} | ConvertTo-Json

$response = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/crypto/hmac-sign" -ContentType "application/json" -Body $body

$signature = $response.signature
Write-Host "Signature: $signature" </pre>
**Kết quả:**
` Signature: dãy chữ ký HMAC`
## 19.2. Test TC4 - Verify chữ ký (trường hợp đúng)
**Dùng signature vừa tạo để kiểm tra:**
<pre>$body = @{
    message = @{ amount = 100; to = "Nam" }
    signature = "22ec32237da452363b1138396d158bd87bc713dc43c79f9a59e1a9015f35dfb4"
} | ConvertTo-Json

$headers = @{ "x-secret" = "my-secret-key" }

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/crypto/hmac-verify" -Headers $headers -ContentType "application/json" -Body $body </pre>

**Kết quả:**
<pre> "success": true,
    "message": "HMAC signature hợp lệ, request không bị sửa đổi",
    "verified": true </pre>

## 19.3. Test TC5: Verify chữ ký (trường hợp SAI - message bị sửa)
<pre> $body = @{
    message = @{ amount = 10000; to = "Ke xau" }
    signature = "22ec32237da452363b1138396d158bd87bc713dc43c79f9a59e1a9015f35dfb4"
} | ConvertTo-Json

$headers = @{ "x-secret" = "my-secret-key" }

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/crypto/hmac-verify" -Headers $headers -ContentType "application/json" -Body $body</pre>

**Kết quả**
<pre>{
    "success": false,
    "message": "HMAC signature không hợp lệ, request đã bị sửa đổi!",
    "verified": false
} </pre>  
*Thông báo hiện lên cảnh báo đỏ là đúng.
## 19.4. TC6 - Thiếu message hoặc signature
<pre># Thiếu message
$body = @{ signature = "abc123" } | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/crypto/hmac-verify" -ContentType "application/json" -Body $body</pre>
**Kết quả**
<pre>{
    "error": "missing_data",
    "message": "Thiếu message hoặc signature"
} </pre>
## 19.5.TC7 - Timestamp cũ (replay attack)
<pre> $body = @{
    message = @{ amount = 100; to = "Nam" }
    signature = "22ec32237da452363b1138396d158bd87bc713dc43c79f9a59e1a9015f35dfb4"
} | ConvertTo-Json

$headers = @{
    "x-secret" = "my-secret-key"
    "x-timestamp" = "1700000000000"
}

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/crypto/hmac-verify" -Headers $headers -ContentType "application/json" -Body $body</pre>

**Kết quả**
<pre>{
    "error": "request_expired",
    "message": "Timestamp quá cũ, request đã hết hạn"
} </pre>
## 19.6. TC8 - Nonce (kiểm tra log)


Tạo body:<pre> $body = @{
    message = @{ amount = 100; to = "Nam" }
    signature = "22ec32237da452363b1138396d158bd87bc713dc43c79f9a59e1a9015f35dfb4"
} | ConvertTo-Json </pre>

Tạo headers: <pre>$headers = @{
    "x-secret" = "my-secret-key"
    "x-nonce" = "abc123xyz"
} </pre>

Gửi request: <pre>Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/crypto/hmac-verify" -Headers $headers -ContentType "application/json" -Body $body </pre>

- Sau đó kiểm tra lại:
`docker logs backend-api`

- Tìm dòng: `Nonce received: abc123xyz`



# Tổng hợp TC1-TC8: Code thêm ở đâu
## Phần 1: JWT Validation (TC1, TC2)
|Test Case|	Mô tả|	Code ở file|Thêm/Sửa chỗ nào|
|----|-----|----|----|
|TC1	|HS256|	middleware/auth.js|	Thêm nhánh else if (algorithm === 'HS256') trong hàm authenticateToken|
|TC1|	HS256	|server.js	|Thêm API /api/demo/token/hs256 (tạo token để test)|
|TC2|	ES256	|middleware/auth.js|	Thêm nhánh else if (algorithm === 'ES256') trong hàm authenticateToken|
|TC2|	ES256	|server.js	|Thêm API /api/demo/token/es256 (tạo token để test)|
|TC2	|ES256|	backend/	|Tạo file generate-es256-keys.js và chạy để tạo cặp khóa .pem|

## Phần 2: Request Signing (TC3-TC8)
|Test Case|	Mô tả	|Code ở file	|Thêm/Sửa chỗ nào|
|-----|------|----|---|
|TC3	|Tạo chữ ký|	server.js	|Thêm API /api/crypto/hmac-sign|
|TC4|	Verify đúng|	server.js	|Thêm API /api/crypto/hmac-verify|
|TC5	|Verify sai	|server.js	|Dùng chung API /api/crypto/hmac-verify|
|TC6|	Thiếu message/signature|	server.js|	Dùng chung API /api/crypto/hmac-verify (có sẵn logic kiểm tra)|
|TC7|	Timestamp cũ|	server.js|	Dùng chung API /api/crypto/hmac-verify (có sẵn logic timestamp)|
|TC8|	Nonce	|server.js	|Dùng chung API /api/crypto/hmac-verify (có sẵn logic nonce)|





