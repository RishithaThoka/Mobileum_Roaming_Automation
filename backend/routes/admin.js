'use strict';

const express = require('express');
const fs   = require('fs');
const path = require('path');
const db   = require('../db');
const undoManager      = require('../services/undoManager');
const workflowEngine   = require('../services/workflowEngine');
const heartbeatPoller  = require('../services/heartbeatPoller');
const ingestionService = require('../services/ingestionService');
const router = express.Router();

// Tables wiped by "reset all data", in FK-safe delete order (children first).
// category_routing is left alone — that's configuration, not demo data.
const RESET_TABLES_IN_DELETE_ORDER = [
  'approval_steps', 'approval_workflows', 'diff_items', 'diffs',
  'document_versions', 'documents', 'heartbeat_seen_files', 'notifications', 'operators',
  'email_log', 'audit_log',
];

router.post('/reset', async (req, res) => {
  const snapshot = await Promise.all(
    RESET_TABLES_IN_DELETE_ORDER.map(async table => ({
      table,
      rows: await db(table).select('*'),
    }))
  );
  const totalRows = snapshot.reduce((sum, t) => sum + t.rows.length, 0);

  await db.transaction(async trx => {
    for (const table of RESET_TABLES_IN_DELETE_ORDER) {
      await trx(table).del();
    }
  });

  // Clean uploaded files directory
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (fs.existsSync(uploadsDir)) {
    fs.readdirSync(uploadsDir).forEach(file => {
      try { fs.unlinkSync(path.join(uploadsDir, file)); } catch (_) {}
    });
  }

  await undoManager.saveUndoSlot(`Reset all data (wiped ${totalRows} total record(s))`, snapshot);
  workflowEngine.logAudit('system', 'all', 'reset', 'admin',
    `Reset all data — wiped ${totalRows} record(s) across ${RESET_TABLES_IN_DELETE_ORDER.length} tables`);

  res.json({ reset: true, wiped: totalRows });
});

router.post('/recalculate-diffs', async (req, res) => {
  const count = await ingestionService.recalculateAllDiffs();
  res.json({ success: true, count });
});

router.get('/undo-status', async (req, res) => {
  res.json(await undoManager.getStatus());
});

router.post('/undo', async (req, res) => {
  const result = await undoManager.undo();
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

router.post('/redo', async (req, res) => {
  const result = await undoManager.redo();
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

router.get('/heartbeat-status', async (req, res) => {
  res.json(await heartbeatPoller.status());
});

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
  workflowEngine.logAudit('diff', req.params.diffId, 'rollout_step', 'admin',
    `System ${system} reported status: ${status}`);
  res.json({ success: true });
});

module.exports = router;
