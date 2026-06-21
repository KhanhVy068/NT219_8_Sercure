# Hướng dẫn chạy benchmark

Tài liệu này hướng dẫn chạy bộ benchmark của đồ án Secure API Gateway. Benchmark được chạy trực tiếp trên máy host, không chạy qua ngrok và không chạy từ máy attacker. Cách này giúp kết quả ít bị ảnh hưởng bởi đường truyền Internet.

## 1. Nội dung benchmark

Script tổng chạy các nhóm sau:

- So sánh xác thực JWT HS256 và ES256.
- So sánh local JWT validation với token introspection.
- So sánh introspection cache-on và cache-off.
- Đo HMAC verification ở concurrency 10 và 100.
- Đo khả năng mở rộng ở concurrency 10, 100 và 500 trong profile `report`.
- Đo Vault key reload khi dùng tùy chọn `-IncludeVault`.
- Tổng hợp JSON/CSV và tạo ablation report.

## 2. Yêu cầu môi trường

Máy chạy benchmark cần có:

- Node.js.
- PowerShell.
- Python và matplotlib nếu muốn tạo biểu đồ.
- Docker Desktop và Vault container nếu chạy benchmark Vault.

Kiểm tra Node.js:

```powershell
node --version
```

Kiểm tra Python:

```powershell
python --version
```

Cài matplotlib nếu máy chưa có:

```powershell
python -m pip install matplotlib
```

## 3. Clone repository trên một máy mới

Có thể clone repository vào thư mục bất kỳ. Không cần sử dụng đúng đường dẫn của máy phát triển ban đầu.

```powershell
git clone <URL_REPOSITORY> NT219_8_Sercure
Set-Location .\NT219_8_Sercure
```

Nếu repository đã được clone và PowerShell đang đứng ở thư mục cha của project:

```powershell
Set-Location .\NT219_8_Sercure
```

Kiểm tra đã vào đúng repository:

```powershell
Test-Path .\scripts\run-benchmarks.ps1
Test-Path .\backend\package.json
```

Hai lệnh phải trả về `True`.

Runner sẽ tự chạy `npm ci --prefix backend` nếu thư mục `backend/node_modules` chưa tồn tại. Cặp khóa ES256 dùng cho benchmark local cũng được tự tạo nếu máy mới chưa có file PEM.

## 4. Xác nhận vị trí repository

```powershell
Get-Location
Test-Path .\scripts\run-benchmarks.ps1
```

Nếu `Test-Path` trả về `True` thì có thể chạy benchmark ngay. Nếu trả về `False`, cần chuyển về thư mục repository trước.

Không cần tự khởi động `backend/server.js`. Script `run-benchmarks.ps1` tự mở backend benchmark tại port 3020 và dừng process sau khi hoàn thành.

Không nên chạy một backend khác trên port 3020 trong lúc benchmark.

Kiểm tra port nếu cần:

```powershell
Get-NetTCPConnection -LocalPort 3020 -ErrorAction SilentlyContinue
```

## 5. Chạy smoke benchmark

Smoke benchmark dùng để kiểm tra script và cấu hình. Mỗi bài chỉ chạy trong thời gian ngắn nên kết quả không được dùng trong báo cáo.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile quick
```

Profile `quick` mặc định:

- Chạy một lần.
- Thời lượng 5 giây cho mỗi benchmark.
- Không chạy ma trận scalability 10/100/500.
- Không chạy Vault nếu không có `-IncludeVault`.

Kết quả hợp lệ phải có dạng:

```text
statusCounts: {
  "200": ...
}
```

Nếu xuất hiện `401`, `403` hoặc `429`, script sẽ dừng và không lưu kết quả đó như một benchmark thành công.

## 6. Chạy benchmark cho báo cáo

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile report
```

Profile `report` mặc định:

- Mỗi phép so sánh chính chạy ba lần.
- Thời lượng 30 giây cho mỗi lần.
- Warm-up 50 request.
- Chạy algorithm ablation ở concurrency 100.
- Chạy local JWT và introspection ở concurrency 100.
- Chạy cache-on và cache-off ở concurrency 100.
- Chạy HMAC ở concurrency 10 và 100.
- Chạy scalability ở concurrency 10, 100 và 500.

Quá trình này có thể mất nhiều phút. Không nên mở ứng dụng nặng hoặc chạy thêm container không liên quan trong lúc benchmark.

## 7. Chạy benchmark Vault

Khởi động Vault trước:

```powershell
docker compose up -d vault vault-seed
```

Kiểm tra trạng thái:

```powershell
docker compose ps vault vault-seed
```

Chạy benchmark đầy đủ kèm Vault reload:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile report `
  -IncludeVault
```

Vault reload dùng concurrency 2 vì đây là thao tác quản trị khóa, không phải API nghiệp vụ cần tải đồng thời cao.

## 8. Tùy chỉnh số lần và thời lượng

Ví dụ chạy hai lần, mỗi lần 15 giây:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile quick `
  -Runs 2 `
  -Duration 15
```

Chọn port khác nếu port 3020 đang được sử dụng:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile quick `
  -Port 3030
```

Chỉ định thư mục kết quả:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile report `
  -ResultsDir .\results\final-benchmark
