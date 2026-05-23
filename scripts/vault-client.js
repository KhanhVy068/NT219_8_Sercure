const VAULT_ADDR = process.env.VAULT_ADDR || 'http://localhost:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN || 'root';

function kv2Url(path) {
  const cleanPath = path.replace(/^secret\//, '');
  return `${VAULT_ADDR}/v1/secret/data/${cleanPath}`;
}

async function readSecret(path, fallback = {}) {
  const response = await fetch(kv2Url(path), {
    headers: { 'X-Vault-Token': VAULT_TOKEN },
  });
  if (response.status === 404) {
    return fallback;
  }
  if (!response.ok) {
    throw new Error(`Vault read ${path} failed: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return body.data?.data || fallback;
}

async function writeSecret(path, data) {
  const response = await fetch(kv2Url(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Vault-Token': VAULT_TOKEN,
    },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    throw new Error(`Vault write ${path} failed: ${response.status} ${response.statusText}`);
  }
}

function parseMaybeJson(value, fallback) {
  if (!value) {
    return fallback;
  }
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeKeySecret(data) {
  return {
    ...data,
    keys: parseMaybeJson(data.keys, data.keys || {}),
  };
}

module.exports = {
  readSecret,
  writeSecret,
  normalizeKeySecret,
};
