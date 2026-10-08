#!/usr/bin/env node
'use strict';

/**
 * verify_auth.js — Phase 1 Authentication & Authorization Verification
 *
 * Covers 6 tests:
 *   Test 1: Valid Admin login → 200 + token + role
 *   Test 2: Invalid credentials → 401
 *   Test 3: Role-based access control (Admin-only endpoint)
 *            - No token → 401
 *            - Approver token → 403
 *            - Admin token → 200
 *   Test 4: Domain enforcement (Approve/Reject endpoints)
 *            Creates a fresh Security-domain diff + workflow + approval step.
 *            Case A: Security-domain Approver → POST /:token/decide → 200  (authorized)
 *            Case B: Security-domain Approver → POST /:token/decide on a
 *                    Routing (GT) step → 403  (domain mismatch)
 *   Test 5: Session invalidation — Admin deactivates a user → old token → 401
 *   Test 6: Logout → token stops working
 *
 * Self-contained: creates its own test accounts (Admin + Approver) with known
 * passwords, runs all tests, then cleans up. No env vars needed.
 *
 * Usage:
 *   node scripts/verify_auth.js
 */

const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const BASE = 'http://localhost:4021';

// ─── DB access (for creating fixtures + test accounts) ────────────────────────

let db;
try {
  db = require('../db');
} catch (err) {
  console.error('Could not load ../db — run from the backend directory.');
  console.error(err.message);
  process.exit(1);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const url = new URL(BASE + urlPath);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
    };

    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, 500); }
        resolve({ status: res.statusCode, body: parsed, raw: raw.slice(0, 800) });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Pretty printers ─────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function banner(num, title) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`  TEST ${num}: ${title}`);
  console.log(`${'='.repeat(72)}`);
}

function result(label, pass, details) {
  const icon = pass ? 'PASS' : 'FAIL';
  if (pass) passCount++; else failCount++;
  console.log(`  [${icon}]  ${label}`);
  if (details) {
    const lines = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
    lines.split('\n').forEach(l => console.log(`         ${l}`));
  }
}

function showResponse(r) {
  console.log(`    HTTP ${r.status}`);
  console.log(`    Body: ${r.raw.slice(0, 600)}`);
}

// ─── Test account creation ────────────────────────────────────────────────────

const TEST_ADMIN_USER = `_verify_admin_${Date.now()}@test.local`;
const TEST_ADMIN_PASS = crypto.randomBytes(16).toString('base64url');
const TEST_APPROVER_USER = `_verify_approver_${Date.now()}@test.local`;
const TEST_APPROVER_PASS = crypto.randomBytes(16).toString('base64url');

let testAdminId = null;
let testApproverId = null;

async function createTestAccounts() {
  console.log('  Setting up test accounts...');

  // Admin account
  testAdminId = uuid();
  const adminHash = bcrypt.hashSync(TEST_ADMIN_PASS, 10);
  await db('users').insert({
    id: testAdminId,
    username: TEST_ADMIN_USER,
    password_hash: adminHash,
    role: 'Admin',
    full_name: 'VerifyAuth Admin',
    approved_domains: null,
    status: 'active',
  });
  console.log(`    Admin:    ${TEST_ADMIN_USER}  (pass=${TEST_ADMIN_PASS})`);

  // Approver account with Security (IPsec) domain
  testApproverId = uuid();
  const approverHash = bcrypt.hashSync(TEST_APPROVER_PASS, 10);
  await db('users').insert({
    id: testApproverId,
    username: TEST_APPROVER_USER,
    password_hash: approverHash,
    role: 'Approver',
    full_name: 'VerifyAuth Security Approver',
    approved_domains: JSON.stringify(['Security (IPsec)']),
    status: 'active',
  });
  console.log(`    Approver: ${TEST_APPROVER_USER}  (pass=${TEST_APPROVER_PASS})`);
  console.log(`              domains: ["Security (IPsec)"]`);
}

