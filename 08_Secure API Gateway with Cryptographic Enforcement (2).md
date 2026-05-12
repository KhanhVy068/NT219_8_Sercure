# Capstone Project — Secure API Gateway with Cryptographic Enforcement

**Môn:** NT219 - Cryptography

**Tiêu đề đề tài:** Secure API Gateway with Cryptographic Enforcement — Triển khai OAuth2/OpenID + HMAC/JWT/ECDSA cho API Cloud

---

## 1. Tóm tắt đề tài (Project Synopsis)

Đề tài tập trung vào thiết kế, triển khai và đánh giá một **API Gateway an toàn** dùng các cơ chế mật mã để cưỡng chế (enforce) chính sách truy cập cho API Cloud. Các thành phần chính bao gồm: tích hợp OAuth2 / OpenID Connect làm identity provider (IdP); token-based authentication/authorization (JWT signed bằng HMAC hoặc ECDSA); token introspection, revocation; request signing bằng HMAC cho bảo đảm tính toàn vẹn và non‑repudiation; quản lý khóa (KMS/Vault) và best practices cho secret rotation. Sinh viên sẽ xây dựng prototype (ví dụ: Kong/Envoy/Express gateway) tích hợp IdP (Keycloak/Auth0/Dex), triển khai chứng thực JWT (HMAC & ECDSA), thêm request signing HMAC, và đo đạc ảnh hưởng hiệu năng, khả năng mở rộng và an ninh trong môi trường cloud (k8s + managed services).

---

## 2. Mục tiêu học thuật & kỹ năng (Learning Objectives)

1. Hiểu mô hình OAuth2 / OpenID Connect (flows: Authorization Code, Client Credentials, PKCE) và cách dùng JWT trong authorization.
2. Triển khai JWT signing/verification với HMAC (symmetric) và ECDSA (asymmetric), hiểu trade‑offs về bảo mật, key management và performance.
3. Thiết kế request signing bằng HMAC (vintage AWS Signature v4 style hoặc custom) để đảm bảo integrity & authenticity end‑to‑end.
4. Tích hợp API Gateway (Kong/Envoy) với IdP (Keycloak/Auth0) và KMS (HashiCorp Vault / AWS KMS) cho secure key storage & rotation.
5. Đánh giá hiệu năng (latency, throughput), độ an toàn (threat model tests), operational concerns (token revocation, replay protection).

---

## 3. Relevance & Motivation

* API là bề mặt tấn công chính trong kiến trúc cloud‑native; xác thực và ủy quyền kém có thể dẫn đến leaks và privilege escalation.
* JWT + OAuth2 là chuẩn công nghiệp cho SSO và dịch vụ API, nhưng sai cấu hình (HS256 dùng khóa yếu, thiếu revocation, no audience checks) khiến hệ thống dễ bị tấn công.
* Mặt khác, request signing (HMAC) bảo vệ tính toàn vẹn và ngăn replay cho máy‑với‑máy (machine‑to‑machine) APIs.
* Công cụ & patterns thực tế (Gateway + IdP + KMS) giúp tổ chức triển khai an toàn, kèm automation cho key rotation và observability.

---

## 4. Câu hỏi nghiên cứu & giả thuyết

**RQ1:** JWT signed bằng HMAC vs ECDSA có ảnh hưởng hiệu năng (latency, throughput) như thế nào khi xác thực ở API Gateway trong load cao?

**RQ2:** Tích hợp KMS/Vault cho key management có overhead và phức tạp vận hành ra sao? Có chiến lược cache/circuit breaker an toàn để giảm overhead không?

**RQ3:** Request signing (HMAC) kết hợp JWT giúp giảm rủi ro replay/mitm so với chỉ dùng TLS + JWT hay không?

**Giả thuyết:** ECDSA (asymmetric) tốn CPU cho verify hơn HMAC, nhưng cho phép phân phối public key dễ dàng và giảm rủi ro bí mật bị lộ; với caching hợp lý, overhead của KMS có thể được làm thấp đi; request signing kết hợp claim audience + nonce giúp giảm replay và tăng tính end‑to‑end integrity.

---

## 5. Background (Tổng quan ngắn)

* **OAuth2 & OIDC:** flows (Auth Code, Client Credentials, Resource Owner Password Credentials deprecated, PKCE), token types (access token, refresh token, id\_token), scopes & claims.
* **JWT:** cấu trúc (header.payload.signature), alg (HS256, RS256, ES256), JWK/JWKS for key publishing, token introspection & revocation.
* **HMAC request signing:** canonical request, string to sign, signature header, timestamp/nonce to prevent replay.
* **Key management:** symmetric keys vs asymmetric keys, KMS (AWS KMS, GCP KMS) và Vault; rotation & versioning.
* **API Gateway options:** Kong, Envoy, Ambassador, KrakenD, AWS API Gateway, GCP Apigee.

