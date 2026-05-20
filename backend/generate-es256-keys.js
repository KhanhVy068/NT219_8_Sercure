const crypto = require('crypto');
const fs = require('fs');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

fs.writeFileSync('es256-private.pem', privateKey);
fs.writeFileSync('es256-public.pem', publicKey);

console.log(' Đã tạo cặp khóa ES256:');
console.log('  - es256-private.pem');
console.log('  - es256-public.pem');