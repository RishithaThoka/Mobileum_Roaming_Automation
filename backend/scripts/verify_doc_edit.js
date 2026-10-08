#!/usr/bin/env node
'use strict';

/**
 * verify_doc_edit.js
 *
 * Integration test for the Document Viewer + Role-Based Editing feature.
 * Tests all cases specified in the implementation plan:
 *
 *   T1  Allowed edit — Admin edits General field → 200, diff created, lock set
 *   T2  Allowed edit — Commercial approver edits Commercial field → 200
 *   T3  403 — Security approver tries to edit Routing field
 *   T4  403 — Analyst tries to edit anything
 *   T5  409 — Stale base_version_id
 *   T6  409 — Pending diff blocks edit
 *   T7  400 — Unknown field path rejected
 *   T8  Audit log — verify entries exist after T1
 *   T9  Force-release — Admin releases stuck lock
 *   T10 GET viewer — editable flags correct per role
 *
 * Uses REAL seeded accounts (real HTTP to running server).
 * Temporarily sets known test passwords, runs tests, then clears them.
 * Server must be running at PORT (default 4021).
 *
 * Usage:  node scripts/verify_doc_edit.js
 * Exit 0 = all pass.  Exit 1 = failures.
 */

const http    = require('http');
const https   = require('https');
const bcrypt  = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db      = require('../db');

const BASE_URL = process.env.VERIFY_URL || 'http://localhost:4021';
const IS_HTTPS = BASE_URL.startsWith('https');

// ── Test document: use the clean RAEX - INDAT doc (no pending diffs) ─────────
// Falls back to first doc with a baseline and 0 pending diffs.
const DOC_ID_PREFERRED = '8f922f43-8201-4dbd-a5f9-08d5c9059525';

