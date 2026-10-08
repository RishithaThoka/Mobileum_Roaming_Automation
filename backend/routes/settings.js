'use strict';

const express = require('express');
const db = require('../db');
const emailService = require('../services/emailService');
const router = express.Router();

router.get('/routing', async (req, res) => {
  const rows = await db('category_routing').orderBy('step_order');
  res.json(rows);
});

router.patch('/routing/:category', async (req, res) => {
  const { approver_name, approver_email, role_title, step_order } = req.body;
  const existing = await db('category_routing').where({ category: req.params.category }).first();
  if (!existing) return res.status(404).json({ error: 'Unknown category' });

  const merged = {
    approver_name:  approver_name  ?? existing.approver_name,
    approver_email: approver_email ?? existing.approver_email,
    role_title:     role_title     ?? existing.role_title,
    step_order:     step_order     ?? existing.step_order,
  };

  await db('category_routing').where({ category: req.params.category }).update(merged);
  const updated = await db('category_routing').where({ category: req.params.category }).first();
  res.json(updated);
});

router.get('/smtp-status', (req, res) => {
  res.json({ configured: emailService.isConfigured() });
});

module.exports = router;
