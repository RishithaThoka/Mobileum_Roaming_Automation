const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const db = require('../db');
const { sendApprovalEmail } = require('./emailService');

const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'http://localhost:4021';

function createWorkflowForDiff(diffId) {
  const diffItems = db.prepare('SELECT * FROM diff_items WHERE diff_id = ?').all(diffId);
  if (diffItems.length === 0) return null;

  const categories = [...new Set(diffItems.map(i => i.category))];
  const routingRows = db.prepare('SELECT * FROM category_routing WHERE category IN (' + categories.map(() => '?').join(',') + ')').all(...categories);

  const routingByCategory = {};
  routingRows.forEach(r => { routingByCategory[r.category] = r; });

  // group categories by step_order so same-priority approvers run in parallel,
  // later steps wait until the earlier step_order group fully clears
  const stepOrders = [...new Set(routingRows.map(r => r.step_order))].sort((a, b) => a - b);

  const workflowId = uuid();
  db.prepare(`INSERT INTO approval_workflows (id, diff_id, status) VALUES (?, ?, 'in_progress')`).run(workflowId, diffId);

  const insertStep = db.prepare(`
    INSERT INTO approval_steps (id, workflow_id, step_order, category, role_title, approver_name, approver_email, status, token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createdSteps = [];
  for (const order of stepOrders) {
    const catsAtOrder = categories.filter(c => routingByCategory[c] && routingByCategory[c].step_order === order);
    for (const cat of catsAtOrder) {
      const routing = routingByCategory[cat];
      const stepId = uuid();
      const token = crypto.randomBytes(24).toString('hex');
      const status = order === stepOrders[0] ? 'pending' : 'waiting';
      insertStep.run(stepId, workflowId, order, cat, routing.role_title, routing.approver_name, routing.approver_email || '', status, token);
      createdSteps.push({ id: stepId, order, category: cat, role_title: routing.role_title, approver_email: routing.approver_email });
    }
  }

  db.prepare(`UPDATE diffs SET status = 'in_approval' WHERE id = ?`).run(diffId);
  logAudit('workflow', workflowId, 'created', 'system', `Workflow created with ${createdSteps.length} step(s) across categories: ${categories.join(', ')}`);

  // notify the first step-order group immediately
  notifyStepsAtStatus(workflowId, 'pending');

  return workflowId;
}

async function notifyStepsAtStatus(workflowId, status) {
  const steps = db.prepare(`SELECT * FROM approval_steps WHERE workflow_id = ? AND status = ?`).all(workflowId, status);
  const workflow = db.prepare(`SELECT * FROM approval_workflows WHERE id = ?`).get(workflowId);
  const diff = db.prepare(`SELECT * FROM diffs WHERE id = ?`).get(workflow.diff_id);
  const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(diff.document_id);
  const operator = db.prepare(`SELECT * FROM operators WHERE id = ?`).get(doc.operator_id);

  for (const step of steps) {
    if (!step.approver_email) continue; // no email configured yet for this role
    const itemsForCategory = db.prepare(`SELECT * FROM diff_items WHERE diff_id = ? AND category = ?`).all(diff.id, step.category);

    const approveUrl = `${PORTAL_BASE_URL}/#/approve/${step.token}`;
    const rejectUrl = `${PORTAL_BASE_URL}/#/approve/${step.token}`;
    const viewUrl = `${PORTAL_BASE_URL}/#/documents/${doc.id}/diffs/${diff.id}`;

    const result = await sendApprovalEmail({
      approvalStepId: step.id,
      toEmail: step.approver_email,
      approverName: step.approver_name,
      roleTitle: step.role_title,
      documentTitle: doc.title,
      operatorName: operator.name,
      docType: doc.doc_type,
      diffItems: itemsForCategory,
      approveUrl, rejectUrl, viewUrl,
    });

    db.prepare(`UPDATE approval_steps SET notified_at = datetime('now') WHERE id = ?`).run(step.id);
    const errorSuffix = result.error ? ` (Error: ${result.error})` : '';
    logAudit('approval_step', step.id, 'notified', 'system', `Email ${result.mode} to ${step.approver_email} for category ${step.category}${errorSuffix}`);
  }
}