```

## 9. Kết quả đầu ra

Nếu không truyền `-ResultsDir`, mỗi lần chạy tạo một thư mục mới:

```text
results/benchmark-YYYYMMDD-HHMMSS/
```

Các file đầu ra chính:

```text
aggregate-summary.json
aggregate-summary.csv
summary.csv
throughput-chart.png
latency-p95-chart.png
```

Mỗi benchmark riêng cũng có một file JSON và CSV. Tên file gồm timestamp và loại benchmark, ví dụ:

```text
20260621152419-hs256-local-verify.json
20260621152419-hs256-local-verify.csv
```

Ablation report được tạo tại:

```text
results/week11/ablation-report.md
```

## 10. Kiểm tra tính hợp lệ

Mở một file JSON kết quả và kiểm tra `statusCounts`:

```powershell
$result = Get-Content `
  .\results\final-benchmark\<ten-file>.json `
  -Raw | ConvertFrom-Json

$result.statusCounts | ConvertTo-Json
```

Kết quả dùng cho báo cáo phải chỉ có HTTP 200:

```json
{
  "200": 10000
}
```

Không sử dụng kết quả có:

```text
401: token hoặc issuer không hợp lệ.
403: thiếu trusted gateway header.
429: benchmark bị rate limit.
error: lỗi kết nối hoặc backend dừng.
```

Script hiện tự kiểm tra các trường hợp trên và dừng ngay khi phát hiện response không phải HTTP 200.

## 11. Đọc aggregate summary

Mở file CSV:

```powershell
Start-Process .\results\final-benchmark\aggregate-summary.csv
```

Các cột chính:

| Cột | Ý nghĩa |
|---|---|
| `rps_mean` | Throughput trung bình |
| `rps_stddev` | Độ lệch chuẩn throughput |
| `avg_ms_mean` | Độ trễ trung bình |
| `p50_ms_mean` | Trung vị độ trễ |
| `p95_ms_mean` | 95% request có độ trễ không vượt quá giá trị này |
| `p99_ms_mean` | 99% request có độ trễ không vượt quá giá trị này |
| `errors_sum` | Tổng response khác HTTP 200 và lỗi kết nối |

`errors_sum` phải bằng 0 trước khi dùng số liệu trong báo cáo.

## 12. Đo CPU và RAM

Trong lúc profile `report` đang chạy, mở terminal khác:

```powershell
Get-Process node |
  Sort-Object CPU -Descending |
  Select-Object Id, ProcessName, CPU,
    @{Name="RAM_MB";Expression={[math]::Round($_.WorkingSet64 / 1MB, 2)}}
```

Nếu muốn ghi thông tin container:

```powershell
docker stats --no-stream
```

Nên chụp CPU và RAM khi benchmark đang chạy ở concurrency 100 hoặc 500.

## 13. Xử lý lỗi thường gặp

### PowerShell không cho chạy script

Lỗi:

```text
running scripts is disabled on this system
```

Chạy qua lệnh có `-ExecutionPolicy Bypass` như hướng dẫn. Không cần thay đổi execution policy toàn hệ thống.

### Port 3020 đã được sử dụng

Kiểm tra process:

```powershell
Get-NetTCPConnection -LocalPort 3020
```

Chọn port khác:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\run-benchmarks.ps1 `
  -Profile quick `
  -Port 3030
```

### Benchmark nhận HTTP 401

Kiểm tra `DEMO_JWT_ISSUER`, token hết hạn hoặc khóa ký. Runner tự đặt issuer theo port benchmark. Nếu vẫn lỗi, chạy backend thủ công để xem log:

```powershell
$env:PORT="3020"
$env:VAULT_ENABLED="false"
$env:DEMO_JWT_ISSUER="http://localhost:3020/demo-idp"
$env:DEMO_JWT_AUDIENCE="secure-api"
$env:RATE_LIMIT_MAX="1000000"
$env:GATEWAY_INTERNAL_TOKEN="demo-gateway-internal-token"
node .\backend\server.js
```

### Benchmark nhận HTTP 403

HTTP 403 thường xuất hiện khi request đi trực tiếp đến backend nhưng thiếu `x-gateway-token`. Các script mới tự thêm header này. Kiểm tra đang chạy đúng file trong thư mục `scripts` hiện tại.

### Benchmark nhận HTTP 429

HTTP 429 cho biết request đang đi qua rate limit hoặc backend khác đang chạy với giới hạn thấp. Runner khởi động backend riêng với `RATE_LIMIT_MAX=1000000` để tránh trường hợp này.

### Không tạo được biểu đồ

Lỗi:

```text
matplotlib is not installed
```

Cài thư viện và chạy lại script vẽ:

```powershell
python -m pip install matplotlib
$env:BENCH_RESULTS_DIR="C:\duong-dan\den\thu-muc-ket-qua"
python .\scripts\plot-benchmarks.py
```

### Vault benchmark thất bại

Kiểm tra Vault:

```powershell
docker compose ps vault vault-seed
Invoke-RestMethod http://localhost:8200/v1/sys/health
```

Vault trong đồ án chạy ở dev mode với token `root`. Cấu hình này chỉ dùng cho demo và benchmark local.

## 14. Minh chứng cần chụp

Khi viết báo cáo, nên lưu các ảnh sau:

- Terminal chạy profile `report`.
- Kết quả HS256 và ES256 có `statusCounts` chỉ chứa HTTP 200.
- Bảng `aggregate-summary.csv`.
- Biểu đồ throughput.
- Biểu đồ P95 latency.
- CPU và RAM khi chạy concurrency 100 hoặc 500.
- Kết quả cache-on và cache-off.
- Kết quả Vault reload nếu có chạy Vault.

Không dùng dữ liệu trong các thư mục `benchmark-smoke*` làm kết quả chính thức vì các lần chạy đó có thời lượng rất ngắn.
