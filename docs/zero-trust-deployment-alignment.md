# Zero Trust Deployment Alignment

This prototype now follows the target deployment boundary:

```text
Client -> Nginx firewall -> Kong -> gateway-auth -> Backend Service -> Service Database
```

## Gateway Layer

Kong remains the edge API gateway for routing, rate limiting, request size limiting,
correlation IDs, CORS, access logs, and Prometheus metrics. Kong also strips
client-supplied identity headers before forwarding traffic.

`gateway-auth` is the internal gateway-authentication component behind Kong. It
verifies JWT presence, format, signature, issuer, audience, and expiration before
business requests reach backend services. After verification it creates trusted
identity context headers and attaches an internal gateway token.

Kong and `gateway-auth` do not perform business RBAC/ABAC and do not verify HMAC
request signatures.

## Backend Services

Business APIs accept requests only when the internal gateway identity token is
present. Backend services own authorization and business decisions:

- legacy `backend-api`: JWT/HMAC demo endpoints, RBAC role checks, HMAC M2M
  verification, timestamp checks, and nonce replay detection.
- `user-service`: `/api/user`, `/api/users`, `/api/user/db-identity`.
- `payment-service`: `/api/payment`, `/api/payments`, `/api/payment/db-identity`.
- `inventory-service`: `/api/inventory`, `/api/inventory/db-identity`.
- `analytics-service`: `/api/analytics`, `/api/analytics/db-identity`.

HMAC is M2M-only in the backend. Kong forwards HMAC headers but does not validate
them.

## Private Databases

Each domain service has its own private database and service-specific credential:

```text
user-service      -> user-db      -> user_app
payment-service   -> payment-db   -> payment_app
inventory-service -> inventory-db -> inventory_app
analytics-service -> analytics-db -> analytics_app
```

Database containers are on private `*-data` Docker networks and do not publish
host ports. Kong is not attached to any database network, so it cannot reach
service databases directly. Cross-service database access is not configured; a
service must use another service API or an analytics/event pipeline pattern.

## Vault

Vault seeds per-service database credential paths for the demo:

```text
secret/db/user-service
secret/db/payment-service
secret/db/inventory-service
secret/db/analytics-service
secret/gateway/internal
```

This demonstrates service-specific secret ownership. In production this should
be replaced with workload identity, Vault policies, and dynamic database
credentials with TTL/lease revocation from the Vault database secrets engine.

## Metrics

Prometheus pulls metrics from targets; services do not push metrics:

```text
Prometheus -> Kong /metrics
Prometheus -> gateway-auth /metrics/prometheus
Prometheus -> backend-api /metrics/prometheus
Prometheus -> each backend service /metrics/prometheus
Prometheus -> database exporters /metrics
Prometheus -> Keycloak management /metrics
Grafana -> Prometheus via PromQL data source
```

Business API access and metrics access are separated logically:

- Business API: only gateway-auth/Kong identity is trusted by backend services.
- Management metrics: only Prometheus is attached to the monitoring path in the
  Compose topology.

## Prototype Limitations

- Vault runs in dev mode and uses a root token for demo seeding only.
- The internal gateway identity uses a demo shared token instead of mTLS.
- Backend-to-database TLS is not enabled in Docker Compose; the demo records this
  as a production hardening item.
- Database credentials are seeded as per-service KV secrets; dynamic credential
  generation is documented as the production target.
