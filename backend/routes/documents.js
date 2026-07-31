const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const undoManager = require('../services/undoManager');
const workflowEngine = require('../services/workflowEngine');
const ingestionService = require('../services/ingestionService');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });

// List all documents with operator info and latest status
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, o.name as operator_name, o.country as operator_country, o.network_code as mcc_mnc,
      (SELECT COUNT(*) FROM document_versions v WHERE v.document_id = d.id) as version_count,
      (SELECT status FROM diffs WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) as latest_diff_status
    FROM documents d JOIN operators o ON d.operator_id = o.id
    ORDER BY d.created_at DESC
  `).all();
  res.json(rows);
});

router.get('/:id/versions', (req, res) => {
  const versions = db.prepare(`SELECT id, version_number, original_filename, source, uploaded_at FROM document_versions WHERE document_id = ? ORDER BY version_number ASC`).all(req.params.id);
  res.json(versions);
});

router.get('/:id/diffs', (req, res) => {
  const diffs = db.prepare(`SELECT * FROM diffs WHERE document_id = ? ORDER BY created_at DESC`).all(req.params.id);
  res.json(diffs);
});

// Push-mode upload: the operator's own system (or a human via this form)
// submits a new version directly, right now. Runs through the same shared
// ingestionService the heartbeat poller uses — diff + workflow happen
// automatically either way.
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { operator_id, doc_type, title } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }
    const result = await ingestionService.ingestDocumentVersion({
      operatorId: operator_id,
      docType: doc_type,
      title,
      filePath: req.file.path,
      originalFilename: req.file.originalname,
      source: req.body.source || 'push',
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Cascading delete: removes one document and every version, diff, diff item,
// approval workflow, and approval step under it. Leaves the operator and the
// audit/email log (immutable history) untouched. Snapshot saved for undo.
router.delete('/:id', (req, res) => {
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!document) return res.status(404).json({ error: 'Not found' });

  const inList = (n) => Array(n).fill('?').join(',');

  const versions = db.prepare('SELECT * FROM document_versions WHERE document_id = ?').all(document.id);
  const diffs = db.prepare('SELECT * FROM diffs WHERE document_id = ?').all(document.id);
  const diffIds = diffs.map(d => d.id);
  const diffItems = diffIds.length ? db.prepare(`SELECT * FROM diff_items WHERE diff_id IN (${inList(diffIds.length)})`).all(...diffIds) : [];
  const workflows = diffIds.length ? db.prepare(`SELECT * FROM approval_workflows WHERE diff_id IN (${inList(diffIds.length)})`).all(...diffIds) : [];
  const workflowIds = workflows.map(w => w.id);
  const steps = workflowIds.length ? db.prepare(`SELECT * FROM approval_steps WHERE workflow_id IN (${inList(workflowIds.length)})`).all(...workflowIds) : [];

  const snapshot = [
    { table: 'approval_steps', rows: steps },
    { table: 'approval_workflows', rows: workflows },
    { table: 'diff_items', rows: diffItems },
    { table: 'diffs', rows: diffs },
    { table: 'document_versions', rows: versions },
    { table: 'documents', rows: [document] },
  ];

  const tx = db.transaction(() => {
    if (steps.length) db.prepare(`DELETE FROM approval_steps WHERE id IN (${inList(steps.length)})`).run(...steps.map(s => s.id));
    if (workflows.length) db.prepare(`DELETE FROM approval_workflows WHERE id IN (${inList(workflows.length)})`).run(...workflows.map(w => w.id));
    if (diffItems.length) db.prepare(`DELETE FROM diff_items WHERE id IN (${inList(diffItems.length)})`).run(...diffItems.map(i => i.id));
    if (diffs.length) db.prepare(`DELETE FROM diffs WHERE id IN (${inList(diffs.length)})`).run(...diffs.map(d => d.id));
    if (versions.length) db.prepare(`DELETE FROM document_versions WHERE id IN (${inList(versions.length)})`).run(...versions.map(v => v.id));
    db.prepare(`DELETE FROM documents WHERE id = ?`).run(document.id);
  });
  tx();

  undoManager.saveUndoSlot(
    `Deleted document "${document.title}" (${diffs.length} diff(s), ${steps.length} approval step(s))`,
    snapshot
  );
  workflowEngine.logAudit('document', document.id, 'deleted', 'admin', `Deleted document "${document.title}" and all related records`);

  res.json({ deleted: true, document: document.title });
});

module.exports = router;
