# Firewall and Independent Monitoring Architecture

This project includes independent operational layers around Kong Gateway OSS and the protected Express backend service:

## 1. Firewall Layer

The `firewall` service in `docker-compose.yml` uses `nginx:1.27-alpine` as a rule-based reverse proxy in front of Kong Gateway OSS.

Responsibilities:

- Expose the public gateway entry on `${GATEWAY_PORT:-3000}`.
- Forward filtered traffic to Kong Gateway at `kong:8000`.
- Enforce request body limit at the edge.
- Apply per-IP request and connection limiting.
- Block common scanner user agents such as `sqlmap`, `nikto`, `nmap`, `masscan`, `acunetix`, and `nessus`.
- Block hidden dotfile paths.
- Add a response header identifying the firewall layer.

This layer is separate from Kong. Kong is the API Gateway layer and forwards validated/routed traffic to the protected Express backend. The Express backend still contains the prototype logic for JWT validation, RBAC authorization, HMAC request signing verification, audit event generation, and application metrics.

## 2. Independent Monitoring Layer

The monitoring stack is separate from the Gateway process:

- `prometheus` scrapes Kong Gateway metrics from `kong:8001/metrics`.
- `prometheus` also scrapes protected backend metrics from `backend:3000/metrics/prometheus`.
- `grafana` is provisioned with Prometheus as its default datasource.

Responsibilities:

- Collect Gateway metrics independently.
- Support dashboarding and operational monitoring.
- Provide a foundation for rule-based alerts such as spikes in `jwt_verify_fail_total`, `request_rejected_total`, `replay_detected_total`, `revoked_token_total`, and high request latency.

## 3. Deployment Zones

Logical zones after this addition:

```text
External Zone
  Users / API clients / security test clients

Security Zone
  Nginx Firewall / reverse proxy
  Kong Gateway OSS

Internal and Operations Zone
  Keycloak Identity Provider
  PostgreSQL for Keycloak
  HashiCorp Vault
  Protected Express backend/resource routes
  Prometheus + Grafana monitoring
```

External clients should enter through the Firewall, then Kong Gateway OSS. Protected Express backend routes are not exposed directly.
