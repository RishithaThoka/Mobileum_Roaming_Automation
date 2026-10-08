'use strict';

const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db      = require('../db');
const { invalidateUserSessions } = require('./auth');
const router  = express.Router();

// All routes in this file are gated with requireRole('Admin') at the server.js level.

const VALID_ROLES = ['Admin', 'Analyst', 'Approver', 'CPO/Exec', 'Auditor'];

// ─── List all users ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const users = await db('users')
      .select('id', 'username', 'full_name', 'role', 'approved_domains', 'status', 'created_at')
      .orderBy('created_at', 'asc');
    // Parse approved_domains from JSON string to array for the frontend
    const mapped = users.map(u => ({
      ...u,
      approved_domains: u.approved_domains ? JSON.parse(u.approved_domains) : null,
    }));
    res.json(mapped);
  } catch (err) {
    console.error('[users] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Create new user ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { username, full_name, role, approved_domains } = req.body;

    if (!username || !role) {
      return res.status(400).json({ error: 'username and role are required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    // Check for duplicate username
    const existing = await db('users').where({ username }).first();
    if (existing) {
      return res.status(409).json({ error: 'A user with this username already exists' });
    }

    // Validate approved_domains for Approver role
    if (role === 'Approver') {
      if (!approved_domains || !Array.isArray(approved_domains) || approved_domains.length === 0) {
        return res.status(400).json({ error: 'Approver role requires at least one approved domain' });
      }
      // Validate domains exist in category_routing
      const validCategories = await db('category_routing').select('category');
      const validCategoryNames = validCategories.map(c => c.category);
      const invalid = approved_domains.filter(d => !validCategoryNames.includes(d));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Invalid domain(s): ${invalid.join(', ')}` });
      }
    }

    // Generate secure random password
    const tempPassword = crypto.randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const id = uuid();
    await db('users').insert({
      id,
      username,
      password_hash: passwordHash,
      role,
      full_name: full_name || '',
      approved_domains: role === 'Approver' ? JSON.stringify(approved_domains) : null,
      status: 'active',
    });

    const user = await db('users')
      .select('id', 'username', 'full_name', 'role', 'approved_domains', 'status', 'created_at')
      .where({ id })
      .first();

    res.json({
      user: {
        ...user,
        approved_domains: user.approved_domains ? JSON.parse(user.approved_domains) : null,
      },
      temp_password: tempPassword,
    });
  } catch (err) {
    console.error('[users] create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Update existing user ────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updates = {};
    const { full_name, role, approved_domains, status } = req.body;

    if (full_name !== undefined) updates.full_name = full_name;

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      }
      updates.role = role;
      // If changing away from Approver, clear domains
      if (role !== 'Approver') {
        updates.approved_domains = null;
      }
    }

    if (approved_domains !== undefined) {
      const effectiveRole = updates.role || user.role;
      if (effectiveRole !== 'Approver') {
        return res.status(400).json({ error: 'approved_domains can only be set for Approver role' });
      }
      if (!Array.isArray(approved_domains) || approved_domains.length === 0) {
        return res.status(400).json({ error: 'approved_domains must be a non-empty array' });
      }
      const validCategories = await db('category_routing').select('category');
      const validCategoryNames = validCategories.map(c => c.category);
      const invalid = approved_domains.filter(d => !validCategoryNames.includes(d));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Invalid domain(s): ${invalid.join(', ')}` });
      }
      updates.approved_domains = JSON.stringify(approved_domains);
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ error: 'status must be active or inactive' });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await db('users').where({ id: req.params.id }).update(updates);

    // Invalidate sessions if status changed to inactive, or role/domains changed
    const needsInvalidation =
      (updates.status === 'inactive') ||
      (updates.role !== undefined && updates.role !== user.role) ||
      (updates.approved_domains !== undefined);

    if (needsInvalidation) {
      invalidateUserSessions(req.params.id);
    }

    const updated = await db('users')
      .select('id', 'username', 'full_name', 'role', 'approved_domains', 'status', 'created_at')
      .where({ id: req.params.id })
      .first();

    res.json({
      ...updated,
      approved_domains: updated.approved_domains ? JSON.parse(updated.approved_domains) : null,
      sessions_invalidated: needsInvalidation,
    });
  } catch (err) {
    console.error('[users] update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
