#!/usr/bin/env node
'use strict';

/**
 * verify_deploy.js — End-to-end verification of the real deployment pipeline.
 *
 * Creates genuinely fresh test data (operator → document → versions → diff →
 * diff_items) and exercises all 5 test scenarios:
 *
 *   1. Precondition rejection (unapproved document → 409)
 *   2. Happy-path deploy (staging pass, production write, reconciliation synced)
 *   3. Confirm simulated_network_state values match diff's after-values
 *   4. Simulate mismatch (reconciliation genuinely detects real corruption)
 *   5. Rollback (simulated_network_state reverts to old_value)
 *
 * Self-contained: all fixtures are created and cleaned up within this script.
 *
 * REQUIRES env vars: VERIFY_USERNAME, VERIFY_PASSWORD
 * Run: VERIFY_USERNAME=rishithathoka@gmail.com VERIFY_PASSWORD=mjn33P7L434sfrfO node scripts/verify_deploy.js
 */

const http = require('http');
const BASE  = 'http://localhost:4021';

const CREDS = {
  username: process.env.VERIFY_USERNAME || '',
  password: process.env.VERIFY_PASSWORD || '',
};
if (!CREDS.username || !CREDS.password) {
  console.error('FATAL: VERIFY_USERNAME and VERIFY_PASSWORD env vars required.');
  process.exit(1);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────────

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const url = new URL(BASE + urlPath);
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, method, headers,
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, 500); }
        resolve({ status: res.statusCode, body: parsed, raw });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Test harness ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  [PASS]  ${label}`);
    if (detail) console.log(`          ${detail}`);
  } else {
    failed++;
    console.log(`  [FAIL]  ${label}`);
    if (detail) console.log(`          ${detail}`);
  }
}

// ── DB access (for direct fixture creation and verification) ────────────────────

process.chdir(require('path').join(__dirname, '..'));
const db = require('../db');
const { v4: uuid } = require('uuid');

// ── Fixture management ──────────────────────────────────────────────────────────

const SUFFIX  = Date.now();
const CLEANUP = { operator_id: null, document_id: null, diff_id: null, version_ids: [] };

async function createFixtures() {
  // Create a fresh operator
  const opId = uuid();
  await db('operators').insert({
    id: opId,
    name: `_VerifyDeploy Telco ${SUFFIX}`,
    country: 'Testland',
    normalized_name: `_verify_deploy_telco_${SUFFIX}`,
    status: 'active',
  });
  CLEANUP.operator_id = opId;

  // Create a document
  const docId = uuid();
  await db('documents').insert({
    id: docId,
    operator_id: opId,
    doc_type: 'IR21',
    format: 'pdf',
    title: `VerifyDeploy Test Doc ${SUFFIX}`,
  });
  CLEANUP.document_id = docId;

  // Create two versions (v1 and v2)
  const v1Id = uuid();
  const v2Id = uuid();
  await db('document_versions').insert([
    { id: v1Id, document_id: docId, version_number: 1, file_path: '/dev/null', original_filename: 'test_v1.pdf' },
    { id: v2Id, document_id: docId, version_number: 2, file_path: '/dev/null', original_filename: 'test_v2.pdf', is_current_baseline: 1 },
  ]);
  CLEANUP.version_ids = [v1Id, v2Id];

  // Create a diff with realistic diff_items
  const diffId = uuid();
  await db('diffs').insert({
    id: diffId,
    document_id: docId,
    from_version_id: v1Id,
    to_version_id: v2Id,
    total_changes: 4,
    highest_severity: 'major',
    status: 'approved',
  });
  CLEANUP.diff_id = diffId;

  // Create 4 diff_items covering all change_types
  const items = [
    {
      id: uuid(), diff_id: diffId,
      field_path: 'NETWORK.HLR Global Title', category: 'Network/Technical',
      change_type: 'modified', old_value: '13125550000', new_value: '13125559999',
      severity: 'major', domain: 'Network/Technical',
    },
    {
      id: uuid(), diff_id: diffId,
      field_path: 'NETWORK.GRX IPX Provider', category: 'Network/Technical',
      change_type: 'modified', old_value: 'Syniverse', new_value: 'Comfone',
      severity: 'minor', domain: 'Network/Technical',
    },
    {
      id: uuid(), diff_id: diffId,
      field_path: 'NETWORK.New SMSC Address', category: 'Network/Technical',
      change_type: 'added', old_value: null, new_value: '+1-555-0199',
      severity: 'minor', domain: 'Network/Technical',
    },
    {
      id: uuid(), diff_id: diffId,
      field_path: 'COMMERCIAL.Old Billing Code', category: 'Commercial',
      change_type: 'removed', old_value: 'BILL-LEGACY-99', new_value: null,
      severity: 'minor', domain: 'Commercial',
    },
  ];
  await db('diff_items').insert(items);

  // Create workflow state — initially "running" (NOT approved)
  await db('document_workflow_state').insert({
    id: `wf_test_${SUFFIX}`,
    document_id: docId,
    current_screen: 1,
    stage_status: 'running',
    updated_at: new Date().toISOString(),
  });

  return { opId, docId, diffId, v1Id, v2Id, items };
}

async function cleanup() {
  console.log('\n  Cleaning up test fixtures...');
  const docId = CLEANUP.document_id;
  if (docId) {
    await db('simulated_network_state').where({ document_id: docId }).del().catch(() => {});
    await db('deployment_log').where({ document_id: docId }).del().catch(() => {});
    await db('approval_signatures').where({ document_id: docId }).del().catch(() => {});
    await db('document_workflow_state').where({ document_id: docId }).del().catch(() => {});
    await db('document_workflow_substages').where({ document_id: docId }).del().catch(() => {});
  }
  if (CLEANUP.diff_id) {
    await db('diff_items').where({ diff_id: CLEANUP.diff_id }).del().catch(() => {});
    await db('diffs').where({ id: CLEANUP.diff_id }).del().catch(() => {});
  }
  for (const vId of CLEANUP.version_ids) {
    await db('document_versions').where({ id: vId }).del().catch(() => {});
  }
  if (docId) await db('documents').where({ id: docId }).del().catch(() => {});
  if (CLEANUP.operator_id) await db('operators').where({ id: CLEANUP.operator_id }).del().catch(() => {});
  console.log('    Done.');
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================================================');
  console.log('  Deployment Pipeline Verification (Steps 7-10)');
  console.log('  ' + new Date().toISOString());
  console.log('========================================================================');
  console.log(`  Server: ${BASE}`);

  // Login
  console.log('\n  Logging in...');
  const loginRes = await request('POST', '/api/auth/login', CREDS);
  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.error('  FATAL: Login failed — aborting.');
    process.exit(1);
  }
  const token = loginRes.body.token;
  console.log(`    Logged in as ${CREDS.username} (token: ${token.slice(0, 16)}...)`);

  // Create fixtures
  console.log('\n  Creating fresh test fixtures...');
  const fix = await createFixtures();
  console.log(`    operator_id:  ${fix.opId}`);
  console.log(`    document_id:  ${fix.docId}`);
  console.log(`    diff_id:      ${fix.diffId}`);
  console.log(`    diff_items:   ${fix.items.length} (modified×2, added×1, removed×1)`);

  try {
    // ═══════════════════════════════════════════════════════════════════
    //  TEST 1: Precondition rejection (unapproved → 409)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n========================================================================');
    console.log('  TEST 1: Precondition Rejection (unapproved document → 409)');
    console.log('========================================================================');

    const r1 = await request('POST', `/api/workflow/${fix.docId}/deploy`, {}, token);
    console.log(`    HTTP ${r1.status}`);
    console.log(`    Body: ${JSON.stringify(r1.body)}`);

    assert('Deploy rejected with 409', r1.status === 409, `status=${r1.status}`);
    assert('Error message mentions "approved"',
      typeof r1.body.error === 'string' && r1.body.error.includes('approved'),
      `error=${r1.body.error}`);
    assert('Current stage_status reported',
      r1.body.current_stage_status === 'running',
      `current_stage_status=${r1.body.current_stage_status}`);

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 2: Happy-path deploy
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n========================================================================');
    console.log('  TEST 2: Happy-path Deploy (approved document)');
    console.log('========================================================================');

    // Set document to approved
    await db('document_workflow_state')
      .where({ document_id: fix.docId })
      .update({ stage_status: 'approved', current_screen: 3 });
    console.log('    Set stage_status=approved');

    const r2 = await request('POST', `/api/workflow/${fix.docId}/deploy`, {}, token);
    console.log(`    HTTP ${r2.status}`);
    console.log(`    success: ${r2.body.success}`);
    console.log(`    stage_failed: ${r2.body.stage_failed}`);
    console.log(`    logs: ${JSON.stringify(r2.body.logs?.map(l => ({ sys: l.system, pf: l.pass_fail })))}`);
    console.log(`    mismatches: ${JSON.stringify(r2.body.mismatches)}`);

    assert('Deploy returns 200', r2.status === 200, `status=${r2.status}`);
    assert('Deploy success=true', r2.body.success === true, `success=${r2.body.success}`);
    assert('No stage failed', r2.body.stage_failed === null, `stage_failed=${r2.body.stage_failed}`);
    assert('4 deployment_log entries', Array.isArray(r2.body.logs) && r2.body.logs.length === 4,
      `logs.length=${r2.body.logs?.length}`);
    assert('All stages passed', r2.body.logs?.every(l => l.pass_fail === 'pass'),
      r2.body.logs?.map(l => `${l.system}=${l.pass_fail}`).join(', '));
    assert('0 mismatches (Synced)', Array.isArray(r2.body.mismatches) && r2.body.mismatches.length === 0,
      `mismatches=${r2.body.mismatches?.length}`);

    // Check deployment_log in DB
    const dbLogs = await db('deployment_log').where({ document_id: fix.docId }).orderBy('order_executed', 'asc');
    assert('DB has 4 deployment_log rows', dbLogs.length === 4, `rows=${dbLogs.length}`);
    assert('DB logs all pass', dbLogs.every(l => l.pass_fail === 'pass'),
      dbLogs.map(l => `${l.system}=${l.pass_fail}`).join(', '));

    // Check workflow state
    const postDeployState = await db('document_workflow_state').where({ document_id: fix.docId }).first();
    assert('stage_status = deployed', postDeployState.stage_status === 'deployed',
      `stage_status=${postDeployState.stage_status}`);

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 3: Confirm simulated_network_state values
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n========================================================================');
    console.log('  TEST 3: Verify simulated_network_state (digital twin)');
    console.log('========================================================================');

    const snsRows = await db('simulated_network_state').where({ document_id: fix.docId });
    console.log(`    Rows in simulated_network_state: ${snsRows.length}`);

    // modified items: HLR Global Title = '13125559999', GRX IPX Provider = 'Comfone'
    const hlr = snsRows.find(r => r.field_path === 'NETWORK.HLR Global Title');
    assert('HLR Global Title = "13125559999"',
      hlr && hlr.current_value === '13125559999',
      `actual=${hlr ? hlr.current_value : 'MISSING'}`);

    const grx = snsRows.find(r => r.field_path === 'NETWORK.GRX IPX Provider');
    assert('GRX IPX Provider = "Comfone"',
      grx && grx.current_value === 'Comfone',
      `actual=${grx ? grx.current_value : 'MISSING'}`);

    // added item: New SMSC Address = '+1-555-0199'
    const smsc = snsRows.find(r => r.field_path === 'NETWORK.New SMSC Address');
    assert('New SMSC Address = "+1-555-0199"',
      smsc && smsc.current_value === '+1-555-0199',
      `actual=${smsc ? smsc.current_value : 'MISSING'}`);

    // removed item: Old Billing Code should NOT exist
    const billing = snsRows.find(r => r.field_path === 'COMMERCIAL.Old Billing Code');
    assert('Old Billing Code REMOVED (no row)',
      !billing,
      `actual=${billing ? `EXISTS with value "${billing.current_value}"` : 'correctly absent'}`);

    // Provenance
    assert('applied_by_diff_id set correctly',
      hlr && hlr.applied_by_diff_id === fix.diffId,
      `applied_by_diff_id=${hlr ? hlr.applied_by_diff_id?.slice(0, 8) : 'N/A'}`);

    // Exactly 3 rows (2 modified + 1 added; the removed one was deleted)
    assert('Exactly 3 rows in simulated_network_state', snsRows.length === 3,
      `count=${snsRows.length}`);

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 4: Simulate mismatch (real corruption → real detection)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n========================================================================');
    console.log('  TEST 4: Simulate Mismatch (?simulateMismatch=true)');
    console.log('========================================================================');

    // Reset to approved state for a fresh deploy
    await db('document_workflow_state')
      .where({ document_id: fix.docId })
      .update({ stage_status: 'approved', current_screen: 3 });
    await db('simulated_network_state').where({ document_id: fix.docId }).del();
    console.log('    Reset state to approved, cleared simulated_network_state');

    const r4 = await request('POST', `/api/workflow/${fix.docId}/deploy?simulateMismatch=true`, {}, token);
    console.log(`    HTTP ${r4.status}`);
    console.log(`    success: ${r4.body.success}`);
    console.log(`    stage_failed: ${r4.body.stage_failed}`);
    console.log(`    mismatches: ${JSON.stringify(r4.body.mismatches)}`);

    assert('Deploy returns 200 (not a server error)', r4.status === 200, `status=${r4.status}`);
    assert('success=false (mismatch detected)', r4.body.success === false, `success=${r4.body.success}`);
    assert('stage_failed=reconciliation', r4.body.stage_failed === 'reconciliation',
      `stage_failed=${r4.body.stage_failed}`);
    assert('At least 1 mismatch reported',
      Array.isArray(r4.body.mismatches) && r4.body.mismatches.length > 0,
      `mismatches=${r4.body.mismatches?.length}`);
    assert('Mismatch mentions CORRUPTED',
      r4.body.mismatches?.[0]?.includes('_CORRUPTED'),
      `mismatch[0]=${r4.body.mismatches?.[0]?.slice(0, 100)}`);

    // Check DB: stage_status should be 'failed' (not 'deployed')
    const postMismatchState = await db('document_workflow_state').where({ document_id: fix.docId }).first();
    assert('stage_status = failed after mismatch', postMismatchState.stage_status === 'failed',
      `stage_status=${postMismatchState.stage_status}`);

    // Check deployment_log: reconciliation should be 'fail'
    const mismatchLogs = await db('deployment_log').where({ document_id: fix.docId }).orderBy('order_executed', 'asc');
    const reconLog = mismatchLogs.find(l => l.system === 'Reconciliation Engine');
    assert('Reconciliation log has pass_fail=fail', reconLog && reconLog.pass_fail === 'fail',
      `pass_fail=${reconLog?.pass_fail}`);
    assert('Reconciliation scope mentions "Mismatch"',
      reconLog && reconLog.scope.includes('Mismatch'),
      `scope=${reconLog?.scope?.slice(0, 80)}`);

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 5: Rollback (revert simulated_network_state)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n========================================================================');
    console.log('  TEST 5: Rollback (revert simulated_network_state)');
    console.log('========================================================================');

    // First do a clean deploy so there's state to roll back
    await db('document_workflow_state')
      .where({ document_id: fix.docId })
      .update({ stage_status: 'approved', current_screen: 3 });
    await db('simulated_network_state').where({ document_id: fix.docId }).del();
    await db('deployment_log').where({ document_id: fix.docId }).del();

    const cleanDeploy = await request('POST', `/api/workflow/${fix.docId}/deploy`, {}, token);
    assert('Clean deploy succeeds for rollback test', cleanDeploy.body.success === true,
      `success=${cleanDeploy.body.success}`);

    // Verify pre-rollback state
    const preRollback = await db('simulated_network_state').where({ document_id: fix.docId });
    console.log(`    Pre-rollback rows: ${preRollback.length}`);
    assert('3 rows exist before rollback', preRollback.length === 3);

    // Now rollback (using v1 version)
    const r5 = await request('POST', `/api/workflow/rollback/${fix.v1Id}`, {}, token);
    console.log(`    Rollback HTTP ${r5.status}`);
    console.log(`    Body: ${JSON.stringify(r5.body)}`);
    assert('Rollback returns 200', r5.status === 200, `status=${r5.status}`);
    assert('Rollback success=true', r5.body.success === true);

    // Verify post-rollback state
    const postRollback = await db('simulated_network_state').where({ document_id: fix.docId });
    console.log(`    Post-rollback rows: ${postRollback.length}`);

    // After rollback:
    // - 'modified' items: HLR should revert to '13125550000', GRX to 'Syniverse'
    // - 'added' item (SMSC): should be DELETED (didn't exist before)
    // - 'removed' item (Old Billing Code): should be RESTORED with old_value='BILL-LEGACY-99'

    const hlrPost = postRollback.find(r => r.field_path === 'NETWORK.HLR Global Title');
    assert('HLR Global Title reverted to "13125550000"',
      hlrPost && hlrPost.current_value === '13125550000',
      `actual=${hlrPost ? hlrPost.current_value : 'MISSING'}`);

    const grxPost = postRollback.find(r => r.field_path === 'NETWORK.GRX IPX Provider');
    assert('GRX IPX Provider reverted to "Syniverse"',
      grxPost && grxPost.current_value === 'Syniverse',
      `actual=${grxPost ? grxPost.current_value : 'MISSING'}`);

    const smscPost = postRollback.find(r => r.field_path === 'NETWORK.New SMSC Address');
    assert('New SMSC Address DELETED (was added, now rolled back)',
      !smscPost,
      `actual=${smscPost ? `EXISTS="${smscPost.current_value}"` : 'correctly absent'}`);

    const billingPost = postRollback.find(r => r.field_path === 'COMMERCIAL.Old Billing Code');
    assert('Old Billing Code RESTORED to "BILL-LEGACY-99"',
      billingPost && billingPost.current_value === 'BILL-LEGACY-99',
      `actual=${billingPost ? billingPost.current_value : 'MISSING'}`);

    // Workflow state
    const rollbackState = await db('document_workflow_state').where({ document_id: fix.docId }).first();
    assert('stage_status = rolled_back', rollbackState.stage_status === 'rolled_back',
      `stage_status=${rollbackState.stage_status}`);

    // Deployment log should have a rollback entry
    const rollbackLogs = await db('deployment_log')
      .where({ document_id: fix.docId, rollback_triggered: 1 });
    assert('deployment_log has rollback entry', rollbackLogs.length > 0,
      `rollback entries=${rollbackLogs.length}`);
    assert('Rollback log pass_fail=pass', rollbackLogs[0]?.pass_fail === 'pass',
      `pass_fail=${rollbackLogs[0]?.pass_fail}`);

  } finally {
    await cleanup();
    await db.destroy();
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FINAL RESULTS
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n========================================================================');
  console.log('  FINAL RESULTS');
  console.log('========================================================================');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}`);
  console.log('========================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  cleanup().then(() => db.destroy()).finally(() => process.exit(1));
});
