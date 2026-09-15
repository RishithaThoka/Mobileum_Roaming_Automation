'use strict';

const express = require('express');
const db      = require('../db');
const { requireRole, requireAuth } = require('./auth');
const router  = express.Router();

router.get('/:id', requireAuth, async (req, res) => {
  const diff = await db('diffs').where({ id: req.params.id }).first();
  if (!diff) return res.status(404).json({ error: 'Not found' });

  const items    = await db('diff_items').where({ diff_id: req.params.id }).orderBy('domain').orderBy('field_path');
  const workflow = await db('approval_workflows').where({ diff_id: req.params.id }).first();
  let steps = [];
  if (workflow) {
    steps = await db('approval_steps').where({ workflow_id: workflow.id }).orderBy('step_order');
  }

  const document = await db('documents as d')
    .select(['d.*', 'o.name as operator_name'])
    .join('operators as o', 'd.operator_id', 'o.id')
    .where('d.id', diff.document_id)
    .first();

  const fromVersion = diff.from_version_id
    ? await db('document_versions').where({ id: diff.from_version_id }).first()
    : null;
  const toVersion = await db('document_versions').where({ id: diff.to_version_id }).first();

  const comparedVersion = {
    current: toVersion   ? `v${toVersion.version_number}`  : 'Current Version',
    against: fromVersion ? `v${fromVersion.version_number}`: 'Previous Version',
    current_filename: toVersion   ? toVersion.original_filename  : '',
    against_filename: fromVersion ? fromVersion.original_filename: '',
    operator_name: document ? document.operator_name : '',
  };

  const domains = {};
  items.forEach(i => {
    const domKey = i.domain || i.category || 'Operations';
    if (!domains[domKey]) domains[domKey] = [];
    domains[domKey].push({
      field: i.field_path, before: i.old_value, after: i.new_value,
      change_type: i.change_type, domain: domKey,
      severity: i.severity, needs_review: i.needs_review || 0,
    });
  });

  res.json({ operator: document ? document.operator_name : 'Unknown Operator', compared_version: comparedVersion, domains, diff, items, workflow, steps });
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db('diff_items as di')
      .select([
        'di.*',
        'df.status as diff_status', 'df.document_id',
        'df.from_version_id', 'df.to_version_id',
        'op.name as operator_name', 'op.country as operator_country',
        'op.network_code as mcc_mnc',
        'v_from.version_number as from_v_num',
        'v_from.original_filename as from_filename',
        'v_to.version_number as to_v_num',
        'v_to.original_filename as to_filename',
      ])
      .join('diffs as df', 'di.diff_id', 'df.id')
      .join('documents as doc', 'df.document_id', 'doc.id')
      .join('operators as op', 'doc.operator_id', 'op.id')
      .leftJoin('document_versions as v_from', 'df.from_version_id', 'v_from.id')
      .leftJoin('document_versions as v_to',   'df.to_version_id',   'v_to.id')
      .orderBy('df.created_at', 'desc');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/items/:itemId/resolve', requireRole('Admin', 'Analyst'), async (req, res) => {
  try {
    await db('diff_items').where({ id: req.params.itemId }).update({ needs_review: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
