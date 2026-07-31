const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const undoManager = require('../services/undoManager');
const workflowEngine = require('../services/workflowEngine');
const heartbeatPoller = require('../services/heartbeatPoller');
const ingestionService = require('../services/ingestionService');
const router = express.Router();

// Tables wiped by "reset all data", in FK-safe delete order (children first).
// category_routing is left alone — that's configuration, not demo data.
const RESET_TABLES_IN_DELETE_ORDER = [
  'approval_steps', 'approval_workflows', 'diff_items', 'diffs',
  'document_versions', 'documents', 'heartbeat_seen_files', 'notifications', 'operators',
  'email_log', 'audit_log',
];

router.post('/reset', (req, res) => {
  const snapshot = RESET_TABLES_IN_DELETE_ORDER.map(table => ({
    table,
    rows: db.prepare(`SELECT * FROM ${table}`).all(),
  }));
  const totalRows = snapshot.reduce((sum, t) => sum + t.rows.length, 0);

  const tx = db.transaction(() => {
    RESET_TABLES_IN_DELETE_ORDER.forEach(table => db.prepare(`DELETE FROM ${table}`).run());
  });
  tx();

  // Clean uploaded files directory
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    files.forEach(file => {
      try { fs.unlinkSync(path.join(uploadsDir, file)); } catch (e) {}
    });
  }

  undoManager.saveUndoSlot(`Reset all data (wiped ${totalRows} total record(s))`, snapshot);
  // logged after the wipe, so this becomes the first entry of the fresh audit log
  workflowEngine.logAudit('system', 'all', 'reset', 'admin', `Reset all data — wiped ${totalRows} record(s) across ${RESET_TABLES_IN_DELETE_ORDER.length} tables`);

  res.json({ reset: true, wiped: totalRows });
});

router.post('/recalculate-diffs', (req, res) => {
  const count = ingestionService.recalculateAllDiffs();
  res.json({ success: true, count });
});

router.get('/undo-status', (req, res) => {
  res.json(undoManager.getStatus());
});

router.post('/undo', (req, res) => {
  const result = undoManager.undo();
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

router.post('/redo', (req, res) => {
  const result = undoManager.redo();
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Live status of the heartbeat poller — which operators are watched, where
// their folder is on disk, when it last scanned, and what it found.
router.get('/heartbeat-status', (req, res) => {
  res.json(heartbeatPoller.status());
});

// Force an immediate scan instead of waiting for the next interval tick —
// handy for a demo: drop a file in the watch folder, click this, watch it
// appear in the pipeline right away instead of waiting up to the interval.
router.post('/heartbeat-scan-now', async (req, res) => {
  try {
    const results = await heartbeatPoller.scanAllOperators();
    res.json({ scanned: true, ingested: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rollout/:diffId/execute', (req, res) => {
  const { system, status } = req.body;
  const diffId = req.params.diffId;
  workflowEngine.logAudit('diff', diffId, 'rollout_step', 'admin', `System ${system} reported status: ${status}`);
  res.json({ success: true });
});

module.exports = router;
