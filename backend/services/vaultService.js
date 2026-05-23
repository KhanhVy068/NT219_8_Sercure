const fs = require('fs');

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://localhost:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN || 'root';
const VAULT_ENABLED = process.env.VAULT_ENABLED !== 'false';
const VAULT_REFRESH_MS = Number(process.env.VAULT_REFRESH_MS || 30000);

const cache = new Map();
let refreshTimer;
let lastError = null;

function kv2Url(path) {
  const cleanPath = path.replace(/^secret\//, '');
  return `${VAULT_ADDR}/v1/secret/data/${cleanPath}`;
}

function normalizeValue(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return JSON.parse(trimmed);
  }
  if (trimmed.includes('\\n')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  return value;
}

async function readSecret(path, options = {}) {
  if (!VAULT_ENABLED) {
    return options.fallback || null;
  }

  try {
    const started = Date.now();
    const response = await fetch(kv2Url(path), {
      headers: {
        'X-Vault-Token': VAULT_TOKEN,
      },
      signal: AbortSignal.timeout(Number(process.env.VAULT_TIMEOUT_MS || 2500)),
    });

    if (!response.ok) {
      throw new Error(`Vault read failed ${response.status} ${response.statusText}`);
    }

    const body = await response.json();
    const rawData = body.data?.data || {};
    const data = Object.fromEntries(
      Object.entries(rawData).map(([key, value]) => [key, normalizeValue(value)])
    );

    cache.set(path, {
      data,
      fetchedAt: Date.now(),
      latencyMs: Date.now() - started,
    });
    lastError = null;
    return data;
  } catch (error) {
    lastError = {
      message: error.message,
      at: new Date().toISOString(),
    };

    const cached = cache.get(path);
    if (cached) {
      return cached.data;
    }
    if (options.fallback) {
      return options.fallback;
    }
    throw error;
  }
}

async function writeSecret(path, data) {
  const response = await fetch(kv2Url(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vault-Token': VAULT_TOKEN,
    },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(Number(process.env.VAULT_TIMEOUT_MS || 2500)),
  });

  if (!response.ok) {
    throw new Error(`Vault write failed ${response.status} ${response.statusText}`);
  }
  cache.delete(path);
}

function startAutoRefresh(paths, refreshFn) {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(async () => {
    try {
      await refreshFn(paths);
    } catch (error) {
      lastError = {
        message: error.message,
        at: new Date().toISOString(),
      };
      console.error('[vault] refresh failed:', error.message);
    }
  }, VAULT_REFRESH_MS);

  refreshTimer.unref?.();
}

function getStatus() {
  return {
    enabled: VAULT_ENABLED,
    addr: VAULT_ADDR,
    cachedPaths: [...cache.keys()],
    lastError,
  };
}

function readFileIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

module.exports = {
  readSecret,
  writeSecret,
  startAutoRefresh,
  getStatus,
  readFileIfExists,
};
