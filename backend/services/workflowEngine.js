'use strict';

const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const db = require('../db');
const { sendApprovalEmail } = require('./emailService');

const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'http://localhost:4021';

/**
 * Load the approval_policy row for a given applies_to key.
 * Returns { enabled: bool } — defaults to false if the row is missing.
 */
async function loadPolicy(appliesTo) {
  const row = await db('approval_policy').where({ applies_to: appliesTo }).first().catch(() => null);
  return { enabled: row ? row.enabled === 1 : false };
}

/**
 * Look up active Approver accounts for a given domain, EXCLUDING one user.
 * Returns array of user rows (may be empty).
 */
async function otherApproversForDomain(domain, excludeUserId) {
  const all = await db('users')
    .where({ role: 'Approver', status: 'active' });
  return all.filter(u => {
    const domains = JSON.parse(u.approved_domains || '[]');
    return domains.includes(domain) && u.id !== excludeUserId;
  });
}

/**
 * Look up all active Admin accounts EXCLUDING one user.
 */
async function otherAdmins(excludeUserId) {
  return db('users')
    .where({ role: 'Admin', status: 'active' })
    .whereNot({ id: excludeUserId });
}

async function createWorkflowForDiff(diffId) {
  const diff      = await db('diffs').where({ id: diffId }).first();
  const diffItems = await db('diff_items').where({ diff_id: diffId });
  if (diffItems.length === 0) return null;

  const editorUserId = diff ? diff.editor_user_id : null;

  // ── Policy: auto-tier Admin step ──────────────────────────────────────────
  const autoPolicy = await loadPolicy('auto_tier_admin_step');
  const hasAutoField = diffItems.some(i => i.owner_source === 'auto');
  const needsAutoAdminStep = autoPolicy.enabled && hasAutoField;

  // ── Self-approval guard for auto-tier Admin step ──────────────────────────
  // If the editor is an Admin AND the extra Admin step is needed, check that
  // at least one OTHER Admin can act on it. If not, refuse at submit time.
  if (needsAutoAdminStep && editorUserId) {
    const editorRow = await db('users').where({ id: editorUserId }).first();
    if (editorRow && editorRow.role === 'Admin') {
      const others = await otherAdmins(editorUserId);
      if (others.length === 0) {
        // No other Admin exists — the auto-tier step would be unapprovable.
        throw Object.assign(
          new Error(
            'Self-approval conflict: the auto-tier Admin review step cannot be created ' +
            'because the submitting account is the only active Admin. ' +
            'Add a second Admin account or disable the auto_tier_admin_step policy.'
          ),
          { code: 'SELF_APPROVAL_ONLY_ADMIN' }
        );
      }
    }
  }

  // ── Collect domain categories from diff_items ─────────────────────────────
  const categories = [...new Set(diffItems.map(i => i.category))];
  const routingRows = categories.length
    ? await db('category_routing').whereIn('category', categories)
    : [];

  const routingByCategory = {};
  routingRows.forEach(r => { routingByCategory[r.category] = r; });

  // Normal step orders from category_routing (domain steps)
  const domainStepOrders = [...new Set(routingRows.map(r => r.step_order))].sort((a, b) => a - b);

  // If we are injecting an Admin step at order=0, domain steps shift to start at 1.
  // category_routing.step_order values might already be 0; to guarantee the
  // Admin step is FIRST, we push domain steps to (their existing order + 1)
  // only when the lowest existing order would collide with 0.
  let domainOrderOffset = 0;
  if (needsAutoAdminStep && domainStepOrders.length > 0 && domainStepOrders[0] <= 0) {
    domainOrderOffset = 1;
  }

  const workflowId = uuid();
  await db('approval_workflows').insert({ id: workflowId, diff_id: diffId, status: 'in_progress' });

  const createdSteps = [];
  const now = new Date().toISOString();

  // ── Step 0: Auto-tier Admin review (if policy enabled + any auto field) ───
  if (needsAutoAdminStep) {
    const stepId = uuid();
    const token  = crypto.randomBytes(24).toString('hex');
    // Self-approval note for this step
    let selfNote = null;
    if (editorUserId) {
      const editorRow = await db('users').where({ id: editorUserId }).first();
      if (editorRow && editorRow.role === 'Admin') {
        selfNote = `Self-approval prevented: editor (${editorRow.username}) is an Admin. ` +
                   `Another Admin must approve this step.`;
      }
    }
    await db('approval_steps').insert({
      id: stepId, workflow_id: workflowId, step_order: 0,
      category: 'Admin Review',
      role_title: 'Admin',
      approver_name: null, approver_email: '',
      status: 'pending', token,
      self_approval_excluded_user_id: editorUserId || null,
      routing_note: selfNote,
    });
    createdSteps.push({ id: stepId, order: 0, category: 'Admin Review', role_title: 'Admin' });
  }

  // ── Domain approver steps (with self-approval routing) ────────────────────
  const firstDomainOrder = needsAutoAdminStep
    ? (domainStepOrders.length > 0 ? domainStepOrders[0] + domainOrderOffset : 1)
    : (domainStepOrders.length > 0 ? domainStepOrders[0] : null);

  for (const order of domainStepOrders) {
    const effectiveOrder = order + domainOrderOffset;
    const catsAtOrder = categories.filter(
      c => routingByCategory[c] && routingByCategory[c].step_order === order
    );
    for (const cat of catsAtOrder) {
      const routing = routingByCategory[cat];
      const stepId  = uuid();
      const token   = crypto.randomBytes(24).toString('hex');
      const isFirst = effectiveOrder === firstDomainOrder && !needsAutoAdminStep;
      const status  = isFirst ? 'pending' : 'waiting';

      // Self-approval routing for domain step
      let routingNote = null;
      let resolvedCategory   = cat;
      let resolvedRoleTitle  = routing.role_title;
      let resolvedEmail      = routing.approver_email || '';
      let resolvedName       = routing.approver_name;
      let excludedUserId     = editorUserId || null;

      if (editorUserId) {
        // Check whether the editor is an approver for this domain
        const editorRow = await db('users').where({ id: editorUserId }).first();
        const editorDomains = editorRow ? JSON.parse(editorRow.approved_domains || '[]') : [];
        const editorIsApproverForDomain = editorRow &&
          editorRow.role === 'Approver' && editorDomains.includes(cat);

        if (editorIsApproverForDomain) {
          const others = await otherApproversForDomain(cat, editorUserId);
          if (others.length === 0) {
            // No other approver for this domain — route to Admin
            resolvedCategory  = cat; // keep category for tracking
            resolvedRoleTitle = 'Admin';
            resolvedEmail     = '';
            resolvedName      = null;
            routingNote = `Self-approval conflict: no other approver account for "${cat}". ` +
                          `Step routed to Admin.`;
            logAudit('approval_step', stepId, 'self_approval_rerouted', 'system', routingNote);
          }
          // else: other approvers exist — step stays as domain role, editor excluded via
          // self_approval_excluded_user_id (enforced on the decide endpoint)
        }
      }

      // Domain steps are 'waiting' when the auto-tier Admin step is first
      const finalStatus = needsAutoAdminStep ? 'waiting'
        : (effectiveOrder === firstDomainOrder ? 'pending' : 'waiting');

      await db('approval_steps').insert({
        id: stepId, workflow_id: workflowId,
        step_order: effectiveOrder,
        category: resolvedCategory,
        role_title: resolvedRoleTitle,
        approver_name: resolvedName,
        approver_email: resolvedEmail,
        status: finalStatus, token,
        self_approval_excluded_user_id: excludedUserId,
        routing_note: routingNote,
      });
      createdSteps.push({
        id: stepId, order: effectiveOrder, category: cat,
        role_title: resolvedRoleTitle, approver_email: resolvedEmail,
      });
    }
  }

  await db('diffs').where({ id: diffId }).update({ status: 'in_approval' });
  logAudit('workflow', workflowId, 'created', 'system',
    `Workflow created with ${createdSteps.length} step(s) across categories: ${categories.join(', ')}` +
    (needsAutoAdminStep ? ' [auto-tier Admin step at order=0]' : ''));

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

async function decideStep(token, action, comment, actorUser = null) {
  const step = await db('approval_steps').where({ token }).first();
  if (!step) return { error: 'Invalid or expired approval link.' };
  if (step.status === 'approved' || step.status === 'rejected') {
    return { error: 'This step has already been decided.', step };
  }

  // ── Workflow terminal state guard ──────────────────────────────────────────
  // Fetch the workflow BEFORE any write so we can check its terminal status.
  //
  // This closes the rejection-cascade gap: when step 0 is rejected, the cascade
  // marks approval_workflows.status = 'rejected' but leaves step 1 untouched
  // (status still 'waiting', token still valid).  The sequencing guard alone
  // would miss this because step 0 is now 'rejected', not 'pending'/'waiting',
  // so it wouldn't appear in the blocking-step query.
  //
  // By checking the workflow status here (before the sequencing guard and before
  // any write), we also cover:
  //   • 'approved'   — all steps cleared; late token replay after workflow finishes
  //   • 'cancelled'  — force-release; diff superseded; no further decisions valid
  //
  // Clarification is exempt: it only writes a comment, no state change.
  const workflow = await db('approval_workflows').where({ id: step.workflow_id }).first();
  if (!workflow) {
    return { error: 'Workflow not found for this approval step.' };
  }
  const TERMINAL = ['rejected', 'approved', 'cancelled'];
  if (action !== 'clarification' && TERMINAL.includes(workflow.status)) {
    logAudit(
      'approval_step', step.id, 'terminal_workflow_rejected', token,
      `Attempt to decide step (order ${step.step_order}) on workflow ${workflow.id} ` +
      `blocked — workflow is already "${workflow.status}".`
    );
    return {
      error: `This workflow has already been ${workflow.status}. No further decisions can be made.`,
      code: 'WORKFLOW_TERMINAL',
      workflow_status: workflow.status,
    };
  }

  // ── Sequencing guard ───────────────────────────────────────────────────────
  // Reject approve/reject actions on any step if an earlier-order step in the
  // same workflow is still pending or waiting.  Clarification (informational
  // only, no state change) is exempt.
  //
  // This check lives here — in the engine — so it applies identically to both
  // the POST /decide API path (used by Admin via the portal) and the GET email
  // magic-link path used by domain approvers.  Neither route can bypass it.
  if (action !== 'clarification') {
    const blockingStep = await db('approval_steps')
      .where({ workflow_id: step.workflow_id })
      .where('step_order', '<', step.step_order)
      .whereIn('status', ['pending', 'waiting'])
      .orderBy('step_order', 'asc')
      .first();

    if (blockingStep) {
      // Log the attempt so it's visible in the audit trail without writing any state.
      logAudit(
        'approval_step', step.id, 'out_of_sequence_rejected', token,
        `Attempt to decide step at order ${step.step_order} blocked by step at order ` +
        `${blockingStep.step_order} (${blockingStep.role_title} / ${blockingStep.category}) ` +
        `which is still "${blockingStep.status}".`
      );
      return {
        error: `Out-of-sequence decision rejected. ` +
               `Step "${blockingStep.role_title} — ${blockingStep.category}" ` +
               `(order ${blockingStep.step_order}) must be completed before this step ` +
               `(order ${step.step_order}) can be decided.`,
        code: 'OUT_OF_SEQUENCE',
        blocking_step: {
          id: blockingStep.id,
          step_order: blockingStep.step_order,
          role_title: blockingStep.role_title,
          category: blockingStep.category,
          status: blockingStep.status,
        },
      };
    }
  }

  if (action === 'clarification') {
    await db('approval_steps').where({ id: step.id }).update({ comment: comment || null });
    logAudit('approval_step', step.id, 'clarification_requested', step.approver_email, comment || '');
    return { status: 'clarification_requested', step };
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  // Capture the real authenticated actor (decided_by_*), separate from the
  // step's assignment (approver_name / approver_email).
  const decidedByUserId = actorUser ? actorUser.user_id : null;
  const decidedByName   = actorUser ? actorUser.full_name || actorUser.username : null;
  const decidedByEmail  = actorUser ? actorUser.username : null;

  await db('approval_steps').where({ id: step.id }).update({
    status: newStatus,
    comment: comment || null,
    decided_at: new Date().toISOString(),
    decided_by_user_id: decidedByUserId,
    decided_by_name:    decidedByName,
    decided_by_email:   decidedByEmail,
  });
  // Log the actual decision-maker's email in the audit trail, not the assignment email.
  const auditActor = decidedByEmail || step.approver_email;
  logAudit('approval_step', step.id, newStatus, auditActor, comment || '');

  // workflow already fetched above — reuse it (no second DB round-trip)

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

    // Release edit lock on rejection so the document can be re-edited
    await db('document_edit_locks').where({ document_id: diff.document_id }).del();

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
      // NOTE: Lock is NOT released on approval. It stays until deployment
      // finishes (steps 7-10) or the workflow is rolled back.
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
  ensureWorkflowState, writeSubstage, loadPolicy,
};

