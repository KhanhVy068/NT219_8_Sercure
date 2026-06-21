const express = require('express');
const net = require('net');

const PORT = Number(process.env.PORT || 3000);
const SERVICE_NAME = process.env.SERVICE_NAME || 'domain-service';
const RESOURCE_NAME = process.env.RESOURCE_NAME || SERVICE_NAME.replace('-service', '');
const GATEWAY_INTERNAL_TOKEN = process.env.GATEWAY_INTERNAL_TOKEN || 'demo-gateway-internal-token';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_NAME = process.env.DB_NAME || RESOURCE_NAME;
const DB_USER = process.env.DB_USER || `${RESOURCE_NAME}_app`;
const VAULT_DB_SECRET_PATH = process.env.VAULT_DB_SECRET_PATH || `database/creds/${RESOURCE_NAME}-service`;

let requestCount = 0;
let deniedCount = 0;

const app = express();
app.use(express.json({ limit: '1mb' }));

function requireGatewayIdentity(req, res, next) {
  if (req.path === '/health' || req.path === '/metrics' || req.path === '/metrics/prometheus') {
    return next();
  }

  if (req.headers['x-gateway-token'] !== GATEWAY_INTERNAL_TOKEN) {
    deniedCount += 1;
    return res.status(403).json({
      error: 'forbidden',
      message: 'Business API accepts requests only from the trusted gateway layer',
    });
  }

  req.identity = {
    subject: req.headers['x-authenticated-subject'] || '',
    clientId: req.headers['x-authenticated-client-id'] || '',
    roles: String(req.headers['x-authenticated-roles'] || '').split(',').filter(Boolean),
    scopes: String(req.headers['x-authenticated-scopes'] || '').split(' ').filter(Boolean),
  };
  return next();
}

function checkDatabaseTcp() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: DB_HOST, port: DB_PORT });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 800);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

app.use(requireGatewayIdentity);

app.get('/health', async (req, res) => {
  res.json({
    status: 'healthy',
    service: SERVICE_NAME,
    databaseTcpReachable: await checkDatabaseTcp(),
  });
});

app.get('/metrics', (req, res) => {
  res.type('text/plain').send(metricsText());
});

app.get('/metrics/prometheus', (req, res) => {
  res.type('text/plain').send(metricsText());
});

app.get(`/api/${RESOURCE_NAME}`, (req, res) => {
  requestCount += 1;
  res.json(domainPayload(req));
});

app.get(`/api/${RESOURCE_NAME}s`, (req, res) => {
  requestCount += 1;
  res.json(domainPayload(req));
});

app.get(`/api/${RESOURCE_NAME}/db-identity`, (req, res) => {
  requestCount += 1;
  res.json({
    service: SERVICE_NAME,
    ownsDatabase: DB_NAME,
    databaseHost: DB_HOST,
    databasePort: DB_PORT,
    serviceSpecificDbUser: DB_USER,
    vaultCredentialPath: VAULT_DB_SECRET_PATH,
    note: 'Prototype reads service-specific DB identity from environment/Vault path; DB port is private and not published to host.',
  });
});

function domainPayload(req) {
  return {
    service: SERVICE_NAME,
    resource: RESOURCE_NAME,
    identity: req.identity,
    database: {
      name: DB_NAME,
      host: DB_HOST,
      user: DB_USER,
      vaultCredentialPath: VAULT_DB_SECRET_PATH,
    },
    authorizationBoundary: 'RBAC/ABAC belongs in the backend service; Kong only authenticated the token.',
  };
}

function metricsText() {
  return [
    '# TYPE backend_service_requests_total counter',
    `backend_service_requests_total{service="${SERVICE_NAME}"} ${requestCount}`,
    '# TYPE backend_service_denied_total counter',
    `backend_service_denied_total{service="${SERVICE_NAME}"} ${deniedCount}`,
  ].join('\n') + '\n';
}

app.listen(PORT, () => {
  console.log(`${SERVICE_NAME} listening on ${PORT}`);
});
