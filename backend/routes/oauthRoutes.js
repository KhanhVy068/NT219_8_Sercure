const express = require('express');
const introspectionStore = require('../services/introspectionStore');
const revocationStore = require('../services/revocationStore');

const router = express.Router();

router.post('/introspect', (req, res) => {
  const token = req.body.token || req.body.access_token;
  if (!token) {
    return res.status(400).json({ error: 'missing_token' });
  }
  res.json(introspectionStore.introspect(token));
});

router.post('/revoke', (req, res) => {
  const token = req.body.token || req.body.access_token || req.body.refresh_token;
  const tokenType = req.body.token_type_hint || (req.body.refresh_token ? 'refresh_token' : 'access_token');
  const exp = req.body.exp || Math.floor(Date.now() / 1000) + 3600;

  if (!token) {
    return res.status(400).json({ error: 'missing_token' });
  }

  const tokenHash = revocationStore.revokeToken(token, exp, tokenType);
  introspectionStore.deactivate(token);
  res.json({
    revoked: true,
    token_type: tokenType,
    token_hash: tokenHash,
  });
});

router.get('/revoked', (req, res) => {
  res.json({
    revoked: revocationStore.listRevoked(),
  });
});

module.exports = router;