// ── Ephemeral test accounts ───────────────────────────────────────────────────
// verify_doc_edit.js NEVER touches live user passwords.
// It creates _verify_test_* accounts before the run and deletes them after.
// These accounts are recognised by the server because they are inserted into
// the same DB the server reads.  No live account is mutated.
const TEST_PASS = 'Verify_Eph_077!';
const EPHEMERAL_ACCOUNTS = [
  { username: '_verify_test_admin@test.local',    role: 'Admin',    domains: null },
  { username: '_verify_test_commercial@test.local', role: 'Approver', domains: JSON.stringify(['Commercial (IOT)']) },
  { username: '_verify_test_security@test.local', role: 'Approver', domains: JSON.stringify(['Security (IPsec)']) },
  { username: '_verify_test_routing@test.local',  role: 'Approver', domains: JSON.stringify(['Routing (GT)']) },
  { username: '_verify_test_analyst@test.local',  role: 'Analyst',  domains: null },
];

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
    };
    const lib = IS_HTTPS ? https : http;
    const req = lib.request({
      hostname: url.hostname, port: url.port || (IS_HTTPS ? 443 : 80),
      path: url.pathname, method, headers,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(username) {
  const r = await request('POST', '/api/auth/login', { username, password: TEST_PASS });
  if (r.status !== 200 || !r.body.token) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(r.body)}`);
  }
  return r.body.token;
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failures.push(label);
    failed++;
  }
}

// ─── Setup: create ephemeral test accounts ──────────────────────────────────────────────
// Creates _verify_test_* users in the live DB. Server reads the same DB,
// so these accounts work transparently via HTTP. Deleted in teardown.

async function createEphemeralAccounts() {
  const hash = await bcrypt.hash(TEST_PASS, 8);
  const now  = new Date().toISOString();
  // Delete any leftover accounts from a previous crashed run
  await db('users').where('username', 'like', '_verify_test_%').del();
  for (const acct of EPHEMERAL_ACCOUNTS) {
    await db('users').insert({
      id:               uuid(),
      username:         acct.username,
      full_name:        `Verify Test ${acct.role}`,
      password_hash:    hash,
      role:             acct.role,
      approved_domains: acct.domains || null,
      status:           'active',
      created_at:       now,
    });
  }
  console.log(`[setup] Created ${EPHEMERAL_ACCOUNTS.length} ephemeral test accounts (no live account touched)\n`);
}

async function deleteEphemeralAccounts() {
  const n = await db('users').where('username', 'like', '_verify_test_%').del();
  console.log(`[teardown] Deleted ${n} ephemeral test accounts`);
}

// ─── Setup: find clean document ───────────────────────────────────────────────

async function findCleanDoc() {
  // Preferred doc first
  const preferred = await db('document_versions')
    .where({ document_id: DOC_ID_PREFERRED, is_current_baseline: 1 }).first();
  if (preferred) {
    const pending = await db('diffs')
      .where({ document_id: DOC_ID_PREFERRED })
      .whereIn('status', ['pending_workflow', 'in_approval']);
    if (pending.length === 0) {
      // Also clear any stale edit lock
      await db('document_edit_locks').where({ document_id: DOC_ID_PREFERRED }).del();
      return { docId: DOC_ID_PREFERRED, baseline: preferred };
    }
  }
  // Fallback: any doc with baseline, 0 pending, has extracted_fields
  const docs = await db('documents').select('id');
  for (const d of docs) {
    const b = await db('document_versions')
      .where({ document_id: d.id, is_current_baseline: 1 }).first();
    if (!b || !b.extracted_fields) continue;
    const pending = await db('diffs')
      .where({ document_id: d.id })
      .whereIn('status', ['pending_workflow', 'in_approval']);
    if (pending.length === 0) {
      await db('document_edit_locks').where({ document_id: d.id }).del();
      return { docId: d.id, baseline: b };
    }
  }
  // Self-heal: try to restore baseline for docs that lost theirs (e.g. after a failed test run)
  let healed = false;
  for (const d of docs) {
    const current = await db('document_versions')
      .where({ document_id: d.id, is_current_baseline: 1 }).first();
    if (current) continue; // already has a baseline
    const approved = await db('document_versions')
      .where({ document_id: d.id, approval_status: 'approved' })
      .orderBy('version_number', 'desc').first();
    if (!approved || !approved.extracted_fields) continue;
    await db('document_versions').where({ document_id: d.id }).update({ is_current_baseline: 0 });
    await db('document_versions').where({ id: approved.id }).update({ is_current_baseline: 1 });
    await db('document_edit_locks').where({ document_id: d.id }).del();
    await db('document_workflow_state').where({ document_id: d.id })
      .update({ stage_status: 'approved', updated_at: new Date().toISOString() }).catch(() => {});
    console.log(`[findCleanDoc] Self-healed baseline for ${d.id.slice(0, 8)} → v${approved.version_number}`);
    healed = true;
  }
  if (healed) {
    // Retry after healing
    for (const d of docs) {
      const b = await db('document_versions')
        .where({ document_id: d.id, is_current_baseline: 1 }).first();
      if (!b || !b.extracted_fields) continue;
      const pending = await db('diffs').where({ document_id: d.id })
        .whereIn('status', ['pending_workflow', 'in_approval']);
      if (pending.length === 0) {
        await db('document_edit_locks').where({ document_id: d.id }).del();
        return { docId: d.id, baseline: b };
      }
    }
  }
  throw new Error('No clean document found (baseline + no pending diffs). Run a reject or deploy first.');

}

// ─── Teardown: remove test data created during tests ─────────────────────────

async function cleanupTestData(docId, createdVersionIds, createdDiffIds) {
  // Remove in FK order: steps → workflows → diff_items → diffs → versions → locks
  for (const diffId of createdDiffIds) {
    const wf = await db('approval_workflows').where({ diff_id: diffId }).first();
    if (wf) {
      await db('approval_steps').where({ workflow_id: wf.id }).del();
      await db('approval_workflows').where({ id: wf.id }).del();
    }
    await db('diff_items').where({ diff_id: diffId }).del();
    await db('diffs').where({ id: diffId }).del();
  }
  for (const vId of createdVersionIds) {
    await db('document_versions').where({ id: vId }).del();
  }
  await db('document_edit_locks').where({ document_id: docId }).del();
  // Restore workflow state to whatever it was
  await db('document_workflow_state').where({ document_id: docId })
    .update({ stage_status: 'running', updated_at: new Date().toISOString() })
    .catch(() => {});
  console.log(`\n[cleanup] Removed ${createdDiffIds.length} test diffs and ${createdVersionIds.length} test versions`);
  await deleteEphemeralAccounts();
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══ VERIFY: Document Viewer + Role-Based Editing ═══\n');

  // Confirm server is up
  try {
    await request('GET', '/api/auth/session');
  } catch (e) {
    console.error(`Server not reachable at ${BASE_URL}: ${e.message}`);
    console.error('Start the backend with: npm run dev');
    process.exit(2);
  }
  console.log(`[server] Reachable at ${BASE_URL}\n`);

  await createEphemeralAccounts();

  // Login all ephemeral accounts
  const tokens = {};
  for (const acct of EPHEMERAL_ACCOUNTS) {
    const domainKey = acct.domains ? JSON.parse(acct.domains).join(',') : '';
    tokens[acct.role + (domainKey ? '_' + domainKey : '')] = await login(acct.username);
  }
  const adminToken      = tokens['Admin'];
  const commercialToken = tokens['Approver_Commercial (IOT)'];
  const securityToken   = tokens['Approver_Security (IPsec)'];
  const routingToken    = tokens['Approver_Routing (GT)'];
  const analystToken    = tokens['Analyst'];
  console.log('[login] All ephemeral accounts authenticated\n');

  // Find clean document
  const { docId, baseline } = await findCleanDoc();
  const baseVersionId = baseline.id;
  const baseFields = JSON.parse(baseline.extracted_fields);

  // Find a General, Commercial, and Routing field from this document.
  // Use catalog-aware lookup (async) so HLR Global Title resolves correctly
  // (catalog_pending → Routing GT) and Signalling Point Code also qualifies.
  const { getFieldOwnerWithCatalog, isFieldHidden } = require('../services/fieldOwnership');
  let generalField = null, commercialField = null, routingField = null;
  for (const k of Object.keys(baseFields)) {
    if (isFieldHidden(k)) continue;
    const owner = await getFieldOwnerWithCatalog(k, db, '*');
    if (!generalField  && owner.domain === 'General')           generalField  = k;
    if (!commercialField && owner.domain === 'Commercial (IOT)') commercialField = k;
    if (!routingField  && owner.domain === 'Routing (GT)')      routingField  = k;
    if (generalField && commercialField && routingField) break;
  }

  // If primary doc has no Routing field, scan all other docs
  if (!routingField) {
    const allDocs = await db('documents').select('id');
    outer: for (const d of allDocs) {
      if (d.id === docId) continue;
      const b = await db('document_versions').where({ document_id: d.id, is_current_baseline: 1 }).first();
      if (!b || !b.extracted_fields) continue;
      const pending = await db('diffs').where({ document_id: d.id }).whereIn('status', ['pending_workflow', 'in_approval']);
      if (pending.length > 0) continue;
      const fields = JSON.parse(b.extracted_fields);
      for (const k of Object.keys(fields)) {
        if (isFieldHidden(k)) continue;
        const owner = await getFieldOwnerWithCatalog(k, db, '*');
        if (owner.domain === 'Routing (GT)') {
          routingField = k;
          break outer;
        }
      }
    }
  }

  // Identify which document the routing field lives in (may differ from primary docId)
  let resolvedRoutingDocId = docId;
  if (routingField && !JSON.parse(baseline.extracted_fields).hasOwnProperty(routingField)) {
    const allDocsForRouting = await db('documents').select('id');
    for (const d of allDocsForRouting) {
      const b2 = await db('document_versions').where({ document_id: d.id, is_current_baseline: 1 }).first();
      if (b2 && b2.extracted_fields) {
        const f2 = JSON.parse(b2.extracted_fields);
        if (Object.prototype.hasOwnProperty.call(f2, routingField)) {
          resolvedRoutingDocId = d.id;
          break;
        }
      }
    }
  }

  console.log(`[doc] ID: ${docId}`);
  console.log(`[doc] Baseline: ${baseVersionId.slice(0, 8)}\u2026 v${baseline.version_number}`);
  console.log(`[doc] General field: "${generalField}"`);
  console.log(`[doc] Commercial field: "${commercialField || 'NONE — skipping T2'}"`);
  console.log(`[doc] Routing field: "${routingField || 'NONE — HARD FAIL'}"\n`);

  // T3 requires a real Routing field — fail hard if none found.
  if (!routingField) {
    console.error('FATAL: No Routing (GT) field found in any clean document.');
    console.error('T3 cannot run. Check that at least one doc with Signalling Point Code or similar is ingested.');
    process.exit(1);
  }

  const createdVersionIds = [];
  const createdDiffIds    = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // T10: GET viewer — editable flags correct per role (before any edits)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T10: GET /:id/fields viewer ───');
  {
    const r = await request('GET', `/api/documents/${docId}/fields`, null, adminToken);
    assert('T10 Admin viewer returns 200', r.status === 200, `got ${r.status}`);
    if (r.status === 200) {
      assert('T10 base_version_id present', !!r.body.base_version_id);
      assert('T10 edit_locked is false (no pending diff)', r.body.edit_locked === false);
      if (generalField) {
        const f = r.body.fields[generalField];
        assert(`T10 Admin: General field "${generalField}" is editable`, f && f.editable === true,
          f ? `editable=${f.editable}` : 'field not in response');
      }
      // Verify routing field domain annotation — query the doc that actually owns it
      if (routingField) {
        const f = r.body.fields && r.body.fields[routingField];
        if (f) {
          // Routing field is in the primary doc — assert owner_domain annotation present
          assert(`T10 Admin: Routing field has owner_domain annotation`, typeof f.owner_domain === 'string',
            `field: ${JSON.stringify(f)}`);
        } else if (resolvedRoutingDocId && resolvedRoutingDocId !== docId) {
          // Routing field lives in a different doc — query that doc's viewer directly
          const rRt = await request('GET', `/api/documents/${resolvedRoutingDocId}/fields`, null, adminToken);
          const fRt = rRt.status === 200 && rRt.body.fields && rRt.body.fields[routingField];
          assert(`T10 Admin: Routing field owner_domain annotation (cross-doc)`,
            fRt && typeof fRt.owner_domain === 'string',
            fRt ? `owner_domain=${fRt.owner_domain}` : `field not in cross-doc response (status ${rRt.status})`);
          if (fRt) {
            assert(`T10 Admin: Routing field not editable by Admin (cross-doc)`,
              fRt.editable === false,
              `editable=${fRt.editable} owner_domain=${fRt.owner_domain}`);
          }
        }
      }
    }

    // Viewer for Security approver
    const r2 = await request('GET', `/api/documents/${docId}/fields`, null, securityToken);
    assert('T10 Security approver viewer returns 200', r2.status === 200, `got ${r2.status}`);
    if (r2.status === 200 && generalField) {
      const f = r2.body.fields[generalField];
      assert(`T10 Security approver: General field NOT editable`, f && f.editable === false,
        f ? `editable=${f.editable}` : 'field missing');
    }

    // Analyst viewer
    const r3 = await request('GET', `/api/documents/${docId}/fields`, null, analystToken);
    assert('T10 Analyst viewer returns 200', r3.status === 200, `got ${r3.status}`);
    if (r3.status === 200 && generalField) {
      const f = r3.body.fields[generalField];
      assert('T10 Analyst: no field is editable', f && f.editable === false,
        f ? `editable=${f.editable}` : 'field missing');
    }
  }
  console.log('');


  // ─────────────────────────────────────────────────────────────────────────────
  // T5: 409 on stale base_version_id (before any real edit)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T5: Stale base_version_id → 409 ───');
  if (generalField) {
    const r = await request('PATCH', `/api/documents/${docId}/fields`, {
      base_version_id: 'stale-version-id-that-does-not-exist',
      changes: { [generalField]: 'test value' },
      comment: 'stale test',
    }, adminToken);
    assert('T5 stale base_version_id returns 409', r.status === 409,
      `got ${r.status}: ${JSON.stringify(r.body)}`);
    assert('T5 response contains current_base_version_id', !!r.body.current_base_version_id);
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T7: Unknown field path rejected
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T7: Unknown field path → 400 ───');
  {
    const r = await request('PATCH', `/api/documents/${docId}/fields`, {
      base_version_id: baseVersionId,
      changes: { 'INVENTED.Field.That.Does.Not.Exist': 'injected' },
      comment: 'unknown path test',
    }, adminToken);
    assert('T7 unknown field returns 400', r.status === 400,
      `got ${r.status}: ${JSON.stringify(r.body)}`);
    assert('T7 unknown_paths in response', Array.isArray(r.body.unknown_paths));
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T3: 403 — Security approver tries to edit Routing field
  //     200 — Routing approver succeeds on same field
  // Both assertions are required. No SKIP.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T3: Wrong-domain Approver → 403, Right-domain Approver → 200 ───');
  {
    // routingField is guaranteed non-null (FATAL check above)
    // Find a doc that has the routing field AND has no pending diffs.
    // The primary doc may now have a pending diff from T1, so we always scan.
    let t3DocId = null, t3BaseVersionId = null, t3RoutingField = null;
    const allDocs = await db('documents').select('id');
    for (const d of allDocs) {
      const b = await db('document_versions').where({ document_id: d.id, is_current_baseline: 1 }).first();
      if (!b || !b.extracted_fields) continue;
      const pend = await db('diffs').where({ document_id: d.id }).whereIn('status', ['pending_workflow', 'in_approval']);
      if (pend.length > 0) continue; // skip docs with pending diffs
      await db('document_edit_locks').where({ document_id: d.id }).del(); // clear any stale lock
      const fields = JSON.parse(b.extracted_fields);
      // Find a Routing field in this doc using catalog-aware lookup
      for (const k of Object.keys(fields)) {
        if (isFieldHidden(k)) continue;
        const owner = await getFieldOwnerWithCatalog(k, db, '*');
        if (owner.domain === 'Routing (GT)') {
          t3DocId = d.id;
          t3BaseVersionId = b.id;
          t3RoutingField = k;
          break;
        }
      }
      if (t3DocId) break;
    }

    if (!t3DocId) {
      console.error('FATAL T3: No clean doc with a Routing field found. Cannot assert T3a/T3b.');
      process.exit(1);
    }
    // Override the routing field with the one found in the clean doc
    const t3FieldToEdit = t3RoutingField;

    // Assert 1: Security approver editing a Routing field → 403
    const r403 = await request('PATCH', `/api/documents/${t3DocId}/fields`, {
      base_version_id: t3BaseVersionId,
      changes: { [t3FieldToEdit]: 'forbidden attempt' },
      comment: 'T3a: security approver should be rejected on routing field',
    }, securityToken);
    assert('T3a Security approver editing Routing field → 403', r403.status === 403,
      `got ${r403.status}: ${JSON.stringify(r403.body)}`);
    assert('T3a forbidden_fields in response', Array.isArray(r403.body.forbidden_fields),
      JSON.stringify(r403.body));
    assert('T3a forbidden field path matches', r403.body.forbidden_fields &&
      r403.body.forbidden_fields.some(f => f.path === t3FieldToEdit),
      JSON.stringify(r403.body.forbidden_fields));

    // Assert 2: Routing approver editing the same field → 200
    if (routingToken) {
      const r200 = await request('PATCH', `/api/documents/${t3DocId}/fields`, {
        base_version_id: t3BaseVersionId,
        changes: { [t3FieldToEdit]: `T3_routing_${Date.now()}` },
        comment: 'T3b: routing approver should succeed',
      }, routingToken);
      assert('T3b Routing approver editing Routing field → 200', r200.status === 200,
        `got ${r200.status}: ${JSON.stringify(r200.body)}`);
      if (r200.status === 200) {
        // Cleanup T3b immediately (secondary doc, not covered by main cleanup())
        const t3DiffId  = r200.body.diff_id;
        const t3VerId   = r200.body.version_id;
        if (t3DiffId) {
          const t3wf = await db('approval_workflows').where({ diff_id: t3DiffId }).first();
          if (t3wf) {
            await db('approval_steps').where({ workflow_id: t3wf.id }).del();
            await db('approval_workflows').where({ id: t3wf.id }).del();
          }
          await db('diff_items').where({ diff_id: t3DiffId }).del();
          await db('diffs').where({ id: t3DiffId }).del();
        }
        if (t3VerId) await db('document_versions').where({ id: t3VerId }).del();
        await db('document_edit_locks').where({ document_id: t3DocId }).del();
        console.log('  [T3b] secondary doc test data cleaned up');
      }
    } else {
      console.log('  SKIP  T3b — no Routing approver account configured in ACCOUNTS');
    }
  }
  console.log('');


  // ─────────────────────────────────────────────────────────────────────────────
  // T4: 403 — Analyst tries to edit any field
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T4: Analyst → 403 ───');
  if (generalField) {
    const r = await request('PATCH', `/api/documents/${docId}/fields`, {
      base_version_id: baseVersionId,
      changes: { [generalField]: 'analyst attempt' },
      comment: 'analyst edit attempt',
    }, analystToken);
    assert('T4 Analyst edit returns 403', r.status === 403,
      `got ${r.status}: ${JSON.stringify(r.body)}`);
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T1: Allowed edit — Admin edits General field → 200, diff created, lock set
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T1: Admin allowed edit ───');
  let t1DiffId = null;
  let t1VersionId = null;
  if (generalField) {
    const newValue = `Verify_Test_${Date.now()}`;
    const r = await request('PATCH', `/api/documents/${docId}/fields`, {
      base_version_id: baseVersionId,
      changes: { [generalField]: newValue },
      comment: 'T1 verify test: admin edits general field',
    }, adminToken);
    assert('T1 Admin edit returns 200', r.status === 200,
      `got ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.status === 200) {
      t1DiffId    = r.body.diff_id;
      t1VersionId = r.body.version_id;
      if (t1DiffId)    createdDiffIds.push(t1DiffId);
      if (t1VersionId) createdVersionIds.push(t1VersionId);
      assert('T1 diff_id returned',    !!r.body.diff_id);
      assert('T1 workflow_id returned', !!r.body.workflow_id);
      assert('T1 version_id returned',  !!r.body.version_id);

      // Verify lock was created in DB
      const lock = await db('document_edit_locks').where({ document_id: docId }).first();
      assert('T1 edit lock created in DB', !!lock, lock ? '' : 'no lock row found');
      if (lock) {
        assert('T1 lock references correct diff', lock.locked_by_diff_id === t1DiffId,
          `lock.locked_by_diff_id=${lock.locked_by_diff_id}`);
      }

      // Verify diff is in DB with manual_edit source
      if (t1DiffId) {
        const diff = await db('diffs').where({ id: t1DiffId }).first();
        assert('T1 diff row exists', !!diff);
        assert('T1 diff.source = manual_edit', diff && diff.source === 'manual_edit',
          diff ? `source=${diff.source}` : '');
        assert('T1 diff.edit_comment populated', diff && !!diff.edit_comment);
      }

      // Verify diff_items in DB
      if (t1DiffId) {
        const items = await db('diff_items').where({ diff_id: t1DiffId });
        assert('T1 diff_items created', items.length > 0, `${items.length} items`);
      }
    }
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T8: Audit log entries exist after T1
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T8: Audit log ───');
  if (t1DiffId) {
    const auditEntries = await db('audit_log')
      .where({ entity_type: 'document_field', entity_id: docId, action: 'manual_edit' })
      .where('details', 'like', `%${t1DiffId}%`);
    assert('T8 audit entries written', auditEntries.length > 0,
      `found ${auditEntries.length} entries`);
    if (auditEntries.length > 0) {
      const detail = JSON.parse(auditEntries[0].details);
      assert('T8 audit entry has field path',   !!detail.field);
      assert('T8 audit entry has old_value',    detail.old_value !== undefined);
      assert('T8 audit entry has new_value',    detail.new_value !== undefined);
      assert('T8 audit entry has domain',       !!detail.domain);
      assert('T8 audit entry actor set',        !!auditEntries[0].actor);
    }
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T6: Pending diff blocks edit
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T6: Pending diff blocks edit → 409 ───');
  if (generalField && t1DiffId) {
    // The lock from T1 is still active — try a second edit
    const r = await request('PATCH', `/api/documents/${docId}/fields`, {
      base_version_id: baseVersionId,
      changes: { [generalField]: 'second edit attempt' },
      comment: 'should be blocked by pending diff',
    }, adminToken);
    assert('T6 second edit blocked by pending diff → 409', r.status === 409,
      `got ${r.status}: ${JSON.stringify(r.body)}`);
    assert('T6 response contains pending_diff_id', !!r.body.pending_diff_id);

    // Viewer should show edit_locked = true
    const rView = await request('GET', `/api/documents/${docId}/fields`, null, adminToken);
    assert('T6 viewer shows edit_locked = true', rView.body && rView.body.edit_locked === true);
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T2: Commercial approver edits Commercial field (need clean doc first)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T2: Commercial approver allowed edit ───');
  if (commercialField) {
    // First force-release the lock from T1 so T2 can proceed
    if (t1DiffId) {
      // Manually mark the diff as rejected so pending_workflow check clears
      await db('diffs').where({ id: t1DiffId }).update({ status: 'rejected' });
      await db('document_edit_locks').where({ document_id: docId }).del();
    }

    // Get fresh base_version_id (still the original baseline — T1 version wasn't approved)
    const freshView = await request('GET', `/api/documents/${docId}/fields`, null, adminToken);
    const freshBaseVersionId = freshView.body && freshView.body.base_version_id;

    const newValue = `IOT_Test_${Date.now()}`;
    const r = await request('PATCH', `/api/documents/${docId}/fields`, {
      base_version_id: freshBaseVersionId || baseVersionId,
      changes: { [commercialField]: newValue },
      comment: 'T2 verify test: commercial approver edits commercial field',
    }, commercialToken);
    assert('T2 Commercial approver edit returns 200', r.status === 200,
      `got ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.status === 200) {
      if (r.body.diff_id)    createdDiffIds.push(r.body.diff_id);
      if (r.body.version_id) createdVersionIds.push(r.body.version_id);
      assert('T2 diff_id returned', !!r.body.diff_id);
    }

    // Try to edit a General field as Commercial approver → 403
    if (generalField && freshBaseVersionId) {
      // Clear lock first
      await db('diffs').whereIn('id', createdDiffIds.filter(d => d !== t1DiffId)).update({ status: 'rejected' });
      await db('document_edit_locks').where({ document_id: docId }).del();

      const r2 = await request('PATCH', `/api/documents/${docId}/fields`, {
        base_version_id: freshBaseVersionId,
        changes: { [generalField]: 'commercial trying general' },
        comment: 'should be 403',
      }, commercialToken);
      assert('T2 Commercial approver cannot edit General field → 403', r2.status === 403,
        `got ${r2.status}: ${JSON.stringify(r2.body)}`);
    }
  } else {
    console.log('  SKIP  T2 — no Commercial field in this document');
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T9: Force-release stuck lock (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T9: Force-release lock ───');
  let t9DiffId = null;
  {
    // Ensure a clean state, then create a real stuck lock:
    // insert a real diff row in pending_workflow so force-release can mark it superseded.
    await db('document_edit_locks').where({ document_id: docId }).del();
    const freshBase = await db('document_versions').where({ document_id: docId, is_current_baseline: 1 }).first();
    t9DiffId = require('uuid').v4();
    const t9VersionId = require('uuid').v4();
    await db('document_versions').insert({
      id: t9VersionId, document_id: docId,
      version_number: (freshBase.version_number || 0) + 10,
      file_path: freshBase.file_path,
      original_filename: 'stuck_test_version',
      source: 'manual_edit',
      extracted_fields: freshBase.extracted_fields,
      uploaded_at: new Date().toISOString(),
      requires_review: 1, approval_status: 'pending', is_current_baseline: 0,
    });
    await db('diffs').insert({
      id: t9DiffId, document_id: docId,
      from_version_id: freshBase.id, to_version_id: t9VersionId,
      total_changes: 1, highest_severity: 'minor',
      status: 'in_approval', overall_risk_score: 10,
      source: 'manual_edit', edit_comment: 'T9 stuck test',
    });
    await db('document_edit_locks').insert({
      document_id: docId, locked_by_diff_id: t9DiffId,
      locked_by_user_id: 'test-user', locked_at: new Date().toISOString(),
    });
    createdDiffIds.push(t9DiffId);
    createdVersionIds.push(t9VersionId);

    // Non-admin should not be able to call this endpoint
    const r403 = await request('DELETE', `/api/documents/${docId}/edit-lock`,
      { reason: 'attempting force release as analyst' }, analystToken);
    assert('T9 non-Admin force-release returns 403', r403.status === 403,
      `got ${r403.status}`);

    // Admin force-release: missing reason → 400
    const r400 = await request('DELETE', `/api/documents/${docId}/edit-lock`,
      {}, adminToken);
    assert('T9 force-release without reason → 400', r400.status === 400,
      `got ${r400.status}`);

    // Admin force-release with reason → 200
    const rOk = await request('DELETE', `/api/documents/${docId}/edit-lock`,
      { reason: 'T9 verify test: releasing stuck lock' }, adminToken);
    assert('T9 Admin force-release returns 200', rOk.status === 200,
      `got ${rOk.status}: ${JSON.stringify(rOk.body)}`);
    assert('T9 released_diff_id in response', !!rOk.body.released_diff_id);

    // Verify lock is gone
    const lockAfter = await db('document_edit_locks').where({ document_id: docId }).first();
    assert('T9 lock removed from DB', !lockAfter);

    // Verify diff is superseded (not just locked away)
    const diffAfter = await db('diffs').where({ id: t9DiffId }).first();
    assert('T9 diff marked superseded', diffAfter && diffAfter.status === 'superseded',
      diffAfter ? `status=${diffAfter.status}` : 'diff not found');

    // Verify audit entry written — filter by this run's diff_id to avoid stale rows
    const auditEntry = await db('audit_log')
      .where({ entity_type: 'document_edit_lock', entity_id: docId, action: 'force_released' })
      .where('details', 'like', `%${t9DiffId}%`)
      .orderBy('id', 'desc').first();
    assert('T9 audit entry written', !!auditEntry, auditEntry ? '' : `no audit row for diff ${t9DiffId}`);
    if (auditEntry) {
      const d = JSON.parse(auditEntry.details);
      assert('T9 audit entry has reason', d.reason === 'T9 verify test: releasing stuck lock');
      assert('T9 audit entry has diff_marked=superseded', d.diff_marked === 'superseded',
        `diff_marked=${d.diff_marked}`);
    }

    // Force-release when no lock → 404
    const r404 = await request('DELETE', `/api/documents/${docId}/edit-lock`,
      { reason: 'should 404' }, adminToken);
    assert('T9 force-release with no lock returns 404', r404.status === 404,
      `got ${r404.status}`);
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T11: PATCH succeeds immediately after force-release
  // This is the core unblock test: confirms that cancelling the workflow and
  // superseding the diff actually allows a new PATCH through.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T11: PATCH succeeds after force-release ───');
  if (generalField) {
    // Confirm no pending diffs remain (superseded must not be in the blocklist)
    const stillPending = await db('diffs')
      .where({ document_id: docId })
      .whereIn('status', ['pending_workflow', 'in_approval']);
    assert('T11 no pending diffs after force-release', stillPending.length === 0,
      `${stillPending.length} still pending`);

    // Now attempt a real PATCH — it must succeed
    const freshBaseView = await request('GET', `/api/documents/${docId}/fields`, null, adminToken);
    const freshBid = freshBaseView.body && freshBaseView.body.base_version_id;
    const t11Val = `PostRelease_${Date.now()}`;
    const r11 = await request('PATCH', `/api/documents/${docId}/fields`, {
      base_version_id: freshBid || baseVersionId,
      changes: { [generalField]: t11Val },
      comment: 'T11: post-force-release edit',
    }, adminToken);
    assert('T11 PATCH succeeds after force-release → 200', r11.status === 200,
      `got ${r11.status}: ${JSON.stringify(r11.body)}`);
    if (r11.status === 200) {
      if (r11.body.diff_id)    createdDiffIds.push(r11.body.diff_id);
      if (r11.body.version_id) createdVersionIds.push(r11.body.version_id);
      assert('T11 new diff_id returned', !!r11.body.diff_id);
      assert('T11 new diff is NOT the old superseded one', r11.body.diff_id !== t9DiffId);
    }
  } else {
    console.log('  SKIP  T11 — no General field found');
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T12: Rollback of pending/rejected version → 409  (Phase A2)
  //
  // Creates a manual_edit version that is never deployed, then tries to roll
  // back to it — must get 409 with a diff_status reason.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T12: Rollback rejected version → 409 ───');
  {
    // We need a fresh baseline with no pending diffs so PATCH can create a new
    // version.  Re-read the current baseline (T11 may have changed it).
    const freshDoc = await findCleanDoc();
    const t12DocId = freshDoc.docId;
    const t12BaseVersionId = freshDoc.baseline.id;
    const t12Fields = JSON.parse(freshDoc.baseline.extracted_fields);
    const t12Field  = Object.keys(t12Fields).find(k => !require('../services/fieldOwnership').isFieldHidden(k));

    if (t12Field) {
      // Create a pending diff by PATCHing the doc
      const patchRes = await request('PATCH', `/api/documents/${t12DocId}/fields`, {
        base_version_id: t12BaseVersionId,
        changes: { [t12Field]: `T12_pending_${Date.now()}` },
        comment: 'T12: creating a pending version for rollback rejection test',
      }, adminToken);

      if (patchRes.status === 200) {
        const pendingVersionId = patchRes.body.version_id;
        const pendingDiffId    = patchRes.body.diff_id;

        // Immediately try to rollback to the just-created PENDING version
        const rRollback = await request('POST', `/api/workflow/rollback/${pendingVersionId}`,
          {}, adminToken);
        assert('T12 rollback of pending version returns 409', rRollback.status === 409,
          `got ${rRollback.status}: ${JSON.stringify(rRollback.body)}`);
        assert('T12 response contains diff_status', !!rRollback.body.diff_status,
          JSON.stringify(rRollback.body));
        assert('T12 diff_status is not "deployed"',
          rRollback.body.diff_status && rRollback.body.diff_status !== 'deployed',
          `got: ${rRollback.body.diff_status}`);

        // Cleanup T12 test data
        const t12wf = await db('approval_workflows').where({ diff_id: pendingDiffId }).first();
        if (t12wf) {
          await db('approval_steps').where({ workflow_id: t12wf.id }).del();
          await db('approval_workflows').where({ id: t12wf.id }).del();
        }
        await db('diff_items').where({ diff_id: pendingDiffId }).del();
        await db('diffs').where({ id: pendingDiffId }).del();
        await db('document_versions').where({ id: pendingVersionId }).del();
        await db('document_edit_locks').where({ document_id: t12DocId }).del();
        // Restore the original baseline flag
        await db('document_versions').where({ id: t12BaseVersionId }).update({ is_current_baseline: 1 });
        console.log('  [T12 cleanup] pending version removed');
      } else {
        console.log(`  SKIP  T12 — could not create a pending version (got ${patchRes.status})`);
      }
    } else {
      console.log('  SKIP  T12 — no editable field in doc');
    }
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // T13: Stale-deploy recovery via admin endpoint  (Phase A3)
  //
  // Manually forces a document's workflow state to 'deploying' (simulating a
  // crash mid-deployment), then calls POST /api/admin/recover-stale-deployments
  // and confirms the row is recovered to 'deployed' or 'failed'.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('─── T13: Stale-deploy recovery → admin endpoint ───');
  {
    // Pick any doc that has a workflow state row
    const anyWf = await db('document_workflow_state').first();
    if (anyWf) {
      const t13DocId   = anyWf.document_id;
      const origStatus = anyWf.stage_status;

      // Force to 'deploying' with a timestamp 35 minutes ago (> 30 min threshold)
      const staleTime = new Date(Date.now() - 35 * 60 * 1000).toISOString();
      await db('document_workflow_state')
        .where({ document_id: t13DocId })
        .update({ stage_status: 'deploying', updated_at: staleTime });

      const rRecover = await request('POST', '/api/admin/recover-stale-deploy',
        {}, adminToken);
      assert('T13 recover endpoint returns 200', rRecover.status === 200,
        `got ${rRecover.status}: ${JSON.stringify(rRecover.body)}`);
      assert('T13 recovered_count >= 1', rRecover.body.recovered_count >= 1,
        `got: ${rRecover.body.recovered_count}`);

      // Confirm the row is no longer 'deploying'
      const afterWf = await db('document_workflow_state').where({ document_id: t13DocId }).first();
      assert('T13 stage_status is no longer "deploying"',
        afterWf && afterWf.stage_status !== 'deploying',
        `got: ${afterWf ? afterWf.stage_status : '(missing)'}`);

      // Restore original status
      await db('document_workflow_state')
        .where({ document_id: t13DocId })
        .update({ stage_status: origStatus, updated_at: new Date().toISOString() });
      console.log(`  [T13] Restored stage_status → ${origStatus}`);
    } else {
      console.log('  SKIP  T13 — no document_workflow_state rows in DB');
    }
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────────
  await cleanupTestData(docId, createdVersionIds, createdDiffIds);


  // ─────────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed  (${total} total)`);
  if (failures.length > 0) {
    console.log('\n  FAILED:');
    failures.forEach(f => console.log(`    ✗ ${f}`));
  }
  console.log('═'.repeat(60));

  await db.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async err => {
  console.error('\n[FATAL]', err.message);
  await deleteEphemeralAccounts().catch(() => {});
  await db.destroy().catch(() => {});
  process.exit(2);
});
