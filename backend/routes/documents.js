'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');
const undoManager    = require('../services/undoManager');
const workflowEngine = require('../services/workflowEngine');
const ingestionService = require('../services/ingestionService');

const router     = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });

// List all documents with operator info and latest status
router.get('/', async (req, res) => {
  const rows = await db('documents as d')
    .select([
      'd.*',
      'o.name as operator_name', 'o.country as operator_country', 'o.network_code as mcc_mnc',
      db.raw('(SELECT COUNT(*) FROM document_versions v WHERE v.document_id = d.id) as version_count'),
      db.raw('(SELECT status FROM diffs WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) as latest_diff_status'),
    ])
    .join('operators as o', 'd.operator_id', 'o.id')
    .orderBy('d.created_at', 'desc');
  res.json(rows);
});

router.get('/:id/versions', async (req, res) => {
  const versions = await db('document_versions')
    .select('id', 'version_number', 'original_filename', 'source', 'uploaded_at')
    .where({ document_id: req.params.id })
    .orderBy('version_number', 'asc');
  res.json(versions);
});

router.get('/:id/diffs', async (req, res) => {
  const diffs = await db('diffs')
    .where({ document_id: req.params.id })
    .orderBy('created_at', 'desc');
  res.json(diffs);
});

// Push-mode upload — runs through the shared ingestionService, same as heartbeat.
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { operator_id, doc_type, title } = req.body;
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const result = await ingestionService.ingestDocumentVersion({
      operatorId: operator_id, docType: doc_type, title,
      filePath: req.file.path, originalFilename: req.file.originalname,
      source: req.body.source || 'push',
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Cascading delete with undo snapshot — children first to satisfy FK constraints.
router.delete('/:id', async (req, res) => {
  const document = await db('documents').where({ id: req.params.id }).first();
  if (!document) return res.status(404).json({ error: 'Not found' });

  const versions    = await db('document_versions').where({ document_id: document.id });
  const diffs       = await db('diffs').where({ document_id: document.id });
  const diffIds     = diffs.map(d => d.id);
  const diffItems   = diffIds.length ? await db('diff_items').whereIn('diff_id', diffIds) : [];
  const workflows   = diffIds.length ? await db('approval_workflows').whereIn('diff_id', diffIds) : [];
  const workflowIds = workflows.map(w => w.id);
  const steps       = workflowIds.length ? await db('approval_steps').whereIn('workflow_id', workflowIds) : [];
  const substages   = await db('document_workflow_substages').where({ document_id: document.id });

  const snapshot = [
    { table: 'approval_steps',     rows: steps },
    { table: 'approval_workflows', rows: workflows },
    { table: 'diff_items',         rows: diffItems },
    { table: 'diffs',              rows: diffs },
    { table: 'document_workflow_substages', rows: substages },
    { table: 'document_versions',  rows: versions },
    { table: 'documents',          rows: [document] },
  ];

  await db.transaction(async trx => {
    if (steps.length)     await trx('approval_steps').whereIn('id', steps.map(s => s.id)).del();
    if (workflows.length) await trx('approval_workflows').whereIn('id', workflows.map(w => w.id)).del();
    if (diffItems.length) await trx('diff_items').whereIn('id', diffItems.map(i => i.id)).del();
    if (diffs.length)     await trx('diffs').whereIn('id', diffs.map(d => d.id)).del();
    if (substages.length) await trx('document_workflow_substages').where({ document_id: document.id }).del();
    if (versions.length)  await trx('document_versions').whereIn('id', versions.map(v => v.id)).del();
    await trx('documents').where({ id: document.id }).del();
  });

  await undoManager.saveUndoSlot(
    `Deleted document "${document.title}" (${diffs.length} diff(s), ${steps.length} approval step(s))`,
    snapshot,
  );
  workflowEngine.logAudit('document', document.id, 'deleted', 'admin',
    `Deleted document "${document.title}" and all related records`);

  res.json({ deleted: true, document: document.title });
});

module.exports = router;
