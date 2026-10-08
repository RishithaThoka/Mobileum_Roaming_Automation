'use strict';

const express = require('express');
const db = require('../db');
const workflowEngine = require('../services/workflowEngine');
const { requireRole, requireAuth } = require('./auth');
const router = express.Router();

// ─── Helper: check domain + self-approval authorization ─────────────────────
function checkDomainAuth(user, step) {
  // Session stores user_id (not id). Use user.user_id for identity checks.
  const actingUserId = user.user_id;

  // Self-approval prevention: if this step excludes the acting user, deny.
  if (step.self_approval_excluded_user_id && step.self_approval_excluded_user_id === actingUserId) {
    return {
      status: 403,
      error: `Self-approval is not permitted. You submitted this diff and cannot approve ` +
             `your own change. Please have another ${step.role_title} review this step.`,
    };
  }

  const stepCategory = step.category;
  if (user.role === 'Admin') return null; // Admin can approve any domain (unless self-approval blocked above)
  if (user.role !== 'Approver') {
    return { status: 403, error: 'Forbidden — only Admin or Approver roles can approve' };
  }
  const userDomains = JSON.parse(user.approved_domains || '[]');
  // For steps re-routed to Admin (routing_note set, role_title = 'Admin'), only Admin can act.
  if (step.role_title === 'Admin') {
    return {
      status: 403,
      error: `This step has been routed to Admin for review. ` +
             (step.routing_note ? `Reason: ${step.routing_note}` : 'Contact your administrator.'),
    };
  }
  if (!userDomains.includes(stepCategory)) {
    return {
      status: 403,
      error: `Your account is not authorized to approve ${stepCategory} steps. Your domain(s): ${userDomains.join(', ') || 'none'}`,
    };
  }
  return null; // authorized
}

// ─── GET / — List all approval steps (Admin + Approver) ─────────────────────
router.get('/', requireRole('Admin', 'Approver'), async (req, res) => {
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
    // Exclude terminal non-actionable workflows:
    //   cancelled  → from force-release (diff superseded, lock released)
    //   rejected   → a step was rejected, workflow is closed, nothing to act on
    // Keep 'approved' — those render as green completed cards and confirm sign-off.
    // Keep 'in_progress' — the only actionable state.
    .whereIn('w.status', ['in_progress', 'approved'])
    .whereNot('df.status', 'superseded')
    .orderBy('s.step_order', 'asc')
    .orderBy('s.notified_at', 'desc');
  res.json(steps);
});

