'use strict';

const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const db = require('../db');
const { sendApprovalEmail } = require('./emailService');

const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'http://localhost:4021';

async function createWorkflowForDiff(diffId) {
  const diffItems = await db('diff_items').where({ diff_id: diffId });
  if (diffItems.length === 0) return null;

  const categories = [...new Set(diffItems.map(i => i.category))];
  const routingRows = categories.length
    ? await db('category_routing').whereIn('category', categories)
    : [];

  const routingByCategory = {};
  routingRows.forEach(r => { routingByCategory[r.category] = r; });

  const stepOrders = [...new Set(routingRows.map(r => r.step_order))].sort((a, b) => a - b);

  const workflowId = uuid();
  await db('approval_workflows').insert({ id: workflowId, diff_id: diffId, status: 'in_progress' });

  const createdSteps = [];
  for (const order of stepOrders) {
    const catsAtOrder = categories.filter(c => routingByCategory[c] && routingByCategory[c].step_order === order);
    for (const cat of catsAtOrder) {
      const routing = routingByCategory[cat];
      const stepId = uuid();
      const token  = crypto.randomBytes(24).toString('hex');
      const status = order === stepOrders[0] ? 'pending' : 'waiting';
      await db('approval_steps').insert({
        id: stepId, workflow_id: workflowId, step_order: order, category: cat,
        role_title: routing.role_title, approver_name: routing.approver_name,
        approver_email: routing.approver_email || '', status, token,
      });
      createdSteps.push({ id: stepId, order, category: cat, role_title: routing.role_title, approver_email: routing.approver_email });
    }
  }

  await db('diffs').where({ id: diffId }).update({ status: 'in_approval' });
  logAudit('workflow', workflowId, 'created', 'system',
    `Workflow created with ${createdSteps.length} step(s) across categories: ${categories.join(', ')}`);

  // Fire-and-forget: notify the first step-order group immediately
  notifyStepsAtStatus(workflowId, 'pending').catch(err =>
    console.error('[workflowEngine] notification error:', err.message));

  return workflowId;
}

async function notifyStepsAtStatus(workflowId, status) {
  const steps    = await db('approval_steps').where({ workflow_id: workflowId, status });
  const workflow = await db('approval_workflows').where({ id: workflowId }).first();
  const diff     = await db('diffs').where({ id: workflow.diff_id }).first();
  const doc      = await db('documents').where({ id: diff.document_id }).first();
  const operator = await db('operators').where({ id: doc.operator_id }).first();

  for (const step of steps) {
    if (!step.approver_email) continue;
    const itemsForCategory = await db('diff_items').where({ diff_id: diff.id, category: step.category });

    const approveUrl = `${PORTAL_BASE_URL}/#/approve/${step.token}`;
    const rejectUrl  = `${PORTAL_BASE_URL}/#/approve/${step.token}`;
    const viewUrl    = `${PORTAL_BASE_URL}/#/documents/${doc.id}/diffs/${diff.id}`;

    const result = await sendApprovalEmail({
      approvalStepId: step.id, toEmail: step.approver_email,
      approverName: step.approver_name, roleTitle: step.role_title,
      documentTitle: doc.title, operatorName: operator.name, docType: doc.doc_type,
      diffItems: itemsForCategory, approveUrl, rejectUrl, viewUrl,
    });

    await db('approval_steps').where({ id: step.id }).update({ notified_at: new Date().toISOString() });
    const errorSuffix = result.error ? ` (Error: ${result.error})` : '';
    logAudit('approval_step', step.id, 'notified', 'system',
      `Email ${result.mode} to ${step.approver_email} for category ${step.category}${errorSuffix}`);
  }
}

