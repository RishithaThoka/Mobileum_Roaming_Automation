const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// A simple in-memory session store
const activeSessions = new Set();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'admin';

  if (username === expectedUser && password === expectedPass) {
    const token = crypto.randomBytes(24).toString('hex');
    activeSessions.add(token);
    return res.json({ success: true, token });
  }

  res.status(401).json({ error: 'Invalid username or password' });
});

router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json({ loggedIn: false });
  const token = authHeader.replace('Bearer ', '');
  if (activeSessions.has(token)) {
    return res.json({ loggedIn: true });
  }
  res.json({ loggedIn: false });
});

function requireAdmin(req, res, next) {
  // Allow OPTIONS pre-flight requests to pass through
  if (req.method === 'OPTIONS') return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace('Bearer ', '');
  if (activeSessions.has(token)) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { router, requireAdmin };
