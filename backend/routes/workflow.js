'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { v4: uuid } = require('uuid');
const { ensureWorkflowState } = require('../services/workflowEngine');

router.get('/rollback-queue', async (req, res) => {
  try {
    const rows = await db('document_versions as v')
      .select([
        'v.id as version_id', 'v.version_number', 'v.original_filename',
        'v.uploaded_at', 'v.is_current_baseline',
        'd.id as doc_id', 'd.title as doc_title', 'd.doc_type',
        'op.name as operator_name', 'op.country as operator_country',
        'op.network_code as mcc_mnc',
      ])
      .join('documents as d', 'v.document_id', 'd.id')
      .join('operators as op', 'd.operator_id', 'op.id')
      .orderBy('v.uploaded_at', 'desc');

    const mapped = rows.map(r => ({
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
      status: r.is_current_baseline === 1 ? 'Active Baseline' : 'Archived',
    }));

    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rollback/:versionId', async (req, res) => {
  try {
    const version = await db('document_versions').where({ id: req.params.versionId }).first();
    if (!version) return res.status(404).json({ error: 'Version not found' });

    await db.transaction(async trx => {
      await trx('document_versions').where({ id: version.id }).update({ is_current_baseline: 1 });
      await trx('document_versions')
        .where({ document_id: version.document_id })
        .whereNot({ id: version.id })
        .update({ is_current_baseline: 0 });

      const hasState = await trx('document_workflow_state').where({ document_id: version.document_id }).first();
      if (hasState) {
        await trx('document_workflow_state')
          .where({ document_id: version.document_id })
          .update({ stage_status: 'rolled_back', updated_at: new Date().toISOString() });
      } else {
        await trx('document_workflow_state').insert({
          id: 'wf_' + Date.now(), document_id: version.document_id,
          current_screen: 1, stage_status: 'rolled_back',
          updated_at: new Date().toISOString(),
        });
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

// GET /api/workflow/:docId
router.get('/:docId', async (req, res) => {
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
router.post('/:docId/advance', async (req, res) => {
  const { docId } = req.params;
  const { screen } = req.body;
  try {
    await ensureWorkflowState(docId);
    await db('document_workflow_state')
      .where({ document_id: docId })
      .update({ current_screen: screen, stage_status: screen === 2 ? 'in_approval' : 'deploying' });
    res.json({ success: true, current_screen: screen });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workflow/:docId/approve
router.post('/:docId/approve', async (req, res) => {
  const { docId } = req.params;
  const { role, approver_name, decision, attestation_method } = req.body;
  try {
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
router.post('/:docId/deploy', async (req, res) => {
  const { docId } = req.params;
  try {
    await db('deployment_log').where({ document_id: docId }).del();

    const stages = [
      { sys: 'Staging Environment',   scope: 'Dry-run Validation',  pass_fail: 'pass', order: 1 },
      { sys: 'Production - Billing',  scope: 'Write Access Scoped', pass_fail: 'pass', order: 2 },
      { sys: 'Production - HLR',      scope: 'Write Access Scoped', pass_fail: 'pass', order: 3 },
      { sys: 'Reconciliation Engine', scope: 'Validation Check',    pass_fail: 'pass', order: 4 },
    ];

    await db('deployment_log').insert(stages.map(s => ({
      id: 'dep_' + Date.now() + '_' + s.order,
      document_id: docId, system: s.sys, scope: s.scope,
      order_executed: s.order, pass_fail: s.pass_fail,
    })));

    await db('document_workflow_state')
      .where({ document_id: docId })
      .update({ stage_status: 'deployed' });

    res.json({ success: true, logs: stages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