async function decideStep(token, action, comment) {
  const step = await db('approval_steps').where({ token }).first();
  if (!step) return { error: 'Invalid or expired approval link.' };
  if (step.status === 'approved' || step.status === 'rejected') {
    return { error: 'This step has already been decided.', step };
  }

  if (action === 'clarification') {
    await db('approval_steps').where({ id: step.id }).update({ comment: comment || null });
    logAudit('approval_step', step.id, 'clarification_requested', step.approver_email, comment || '');
    return { status: 'clarification_requested', step };
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  await db('approval_steps').where({ id: step.id }).update({
    status: newStatus,
    comment: comment || null,
    decided_at: new Date().toISOString(),
  });
  logAudit('approval_step', step.id, newStatus, step.approver_email, comment || '');

  const workflow = await db('approval_workflows').where({ id: step.workflow_id }).first();

  if (newStatus === 'rejected') {
    await db('approval_workflows').where({ id: workflow.id }).update({
      status: 'rejected', completed_at: new Date().toISOString(),
    });
    await db('diffs').where({ id: workflow.diff_id }).update({ status: 'rejected' });
    const diff = await db('diffs').where({ id: workflow.diff_id }).first();
    if (diff) {
      await db('document_versions').where({ id: diff.to_version_id }).update({ approval_status: 'rejected' });
      // Explicitly mark the document's workflow state as rejected so the UI
      // can show this without inferring it from diff.status.
      await db('document_workflow_state')
        .where({ document_id: diff.document_id })
        .update({ stage_status: 'rejected', updated_at: new Date().toISOString() });
    }
    logAudit('workflow', workflow.id, 'rejected', step.approver_email,
      `Rejected at ${step.role_title} (${step.category}) step`);
    return { status: 'rejected', step };
  }

  // Check if all steps at this order are done → advance next order group
  const currentOrderSteps = await db('approval_steps')
    .where({ workflow_id: step.workflow_id, step_order: step.step_order });
  // Re-fetch this step to get its latest status after the update
  const updatedStep = await db('approval_steps').where({ id: step.id }).first();
  const stepsWithLatest = currentOrderSteps.map(s => s.id === updatedStep.id ? updatedStep : s);
  const allDoneAtOrder = stepsWithLatest.every(s => s.status === 'approved');

  if (allDoneAtOrder) {
    const nextOrderRow = await db('approval_steps')
      .where({ workflow_id: step.workflow_id, status: 'waiting' })
      .where('step_order', '>', step.step_order)
      .min('step_order as next_order')
      .first();

    if (nextOrderRow && nextOrderRow.next_order !== null) {
      await db('approval_steps')
        .where({ workflow_id: step.workflow_id, step_order: nextOrderRow.next_order })
        .update({ status: 'pending' });
      notifyStepsAtStatus(step.workflow_id, 'pending').catch(err =>
        console.error('[workflowEngine] notification error:', err.message));
    } else {
      // No more steps → workflow fully approved
      await db('approval_workflows').where({ id: workflow.id }).update({
        status: 'approved', completed_at: new Date().toISOString(),
      });
      await db('diffs').where({ id: workflow.diff_id }).update({ status: 'approved' });
      const diff = await db('diffs').where({ id: workflow.diff_id }).first();
      if (diff) {
        await db('document_versions').where({ id: diff.to_version_id }).update({
          approval_status: 'approved', is_current_baseline: 1,
        });
        await db('document_versions')
          .where({ document_id: diff.document_id })
          .whereNot({ id: diff.to_version_id })
          .update({ is_current_baseline: 0 });
        // Explicitly transition the document workflow state to 'approved' at the
        // moment all approval steps clear.  The advance endpoint then moves it
        // onward to 'deploying' — but this intermediate state must exist so Step 6
        // in the UI can show a real 'approved' fact rather than inferring it from
        // 'deploying'/'deployed'.
        await db('document_workflow_state')
          .where({ document_id: diff.document_id })
          .update({ stage_status: 'approved', updated_at: new Date().toISOString() });
      }
      logAudit('workflow', workflow.id, 'approved', 'system', 'All approval steps cleared.');
    }
  }

  return { status: newStatus, step };
}

// ─── Shared workflow-state utilities ──────────────────────────────────────────

/**
 * Ensures a document_workflow_state row exists for the given document.
 * Returns the (possibly pre-existing) row.
 *
 * Race-safe: uses INSERT … ON CONFLICT IGNORE backed by a UNIQUE index on
 * document_id (added in migration 003), so concurrent callers never produce
 * duplicate rows.
 */
async function ensureWorkflowState(docId) {
  await db('document_workflow_state')
    .insert({
      id: 'wf_' + Date.now(),
      document_id: docId,
      current_screen: 1,
      stage_status: 'running',
      updated_at: new Date().toISOString(),
    })
    .onConflict('document_id')
    .ignore();
  return db('document_workflow_state').where({ document_id: docId }).first();
}

/**
 * Persist (upsert) the status of a single workflow sub-stage.
 *
 * @param {string} documentId – the document this sub-stage belongs to
 * @param {string} substageId – one of: extraction, comparison, diff, risk
 * @param {string} status     – pending | complete | failed | not_applicable
 * @param {object} [opts]
 * @param {string} [opts.completedAt] – ISO timestamp (defaults to NOW when status=complete)
 * @param {string} [opts.error]       – error message (when status=failed)
 * @param {string} [opts.reason]      – explanation  (when status=not_applicable)
 *
 * Swallows its own DB errors so that sub-stage tracking never blocks
 * the primary ingestion path.
 */
async function writeSubstage(documentId, substageId, status, opts = {}) {
  try {
    const row = {
      id: `${documentId}_${substageId}`,
      document_id: documentId,
      substage_id: substageId,
      status,
      completed_at: opts.completedAt || (status === 'complete' ? new Date().toISOString() : null),
      error_message: opts.error || null,
      reason: opts.reason || null,
    };
    await db('document_workflow_substages')
      .insert(row)
      .onConflict(['document_id', 'substage_id'])
      .merge();
  } catch (err) {
    console.error(`[writeSubstage] Failed to write ${substageId}=${status} for doc ${documentId}: ${err.message}`);
  }
}

// Fire-and-forget audit log writer. Callers do not await this.
function logAudit(entityType, entityId, action, actor, details) {
  db('audit_log').insert({
    id: uuid(), entity_type: entityType, entity_id: entityId,
    action, actor, details,
  }).catch(err => console.error('[audit_log] write error:', err.message));
}

module.exports = {
  createWorkflowForDiff, decideStep, notifyStepsAtStatus, logAudit,
  ensureWorkflowState, writeSubstage,
};