---

## 6. Literature review & practical references (hướng khảo sát)

* RFCs: OAuth2 (RFC6749), OpenID Connect Core, JWT (RFC7519), JWS/JWK.
* OWASP API Security Top 10, MITRE ATT\&CK for API abuse.
* Benchmarks & blog posts comparing HS vs RS/ES JWT verification performance.
* Docs & best practices: Keycloak, Kong, Envoy, HashiCorp Vault, AWS KMS.

> Yêu cầu: sinh viên trích dẫn tối thiểu 6 nguồn chính thức (RFCs, OWASP, vendor docs) và 3 repo/hướng dẫn triển khai thực tế.

---

## 7. Methodology (chi tiết đề xuất)

### 7.1. Scope & Use‑cases

* **User authentication (interactive):** Authorization Code + PKCE (OIDC) → id\_token (JWT) for SSO; API calls carry access\_token.
* **Service‑to‑Service (machine):** Client Credentials flow with HMAC signed request and JWT access token.
* **Mobile clients / browser clients:** use short lived tokens + refresh tokens; use PKCE.

### 7.2. Architecture & components

* **Identity Provider (IdP):** Keycloak (self‑host) or Auth0 (managed). Configure clients, scopes, and JWK endpoint.
* **API Gateway:** Kong (with plugins), or Envoy + external auth service. The gateway performs: JWT validation, scope check, introspection (if using opaque tokens), request signing verification (HMAC), rate limiting and logging.
* **KMS/Secrets:** HashiCorp Vault (self‑host) or cloud KMS for storing signing keys and rotating them. Use signing via KMS when possible (asymmetric keys in KMS) to avoid key material leakage.
* **Backend services:** simple microservices (FastAPI/Express) trusting gateway headers (x‑user, x‑scopes) and optionally verifying request signatures.
* **Observability:** logs, traces (OpenTelemetry), metrics (Prometheus) for auth latencies, failures, and security alerts.

### 7.3. Cryptographic choices

* **JWT signing:** experiment with HS256 (HMAC‑SHA256) and ES256 (ECDSA P‑256 + SHA256). Also include RS256 (RSA) for comparison.
* **Request signing:** HMAC‑SHA256 with canonicalization rules; include timestamp & nonce header to prevent replay.
* **Key rotation:** implement versioned keys (kid in JWT header) and rotation protocol (publish new JWKs, grace period for old tokens).
* **Token storage & revocation:** for refresh tokens use persistent store (Redis) to allow revocation; for access tokens consider short TTL + introspection endpoint for immediate revocation if needed.

### 7.4. Threat model & tests

* **Threats:** stolen tokens (bearer token theft), replay attacks, forged tokens (weak HS256 key), signature algorithm downgrade (alg none or change), KMS compromise, replay of signed requests.
* **Tests:** token forgery attempts, replay attempts, algorithm downgrade attempts, compromised symmetric key scenario (simulate leak), key rotation correctness.

---

## 8. Implementation & Experiment Setup

### 8.1. Tech stack & tools

* **IdP:** Keycloak (Docker), or Auth0.
* **Gateway:** Kong (with Kong Gateway OSS + Lua plugins) or Envoy + ext\_authz service (Python/Go).
* **KMS / Vault:** HashiCorp Vault (dev & production mode) and AWS KMS (optional).
* **Backend services:** FastAPI (Python) / Express (Node).
* **Clients:** curl, Postman, simple web SPA.
* **Benchmarking:** `wrk`, `hey`, or `wrk2` for throughput; `locust` for complex scenarios.
* **Monitoring:** Prometheus + Grafana, OpenTelemetry tracing.

### 8.2. Datasets & scenarios

* **Load scenarios:** low/medium/high concurrency with mix of authenticated/unauthenticated calls.
* **Security scenarios:** simulated token theft (replay), signature forgery, expired token usage, revocation.
* **Deployment:** Kubernetes cluster (minikube/k3s) to simulate cloud environment; optionally test on AWS EKS/GKE.

### 8.3. Reproducibility

* Provide Docker Compose / Helm charts for quick deploy, Terraform scripts for optional cloud infra, and step‑by‑step runbooks. Lock versions for Keycloak, Kong, Vault, and tools; provide `requirements.txt` / `package.json` and Dockerfile.

---

## 9. Evaluation Plan & Metrics

