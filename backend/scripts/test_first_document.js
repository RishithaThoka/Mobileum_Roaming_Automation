'use strict';

// Direct DB-level test — bypasses HTTP auth, uses the same ingestionService
// the server uses. This proves the first-document substage logic end-to-end.

const path = require('path');

// Set env so knex finds the right DB
process.chdir(__dirname + '/..');

const db = require('../db');
const ingestionService = require('../services/ingestionService');
const { v4: uuid } = require('uuid');

async function main() {
  // Bootstrap DB (run migrations etc.)
  await db.bootstrap();

  console.log('=== TEST: First-ever document for a brand-new operator ===\n');

  // Step 1: List existing operators
  const existing = await db('operators').select('name', 'country');
  console.log(`Found ${existing.length} existing operators:`);
  existing.forEach(op => console.log(`  - ${op.name} (${op.country})`));

  // Step 2: Create a brand-new operator (unique name + country)
  const opId = uuid();
  const opName = 'Telenor Myanmar';
  const opCountry = 'Myanmar';
  console.log(`\nCreating brand-new operator "${opName}" (${opCountry})...`);

  // Check if it already exists
  const existingOp = await db('operators')
    .whereRaw('LOWER(name) = LOWER(?)', [opName])
    .whereRaw('LOWER(country) = LOWER(?)', [opCountry])
    .first();

  let operatorId;
  if (existingOp) {
    console.log(`  Operator already exists (id=${existingOp.id}). Checking if it has documents...`);
    const docs = await db('documents').where({ operator_id: existingOp.id });
    if (docs.length > 0) {
      console.log(`  Has ${docs.length} existing documents — this won't work as a "first-ever" test.`);
      console.log(`  Creating a different operator: "Grameenphone Bangladesh"...`);
      const altId = uuid();
      await db('operators').insert({
        id: altId,
        name: 'Grameenphone Bangladesh',
        country: 'Bangladesh',
        normalized_name: 'grameenphone bangladesh',
        network_code: '470/01',
        contact_email: 'roaming@grameenphone.com',
        ingest_mode: 'push',
        default_doc_type: 'IR21',
      });
      operatorId = altId;
      console.log(`  Created operator: Grameenphone Bangladesh (id=${altId})`);
    } else {
      operatorId = existingOp.id;
      console.log(`  Operator exists but has 0 documents — safe to use for first-ever test.`);
    }
  } else {
    await db('operators').insert({
      id: opId,
      name: opName,
      country: opCountry,
      normalized_name: 'telenor myanmar',
      network_code: '414/01',
      contact_email: 'roaming@telenormyanmar.com.mm',
      ingest_mode: 'push',
      default_doc_type: 'IR21',
    });
    operatorId = opId;
    console.log(`  Created operator: ${opName} (id=${opId})`);
  }

  // Verify no documents exist for this operator
  const preDocs = await db('documents').where({ operator_id: operatorId });
  console.log(`  Pre-existing documents for this operator: ${preDocs.length}`);
  if (preDocs.length > 0) {
    console.error('ERROR: Operator already has documents. Cannot test first-ever scenario.');
    process.exit(1);
  }

  // Step 3: Upload exactly ONE sample document via ingestionService
  const sampleFile = path.join(__dirname, '..', '..', 'sample-documents', 'Singtel_IR21_v1.csv');
  console.log(`\nIngesting first-ever document...`);
  console.log(`  File: ${path.basename(sampleFile)}`);
  console.log(`  doc_type: IR21`);
  console.log(`  operator_id: ${operatorId}`);

  const result = await ingestionService.ingestDocumentVersion({
    operatorId,
    docType: 'IR21',
    title: 'IR21 - First Ever Test',
    filePath: sampleFile,
    originalFilename: 'Singtel_IR21_v1.csv',
    source: 'push',
  });

  const docId = result.document.id;
  console.log(`\n  Ingestion complete!`);
  console.log(`  Document ID: ${docId}`);
  console.log(`  Version ID:  ${result.versionId}`);
  console.log(`  Diff result: ${JSON.stringify(result.diff)}`);

  // Step 4: Now replicate exactly what GET /api/workflow/:docId does
  console.log(`\n=== Fetching workflow state (replicating GET /api/workflow/${docId}) ===\n`);

  const { ensureWorkflowState } = require('../services/workflowEngine');
  let state = await ensureWorkflowState(docId);

  const doc = await db('documents').where({ id: docId }).first();
  const baseline = await db('document_versions').where({ document_id: docId, is_current_baseline: 1 }).first();
  const latestVersion = await db('document_versions').where({ document_id: docId }).orderBy('version_number', 'desc').first();

  const extractionData = latestVersion && latestVersion.extracted_fields
    ? JSON.parse(latestVersion.extracted_fields)
    : { status: 'No data extracted yet' };

  const comparisonData = {
    baseline: baseline ? `v${baseline.version_number} (${baseline.original_filename})` : 'None',
    latest: latestVersion ? `v${latestVersion.version_number} (${latestVersion.original_filename})` : 'None',
  };

  const diff = await db('diffs').where({ document_id: docId }).orderBy('created_at', 'desc').first();
  let diffItems = [], domains = [], riskLevel = 'Low';
  if (diff) {
    diffItems = await db('diff_items').where({ diff_id: diff.id });
    domains = [...new Set(diffItems.map(i => i.domain || i.category || 'Operations'))];
    riskLevel = diff.highest_severity.toUpperCase();
  }

  const payloadData = {
    extraction: extractionData,
    comparison: comparisonData,
    diff: diffItems,
    risk: { level: riskLevel, details: diff ? `${diff.total_changes} changes detected across ${domains.length} domains.` : 'No diff available.' },
  };

  // Sub-stage state
  const SUBSTAGE_IDS = ['extraction', 'comparison', 'diff', 'risk'];
  const SUBSTAGE_TITLES = {
    extraction: 'AI Extraction',
    comparison: 'Version Comparison',
    diff: 'Difference Analysis',
    risk: 'Risk Assessment',
  };

  const substageRows = await db('document_workflow_substages').where({ document_id: docId });

  let subStages;
  if (substageRows.length > 0) {
    const byId = {};
    substageRows.forEach(r => { byId[r.substage_id] = r; });
    subStages = SUBSTAGE_IDS.map(id => {
      const row = byId[id];
      return {
        id,
        title: SUBSTAGE_TITLES[id],
        status: row ? row.status : 'pending',
        completed_at: row ? row.completed_at : null,
        error_message: row ? row.error_message : null,
        reason: row ? row.reason : null,
        legacy_inferred: false,
      };
    });
  } else {
    subStages = [{ error: 'NO SUBSTAGE ROWS FOUND — this is a bug' }];
  }

  // Safety-net transition
  if (state.stage_status === 'running') {
    const allResolved = subStages.every(s => s.status === 'complete' || s.status === 'not_applicable');
    if (allResolved) {
      await db('document_workflow_state')
        .where({ id: state.id })
        .update({ stage_status: 'ready_for_approval', updated_at: new Date().toISOString() });
      state = { ...state, stage_status: 'ready_for_approval' };
    }
  }

  const signatures = await db('approval_signatures').where({ document_id: docId }).orderBy('signed_at', 'asc');
  const deployment_logs = await db('deployment_log').where({ document_id: docId }).orderBy('order_executed', 'asc');

  const fullResponse = { state, subStages, payloadData, domains, approvalChain: [], signatures, deployment_logs };

  console.log('========== FULL WORKFLOW RESPONSE ==========');
  console.log(JSON.stringify(fullResponse, null, 2));
  console.log('=============================================\n');

  // Validation
  console.log('=== VALIDATION ===');
  const extraction = subStages.find(s => s.id === 'extraction');
  const comparison = subStages.find(s => s.id === 'comparison');
  const diffSub    = subStages.find(s => s.id === 'diff');
  const risk       = subStages.find(s => s.id === 'risk');

  console.log(`  extraction.status       = ${extraction?.status}         (expected: complete)`);
  console.log(`  extraction.completed_at = ${extraction?.completed_at}   (expected: real timestamp)`);
  console.log(`  comparison.status       = ${comparison?.status}  (expected: not_applicable)`);
  console.log(`  comparison.reason       = ${comparison?.reason}`);
  console.log(`  diff.status             = ${diffSub?.status}  (expected: not_applicable)`);
  console.log(`  diff.reason             = ${diffSub?.reason}`);
  console.log(`  risk.status             = ${risk?.status}  (expected: not_applicable)`);
  console.log(`  risk.reason             = ${risk?.reason}`);
  console.log(`  stage_status            = ${state.stage_status}  (expected: ready_for_approval)`);
  console.log(`  legacy_inferred         = ${extraction?.legacy_inferred}  (expected: false)`);

  const allPass =
    extraction?.status === 'complete' &&
    extraction?.completed_at != null &&
    comparison?.status === 'not_applicable' &&
    comparison?.reason != null &&
    diffSub?.status === 'not_applicable' &&
    diffSub?.reason != null &&
    risk?.status === 'not_applicable' &&
    risk?.reason != null &&
    state.stage_status === 'ready_for_approval' &&
    extraction?.legacy_inferred === false;

  console.log(`\n  ALL CHECKS PASS: ${allPass ? 'YES ✅' : 'NO ❌'}`);

  await db.destroy();
  process.exit(0);
}

main().catch(async err => {
  console.error('FATAL:', err);
  try { await db.destroy(); } catch (_) {}
  process.exit(1);
});
