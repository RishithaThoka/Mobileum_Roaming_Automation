'use strict';

const express = require('express');
const db      = require('../db');
const { requireRole, requireAuth } = require('./auth');
const router  = express.Router();

router.get('/stats', requireAuth, async (req, res) => {
  const count = async (table, where = {}) => {
    const q = db(table).count('* as c');
    if (where.raw) q.whereRaw(where.raw);
    else if (Object.keys(where).length) q.where(where);
    const { c } = await q.first();
    return Number(c);
  };

  const [operators, documents, pendingDiffs, approvedDiffs, approvedDiffsToday,
         rejectedDiffs, pendingSteps, emailsSent] = await Promise.all([
    count('operators'),
    count('documents'),
    db('diffs').whereIn('status', ['pending_workflow', 'in_approval']).count('* as c').first().then(r => Number(r.c)),
    db('diffs').where({ status: 'approved' }).count('* as c').first().then(r => Number(r.c)),
    db('diffs').where({ status: 'approved' }).whereRaw(db.helpers.whereToday('created_at')).count('* as c').first().then(r => Number(r.c)),
    db('diffs').where({ status: 'rejected' }).count('* as c').first().then(r => Number(r.c)),
    db('approval_steps').where({ status: 'pending' }).count('* as c').first().then(r => Number(r.c)),
    db('email_log').count('* as c').first().then(r => Number(r.c)),
  ]);

  res.json({ operators, documents, pendingDiffs, approvedDiffs, approvedDiffsToday, rejectedDiffs, pendingSteps, emailsSent });
});

router.get('/audit-log', requireRole('Admin', 'Auditor'), async (req, res) => {
  // LEFT JOIN with users to get the actual role — audit_log.actor stores the
  // username string but the table has no role column of its own.
  const rows = await db('audit_log as a')
    .select([
      'a.id', 'a.entity_type', 'a.entity_id', 'a.action',
      'a.actor', 'a.details', 'a.timestamp',
      'u.role as actor_role',
    ])
    .leftJoin('users as u', 'u.username', 'a.actor')
    .orderBy('a.timestamp', 'desc')
    .limit(200);
  res.json(rows);
});

router.get('/email-log', requireRole('Admin'), async (req, res) => {
  const rows = await db('email_log').orderBy('sent_at', 'desc').limit(100);
  res.json(rows);
});

router.get('/email-log/:id', requireRole('Admin'), async (req, res) => {
  const row = await db('email_log').where({ id: req.params.id }).first();
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.get('/pipeline', requireAuth, async (req, res) => {
  const rows = await db('documents as doc')
    .select([
      'doc.id as document_id', 'doc.title', 'doc.doc_type',
      'o.name as operator_name', 'o.country',
      'df.id as diff_id', 'df.status as diff_status',
      'df.total_changes', 'df.highest_severity',
      'df.created_at as diff_created_at',
    ])
    .join('operators as o', 'doc.operator_id', 'o.id')
    .leftJoin('diffs as df', function () {
      this.on('df.id', '=',
        db.raw('(SELECT id FROM diffs WHERE document_id = doc.id ORDER BY created_at DESC LIMIT 1)'));
    })
    .orderBy('df.created_at', 'desc');
  res.json(rows);
});

module.exports = router;
