'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { v4: uuid } = require('uuid');
const { ensureWorkflowState } = require('../services/workflowEngine');
const { requireRole, requireAuth } = require('./auth');

router.get('/rollback-queue', requireAuth, async (req, res) => {
  try {
    // Only include versions that are actually eligible rollback targets —
    // matches the exact rules enforced by POST /rollback/:versionId.
    //
    // Eligible = one of:
    //   a) The version has a linked diff (diffs.to_version_id = v.id) with
    //      status = 'deployed'  →  fully approved and pushed to the network.
    //   b) The version has NO linked diff AND approval_status = 'approved'
    //      →  initial ingest version, never went through a diff cycle.
    const rows = await db('document_versions as v')
      .select([
        'v.id as version_id', 'v.version_number', 'v.original_filename',
        'v.uploaded_at', 'v.is_current_baseline', 'v.approval_status',
        'd.id as doc_id', 'd.title as doc_title', 'd.doc_type',
        'op.name as operator_name', 'op.country as operator_country',
        'op.network_code as mcc_mnc',
        db.raw(`(SELECT status FROM diffs WHERE to_version_id = v.id LIMIT 1) as linked_diff_status`),
      ])
      .join('documents as d', 'v.document_id', 'd.id')
      .join('operators as op', 'd.operator_id', 'op.id')
      .orderBy('v.uploaded_at', 'desc');

    // Filter to eligible versions only
    const eligible = rows.filter(r => {
      if (r.linked_diff_status) {
        return r.linked_diff_status === 'deployed';
      }
      // No linked diff — only allow if initial-ingest approved version
      return r.approval_status === 'approved';
    });

    const mapped = eligible.map(r => ({
      id: r.version_id,
      versionNumber: `v${r.version_number}`,
      previousVersion: r.version_number > 1 ? `v${r.version_number - 1}` : 'N/A',
      operator: r.operator_name,
      mccMnc: r.mcc_mnc || '420/01',
      timestamp: r.uploaded_at ? r.uploaded_at.replace('T', ' ').slice(0, 16) : 'Unknown',
      author: 'Ingestion Service',
      comment: `Ingested configuration file ${r.original_filename}`,
      activeConfiguration: `Baseline configuration for ${r.operator_name} (${r.doc_type})`,
      rollbackRisk: r.version_number > 1 ? 'Moderate' : 'Safe',
      status: r.is_current_baseline === 1 ? 'Active Baseline' : 'Archived Baseline',
      eligible: true,
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/rollback/:versionId', requireRole('Admin'), async (req, res) => {
  try {
    const version = await db('document_versions').where({ id: req.params.versionId }).first();
    if (!version) return res.status(404).json({ error: 'Version not found' });

    const docId = version.document_id;

    // ── Deploying-state guard ─────────────────────────────────────────────────
    // If stage_status = 'deploying', refuse to avoid half-applied simulated_network_state.
    const wfState = await db('document_workflow_state').where({ document_id: docId }).first();
    if (wfState && wfState.stage_status === 'deploying') {
      return res.status(409).json({
        error: 'Cannot rollback while deployment is in progress. Wait for deployment to complete (deployed or failed) then retry.',
        stage_status: 'deploying',
      });
    }

    // ── Deployed-baseline guard (A2) ──────────────────────────────────────────
    // Rollback is allowed only to a version that was previously an approved,
    // deployed baseline.
    //
    // How we identify eligible versions:
    //   a) Version has a linked diff (diffs.to_version_id = version.id) with
    //      status = 'deployed'  →  the diff was fully deployed, version is safe.
    //   b) Version has NO linked diff AND approval_status = 'approved'
    //      →  initial ingest version (uploaded directly, never went through a diff);
    //      these are always valid rollback targets.
    //
    // All other cases (diff status = pending_workflow, in_approval, rejected,
    // superseded, or no diff but approval_status ≠ approved) are refused.
    const linkedDiff = await db('diffs')
      .where({ to_version_id: version.id })
      .first();

    if (linkedDiff) {
      if (linkedDiff.status !== 'deployed') {
        return res.status(409).json({
          error: `Cannot rollback to this version: its diff has status "${linkedDiff.status}". Only versions from deployed diffs can be used as rollback targets.`,
          diff_id: linkedDiff.id,
          diff_status: linkedDiff.status,
        });
      }
    } else {
      // No diff — only allow if this was an initial approved ingest version
      if (version.approval_status !== 'approved') {
        return res.status(409).json({
          error: 'Cannot rollback to this version: it has no associated deployed diff and was never approved.',
          approval_status: version.approval_status,
        });
      }
    }

    // NOTE: all queries below are scoped to docId — this handler never touches
    // diffs, versions, locks, or workflows of any other document.

    await db.transaction(async trx => {

      await trx('document_versions').where({ id: version.id }).update({ is_current_baseline: 1 });
      await trx('document_versions')
        .where({ document_id: docId })
        .whereNot({ id: version.id })
        .update({ is_current_baseline: 0 });

      // ── Revert simulated_network_state using the latest diff's old values ──
      const diff = await trx('diffs').where({ document_id: docId }).orderBy('created_at', 'desc').first();
      let fieldsReverted = 0;
      if (diff) {
        const diffItems = await trx('diff_items').where({ diff_id: diff.id });
        for (const item of diffItems) {
          if (item.change_type === 'added') {
            // Field didn't exist before — remove it
            await trx('simulated_network_state')
              .where({ document_id: docId, field_path: item.field_path })
              .del();
            fieldsReverted++;
          } else if (item.change_type === 'removed') {
            // Field existed before — restore with old_value
            await trx('simulated_network_state')
              .insert({
                id: uuid(),
                document_id: docId,
                field_path: item.field_path,
                current_value: item.old_value,
                applied_by_diff_id: null,
                updated_at: new Date().toISOString(),
              })
              .onConflict(['document_id', 'field_path'])
              .merge({
                current_value: item.old_value,
                applied_by_diff_id: null,
                updated_at: new Date().toISOString(),
              });
            fieldsReverted++;
          } else if (item.change_type === 'modified') {
            // Field was changed — revert to old_value
            await trx('simulated_network_state')
              .where({ document_id: docId, field_path: item.field_path })
              .update({
                current_value: item.old_value,
                applied_by_diff_id: null,
                updated_at: new Date().toISOString(),
              });
            fieldsReverted++;
          }
        }

        // Log rollback in deployment_log
        await trx('deployment_log').insert({
          id: `dep_rollback_${Date.now()}`,
          document_id: docId,
          system: 'Rollback',
          scope: `Reverted ${fieldsReverted} fields to pre-deployment values (diff ${diff.id.slice(0, 8)})`,
          order_executed: 0,
          pass_fail: 'pass',
          rollback_triggered: 1,
        });
      }

      const hasState = await trx('document_workflow_state').where({ document_id: docId }).first();
      if (hasState) {
        await trx('document_workflow_state')
          .where({ document_id: docId })
          .update({ stage_status: 'rolled_back', updated_at: new Date().toISOString() });
      } else {
        await trx('document_workflow_state').insert({
          id: 'wf_' + Date.now(), document_id: docId,
          current_screen: 1, stage_status: 'rolled_back',
          updated_at: new Date().toISOString(),
        });
      }

      // Release edit lock on rollback — document is back to a prior baseline
      // and can be re-edited.
      await trx('document_edit_locks').where({ document_id: docId }).del();

      // Supersede any pending/in_approval diffs so the PATCH edit-block check
      // (which reads diffs.status) doesn't continue blocking new edits.
      // This covers both manual_edit diffs and ingestion diffs that were
      // in-flight when the rollback was triggered.
      const pendingDiffs = await trx('diffs')
        .where({ document_id: docId })
        .whereIn('status', ['pending_workflow', 'in_approval'])
        .select('id');
      for (const pd of pendingDiffs) {
        await trx('diffs').where({ id: pd.id }).update({ status: 'superseded' });
        const wf = await trx('approval_workflows').where({ diff_id: pd.id }).first();
        if (wf) {
          await trx('approval_steps')
            .where({ workflow_id: wf.id })
            .whereIn('status', ['pending', 'waiting'])
            .update({ status: 'cancelled', decided_at: new Date().toISOString() });
          await trx('approval_workflows').where({ id: wf.id }).update({
            status: 'cancelled', completed_at: new Date().toISOString(),
          });
        }
      }

    });

    const workflowEngine = require('../services/workflowEngine');
    workflowEngine.logAudit('document_version', version.id, 'rolled_back', 'admin',
      `Restored version v${version.version_number} of "${version.original_filename}" as current baseline`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sub-stage title map ──────────────────────────────────────────────────────
const SUBSTAGE_TITLES = {
  extraction: 'AI Extraction',
  comparison: 'Version Comparison',
  diff:       'Difference Analysis',
  risk:       'Risk Assessment',
};
const SUBSTAGE_IDS = ['extraction', 'comparison', 'diff', 'risk'];

/**
 * Build best-effort sub-stage state for legacy documents that pre-date the
 * document_workflow_substages table.  Infers from actual DB artefacts.
 * Every returned entry carries `legacy_inferred: true`.
 */
function inferLegacySubstages(latestVersion, versionCount, diff, diffItems) {
  const make = (id, status, overrides = {}) => ({
    id,
    title: SUBSTAGE_TITLES[id],
    status,
    completed_at:  overrides.completed_at  || null,
    error_message: overrides.error_message || null,
    reason:        overrides.reason        || null,
    legacy_inferred: true,
  });

  const stages = [];

  // Extraction: infer from extracted_fields presence
  if (latestVersion && latestVersion.extracted_fields) {
    stages.push(make('extraction', 'complete', { completed_at: latestVersion.uploaded_at || null }));
  } else {
    stages.push(make('extraction', 'pending'));
  }

  // Comparison / Diff / Risk
  if (versionCount <= 1) {
    const reason = 'First version \u2014 no prior version to compare against';
    stages.push(make('comparison', 'not_applicable', { reason }));
    stages.push(make('diff',       'not_applicable', { reason: 'First version \u2014 no prior version to diff' }));
    stages.push(make('risk',       'not_applicable', { reason: 'First version \u2014 no risk assessment without a diff' }));
  } else if (diff) {
    const ts = diff.created_at || null;
    stages.push(make('comparison', 'complete', { completed_at: ts }));
    stages.push(make('diff',       'complete', { completed_at: ts }));
    stages.push(make('risk',       'complete', { completed_at: ts }));
  } else {
    // Multiple versions but no diff row — genuinely ambiguous
    stages.push(make('comparison', 'pending'));
    stages.push(make('diff',       'pending'));
    stages.push(make('risk',       'pending'));
  }

  return stages;
}

router.get('/:docId', requireAuth, async (req, res) => {
  const { docId } = req.params;
  try {
    let state = await ensureWorkflowState(docId);

    // ── Data queries (unchanged from original) ───────────────────────────────
    const doc           = await db('documents').where({ id: docId }).first();
    const baseline      = await db('document_versions').where({ document_id: docId, is_current_baseline: 1 }).first();
    const latestVersion = await db('document_versions').where({ document_id: docId }).orderBy('version_number', 'desc').first();

    const extractionData = latestVersion && latestVersion.extracted_fields
      ? JSON.parse(latestVersion.extracted_fields)
      : { status: 'No data extracted yet' };

    const comparisonData = {
      baseline:  baseline      ? `v${baseline.version_number} (${baseline.original_filename})`      : 'None',
      latest:    latestVersion ? `v${latestVersion.version_number} (${latestVersion.original_filename})` : 'None',
    };

    const diff = await db('diffs').where({ document_id: docId }).orderBy('created_at', 'desc').first();
    let diffItems = [], domains = [], riskLevel = 'Low';
    if (diff) {
      diffItems = await db('diff_items').where({ diff_id: diff.id });
      domains   = [...new Set(diffItems.map(i => i.domain || i.category || 'Operations'))];
      riskLevel = diff.highest_severity.toUpperCase();
    }

    const payloadData = {
      extraction: extractionData,
      comparison: comparisonData,
      diff: diffItems,
      risk: { level: riskLevel, details: diff ? `${diff.total_changes} changes detected across ${domains.length} domains.` : 'No diff available.' },
    };

    // ── Real sub-stage state (or legacy inference) ────────────────────────────
    const substageRows = await db('document_workflow_substages')
      .where({ document_id: docId });

    let subStages;

    if (substageRows.length > 0) {
      // Build from persisted rows; fill any missing substage as 'pending'
      const byId = {};
      substageRows.forEach(r => { byId[r.substage_id] = r; });

      subStages = SUBSTAGE_IDS.map(id => {
        const row = byId[id];
        return {
          id,
          title: SUBSTAGE_TITLES[id],
          status:        row ? row.status        : 'pending',
          completed_at:  row ? row.completed_at  : null,
          error_message: row ? row.error_message : null,
          reason:        row ? row.reason        : null,
          legacy_inferred: false,
        };
      });
    } else {
      // Legacy document — infer from actual DB artefacts
      const versionCount = latestVersion ? latestVersion.version_number : 0;
      subStages = inferLegacySubstages(latestVersion, versionCount, diff, diffItems);
    }

    // ── Safety-net stage_status transition ────────────────────────────────────
    // If all 4 sub-stages are resolved (complete or not_applicable — none
    // pending or failed) and stage_status is still 'running', transition to
    // 'ready_for_approval'.  This is a backup — the primary transition
    // happens in ingestionService at ingestion time.
    if (state.stage_status === 'running') {
      const allResolved = subStages.every(
        s => s.status === 'complete' || s.status === 'not_applicable'
      );
      if (allResolved) {
        await db('document_workflow_state')
          .where({ id: state.id })
          .update({ stage_status: 'ready_for_approval', updated_at: new Date().toISOString() });
        state = { ...state, stage_status: 'ready_for_approval' };
      }
    }

    // ── Approval chain (unchanged) ───────────────────────────────────────────
    const signatures       = await db('approval_signatures').where({ document_id: docId }).orderBy('signed_at', 'asc');
    const deployment_logs  = await db('deployment_log').where({ document_id: docId }).orderBy('order_executed', 'asc');
    const routing          = await db('category_routing').select('*');

    const approvalChain = domains.map(d => {
      const route = routing.find(r => r.category === d) || { role_title: 'Manager', step_order: 99 };
      const sig   = signatures.find(s => s.stage_role === route.role_title);
      return {
        domain: d, role: route.role_title,
        status: sig ? (sig.decision === 'approved' ? 'Approved' : 'Rejected') : 'Pending',
        signature: sig || null,
      };
    });

    res.json({ state, subStages, payloadData, domains, approvalChain, signatures, deployment_logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workflow/:docId/advance
// Gate: screen=2 requires all 4 substages resolved; screen=3 requires approval done.
router.post('/:docId/advance', requireRole('Admin', 'Approver'), async (req, res) => {
  const { docId } = req.params;
  // Coerce to number — body parsers may deliver this as string or number
  // depending on caller; === 2 must not silently fail due to type mismatch.
  const screen = Number(req.body.screen);
  console.log(`[advance] docId=${docId} screen=${screen} (raw=${JSON.stringify(req.body.screen)})`);
  try {
    await ensureWorkflowState(docId);

    if (screen === 2) {
      // All 4 substages must be complete or not_applicable before entering approval.
      const substages = await db('document_workflow_substages').where({ document_id: docId });
      const required  = ['extraction', 'comparison', 'diff', 'risk'];
      const byId      = {};
      substages.forEach(s => { byId[s.substage_id] = s; });
      const unresolved = required.filter(id => {
        const s = byId[id];
        return !s || (s.status !== 'complete' && s.status !== 'not_applicable');
      });
      console.log(`[advance] substages found: ${substages.length}, unresolved: ${JSON.stringify(unresolved)}`);
      if (unresolved.length > 0) {
        return res.status(409).json({
          error: 'Cannot advance to approval: substage prerequisites not resolved',
          unresolved,
        });
      }
    }

    if (screen === 3) {
      // Approval must be complete before entering deployment.
      const state = await db('document_workflow_state').where({ document_id: docId }).first();
      const approvalDone = ['ready_for_approval', 'in_approval', 'approved'];
      if (!state || !approvalDone.includes(state.stage_status)) {
        return res.status(409).json({
          error: 'Cannot advance to deployment: approval workflow is not complete',
          current_stage_status: state ? state.stage_status : null,
        });
      }
    }

    await db('document_workflow_state')
      .where({ document_id: docId })
      .update({ current_screen: screen, stage_status: screen === 2 ? 'in_approval' : 'deploying' });
    res.json({ success: true, current_screen: screen });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// POST /api/workflow/:docId/approve
// Domain enforcement: derives domain from the DB-side approval step, NOT from req.body.
router.post('/:docId/approve', requireRole('Admin', 'Approver'), async (req, res) => {
  const { docId } = req.params;
  const { role, approver_name, decision, attestation_method } = req.body;
  try {
    // Look up the real approval step from DB — this is the source of truth for domain check.
    const diff = await db('diffs').where({ document_id: docId }).orderBy('created_at', 'desc').first();
    const workflow = diff ? await db('approval_workflows').where({ diff_id: diff.id }).first() : null;
    const step = workflow
      ? await db('approval_steps').where({ workflow_id: workflow.id, role_title: role }).first()
      : null;

    if (!step) {
      return res.status(404).json({ error: 'No matching approval step found for this document and role' });
    }

    // Domain authorization: check the STEP's category (DB truth), never the body
    if (req.user.role === 'Approver') {
      const userDomains = JSON.parse(req.user.approved_domains || '[]');
      if (!userDomains.includes(step.category)) {
        return res.status(403).json({
          error: `Your account is not authorized to approve ${step.category} steps. Your domain(s): ${userDomains.join(', ') || 'none'}`,
        });
      }
    }
    // Admin bypasses domain check.

    await db('approval_signatures').insert({
      id: 'sig_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      document_id: docId, stage_role: role, approver_name, decision, attestation_method,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workflow/:docId/deploy
// Real 4-stage sequential pipeline: Precondition → Staging → Production → Reconciliation.
// Stops on first failure. Writes honest pass/fail into deployment_log.
//
// KNOWN LIMITATION: if Reconciliation detects a mismatch, the Production
// stage's writes to simulated_network_state have ALREADY been committed.
// A failed reconciliation does NOT auto-rollback those writes — the state
// remains "wrong" until an operator manually triggers POST /rollback.
router.post('/:docId/deploy', requireRole('Admin'), async (req, res) => {
  const { docId } = req.params;
  const simulateMismatch = req.query.simulateMismatch === 'true';

  try {
    // ── Precondition Gate ─────────────────────────────────────────────
    const state = await db('document_workflow_state').where({ document_id: docId }).first();
    if (!state || state.stage_status !== 'approved') {
      return res.status(409).json({
        error: 'Cannot deploy: document must be fully approved first',
        current_stage_status: state ? state.stage_status : null,
      });
    }

    const diff = await db('diffs').where({ document_id: docId }).orderBy('created_at', 'desc').first();
    if (!diff) {
      return res.status(409).json({
        error: 'Cannot deploy: no diff exists for this document',
      });
    }

    const diffItems = await db('diff_items').where({ diff_id: diff.id });
    if (diffItems.length === 0) {
      return res.status(409).json({
        error: 'Cannot deploy: diff has no items to deploy',
      });
    }

    // Clear any previous deployment logs for this document
    await db('deployment_log').where({ document_id: docId }).del();

    const now = Date.now();
    const logs = [];

    // Helper: write a deployment_log entry
    const writeLog = async (order, system, scope, passFail) => {
      const entry = {
        id: `dep_${now}_${order}`,
        document_id: docId,
        system,
        scope,
        order_executed: order,
        pass_fail: passFail,
      };
      await db('deployment_log').insert(entry);
      logs.push(entry);
      return passFail === 'pass';
    };

    // ── Stage 1: Staging Validation (Dry-run) ─────────────────────────
    const validChangeTypes = ['added', 'removed', 'modified'];
    const stagingErrors = [];

    for (const item of diffItems) {
      if (!item.field_path || typeof item.field_path !== 'string' || !item.field_path.trim()) {
        stagingErrors.push(`Item ${item.id}: missing field_path`);
      }
      if (!validChangeTypes.includes(item.change_type)) {
        stagingErrors.push(`Item ${item.id}: invalid change_type "${item.change_type}"`);
      }
      if ((item.change_type === 'added' || item.change_type === 'modified') &&
          (item.new_value === null || item.new_value === undefined)) {
        stagingErrors.push(`Item ${item.id}: change_type="${item.change_type}" but new_value is null`);
      }
    }

    const stagingPassed = stagingErrors.length === 0;
    const stagingScope = stagingPassed
      ? `Validated ${diffItems.length} diff items — all structurally valid`
      : `Validation failed: ${stagingErrors.join('; ')}`;

    const s1ok = await writeLog(1, 'Staging Environment', stagingScope, stagingPassed ? 'pass' : 'fail');
    if (!s1ok) {
      await db('document_workflow_state').where({ document_id: docId }).update({ stage_status: 'failed' });
      return res.json({ success: false, stage_failed: 'staging', logs, errors: stagingErrors });
    }

    // ── Stage 2: Production Write — Billing Systems ───────────────────
    // Split into two deployment_log rows for UI compatibility (rows 2 + 3).
    // Both share the same underlying write transaction.
    let productionPassed = true;
    let productionError = null;
    try {
      await db.transaction(async trx => {
        for (const item of diffItems) {
          if (item.change_type === 'removed') {
            // Delete the field from the digital twin
            await trx('simulated_network_state')
              .where({ document_id: docId, field_path: item.field_path })
              .del();
          } else {
            // added or modified — upsert using onConflict().merge()
            await trx('simulated_network_state')
              .insert({
                id: uuid(),
                document_id: docId,
                field_path: item.field_path,
                current_value: item.new_value,
                applied_by_diff_id: diff.id,
                updated_at: new Date().toISOString(),
              })
              .onConflict(['document_id', 'field_path'])
              .merge({
                current_value: item.new_value,
                applied_by_diff_id: diff.id,
                updated_at: new Date().toISOString(),
              });
          }
        }
      });
    } catch (err) {
      productionPassed = false;
      productionError = err.message;
    }

    const prodScope = productionPassed
      ? `Applied ${diffItems.length} field changes to simulated network state`
      : `Write failed: ${productionError}`;

    // Row 2: Production - Billing
    const billingItems = diffItems.filter(i => {
      const cat = (i.category || i.domain || '').toLowerCase();
      return cat.includes('commercial') || cat.includes('billing') || cat.includes('iot');
    });
    const billingScope = productionPassed
      ? `${billingItems.length} billing-domain fields applied`
      : prodScope;
    const s2ok = await writeLog(2, 'Production - Billing', billingScope, productionPassed ? 'pass' : 'fail');

    // Row 3: Production - HLR
    const hlrItems = diffItems.filter(i => !billingItems.includes(i));
    const hlrScope = productionPassed
      ? `${hlrItems.length} HLR/network fields applied`
      : prodScope;
    const s3ok = await writeLog(3, 'Production - HLR', hlrScope, productionPassed ? 'pass' : 'fail');

    if (!s2ok || !s3ok) {
      await db('document_workflow_state').where({ document_id: docId }).update({ stage_status: 'failed' });
      return res.json({ success: false, stage_failed: 'production', logs, error: productionError });
    }

    // ── Simulate Mismatch (test/demo facility) ────────────────────────
    // If ?simulateMismatch=true, corrupt one field AFTER the production
    // writes so the reconciliation stage genuinely detects it.
    if (simulateMismatch && diffItems.length > 0) {
      const targetField = diffItems[0].field_path;
      await db('simulated_network_state')
        .where({ document_id: docId, field_path: targetField })
        .update({ current_value: (diffItems[0].new_value || '') + '_CORRUPTED' });
    }

    // ── Stage 3: Reconciliation (Read-back Verification) ──────────────
    const mismatches = [];

    for (const item of diffItems) {
      const row = await db('simulated_network_state')
        .where({ document_id: docId, field_path: item.field_path })
        .first();

      if (item.change_type === 'removed') {
        // Expect the row to NOT exist
        if (row) {
          mismatches.push(`${item.field_path}: expected REMOVED but found value "${row.current_value}"`);
        }
      } else {
        // added or modified — expect current_value === new_value
        if (!row) {
          mismatches.push(`${item.field_path}: expected "${item.new_value}" but row is MISSING`);
        } else if (row.current_value !== item.new_value) {
          mismatches.push(`${item.field_path}: expected "${item.new_value}" but found "${row.current_value}"`);
        }
      }
    }

    const reconPassed = mismatches.length === 0;
    const reconScope = reconPassed
      ? `Synced — all ${diffItems.length} fields match expected values`
      : `Mismatch — ${mismatches.length} field(s): ${mismatches.join('; ')}`;

    await writeLog(4, 'Reconciliation Engine', reconScope, reconPassed ? 'pass' : 'fail');

    // ── Final status ──────────────────────────────────────────────────
    const finalStatus = reconPassed ? 'deployed' : 'failed';
    await db('document_workflow_state')
      .where({ document_id: docId })
      .update({ stage_status: finalStatus, updated_at: new Date().toISOString() });

    // Release edit lock — deployment finished (succeeded OR failed).
    // On failure the user must fix the document and re-submit;
    // keeping the lock would prevent that.
    await db('document_edit_locks').where({ document_id: docId }).del();

    res.json({ success: reconPassed, stage_failed: reconPassed ? null : 'reconciliation', logs, mismatches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

