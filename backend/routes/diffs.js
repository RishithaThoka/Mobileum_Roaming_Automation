const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/:id', (req, res) => {
  const diff = db.prepare(`SELECT * FROM diffs WHERE id = ?`).get(req.params.id);
  if (!diff) return res.status(404).json({ error: 'Not found' });

  const items = db.prepare(`SELECT * FROM diff_items WHERE diff_id = ? ORDER BY domain, field_path`).all(req.params.id);
  const workflow = db.prepare(`SELECT * FROM approval_workflows WHERE diff_id = ?`).get(req.params.id);
  let steps = [];
  if (workflow) {
    steps = db.prepare(`SELECT * FROM approval_steps WHERE workflow_id = ? ORDER BY step_order`).all(workflow.id);
  }

  // Fetch document & operator details
  const document = db.prepare(`SELECT d.*, o.name as operator_name FROM documents d JOIN operators o ON d.operator_id = o.id WHERE d.id = ?`).get(diff.document_id);
  const fromVersion = db.prepare(`SELECT * FROM document_versions WHERE id = ?`).get(diff.from_version_id);
  const toVersion = db.prepare(`SELECT * FROM document_versions WHERE id = ?`).get(diff.to_version_id);

  const comparedVersion = {
    current: toVersion ? `v${toVersion.version_number}` : 'Current Version',
    against: fromVersion ? `v${fromVersion.version_number}` : 'Previous Version',
    current_filename: toVersion ? toVersion.original_filename : '',
    against_filename: fromVersion ? fromVersion.original_filename : '',
    operator_name: document ? document.operator_name : ''
  };

  // Group diff items by domain
  const domains = {};
  items.forEach(i => {
    const domKey = i.domain || i.category || 'Operations';
    if (!domains[domKey]) domains[domKey] = [];
    domains[domKey].push({
      field: i.field_path,
      before: i.old_value,
      after: i.new_value,
      change_type: i.change_type,
      domain: domKey,
      severity: i.severity,
      needs_review: i.needs_review || 0
    });
  });

  res.json({
    operator: document ? document.operator_name : 'Unknown Operator',
    compared_version: comparedVersion,
    domains,
    diff,
    items,
    workflow,
    steps
  });
});

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        di.*, 
        df.status as diff_status, 
        df.document_id,
        df.from_version_id,
        df.to_version_id,
        op.name as operator_name,
        op.country as operator_country,
        op.network_code as mcc_mnc,
        v_from.version_number as from_v_num,
        v_from.original_filename as from_filename,
        v_to.version_number as to_v_num,
        v_to.original_filename as to_filename
      FROM diff_items di
      JOIN diffs df ON di.diff_id = df.id
      JOIN documents doc ON df.document_id = doc.id
      JOIN operators op ON doc.operator_id = op.id
      LEFT JOIN document_versions v_from ON df.from_version_id = v_from.id
      LEFT JOIN document_versions v_to ON df.to_version_id = v_to.id
      ORDER BY df.created_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/items/:itemId/resolve', (req, res) => {
  try {
    db.prepare('UPDATE diff_items SET needs_review = 0 WHERE id = ?').run(req.params.itemId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