async function cleanupTestAccounts() {
  console.log('\n  Cleaning up test accounts...');
  if (testAdminId) await db('users').where({ id: testAdminId }).del().catch(() => {});
  if (testApproverId) await db('users').where({ id: testApproverId }).del().catch(() => {});
  console.log('    Done.');
}

// ─── Fixture creation for Test 4 ─────────────────────────────────────────────

/**
 * Create a fresh diff with an approval workflow + step in the given category.
 * Returns { diffId, workflowId, stepToken, stepId }
 */
async function createDiffFixture(category) {
  // Find or create a test operator
  let operator = await db('operators').where({ name: 'VerifyAuth Test Operator' }).first();
  if (!operator) {
    const opId = uuid();
    await db('operators').insert({
      id: opId,
      name: 'VerifyAuth Test Operator',
      country: 'Test Country',
      normalized_name: 'verifyauth test operator',
      network_code: '999-99',
      contact_email: 'test@test.local',
      ingest_mode: 'manual',
      default_doc_type: 'IR21',
    });
    operator = await db('operators').where({ id: opId }).first();
  }

  // Find or create a test document
  let document = await db('documents').where({ operator_id: operator.id, title: 'VerifyAuth Test Doc' }).first();
  if (!document) {
    const docId = uuid();
    await db('documents').insert({
      id: docId,
      operator_id: operator.id,
      doc_type: 'IR21',
      format: 'pdf',
      title: 'VerifyAuth Test Doc',
    });
    document = await db('documents').where({ id: docId }).first();
  }

  // Create a test document version
  const verId = uuid();
  await db('document_versions').insert({
    id: verId,
    document_id: document.id,
    version_number: Date.now(),
    original_filename: `verify_auth_${category.replace(/[^a-zA-Z]/g, '_')}.pdf`,
    file_path: '/dev/null',
  });

  // Create a diff
  const diffId = uuid();
  await db('diffs').insert({
    id: diffId,
    document_id: document.id,
    to_version_id: verId,
    status: 'in_approval',
    total_changes: 1,
    highest_severity: 'medium',
  });

  // Insert a diff_item in the target category
  await db('diff_items').insert({
    id: uuid(),
    diff_id: diffId,
    field_path: `test.${category}.field`,
    old_value: 'old_value',
    new_value: 'new_value',
    change_type: 'modified',
    category: category,
    domain: category,
    severity: 'medium',
  });

  // Create workflow
  const workflowId = uuid();
  await db('approval_workflows').insert({
    id: workflowId,
    diff_id: diffId,
    status: 'in_progress',
  });

  // Create an approval step with a fresh token
  const stepToken = crypto.randomBytes(24).toString('hex');
  const stepId = uuid();
  await db('approval_steps').insert({
    id: stepId,
    workflow_id: workflowId,
    step_order: 1,
    category: category,
    role_title: `${category} Tester`,
    approver_name: 'Test',
    approver_email: 'test@test.local',
    status: 'pending',
    token: stepToken,
  });

  return { diffId, workflowId, stepToken, stepId, operatorId: operator.id, documentId: document.id };
}

async function cleanupFixture(fixture) {
  try {
    if (fixture.stepId) await db('approval_steps').where({ id: fixture.stepId }).del();
    if (fixture.workflowId) await db('approval_workflows').where({ id: fixture.workflowId }).del();
    if (fixture.diffId) {
      await db('diff_items').where({ diff_id: fixture.diffId }).del();
      await db('diffs').where({ id: fixture.diffId }).del();
    }
  } catch (e) { /* swallow */ }
}

