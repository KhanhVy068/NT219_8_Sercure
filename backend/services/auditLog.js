const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.AUDIT_LOG_DIR || path.join(__dirname, '..', 'logs');
const LOG_FILE = process.env.AUDIT_LOG_FILE || path.join(LOG_DIR, 'security-audit.log');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function write(event, fields = {}) {
  ensureLogDir();
  const record = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  };
  const line = JSON.stringify(record);
  fs.appendFileSync(LOG_FILE, `${line}\n`);
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
