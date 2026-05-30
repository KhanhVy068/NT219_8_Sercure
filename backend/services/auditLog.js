const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.AUDIT_LOG_DIR || path.join(__dirname, '..', 'logs');
const LOG_FILE = process.env.AUDIT_LOG_FILE || path.join(LOG_DIR, 'security-audit.log');
let warned = false;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function warnOnce(error) {
  if (warned) {
    return;
  }
  warned = true;
  console.error(`[audit] disabled file logging: ${error.message}`);
}

function write(event, fields = {}) {
  const record = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  };
  const line = JSON.stringify(record);
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch (error) {
    warnOnce(error);
  }
  if (process.env.AUDIT_LOG_STDOUT === 'true') {
    console.log(line);
  }
}

function getLogFile() {
  ensureLogDir();
  return LOG_FILE;
}

module.exports = {
  write,
  getLogFile,
};