// ─── GET /rejected — List all rejected workflows with full step history ──────
router.get('/rejected', requireRole('Admin', 'Approver'), async (req, res) => {
  try {
    // Fetch all rejected workflows with document/operator context
    const workflows = await db('approval_workflows as w')
      .select([
        'w.id as workflow_id', 'w.status as workflow_status',
        'w.created_at as workflow_created_at', 'w.completed_at as workflow_completed_at',
        'w.diff_id',
        'doc.id as document_id', 'doc.title as document_title', 'doc.doc_type',
        'o.name as operator_name', 'o.country as operator_country',
        'df.total_changes', 'df.highest_severity', 'df.created_at as diff_created_at',
        'df.from_version_id', 'df.to_version_id',
      ])
      .join('diffs as df', 'w.diff_id', 'df.id')
      .join('documents as doc', 'df.document_id', 'doc.id')
      .join('operators as o', 'doc.operator_id', 'o.id')
      .where('w.status', 'rejected')
      .orderBy('w.completed_at', 'desc');

    // For each rejected workflow, fetch all steps (full history) and diff items
    const results = await Promise.all(workflows.map(async (wf) => {
      // All steps in this workflow, ordered — so we see the full decision trail
      const steps = await db('approval_steps')
        .where({ workflow_id: wf.workflow_id })
        .orderBy('step_order', 'asc');

      // Diff items for the change summary
      const diffItems = await db('diff_items')
        .where({ diff_id: wf.diff_id })
        .select(['field_path', 'category', 'change_type', 'old_value', 'new_value', 'severity', 'domain']);

      return {
        workflowId: wf.workflow_id,
        workflowCreatedAt: wf.workflow_created_at,
        workflowCompletedAt: wf.workflow_completed_at,
        diffId: wf.diff_id,
        documentId: wf.document_id,
        documentTitle: wf.document_title,
        docType: wf.doc_type,
        operatorName: wf.operator_name,
        operatorCountry: wf.operator_country,
        totalChanges: wf.total_changes,
        highestSeverity: wf.highest_severity,
        diffCreatedAt: wf.diff_created_at,
        steps: steps.map(s => ({
          id: s.id,
          stepOrder: s.step_order,
          category: s.category,
          roleTitle: s.role_title,
          // Assignment fields (who was originally routed)
          assignedName: s.approver_name,
          assignedEmail: s.approver_email,
          // Decision fields (who actually clicked the button — real identity)
          decidedByUserId: s.decided_by_user_id,
          decidedByName:   s.decided_by_name,
          decidedByEmail:  s.decided_by_email,
          status: s.status,
          comment: s.comment,
          decidedAt: s.decided_at,
          notifiedAt: s.notified_at,
          routingNote: s.routing_note,
        })),
        diffItems,
      };
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /token/:token — View pending approval detail (requires auth) ───────
router.get('/token/:token', requireRole('Admin', 'Approver'), async (req, res) => {
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

// ─── GET /:token/decide — Email magic-link page (requires auth + domain) ────
router.get('/:token/decide', requireRole('Admin', 'Approver'), async (req, res) => {
  // Look up the step to check domain authorization before acting
  const step = await db('approval_steps').where({ token: req.params.token }).first();
  if (!step) {
    return res.status(400).send(renderPage('Link no longer valid', 'This approval token is invalid or expired.', '#a12b1f'));
  }

  const domainErr = checkDomainAuth(req.user, step);
  if (domainErr) {
    return res.status(403).send(renderPage(
      'Access Denied',
      `Your account (${req.user.username}) cannot act on this step. ` +
      domainErr.error,
      '#a12b1f'
    ));
  }

  const action = req.query.action === 'reject' ? 'reject' : 'approve';
  const result = await workflowEngine.decideStep(req.params.token, action, req.query.comment, req.user);

  if (result.error) {
    return res.status(400).send(renderPage('Link no longer valid', result.error, '#a12b1f'));
  }

  const message = action === 'approve'
    ? `You approved the ${result.step.category} changes for this document. Thank you.`
    : `You rejected the ${result.step.category} changes for this document. The workflow has been stopped and the admin has been notified.`;

  res.send(renderPage(action === 'approve' ? 'Approved' : 'Rejected', message, action === 'approve' ? '#1c7a4d' : '#a12b1f'));
});

// ─── POST /:token/decide — API decision endpoint (requires auth + domain) ───
router.post('/:token/decide', requireRole('Admin', 'Approver'), async (req, res) => {
  // Look up step from DB to verify domain authorization (never trust body for auth)
  const step = await db('approval_steps').where({ token: req.params.token }).first();
  if (!step) return res.status(404).json({ error: 'Step not found or invalid token' });

  const domainErr = checkDomainAuth(req.user, step);
  if (domainErr) return res.status(domainErr.status).json({ error: domainErr.error });

  const { action, comment } = req.body;
  const result = await workflowEngine.decideStep(req.params.token, action, comment, req.user);
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


// ─── POST /admin/phase1-setup — Apply migration + seed override [TEMP] ────────
// Applies migration 014 (decided_by columns) to the live DB and seeds one
// Admin override on an existing approved step so the ⚡ flag fires in the modal.
// Admin-only. Remove this endpoint once Phase 1 verification is complete.
router.post('/admin/phase1-setup', requireRole('Admin'), async (req, res) => {
  const steps_log = [];

  try {
    // Step 1: Apply migration 014
    try {
      const cols = await db.raw("PRAGMA table_info(approval_steps)");
      const names = cols.map(c => c.name);
      if (names.includes('decided_by_email')) {
        steps_log.push({ step: 'migration_014', status: 'already_applied', detail: 'decided_by_* columns already exist' });
      } else {
        await db.schema.table('approval_steps', t => {
          t.string('decided_by_user_id').nullable();
          t.string('decided_by_name').nullable();
          t.string('decided_by_email').nullable();
        });
        steps_log.push({ step: 'migration_014', status: 'applied', detail: 'Added decided_by_user_id, decided_by_name, decided_by_email' });
      }
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('already exists')) {
        steps_log.push({ step: 'migration_014', status: 'already_applied', detail: e.message });
      } else {
        throw e;
      }
    }

    // Step 2: Seed Admin override on an approved step where approver_email != admin
    const adminEmail = req.user.username;
    const adminName  = req.user.full_name || req.user.username;
    const adminId    = String(req.user.user_id);

    // Find the first approved step whose approver_email differs from admin's
    const targetStep = await db('approval_steps')
      .where('status', 'approved')
      .whereNot('approver_email', adminEmail)
      .whereNull('decided_by_email')   // only seed steps that don't yet have decided_by
      .orderBy('id', 'asc')
      .first();

    if (targetStep) {
      await db('approval_steps').where({ id: targetStep.id }).update({
        decided_by_user_id: adminId,
        decided_by_name:    `${adminName} (Admin Override)`,
        decided_by_email:   adminEmail,
      });
      steps_log.push({
        step: 'override_seed',
        status: 'seeded',
        detail: `Step ${targetStep.id} (${targetStep.category}) — assigned to "${targetStep.approver_email}", decided_by set to "${adminEmail}" → ⚡ Override flag will fire`,
        step_id: targetStep.id,
        assigned_email: targetStep.approver_email,
        decided_by_email: adminEmail,
        workflow_id: targetStep.workflow_id,
      });
    } else {
      // All steps already have decided_by or none are approved yet — update any approved step
      const anyApproved = await db('approval_steps')
        .where('status', 'approved')
        .whereNot('approver_email', adminEmail)
        .orderBy('id', 'asc')
        .first();
      if (anyApproved) {
        await db('approval_steps').where({ id: anyApproved.id }).update({
          decided_by_user_id: adminId,
          decided_by_name:    `${adminName} (Admin Override)`,
          decided_by_email:   adminEmail,
        });
        steps_log.push({
          step: 'override_seed',
          status: 'updated',
          detail: `Updated step ${anyApproved.id} (${anyApproved.category}) with admin decided_by`,
          step_id: anyApproved.id,
          assigned_email: anyApproved.approver_email,
          decided_by_email: adminEmail,
        });
      } else {
        steps_log.push({ step: 'override_seed', status: 'skipped', detail: 'No approved steps found with non-admin approver_email' });
      }
    }

    res.json({ success: true, steps: steps_log });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, steps: steps_log });
  }
});

module.exports = router;

