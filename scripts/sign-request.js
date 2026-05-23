const crypto = require('crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const method = getArg('method', 'POST').toUpperCase();
const pathName = getArg('path', '/api/crypto/hmac-verify');
const timestamp = getArg('timestamp', String(Date.now()));
const nonce = getArg('nonce', crypto.randomUUID());
const bodyText = getArg('body', '{"amount":100000,"to":"alice"}');
const secret = process.env.HMAC_SECRET || 'demo-hmac-secret-32bytes-minimum';

function parseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    // PowerShell sometimes strips inner quotes from JSON arguments:
    // --body={"amount":100000,"to":"alice"} can arrive as {amount:100000,to:alice}.
    const repaired = text
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
      .replace(/:\s*([A-Za-z_][A-Za-z0-9_-]*)(\s*[,}])/g, ':"$1"$2');
    return JSON.parse(repaired);
  }
}

const body = parseBody(bodyText);
const bodyHash = sha256Hex(stableStringify(body));
const canonical = [method, pathName, timestamp, nonce, bodyHash].join('\n');
const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

console.log(JSON.stringify({
  method,
  path: pathName,
  timestamp,
  nonce,
  signature,
  body,
  canonical,
  powershellHeaders: {
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-signature': signature
  }
}, null, 2));
