const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/stats', (req, res) => {
  const operators = db.prepare('SELECT COUNT(*) c FROM operators').get().c;
  const documents = db.prepare('SELECT COUNT(*) c FROM documents').get().c;
  const pendingDiffs = db.prepare(`SELECT COUNT(*) c FROM diffs WHERE status IN ('pending_workflow','in_approval')`).get().c;
  const approvedDiffs = db.prepare(`SELECT COUNT(*) c FROM diffs WHERE status = 'approved'`).get().c;
  const approvedDiffsToday = db.prepare(`SELECT COUNT(*) c FROM diffs WHERE status = 'approved' AND date(created_at) = date('now')`).get().c;
  const rejectedDiffs = db.prepare(`SELECT COUNT(*) c FROM diffs WHERE status = 'rejected'`).get().c;
  const pendingSteps = db.prepare(`SELECT COUNT(*) c FROM approval_steps WHERE status = 'pending'`).get().c;
  const emailsSent = db.prepare(`SELECT COUNT(*) c FROM email_log`).get().c;
  res.json({ operators, documents, pendingDiffs, approvedDiffs, approvedDiffsToday, rejectedDiffs, pendingSteps, emailsSent });
});

router.get('/audit-log', (req, res) => {
  res.json(db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 200').all());
});

router.get('/email-log', (req, res) => {
  res.json(db.prepare('SELECT * FROM email_log ORDER BY sent_at DESC LIMIT 100').all());
});

router.get('/email-log/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM email_log WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.get('/pipeline', (req, res) => {
  // one row per document showing where it sits in the Ingested -> Diffed -> Approval -> Approved/Rejected pipeline
  const rows = db.prepare(`
    SELECT doc.id as document_id, doc.title, doc.doc_type, o.name as operator_name, o.country,
      df.id as diff_id, df.status as diff_status, df.total_changes, df.highest_severity, df.created_at as diff_created_at
    FROM documents doc
    JOIN operators o ON doc.operator_id = o.id
    LEFT JOIN diffs df ON df.id = (SELECT id FROM diffs WHERE document_id = doc.id ORDER BY created_at DESC LIMIT 1)
    ORDER BY df.created_at DESC
  `).all();
  res.json(rows);
});

module.exports = router;