* **Performance:** per‑request latency added by gateway auth (median, p95, p99), throughput (requests/sec), CPU & memory footprint of gateway when validating tokens/signatures.
* **Security:** rate of successful forgery/replay in testbed; detection & mitigation time for revoked tokens; resilience to alg‑downgrade attacks.
* **Operational:** key rotation time & failure rate, downtime during rotation (if any), complexity of deployment (manual steps vs automated).
* **Usability:** developer experience metrics (time to onboard new client), number of configuration changes for new scope.

**Reporting:** compare HS256 vs ES256 JWT verification costs, KMS inline signing latency vs cached key usage, overhead of request signing, and recommendations.

---

## 10. Timeline & Milestones (12 tuần)

* **Tuần 1–2:** Survey tài liệu, chọn IdP & gateway, thiết lập môi trường (k8s/Docker).
* **Tuần 3–4:** Cấu hình IdP (Keycloak), tạo clients, thiết kế token flows (Auth Code, Client Credentials).
* **Tuần 5–6:** Triển khai gateway và tích hợp JWT validation (HS256, ES256). Implement request signing verification.
* **Tuần 7–8:** Tích hợp KMS/Vault cho key management & rotation; implement token introspection/revocation flows.
* **Tuần 9:** Run performance benchmarks & security tests (forgery, replay).
* **Tuần 10:** Harden and add observability (metrics, tracing), implement canary key rotation.
* **Tuần 11:** Aggregate results, do ablation (compare algs, caching strategies).
* **Tuần 12:** Finalize report, deliverables, demo & presentation.

---

## 11. Deliverables

1. **Mid‑term presentation/report:** architecture, token flows, initial integration.
2. **Final report (PDF/MD):** methodology, experiments, security analysis, recommendations.
3. **Code repository:** gateway config (Kong/Envoy), IdP config (Keycloak realm export), backend services, Docker/Helm charts, scripts to run benchmarks.
4. **Automation:** sample CI job (GitHub Actions) to run integration tests & performance smoke tests.
5. **Demo:** video showing login flow, JWT verification, HMAC request signing, and a security test (forgery/replay).

---

## 12. Assessment & Rubric (gợi ý)

* System design & security reasoning: 25%
* Implementation & reproducibility (working stack + scripts): 25%
* Experimental rigor & analysis (benchmarks + tests): 25%
* Documentation & operational guide (rotation, rollback): 15%
* Presentation & demo quality: 10%

---

## 13. Risks, Limitations & Mitigation

* **Key leakage / misconfig:** use KMS and do not store key material in plaintext; rotate keys and use limited lifetime tokens.
* **High false positives/negatives in custom verification:** ensure tests and fallback; log suspicious attempts but avoid blocking legitimate clients during learning phase.
* **Third‑party IdP availability:** design for fallback/bundled offline validation (JWKS caching + introspection cache).
* **Algorithm selection:** avoid HS256 for third‑party tokens unless shared secret management is plumbed securely; prefer ECDSA or RSA with JWKS.

---

## 14. Ethics & Responsible Use

* Do not use real user data or production secrets in tests.
* If discovering vulnerabilities in third‑party libraries (Keycloak/Kong), follow responsible disclosure.
* Respect privacy—do not log sensitive token payloads in plaintext; redact PII from logs.

---

## 15. Extensions & Future Work

* Add support for mutual TLS (mTLS) authentication at gateway and certificate‑bound tokens (cnf claim).
* Explore OAuth2 Proof‑of‑Possession (PoP) tokens and DPOP/MTLS for stronger binding.
* Investigate PQC‑powered tokens (PQC signatures for JWT) and migration paths.
* Integrate anomaly detection for tokens and request signing patterns (ML for token abuse detection).

---

## 16. Tools & Resources gợi ý

* Keycloak (IdP), Kong/Envoy (API Gateway), HashiCorp Vault, AWS KMS/GCP KMS, OpenID libraries (oidc‑client, python‑jwt, jose), Prometheus/Grafana, OpenTelemetry.
* Benchmarks: wrk/wrk2, locust; load generators and security testing tools (OWASP ZAP, Burp Suite).

---

## 17. Appendix: Repository Structure (mẫu)

```
project-root/
  ├─ infra/              # docker-compose / helm charts for Keycloak, Kong/Envoy, Vault, backend services
  ├─ gateway-config/     # Kong declarative config or Envoy filters + ext_authz service
  ├─ idp-config/         # Keycloak realm export, clients, roles
  ├─ services/           # sample backend services (FastAPI/Express)
  ├─ clients/            # sample client apps (curl scripts, SPA)
  ├─ benchmarks/         # scripts to run wrk/locust, raw csv outputs
  ├─ tests/              # security test scripts (forgery, replay, alg‑downgrade)
  ├─ ci/                 # GitHub Actions workflows for integration tests
  └─ docs/               # runbook, rotation guide, final report
```

---

