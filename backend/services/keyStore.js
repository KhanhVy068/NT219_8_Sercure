const path = require('path');
const vault = require('./vaultService');
const metrics = require('./metrics');

const HS256_PATH = process.env.VAULT_HS256_PATH || 'secret/jwt/hs256';
const ES256_PATH = process.env.VAULT_ES256_PATH || 'secret/jwt/es256';
const HMAC_PATH = process.env.VAULT_HMAC_PATH || 'secret/hmac/api';
const DEMO_JWT_ISSUER = process.env.DEMO_JWT_ISSUER || 'http://localhost:3000/demo-idp';
const DEMO_JWT_AUDIENCE = process.env.DEMO_JWT_AUDIENCE || 'secure-api';
const FALLBACK_HS256_SECRET = process.env.HS256_SECRET || 'khoa-bi-mat-24byte-cho-hs256!!';
const FALLBACK_HS256_KID = process.env.HS256_KID || 'demo-hs256-key-1';
const FALLBACK_ES256_KID = process.env.ES256_KID || 'demo-es256-key-1';
const FALLBACK_HMAC_SECRET = process.env.HMAC_SECRET || 'demo-hmac-secret-32bytes-minimum';
const ES256_PRIVATE_KEY_PATH =
  process.env.ES256_PRIVATE_KEY_PATH || path.join(__dirname, '..', 'es256-private.pem');
const ES256_PUBLIC_KEY_PATH =
  process.env.ES256_PUBLIC_KEY_PATH || path.join(__dirname, '..', 'es256-public.pem');

let hs256State;
let es256State;
let hmacState;

function epochNow() {
  return Math.floor(Date.now() / 1000);
}

function normalizeKeyMap(secretData, algorithm) {
  const keys = secretData.keys || {};
  const currentKid = secretData.currentKid;
  return {
    currentKid,
    canaryKid: secretData.canaryKid || null,
    canaryPercent: Number(secretData.canaryPercent || 0),
    keys: Object.fromEntries(
      Object.entries(keys).map(([kid, key]) => [
        kid,
        {
          kid,
          algorithm,
          status: key.status || 'active',
          secret: key.secret,
          privateKey: key.privateKey,
          publicKey: key.publicKey,
          notBefore: Number(key.notBefore || 0),
          expiresAt: Number(key.expiresAt || 4102444800),
          createdAt: key.createdAt || new Date().toISOString(),
        },
      ])
    ),
  };
}

function isUsableKey(key, allowGrace = true) {
  if (!key) {
    return false;
  }
  const now = epochNow();
  if (key.notBefore && now < key.notBefore) {
    return false;
  }
  if (key.status === 'revoked') {
    return false;
  }
  if (key.status === 'grace' && !allowGrace) {
    return false;
  }
  return !key.expiresAt || now <= key.expiresAt;
}

function fallbackHs256() {
  return normalizeKeyMap({
    currentKid: FALLBACK_HS256_KID,
    keys: {
      [FALLBACK_HS256_KID]: {
        secret: FALLBACK_HS256_SECRET,
        status: 'active',
        expiresAt: 4102444800,
      },
    },
  }, 'HS256');
}

function fallbackEs256() {
  return normalizeKeyMap({
    currentKid: FALLBACK_ES256_KID,
    keys: {
      [FALLBACK_ES256_KID]: {
        privateKey: vault.readFileIfExists(ES256_PRIVATE_KEY_PATH),
        publicKey: vault.readFileIfExists(ES256_PUBLIC_KEY_PATH),
        status: 'active',
        expiresAt: 4102444800,
      },
    },
  }, 'ES256');
}

function fallbackHmac() {
  return {
    currentKid: process.env.HMAC_KID || 'demo-hmac-key-1',
    secret: FALLBACK_HMAC_SECRET,
  };
}

async function refreshKeys() {
  const [hs256Data, es256Data, hmacData] = await Promise.all([
    vault.readSecret(HS256_PATH, { fallback: fallbackHs256() }),
    vault.readSecret(ES256_PATH, { fallback: fallbackEs256() }),
    vault.readSecret(HMAC_PATH, { fallback: fallbackHmac() }),
  ]);

  hs256State = hs256Data.keys ? normalizeKeyMap(hs256Data, 'HS256') : hs256Data;
  es256State = es256Data.keys ? normalizeKeyMap(es256Data, 'ES256') : es256Data;
  hmacState = {
    currentKid: hmacData.currentKid || 'demo-hmac-key-1',
    secret: hmacData.secret || FALLBACK_HMAC_SECRET,
  };

  return getState();
}

async function initializeKeyStore() {
  await refreshKeys();
  vault.startAutoRefresh([HS256_PATH, ES256_PATH, HMAC_PATH], refreshKeys);
}

function getSigningKey(algorithm) {
  const state = algorithm === 'HS256' ? hs256State : es256State;
  const canaryPercent = Math.max(0, Math.min(100, Number(state?.canaryPercent || 0)));
  const useCanary = state?.canaryKid && canaryPercent > 0 && Math.random() * 100 < canaryPercent;
  const kid = useCanary ? state.canaryKid : state?.currentKid;
  const key = state?.keys?.[kid];
  if (!isUsableKey(key, false)) {
    throw new Error(`No active signing key for ${algorithm}`);
  }
  if (useCanary) {
    metrics.inc('canary_token_issued_total', { alg: algorithm, kid });
  }
  return key;
}

function getVerifyKey(algorithm, kid) {
  const state = algorithm === 'HS256' ? hs256State : es256State;
  const key = state?.keys?.[kid];
  if (!isUsableKey(key, true)) {
    throw new Error(`${algorithm} unknown or revoked kid: ${kid || 'missing'}`);
  }
  return key;
}

function getHmacSecret() {
  return hmacState?.secret || FALLBACK_HMAC_SECRET;
}

function getState() {
  return {
    issuer: DEMO_JWT_ISSUER,
    audience: DEMO_JWT_AUDIENCE,
    hs256: {
      currentKid: hs256State?.currentKid,
      canaryKid: hs256State?.canaryKid,
      canaryPercent: hs256State?.canaryPercent || 0,
      kids: Object.fromEntries(
        Object.entries(hs256State?.keys || {}).map(([kid, key]) => [
          kid,
          { status: key.status, expiresAt: key.expiresAt },
        ])
      ),
    },
    es256: {
      currentKid: es256State?.currentKid,
      canaryKid: es256State?.canaryKid,
      canaryPercent: es256State?.canaryPercent || 0,
      kids: Object.fromEntries(
        Object.entries(es256State?.keys || {}).map(([kid, key]) => [
          kid,
          { status: key.status, expiresAt: key.expiresAt },
        ])
      ),
    },
    hmac: {
      currentKid: hmacState?.currentKid,
      loaded: Boolean(hmacState?.secret),
    },
    vault: vault.getStatus(),
  };
}

module.exports = {
  initializeKeyStore,
  refreshKeys,
  getSigningKey,
  getVerifyKey,
  getHmacSecret,
  getState,
  issuer: DEMO_JWT_ISSUER,
  audience: DEMO_JWT_AUDIENCE,
};
