const express = require('express');
const db = require('../db');
const emailService = require('../services/emailService');
const router = express.Router();

router.get('/routing', (req, res) => {
  res.json(db.prepare('SELECT * FROM category_routing ORDER BY step_order').all());
});

router.patch('/routing/:category', (req, res) => {
  const { approver_name, approver_email, role_title, step_order } = req.body;
  const existing = db.prepare('SELECT * FROM category_routing WHERE category = ?').get(req.params.category);
  if (!existing) return res.status(404).json({ error: 'Unknown category' });
  const merged = { ...existing, approver_name: approver_name ?? existing.approver_name, approver_email: approver_email ?? existing.approver_email, role_title: role_title ?? existing.role_title, step_order: step_order ?? existing.step_order };
  db.prepare('UPDATE category_routing SET approver_name=?, approver_email=?, role_title=?, step_order=? WHERE category=?')
    .run(merged.approver_name, merged.approver_email, merged.role_title, merged.step_order, req.params.category);
  res.json(db.prepare('SELECT * FROM category_routing WHERE category = ?').get(req.params.category));
});

router.get('/smtp-status', (req, res) => {
  res.json({ configured: emailService.isConfigured() });
});

module.exports = router;
