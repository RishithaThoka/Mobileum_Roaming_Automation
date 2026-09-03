'use strict';

const express = require('express');
const db = require('../db');
const workflowEngine = require('../services/workflowEngine');
const { requireAdmin } = require('./auth');
const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  const steps = await db('approval_steps as s')
    .select([
      's.*', 'w.diff_id',
      'doc.id as document_id', 'doc.title as document_title', 'doc.doc_type',
      'o.name as operator_name', 'o.country as operator_country',
    ])
    .join('approval_workflows as w', 's.workflow_id', 'w.id')
    .join('diffs as df', 'w.diff_id', 'df.id')
    .join('documents as doc', 'df.document_id', 'doc.id')
    .join('operators as o', 'doc.operator_id', 'o.id')
    .orderBy('s.notified_at', 'desc');
  res.json(steps);
});

router.get('/token/:token', async (req, res) => {
  try {
    const step = await db('approval_steps').where({ token: req.params.token }).first();
    if (!step) return res.status(404).json({ error: 'Step not found or invalid token' });

    const workflow  = await db('approval_workflows').where({ id: step.workflow_id }).first();
    const diff      = await db('diffs').where({ id: workflow.diff_id }).first();
    const document  = await db('documents').where({ id: diff.document_id }).first();
    const operator  = await db('operators').where({ id: document.operator_id }).first();
    const diffItems = await db('diff_items').where({ diff_id: diff.id, category: step.category });

    res.json({ step, workflow, diff, document, operator, diffItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Magic-link decision endpoint — reached from the email Approve/Reject buttons.
router.get('/:token/decide', async (req, res) => {
  const action = req.query.action === 'reject' ? 'reject' : 'approve';
  const result = await workflowEngine.decideStep(req.params.token, action, req.query.comment);

  if (result.error) {
    return res.status(400).send(renderPage('Link no longer valid', result.error, '#a12b1f'));
  }

  const message = action === 'approve'
    ? `You approved the ${result.step.category} changes for this document. Thank you.`
    : `You rejected the ${result.step.category} changes for this document. The workflow has been stopped and the admin has been notified.`;

  res.send(renderPage(action === 'approve' ? 'Approved' : 'Rejected', message, action === 'approve' ? '#1c7a4d' : '#a12b1f'));
});

// Admin UI decision endpoint
router.post('/:token/decide', async (req, res) => {
  const { action, comment } = req.body;
  const result = await workflowEngine.decideStep(req.params.token, action, comment);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true, step: result.step });
});

function renderPage(title, message, color) {
  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"><title>${title}</title></head>
  <body style="font-family:Segoe UI, Arial, sans-serif; background:#f4f1ea; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
    <div style="background:#fff; padding:40px 48px; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.08); max-width:480px; text-align:center;">
      <h2 style="color:${color}; margin-bottom:12px;">${title}</h2>
      <p style="color:#333; line-height:1.5;">${message}</p>
      <p style="color:#999; font-size:12px; margin-top:24px;">Roaming Document Control Center</p>
    </div>
  </body></html>`;
}

module.exports = router;
