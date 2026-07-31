const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper to ensure workflow state exists for a document
function ensureWorkflowState(docId) {
  let state = db.prepare('SELECT * FROM document_workflow_state WHERE document_id = ?').get(docId);
  if (!state) {
    const id = 'wf_' + Date.now();
    // Use current time for updated_at to track progress
    db.prepare('INSERT INTO document_workflow_state (id, document_id, current_screen, stage_status, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, docId, 1, 'running', new Date().toISOString());
    state = db.prepare('SELECT * FROM document_workflow_state WHERE document_id = ?').get(docId);
  }
  return state;
}

router.get('/rollback-queue', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        v.id as version_id,
        v.version_number,
        v.original_filename,
        v.uploaded_at,
        v.is_current_baseline,
        d.id as doc_id,
        d.title as doc_title,
        d.doc_type,
        op.name as operator_name,
        op.country as operator_country,
        op.network_code as mcc_mnc
      FROM document_versions v
      JOIN documents d ON v.document_id = d.id
      JOIN operators op ON d.operator_id = op.id
      ORDER BY v.uploaded_at DESC
    `).all();
    
    const mapped = rows.map(r => {
      const vNum = r.version_number;
      return {
        id: r.version_id,
        versionNumber: `v${vNum}`,
        previousVersion: vNum > 1 ? `v${vNum - 1}` : 'N/A',
        operator: r.operator_name,
        mccMnc: r.mcc_mnc || '420/01',
        timestamp: r.uploaded_at ? r.uploaded_at.replace('T', ' ').slice(0, 16) : 'Unknown',
        author: 'Ingestion Service',
        comment: `Ingested configuration file ${r.original_filename}`,
        activeConfiguration: `Baseline configuration for ${r.operator_name} (${r.doc_type})`,
        rollbackRisk: vNum > 1 ? 'Moderate' : 'Safe',
        status: r.is_current_baseline === 1 ? 'Active Baseline' : 'Archived'
      };
    });
    
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rollback/:versionId', (req, res) => {
  try {
    const version = db.prepare('SELECT * FROM document_versions WHERE id = ?').get(req.params.versionId);
    if (!version) return res.status(404).json({ error: 'Version not found' });

    db.transaction(() => {
      // 1. Set is_current_baseline = 1 for the restored version
      db.prepare('UPDATE document_versions SET is_current_baseline = 1 WHERE id = ?').run(version.id);
      // 2. Set is_current_baseline = 0 for other versions of the same document
      db.prepare('UPDATE document_versions SET is_current_baseline = 0 WHERE document_id = ? AND id != ?').run(version.document_id, version.id);
      
      // Ensure workflow state exists or create it
      const hasState = db.prepare('SELECT 1 FROM document_workflow_state WHERE document_id = ?').get(version.document_id);
      if (hasState) {
        db.prepare("UPDATE document_workflow_state SET stage_status = 'rolled_back', updated_at = datetime('now') WHERE document_id = ?")
          .run(version.document_id);
      } else {
        db.prepare("INSERT INTO document_workflow_state (id, document_id, current_screen, stage_status, updated_at) VALUES (?, ?, 1, 'rolled_back', datetime('now'))")
          .run('wf_' + Date.now(), version.document_id);
      }
    })();

    const workflowEngine = require('../services/workflowEngine');
    workflowEngine.logAudit('document_version', version.id, 'rolled_back', 'admin', `Restored version v${version.version_number} of "${version.original_filename}" as current baseline`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workflow/:docId
router.get('/:docId', (req, res) => {
  const { docId } = req.params;
  try {
    const state = ensureWorkflowState(docId);
    
    // Simulate granular sub-stage progress for Stage 1 based on time elapsed
    let subStages = [
      { id: 'extraction', title: 'AI Extraction', status: 'pending' },
      { id: 'comparison', title: 'Version Comparison', status: 'pending' },
      { id: 'diff', title: 'Difference Analysis', status: 'pending' },
      { id: 'risk', title: 'Risk Assessment', status: 'pending' }
    ];

    if (state.current_screen === 1 && state.stage_status === 'running') {
      const elapsed = Date.now() - new Date(state.updated_at).getTime();
      if (elapsed > 2000) subStages[0].status = 'complete';
      else if (elapsed > 0) subStages[0].status = 'running';
      
      if (elapsed > 4000) subStages[1].status = 'complete';
      else if (elapsed > 2000) subStages[1].status = 'running';
      
      if (elapsed > 6000) subStages[2].status = 'complete';
      else if (elapsed > 4000) subStages[2].status = 'running';
      
      if (elapsed > 8000) {
        subStages[3].status = 'complete';
        db.prepare("UPDATE document_workflow_state SET stage_status = 'ready_for_approval' WHERE id = ?").run(state.id);
        state.stage_status = 'ready_for_approval';
      }
      else if (elapsed > 6000) subStages[3].status = 'running';
    } else if (state.current_screen > 1 || state.stage_status !== 'running') {
      subStages.forEach(s => s.status = 'complete');
    }

    // Fetch Drill-down Payload Data
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    const baseline = db.prepare('SELECT * FROM document_versions WHERE document_id = ? AND is_current_baseline = 1').get(docId);
    const latestVersion = db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC LIMIT 1').get(docId);
    
    const extractionData = latestVersion && latestVersion.extracted_fields ? JSON.parse(latestVersion.extracted_fields) : { status: "No data extracted yet" };
    
    const comparisonData = {
      baseline: baseline ? `v${baseline.version_number} (${baseline.original_filename})` : 'None',
      latest: latestVersion ? `v${latestVersion.version_number} (${latestVersion.original_filename})` : 'None'
    };

    const diff = db.prepare('SELECT * FROM diffs WHERE document_id = ? ORDER BY created_at DESC LIMIT 1').get(docId);
    let diffItems = [];
    let domains = [];
    let riskLevel = 'Low';
    
    if (diff) {
      diffItems = db.prepare('SELECT * FROM diff_items WHERE diff_id = ?').all(diff.id);
      domains = diffItems.map(i => i.domain || i.category || 'Operations');
      domains = [...new Set(domains)]; // unique
      riskLevel = diff.highest_severity.toUpperCase();
    }

    const payloadData = {
      extraction: extractionData,
      comparison: comparisonData,
      diff: diffItems,
      risk: { level: riskLevel, details: diff ? `${diff.total_changes} changes detected across ${domains.length} domains.` : 'No diff available.' }
    };

    // Get signatures
    const signatures = db.prepare('SELECT * FROM approval_signatures WHERE document_id = ? ORDER BY signed_at ASC').all(docId);
    
    // Get deployment logs
    const deployment_logs = db.prepare('SELECT * FROM deployment_log WHERE document_id = ? ORDER BY order_executed ASC').all(docId);

    // Map domains to roles
    const routing = db.prepare('SELECT * FROM category_routing').all();
    const approvalChain = domains.map(d => {
      const route = routing.find(r => r.category === d) || { role_title: 'Manager', step_order: 99 };
      const sig = signatures.find(s => s.stage_role === route.role_title);
      return {
        domain: d,
        role: route.role_title,
        status: sig ? (sig.decision === 'approved' ? 'Approved' : 'Rejected') : 'Pending',
        signature: sig || null
      };
    });

    res.json({
      state,
      subStages,
      payloadData,
      domains,
      approvalChain,
      signatures,
      deployment_logs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workflow/:docId/advance
router.post('/:docId/advance', (req, res) => {
  const { docId } = req.params;
  const { screen } = req.body;
  try {
    const state = ensureWorkflowState(docId);
    db.prepare('UPDATE document_workflow_state SET current_screen = ?, stage_status = ? WHERE document_id = ?')
      .run(screen, screen === 2 ? 'in_approval' : 'deploying', docId);
    res.json({ success: true, current_screen: screen });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workflow/:docId/approve
router.post('/:docId/approve', (req, res) => {
  const { docId } = req.params;
  const { role, approver_name, decision, attestation_method } = req.body;
  try {
    const id = 'sig_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    db.prepare(`
      INSERT INTO approval_signatures (id, document_id, stage_role, approver_name, decision, attestation_method)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, docId, role, approver_name, decision, attestation_method);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workflow/:docId/deploy
router.post('/:docId/deploy', (req, res) => {
  const { docId } = req.params;
  try {
    // Clear old logs
    db.prepare('DELETE FROM deployment_log WHERE document_id = ?').run(docId);
    
    // Simulate Stages
    const stages = [
      { sys: 'Staging Environment', scope: 'Dry-run Validation', pass_fail: 'pass', order: 1 },
      { sys: 'Production - Billing', scope: 'Write Access Scoped', pass_fail: 'pass', order: 2 },
      { sys: 'Production - HLR', scope: 'Write Access Scoped', pass_fail: 'pass', order: 3 },
      { sys: 'Reconciliation Engine', scope: 'Validation Check', pass_fail: 'pass', order: 4 }
    ];

    const insert = db.prepare(`
      INSERT INTO deployment_log (id, document_id, system, scope, order_executed, pass_fail)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stages.forEach(s => {
      insert.run('dep_' + Date.now() + '_' + s.order, docId, s.sys, s.scope, s.order, s.pass_fail);
    });

    db.prepare("UPDATE document_workflow_state SET stage_status = 'deployed' WHERE document_id = ?").run(docId);

    res.json({ success: true, logs: stages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
