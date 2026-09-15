'use strict';

const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const router  = express.Router();

// ─── Session store ───────────────────────────────────────────────────────────
// Map<token, { user_id, username, role, full_name, approved_domains }>
const activeSessions = new Map();

// ─── Login ───────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = await db('users').where({ username }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(401).json({ error: 'Account is inactive — contact an administrator' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const session = {
      user_id:          user.id,
      username:         user.username,
      role:             user.role,
      full_name:        user.full_name,
      approved_domains: user.approved_domains || null,
    };
    activeSessions.set(token, session);

    res.json({
      success:          true,
      token,
      role:             user.role,
      full_name:        user.full_name,
      approved_domains: user.approved_domains ? JSON.parse(user.approved_domains) : null,
    });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Session check ───────────────────────────────────────────────────────────
router.get('/session', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.json({ loggedIn: false });

  const token = authHeader.replace('Bearer ', '');
  const session = activeSessions.get(token);
  if (!session) return res.json({ loggedIn: false });

  res.json({
    loggedIn:         true,
    username:         session.username,
    role:             session.role,
    full_name:        session.full_name,
    approved_domains: session.approved_domains ? JSON.parse(session.approved_domains) : null,
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

// ─── Middleware: requireRole ─────────────────────────────────────────────────
/**
 * Returns Express middleware that:
 *  - Rejects unauthenticated requests with 401
 *  - Rejects authenticated requests whose role is not in `allowedRoles` with 403
 *  - If `allowedRoles` is empty, any authenticated user passes (use via requireAuth)
 *  - Attaches `req.user` = { user_id, username, role, full_name, approved_domains }
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized — no token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const session = activeSessions.get(token);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
    }

    req.user = session;

    if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
      return res.status(403).json({ error: 'Forbidden — insufficient role privileges' });
    }

    next();
  };
}

// Shortcut: any authenticated user
const requireAuth = requireRole();

// ─── Session invalidation by user_id ─────────────────────────────────────────
/**
 * Remove all active sessions for a given user ID.
 * Called when an Admin deactivates a user or changes their role/domains.
 */
function invalidateUserSessions(userId) {
  for (const [token, session] of activeSessions) {
    if (session.user_id === userId) {
      activeSessions.delete(token);
    }
  }
}

module.exports = { router, requireRole, requireAuth, invalidateUserSessions };