function decideStep(token, action, comment) {
  const step = db.prepare(`SELECT * FROM approval_steps WHERE token = ?`).get(token);
  if (!step) return { error: 'Invalid or expired approval link.' };
  if (step.status === 'approved' || step.status === 'rejected') {
    return { error: 'This step has already been decided.', step };
  }

  if (action === 'clarification') {
    db.prepare(`UPDATE approval_steps SET comment = ? WHERE id = ?`).run(comment || null, step.id);
    logAudit('approval_step', step.id, 'clarification_requested', step.approver_email, comment || '');
    return { status: 'clarification_requested', step };
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  db.prepare(`UPDATE approval_steps SET status = ?, comment = ?, decided_at = datetime('now') WHERE id = ?`)
    .run(newStatus, comment || null, step.id);
  logAudit('approval_step', step.id, newStatus, step.approver_email, comment || '');

  const workflow = db.prepare(`SELECT * FROM approval_workflows WHERE id = ?`).get(step.workflow_id);

  if (newStatus === 'rejected') {
    db.prepare(`UPDATE approval_workflows SET status = 'rejected', completed_at = datetime('now') WHERE id = ?`).run(workflow.id);
    db.prepare(`UPDATE diffs SET status = 'rejected' WHERE id = ?`).run(workflow.diff_id);
    const diff = db.prepare(`SELECT * FROM diffs WHERE id = ?`).get(workflow.diff_id);
    if (diff) {
      db.prepare(`UPDATE document_versions SET approval_status = 'rejected' WHERE id = ?`).run(diff.to_version_id);
    }
    logAudit('workflow', workflow.id, 'rejected', step.approver_email, `Rejected at ${step.role_title} (${step.category}) step`);
    return { status: 'rejected', step };
  }

  // check if all steps at this order are done -> advance next order group
  const currentOrderSteps = db.prepare(`SELECT * FROM approval_steps WHERE workflow_id = ? AND step_order = ?`).all(step.workflow_id, step.step_order);
  const allDoneAtOrder = currentOrderSteps.every(s => s.status === 'approved');

  if (allDoneAtOrder) {
    const nextOrderRow = db.prepare(`
      SELECT MIN(step_order) as next_order FROM approval_steps WHERE workflow_id = ? AND step_order > ? AND status = 'waiting'
    `).get(step.workflow_id, step.step_order);

    if (nextOrderRow && nextOrderRow.next_order !== null) {
      db.prepare(`UPDATE approval_steps SET status = 'pending' WHERE workflow_id = ? AND step_order = ?`)
        .run(step.workflow_id, nextOrderRow.next_order);
      notifyStepsAtStatus(step.workflow_id, 'pending');
    } else {
      // no more steps -> workflow fully approved
      db.prepare(`UPDATE approval_workflows SET status = 'approved', completed_at = datetime('now') WHERE id = ?`).run(workflow.id);
      db.prepare(`UPDATE diffs SET status = 'approved' WHERE id = ?`).run(workflow.diff_id);

      const diff = db.prepare(`SELECT * FROM diffs WHERE id = ?`).get(workflow.diff_id);
      if (diff) {
        db.prepare(`UPDATE document_versions SET approval_status = 'approved', is_current_baseline = 1 WHERE id = ?`).run(diff.to_version_id);
        db.prepare(`UPDATE document_versions SET is_current_baseline = 0 WHERE document_id = ? AND id != ?`).run(diff.document_id, diff.to_version_id);
      }

      logAudit('workflow', workflow.id, 'approved', 'system', 'All approval steps cleared.');
    }
  }

  return { status: newStatus, step };
}

function logAudit(entityType, entityId, action, actor, details) {
  db.prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, actor, details) VALUES (?,?,?,?,?,?)`)
    .run(uuid(), entityType, entityId, action, actor, details);
}

module.exports = { createWorkflowForDiff, decideStep, notifyStepsAtStatus, logAudit };
