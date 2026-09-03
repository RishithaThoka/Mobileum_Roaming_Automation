'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const undoManager    = require('../services/undoManager');
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
  const m = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = a[i-1] === b[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1], m[i][j-1], m[i-1][j]) + 1;
  return m[a.length][b.length];
}

function getSimilarity(a, b) {
  const dist = levenshtein(a, b);
  const max  = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - dist / max;
}

router.get('/', async (req, res) => {
  const operators = await db('operators').orderBy('created_at', 'desc');
  res.json(operators.map(withWatchFolder));
});

router.get('/:id/space', async (req, res) => {
  const operator = await db('operators').where({ id: req.params.id }).first();
  if (!operator) return res.status(404).json({ error: 'Operator not found' });

  const documents = await db('documents')
    .where({ operator_id: operator.id })
    .orderBy('created_at', 'desc');

  for (const doc of documents) {
    doc.versions = await db('document_versions')
      .where({ document_id: doc.id })
      .orderBy('version_number', 'desc');
  }

  const docIds = documents.map(d => d.id);
  let diffs = [];
  if (docIds.length > 0) {
    diffs = await db('diffs as d')
      .select(['d.*', 'doc.doc_type', 'doc.title as doc_title'])
      .join('documents as doc', 'd.document_id', 'doc.id')
      .whereIn('d.document_id', docIds)
      .orderBy('d.created_at', 'desc');
  }

  let activeApprovals = [];
  const diffIds = diffs.map(d => d.id);
  if (diffIds.length > 0) {
    activeApprovals = await db('approval_steps as s')
      .select(['s.*', 'w.diff_id', 'd.document_id', 'doc.doc_type', 'doc.title as doc_title'])
      .join('approval_workflows as w', 's.workflow_id', 'w.id')
      .join('diffs as d', 'w.diff_id', 'd.id')
      .join('documents as doc', 'd.document_id', 'doc.id')
      .whereIn('w.diff_id', diffIds)
      .orderBy('s.step_order', 'asc');
  }

  const notifications = await db('notifications')
    .where({ operator_id: operator.id })
    .orderBy('created_at', 'desc')
    .limit(30);

  res.json({ operator: withWatchFolder(operator), documents, diffs, activeApprovals, notifications });
});

router.post('/', async (req, res) => {
  const { name, country, network_code, contact_email, ingest_mode, default_doc_type, forceCreate } = req.body;
  if (!name || !country) return res.status(400).json({ error: 'name and country are required' });

  const normName = normalizeName(name);

  const existingExact = await db('operators')
    .where({ normalized_name: normName })
    .whereRaw('LOWER(country) = LOWER(?)', [country])
    .first();
  if (existingExact) return res.json({ isExactMatch: true, operator: withWatchFolder(existingExact) });

  if (!forceCreate) {
    const allOps = await db('operators').select('*');
    for (const op of allOps) {
      if (op.normalized_name && getSimilarity(normName, op.normalized_name) > 0.85) {
        return res.status(409).json({ suggested: op });
      }
    }
  }

  const id = uuid();
  await db('operators').insert({
    id, name, country, normalized_name: normName,
    network_code: network_code || '', contact_email: contact_email || '',
    ingest_mode: ingest_mode || 'heartbeat',
    default_doc_type: default_doc_type || 'IR21',
  });
  const operator = await db('operators').where({ id }).first();
  res.json({ isExactMatch: false, operator: withWatchFolder(operator) });
});

router.patch('/:id', async (req, res) => {
  const existing = await db('operators').where({ id: req.params.id }).first();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const merged = { ...existing, ...req.body };
  await db('operators').where({ id: req.params.id }).update({
    name: merged.name, country: merged.country,
    network_code: merged.network_code, contact_email: merged.contact_email,
    ingest_mode: merged.ingest_mode, status: merged.status,
    default_doc_type: merged.default_doc_type,
  });
  const operator = await db('operators').where({ id: req.params.id }).first();
  res.json(withWatchFolder(operator));
});

// Cascading delete with undo snapshot — children deleted first to satisfy FK constraints.
router.delete('/:id', async (req, res) => {
  const operator = await db('operators').where({ id: req.params.id }).first();
  if (!operator) return res.status(404).json({ error: 'Not found' });

  const documents = await db('documents').where({ operator_id: operator.id });
  const docIds    = documents.map(d => d.id);

  const versions        = docIds.length ? await db('document_versions').whereIn('document_id', docIds) : [];
  const diffs           = docIds.length ? await db('diffs').whereIn('document_id', docIds) : [];
  const diffIds         = diffs.map(d => d.id);
  const diffItems       = diffIds.length ? await db('diff_items').whereIn('diff_id', diffIds) : [];
  const workflows       = diffIds.length ? await db('approval_workflows').whereIn('diff_id', diffIds) : [];
  const workflowIds     = workflows.map(w => w.id);
  const steps           = workflowIds.length ? await db('approval_steps').whereIn('workflow_id', workflowIds) : [];
  const heartbeatFiles  = await db('heartbeat_seen_files').where({ operator_id: operator.id });

  const snapshot = [
    { table: 'approval_steps',        rows: steps },
    { table: 'approval_workflows',    rows: workflows },
    { table: 'diff_items',            rows: diffItems },
    { table: 'diffs',                 rows: diffs },
    { table: 'document_versions',     rows: versions },
    { table: 'documents',             rows: documents },
    { table: 'heartbeat_seen_files',  rows: heartbeatFiles },
    { table: 'operators',             rows: [operator] },
  ];

  await db.transaction(async trx => {
    if (steps.length)         await trx('approval_steps').whereIn('id', steps.map(s => s.id)).del();
    if (workflows.length)     await trx('approval_workflows').whereIn('id', workflows.map(w => w.id)).del();
    if (diffItems.length)     await trx('diff_items').whereIn('id', diffItems.map(i => i.id)).del();
    if (diffs.length)         await trx('diffs').whereIn('id', diffs.map(d => d.id)).del();
    if (versions.length)      await trx('document_versions').whereIn('id', versions.map(v => v.id)).del();
    if (documents.length)     await trx('documents').whereIn('id', documents.map(d => d.id)).del();
    if (heartbeatFiles.length) await trx('heartbeat_seen_files').whereIn('id', heartbeatFiles.map(h => h.id)).del();
    await trx('operators').where({ id: operator.id }).del();
  });

  await undoManager.saveUndoSlot(
    `Deleted operator "${operator.name}" (${documents.length} document(s), ${diffs.length} diff(s), ${steps.length} approval step(s))`,
    snapshot,
  );
  workflowEngine.logAudit('operator', operator.id, 'deleted', 'admin',
    `Deleted operator "${operator.name}" and all related records`);

  res.json({ deleted: true, operator: operator.name });
});

module.exports = router;
