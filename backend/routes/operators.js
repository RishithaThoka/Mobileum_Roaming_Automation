const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const undoManager = require('../services/undoManager');
const workflowEngine = require('../services/workflowEngine');
const heartbeatPoller = require('../services/heartbeatPoller');
const router = express.Router();

function withWatchFolder(operator) {
  if (operator.ingest_mode !== 'heartbeat') return operator;
  return { ...operator, watch_folder: heartbeatPoller.watchFolderFor(operator.id) };
}

function normalizeName(name) {
  return name.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\b(ltd|limited|inc|corp|corporation)\b/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
      }
    }
  }
  return matrix[a.length][b.length];
}

function getSimilarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - (dist / maxLen);
}

router.get('/', (req, res) => {
  const operators = db.prepare('SELECT * FROM operators ORDER BY created_at DESC').all();
  res.json(operators.map(withWatchFolder));
});

router.get('/:id/space', (req, res) => {
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(req.params.id);
  if (!operator) return res.status(404).json({ error: 'Operator not found' });

  const opWithWatch = withWatchFolder(operator);
  const documents = db.prepare('SELECT * FROM documents WHERE operator_id = ? ORDER BY created_at DESC').all(operator.id);

  for (const doc of documents) {
    doc.versions = db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC').all(doc.id);
  }

  const docIds = documents.map(d => d.id);
  let diffs = [];
  if (docIds.length > 0) {
    const placeholders = docIds.map(() => '?').join(',');
    diffs = db.prepare(`SELECT d.*, doc.doc_type, doc.title as doc_title FROM diffs d JOIN documents doc ON d.document_id = doc.id WHERE d.document_id IN (${placeholders}) ORDER BY d.created_at DESC`).all(...docIds);
  }

  let activeApprovals = [];
  const diffIds = diffs.map(d => d.id);
  if (diffIds.length > 0) {
    const placeholders = diffIds.map(() => '?').join(',');
    activeApprovals = db.prepare(`
      SELECT s.*, w.diff_id, d.document_id, doc.doc_type, doc.title as doc_title
      FROM approval_steps s
      JOIN approval_workflows w ON s.workflow_id = w.id
      JOIN diffs d ON w.diff_id = d.id
      JOIN documents doc ON d.document_id = doc.id
      WHERE w.diff_id IN (${placeholders})
      ORDER BY s.step_order ASC
    `).all(...diffIds);
  }

  const notifications = db.prepare('SELECT * FROM notifications WHERE operator_id = ? ORDER BY created_at DESC LIMIT 30').all(operator.id);

  res.json({
    operator: opWithWatch,
    documents,
    diffs,
    activeApprovals,
    notifications
  });
});