async function cleanupAllFixtures() {
  // Clean up operator/document created for fixtures
  const doc = await db('documents').where({ title: 'VerifyAuth Test Doc' }).first();
  if (doc) {
    await db('document_versions').where({ document_id: doc.id }).del().catch(() => {});
    await db('documents').where({ id: doc.id }).del().catch(() => {});
  }
  await db('operators').where({ name: 'VerifyAuth Test Operator' }).del().catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`  Phase 1 -- Authentication & Authorization Verification`);
  console.log(`  ${new Date().toISOString()}`);
  console.log(`${'='.repeat(72)}`);
  console.log(`  Server:   ${BASE}`);

  // ── Setup: create test accounts directly in DB ──
  await createTestAccounts();

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 1: Valid Admin login -> 200, token, role
  // ════════════════════════════════════════════════════════════════════════════
  banner(1, 'Valid Admin Login');

  const loginRes = await request('POST', '/api/auth/login', {
    username: TEST_ADMIN_USER,
    password: TEST_ADMIN_PASS,
  });
  showResponse(loginRes);
  result('Status is 200', loginRes.status === 200, `status=${loginRes.status}`);
  result('Response contains token', !!loginRes.body.token,
    `token=${loginRes.body.token ? loginRes.body.token.slice(0, 16) + '...' : 'MISSING'}`);
  result('Response contains role=Admin', loginRes.body.role === 'Admin', `role=${loginRes.body.role}`);
  result('Response contains full_name', typeof loginRes.body.full_name === 'string' && loginRes.body.full_name.length > 0,
    `full_name=${loginRes.body.full_name}`);

  const adminToken = loginRes.body.token;

  // Verify session check works
  const sessionRes = await request('GET', '/api/auth/session', null, adminToken);
  console.log('\n  Session check (/api/auth/session):');
  showResponse(sessionRes);
  result('Session confirms loggedIn=true', sessionRes.body.loggedIn === true);
  result('Session shows correct role', sessionRes.body.role === 'Admin', `role=${sessionRes.body.role}`);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 2: Invalid credentials -> 401
  // ════════════════════════════════════════════════════════════════════════════
  banner(2, 'Invalid Credentials Rejected');

  const badPassRes = await request('POST', '/api/auth/login', {
    username: TEST_ADMIN_USER,
    password: 'completely-wrong-password-12345',
  });
  console.log('  (a) Wrong password:');
  showResponse(badPassRes);
  result('Wrong password -> 401', badPassRes.status === 401, `status=${badPassRes.status}`);

  const badUserRes = await request('POST', '/api/auth/login', {
    username: 'nonexistent-user-xyz@fake.com',
    password: 'irrelevant',
  });
  console.log('\n  (b) Non-existent user:');
  showResponse(badUserRes);
  result('Non-existent user -> 401', badUserRes.status === 401, `status=${badUserRes.status}`);

  const emptyRes = await request('POST', '/api/auth/login', {});
  console.log('\n  (c) Missing username & password:');
  showResponse(emptyRes);
  result('Empty body -> 400', emptyRes.status === 400, `status=${emptyRes.status}`);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 3: Role-based access control -- Admin-only endpoint
  // ════════════════════════════════════════════════════════════════════════════
  banner(3, 'Role-Based Access Control (Admin-Only Endpoints)');

  // 3a: No token -> 401
  const noTokenRes = await request('GET', '/api/users', null, null);
  console.log('  (a) No token -> GET /api/users:');
  showResponse(noTokenRes);
  result('No token -> 401', noTokenRes.status === 401,
    `status=${noTokenRes.status}, error=${noTokenRes.body.error}`);

  // 3b: Approver login + try Admin-only endpoint -> 403
  const approverLoginRes = await request('POST', '/api/auth/login', {
    username: TEST_APPROVER_USER,
    password: TEST_APPROVER_PASS,
  });
  console.log('\n  (b) Approver login:');
  showResponse(approverLoginRes);
  result('Approver login succeeds', approverLoginRes.status === 200, `status=${approverLoginRes.status}`);

  const approverToken = approverLoginRes.body.token;
  const approverDomains = approverLoginRes.body.approved_domains;
  console.log(`      approved_domains: ${JSON.stringify(approverDomains)}`);

  const approverUsersRes = await request('GET', '/api/users', null, approverToken);
  console.log('\n      Approver -> GET /api/users:');
  showResponse(approverUsersRes);
  result('Approver -> /api/users -> 403', approverUsersRes.status === 403,
    `status=${approverUsersRes.status}, error=${approverUsersRes.body.error}`);

  // 3c: Admin token -> 200
  const adminUsersRes = await request('GET', '/api/users', null, adminToken);
  console.log('\n  (c) Admin -> GET /api/users:');
  showResponse(adminUsersRes);
  result('Admin -> /api/users -> 200', adminUsersRes.status === 200,
    `status=${adminUsersRes.status}, returned ${Array.isArray(adminUsersRes.body) ? adminUsersRes.body.length : '?'} users`);

  // 3d: Approver -> Admin-gated /api/settings/routing -> 403
  const approverSettingsRes = await request('GET', '/api/settings/routing', null, approverToken);
  console.log('\n  (d) Approver -> GET /api/settings/routing (Admin-gated):');
  showResponse(approverSettingsRes);
  result('Approver -> /api/settings/routing -> 403', approverSettingsRes.status === 403,
    `status=${approverSettingsRes.status}`);

  const adminSettingsRes = await request('GET', '/api/settings/routing', null, adminToken);
  console.log('\n      Admin -> GET /api/settings/routing:');
  showResponse(adminSettingsRes);
  result('Admin -> /api/settings/routing -> 200', adminSettingsRes.status === 200,
    `status=${adminSettingsRes.status}, categories=${Array.isArray(adminSettingsRes.body) ? adminSettingsRes.body.map(r => r.category).join(', ') : '?'}`);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 4: Domain Enforcement -- The Critical Test
  // ════════════════════════════════════════════════════════════════════════════
  banner(4, 'Domain Enforcement on Approval Endpoints');

  console.log('  Creating fresh Security (IPsec) test fixture...');
  const secFixture = await createDiffFixture('Security (IPsec)');
  console.log(`    diff_id:    ${secFixture.diffId}`);
  console.log(`    workflow:   ${secFixture.workflowId}`);
  console.log(`    step_token: ${secFixture.stepToken.slice(0, 20)}...`);
  console.log(`    step_id:    ${secFixture.stepId}`);
  console.log(`    category:   Security (IPsec)`);

  console.log('\n  Creating fresh Routing (GT) test fixture...');
  const routingFixture = await createDiffFixture('Routing (GT)');
  console.log(`    diff_id:    ${routingFixture.diffId}`);
  console.log(`    workflow:   ${routingFixture.workflowId}`);
  console.log(`    step_token: ${routingFixture.stepToken.slice(0, 20)}...`);
  console.log(`    step_id:    ${routingFixture.stepId}`);
  console.log(`    category:   Routing (GT)`);

  // -- Case A: Security Approver -> Security step -> should SUCCEED
  console.log('\n  --- Case A: Security Approver -> Security step (should SUCCEED) ---');
  console.log(`  Approver user:    ${TEST_APPROVER_USER}`);
  console.log(`  Approver domains: ${JSON.stringify(approverDomains)}`);
  console.log(`  Step category:    Security (IPsec)`);

  const caseARes = await request('POST', `/api/approvals/${secFixture.stepToken}/decide`, {
    action: 'approve',
    comment: 'verify_auth.js Test 4 Case A -- domain-authorized approval',
  }, approverToken);
  console.log('  Response:');
  showResponse(caseARes);
  result('Case A: Security Approver -> Security step -> 200 (authorized)',
    caseARes.status === 200,
    `status=${caseARes.status}, body=${JSON.stringify(caseARes.body).slice(0, 200)}`);

  // Verify the step was actually approved in the DB
  const approvedStep = await db('approval_steps').where({ id: secFixture.stepId }).first();
  console.log(`    DB step status after approval: ${approvedStep ? approvedStep.status : 'NOT_FOUND'}`);
  result('Case A: DB confirms step status=approved',
    approvedStep && approvedStep.status === 'approved',
    `status=${approvedStep ? approvedStep.status : 'MISSING'}`);

  // -- Case B: Security Approver -> Routing step -> should be REJECTED
  console.log('\n  --- Case B: Security Approver -> Routing step (should be REJECTED 403) ---');
  console.log(`  Approver user:    ${TEST_APPROVER_USER}`);
  console.log(`  Approver domains: ${JSON.stringify(approverDomains)}`);
  console.log(`  Step category:    Routing (GT)`);

  const caseBRes = await request('POST', `/api/approvals/${routingFixture.stepToken}/decide`, {
    action: 'approve',
    comment: 'verify_auth.js Test 4 Case B -- should be BLOCKED by domain enforcement',
  }, approverToken);
  console.log('  Response:');
  showResponse(caseBRes);
  result('Case B: Security Approver -> Routing step -> 403 (domain mismatch)',
    caseBRes.status === 403,
    `status=${caseBRes.status}, error=${caseBRes.body.error || caseBRes.body}`);

  // Verify the step was NOT approved in the DB
  const blockedStep = await db('approval_steps').where({ id: routingFixture.stepId }).first();
  console.log(`    DB step status (should still be pending): ${blockedStep ? blockedStep.status : 'NOT_FOUND'}`);
  result('Case B: DB confirms step still pending (not approved)',
    blockedStep && blockedStep.status === 'pending',
    `status=${blockedStep ? blockedStep.status : 'MISSING'}`);

  // Also test the GET /:token/decide endpoint for domain enforcement
  console.log('\n  --- Case B (GET endpoint): Security Approver -> Routing step via GET ---');
  const caseBGetRes = await request('GET',
    `/api/approvals/${routingFixture.stepToken}/decide?action=approve`,
    null, approverToken);
  console.log('  Response:');
  showResponse(caseBGetRes);
  result('Case B GET: Security Approver -> Routing step -> 403',
    caseBGetRes.status === 403,
    `status=${caseBGetRes.status}`);

  // Clean up test fixtures
  console.log('\n  Cleaning up Test 4 fixtures...');
  await cleanupFixture(secFixture);
  await cleanupFixture(routingFixture);
  console.log('    Done.');

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 5: Session Invalidation -- Deactivate user -> old token -> 401
  // ════════════════════════════════════════════════════════════════════════════
  banner(5, 'Session Invalidation on User Deactivation');

  // Create a temporary test user via Admin API
  console.log('  Creating temporary test user via POST /api/users...');
  const tempUsername = `_verify_temp_${Date.now()}@test.local`;
  const createUserRes = await request('POST', '/api/users', {
    username: tempUsername,
    full_name: 'Verify Auth Temp User',
    role: 'Analyst',
  }, adminToken);
  console.log('  Create user response:');
  showResponse(createUserRes);
  result('Temp user created', createUserRes.status === 200, `username=${tempUsername}`);

  const tempUserId = createUserRes.body.user ? createUserRes.body.user.id : null;
  const tempPassword = createUserRes.body.temp_password;
  console.log(`    user_id:       ${tempUserId}`);
  console.log(`    temp_password: ${tempPassword}`);

  // Login as temp user
  const tempLoginRes = await request('POST', '/api/auth/login', {
    username: tempUsername,
    password: tempPassword,
  });
  console.log('\n  Temp user login:');
  showResponse(tempLoginRes);
  result('Temp user login -> 200', tempLoginRes.status === 200);
  const tempToken = tempLoginRes.body.token;

  // Verify temp user can access an authenticated endpoint
  const tempDashRes = await request('GET', '/api/dashboard/stats', null, tempToken);
  console.log('\n  Temp user -> GET /api/dashboard/stats (before deactivation):');
  showResponse(tempDashRes);
  result('Temp user -> dashboard -> 200 (active)', tempDashRes.status === 200);

  // Admin deactivates the temp user
  console.log('\n  Admin deactivates temp user via PATCH /api/users/:id ...');
  const deactivateRes = await request('PATCH', `/api/users/${tempUserId}`, {
    status: 'inactive',
  }, adminToken);
  console.log('  Deactivate response:');
  showResponse(deactivateRes);
  result('Deactivation -> sessions_invalidated=true',
    deactivateRes.body.sessions_invalidated === true,
    `sessions_invalidated=${deactivateRes.body.sessions_invalidated}`);

  // Old token should now be dead
  const afterDeactivateRes = await request('GET', '/api/dashboard/stats', null, tempToken);
  console.log('\n  Temp user -> GET /api/dashboard/stats (AFTER deactivation):');
  showResponse(afterDeactivateRes);
  result('Old token -> 401 after deactivation', afterDeactivateRes.status === 401,
    `status=${afterDeactivateRes.status}, error=${afterDeactivateRes.body.error}`);

  // Re-login also fails because status=inactive
  const reloginRes = await request('POST', '/api/auth/login', {
    username: tempUsername,
    password: tempPassword,
  });
  console.log('\n  Re-login attempt after deactivation:');
  showResponse(reloginRes);
  result('Re-login after deactivation -> 401', reloginRes.status === 401,
    `status=${reloginRes.status}, error=${reloginRes.body.error}`);

  // Clean up temp user
  await db('users').where({ id: tempUserId }).del().catch(() => {});
  console.log(`  Cleaned up temp user ${tempUserId}`);

  // ════════════════════════════════════════════════════════════════════════════
  // TEST 6: Logout -> token stops working
  // ════════════════════════════════════════════════════════════════════════════
  banner(6, 'Logout Invalidates Token');

  // Login fresh to get a token specifically for this test
  const freshLoginRes = await request('POST', '/api/auth/login', {
    username: TEST_APPROVER_USER,
    password: TEST_APPROVER_PASS,
  });
  const freshToken = freshLoginRes.body.token;
  console.log(`  Fresh approver token: ${freshToken ? freshToken.slice(0, 16) + '...' : 'MISSING'}`);

  // Verify token works
  const beforeLogoutRes = await request('GET', '/api/auth/session', null, freshToken);
  console.log('\n  Before logout -- session check:');
  showResponse(beforeLogoutRes);
  result('Token works before logout', beforeLogoutRes.body.loggedIn === true);

  // Logout
  const logoutRes = await request('POST', '/api/auth/logout', null, freshToken);
  console.log('\n  Logout:');
  showResponse(logoutRes);
  result('Logout -> success=true', logoutRes.body.success === true);

  // Token should no longer work
  const afterLogoutRes = await request('GET', '/api/auth/session', null, freshToken);
  console.log('\n  After logout -- session check:');
  showResponse(afterLogoutRes);
  result('Token dead after logout -> loggedIn=false', afterLogoutRes.body.loggedIn === false,
    `loggedIn=${afterLogoutRes.body.loggedIn}`);

  // Protected endpoint should also reject
  const afterLogoutProtectedRes = await request('GET', '/api/approvals', null, freshToken);
  console.log('\n  After logout -- protected endpoint (GET /api/approvals):');
  showResponse(afterLogoutProtectedRes);
  result('Protected endpoint -> 401 after logout', afterLogoutProtectedRes.status === 401,
    `status=${afterLogoutProtectedRes.status}`);

  // ════════════════════════════════════════════════════════════════════════════
  // CLEANUP & SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  await cleanupTestAccounts();
  await cleanupAllFixtures();

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  FINAL RESULTS`);
  console.log(`${'='.repeat(72)}`);
  console.log(`  Passed: ${passCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Total:  ${passCount + failCount}`);
  console.log(`${'='.repeat(72)}\n`);

  await db.destroy();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(async err => {
  console.error('\nFATAL ERROR:', err);
  try { await cleanupTestAccounts(); } catch (_) {}
  try { await cleanupAllFixtures(); } catch (_) {}
  try { await db.destroy(); } catch (_) {}
  process.exit(2);
});
