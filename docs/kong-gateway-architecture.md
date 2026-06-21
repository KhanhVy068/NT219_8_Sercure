# Kong Gateway Architecture

The gateway prototype now uses **Kong Gateway OSS** as the API Gateway layer.

## Runtime Flow

```text
Internet client
  -> HTTPS via ngrok demo / local port 3001
  -> Nginx Firewall
  -> Kong Gateway OSS
  -> Protected Express backend/resource API
```

## Module Mapping

| Module | Framework / Runtime | Role |
|---|---|---|
| Firewall | Nginx 1.27 Alpine | Rule-based filtering, reverse proxy, body/rate limits |
| API Gateway | Kong Gateway OSS 3.8 | API routing, gateway plugins, correlation id, rate limit, request size limit, CORS, Prometheus metrics |
| Protected backend | Node.js 18 Alpine + Express.js | Resource APIs and prototype security logic |
| Identity Provider | Keycloak 26.1 | OIDC, JWT issuer, JWKS, realm roles |
| Key/Secret Management | HashiCorp Vault 1.16 dev mode | HS256 keys, ES256 key pair, HMAC secret |
| Monitoring | Prometheus + Grafana | Scrape Kong and backend metrics, dashboarding |
| Database | PostgreSQL 16 Alpine | Keycloak database |

## Kong Configuration

Kong runs in DB-less mode:

- Compose config: `docker-compose.yml`
- Declarative config: `infra/kong/kong.yml`
- Kubernetes config: `k8s/kong.yml`

Enabled Kong OSS plugins:

- `correlation-id`
- `rate-limiting`
- `request-size-limiting`
- `cors`
- `prometheus`

The Express service is no longer described as the main API Gateway. It is the protected backend/resource service behind Kong. It still contains the custom cryptographic enforcement prototype for JWT validation, RBAC, HMAC request verification, replay detection, audit logs, and application metrics.