router.post('/', (req, res) => {
  const { name, country, network_code, contact_email, ingest_mode, default_doc_type, forceCreate } = req.body;
  if (!name || !country) return res.status(400).json({ error: 'name and country are required' });
  
  const normName = normalizeName(name);

  // Exact Match Check
  const existingExact = db.prepare('SELECT * FROM operators WHERE normalized_name = ? AND LOWER(country) = LOWER(?)').get(normName, country);
  if (existingExact) {
    return res.json({ isExactMatch: true, operator: withWatchFolder(existingExact) });
  }

  // Fuzzy Match Check
  if (!forceCreate) {
    const allOps = db.prepare('SELECT * FROM operators').all();
    for (const op of allOps) {
      if (op.normalized_name && getSimilarity(normName, op.normalized_name) > 0.85) {
        return res.status(409).json({ suggested: op });
      }
    }
  }

  const id = uuid();
  db.prepare(`INSERT INTO operators (id, name, country, normalized_name, network_code, contact_email, ingest_mode, default_doc_type) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, name, country, normName, network_code || '', contact_email || '', ingest_mode || 'heartbeat', default_doc_type || 'IR21');
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(id);
  res.json({ isExactMatch: false, operator: withWatchFolder(operator) });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM operators WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const merged = { ...existing, ...req.body };
  db.prepare(`UPDATE operators SET name=?, country=?, network_code=?, contact_email=?, ingest_mode=?, status=?, default_doc_type=? WHERE id=?`)
    .run(merged.name, merged.country, merged.network_code, merged.contact_email, merged.ingest_mode, merged.status, merged.default_doc_type, req.params.id);
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(req.params.id);
  res.json(withWatchFolder(operator));
});

// Cascading delete: removes the operator and every document, version, diff,
// diff item, approval workflow, and approval step that belongs to it.
// Audit log and email log entries are kept as an immutable historical record.
// A snapshot is saved first so this can be undone once via /api/admin/undo.
router.delete('/:id', (req, res) => {
  const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(req.params.id);
  if (!operator) return res.status(404).json({ error: 'Not found' });

  const documents = db.prepare('SELECT * FROM documents WHERE operator_id = ?').all(operator.id);
  const docIds = documents.map(d => d.id);
  const inList = (n) => Array(n).fill('?').join(',');

  const versions = docIds.length ? db.prepare(`SELECT * FROM document_versions WHERE document_id IN (${inList(docIds.length)})`).all(...docIds) : [];
  const diffs = docIds.length ? db.prepare(`SELECT * FROM diffs WHERE document_id IN (${inList(docIds.length)})`).all(...docIds) : [];
  const diffIds = diffs.map(d => d.id);
  const diffItems = diffIds.length ? db.prepare(`SELECT * FROM diff_items WHERE diff_id IN (${inList(diffIds.length)})`).all(...diffIds) : [];
  const workflows = diffIds.length ? db.prepare(`SELECT * FROM approval_workflows WHERE diff_id IN (${inList(diffIds.length)})`).all(...diffIds) : [];
  const workflowIds = workflows.map(w => w.id);
  const steps = workflowIds.length ? db.prepare(`SELECT * FROM approval_steps WHERE workflow_id IN (${inList(workflowIds.length)})`).all(...workflowIds) : [];
  const heartbeatFiles = db.prepare(`SELECT * FROM heartbeat_seen_files WHERE operator_id = ?`).all(operator.id);

  // delete-order: children first, so FK constraints (foreign_keys=ON) never trip
  const snapshot = [
    { table: 'approval_steps', rows: steps },
    { table: 'approval_workflows', rows: workflows },
    { table: 'diff_items', rows: diffItems },
    { table: 'diffs', rows: diffs },
    { table: 'document_versions', rows: versions },
    { table: 'documents', rows: documents },
    { table: 'heartbeat_seen_files', rows: heartbeatFiles },
    { table: 'operators', rows: [operator] },
  ];

  const tx = db.transaction(() => {
    if (steps.length) db.prepare(`DELETE FROM approval_steps WHERE id IN (${inList(steps.length)})`).run(...steps.map(s => s.id));
    if (workflows.length) db.prepare(`DELETE FROM approval_workflows WHERE id IN (${inList(workflows.length)})`).run(...workflows.map(w => w.id));
    if (diffItems.length) db.prepare(`DELETE FROM diff_items WHERE id IN (${inList(diffItems.length)})`).run(...diffItems.map(i => i.id));
    if (diffs.length) db.prepare(`DELETE FROM diffs WHERE id IN (${inList(diffs.length)})`).run(...diffs.map(d => d.id));
    if (versions.length) db.prepare(`DELETE FROM document_versions WHERE id IN (${inList(versions.length)})`).run(...versions.map(v => v.id));
    if (documents.length) db.prepare(`DELETE FROM documents WHERE id IN (${inList(documents.length)})`).run(...documents.map(d => d.id));
    if (heartbeatFiles.length) db.prepare(`DELETE FROM heartbeat_seen_files WHERE id IN (${inList(heartbeatFiles.length)})`).run(...heartbeatFiles.map(h => h.id));
    db.prepare(`DELETE FROM operators WHERE id = ?`).run(operator.id);
  });
  tx();

  undoManager.saveUndoSlot(
    `Deleted operator "${operator.name}" (${documents.length} document(s), ${diffs.length} diff(s), ${steps.length} approval step(s))`,
    snapshot
  );
  workflowEngine.logAudit('operator', operator.id, 'deleted', 'admin', `Deleted operator "${operator.name}" and all related records`);

  res.json({ deleted: true, operator: operator.name });
});

module.exports = router;
