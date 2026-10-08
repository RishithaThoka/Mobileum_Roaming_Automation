#!/usr/bin/env node
'use strict';

/**
 * tests/test_workflow_policy.js
 *
 * Tests for the two new workflow policies:
 *
 * A. AUTO-TIER ADMIN STEP
 *    A1. Diff with only catalog/override fields → NO extra Admin step
 *    A2. Diff with at least one 'auto' field → extra Admin step at order=0,
 *        domain step is 'waiting' (blocked on Admin step)
 *    A3. Mixed diff (one auto + one catalog field) → still gets extra Admin step
 *    A4. Admin step is order=0, domain step is order >= 1 (correct order)
 *    A5. After Admin approves step 0, the domain step advances to 'pending'
 *
 * B. SELF-APPROVAL ROUTING
 *    B1. Domain has 2+ approvers, editor is one of them → step assigned to
 *        domain role, editor's own account is excluded (self_approval_excluded_user_id set)
 *    B2. Editor account tries to approve their own step → 403
 *    B3. Non-editor approver for same domain can approve → 200
 *    B4. Domain has exactly 1 approver and it's the editor → step routed to Admin,
 *        routing_note recorded
 *    B5. Editor is the only Admin AND auto-tier step required → PATCH returns 409
 *        with code SELF_APPROVAL_ONLY_ADMIN
 *
 * All accounts are ephemeral (_wp_test_*). No live accounts permanently mutated.
 */

const http   = require('http');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db     = require('../db');
const { classifyField } = require('../services/fieldOwnershipEngine');

const BASE_URL = process.env.VERIFY_URL || 'http://localhost:4021';

// ── HTTP helper ───────────────────────────────────────────────────────────────
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const pl  = body ? JSON.stringify(body) : null;
    const hdr = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(pl    ? { 'Content-Length': Buffer.byteLength(pl) } : {}),
    };
    const r = http.request({
      hostname: url.hostname, port: url.port || 80,
      path: url.pathname, method, headers: hdr,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (pl) r.write(pl);
    r.end();
  });
}

// ── Assertions ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function assert(label, condition, detail = '') {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failures.push(label); failed++;
  }
}

// ── Ephemeral accounts ────────────────────────────────────────────────────────
const TEST_PASS = 'WPolicy_007!';
async function createUser({ suffix, role, domains }) {
  const hash = await bcrypt.hash(TEST_PASS, 8);
  const id   = uuid();
  const now  = new Date().toISOString();
  const username = `_wp_test_${suffix}@test.local`;
  await db('users').where({ username }).del();
  await db('users').insert({
    id, username,
    full_name:        `WP Test ${suffix}`,
    password_hash:    hash,
    role,
    approved_domains: domains ? JSON.stringify(domains) : null,
    status:           'active',
    created_at:       now,
  });
  return { id, username };
}
async function login(username) {
  const r = await req('POST', '/api/auth/login', { username, password: TEST_PASS });
  if (r.status !== 200 || !r.body.token)
    throw new Error(`Login failed for ${username}: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

// ── Field discovery ───────────────────────────────────────────────────────────

/**
 * Find a field in any clean document by owner_source, optionally excluding domains.
 * Returns { docId, baseVersionId, fieldPath, currentValue, engineResult } or null.
 */
async function findDocWithField(ownerSource, { excludeDomains = [], requiredRole = null } = {}) {
  const docs = await db('documents').select('id', 'doc_type', 'operator_id');
  const blockedIds = new Set(await db('diffs')
    .whereIn('status', ['pending_workflow', 'in_approval']).pluck('document_id'));
  for (const doc of docs) {
    if (blockedIds.has(doc.id)) continue;
    const baseline = await db('document_versions')
      .where({ document_id: doc.id, is_current_baseline: 1 }).first();
    if (!baseline || !baseline.extracted_fields) continue;
    await db('document_edit_locks').where({ document_id: doc.id }).del();
    const fields = JSON.parse(baseline.extracted_fields);
    for (const [fp, val] of Object.entries(fields)) {
      const r = await classifyField(fp, db, { docType: doc.doc_type || '*', operatorId: doc.operator_id });
      if (r.owner_source !== ownerSource) continue;
      if (excludeDomains.includes(r.domain)) continue;
      if (requiredRole === 'Admin' && r.domain !== 'General') continue;
      if (requiredRole === 'Approver' && r.domain === 'General') continue;
      return { docId: doc.id, baseVersionId: baseline.id, fieldPath: fp,
               currentValue: val, engineResult: r, opId: doc.operator_id };
    }
  }
  return null;
}

/**
 * Find a doc with BOTH an 'auto' AND a 'catalog' field that the same Admin can edit.
 * Since Admin can only edit General fields, look for both sources in General domain.
 * Fallback: if no doc has both as General, find a doc where one field is editable
 * by a domain Approver for the auto field's domain.
 */
async function findMixedDocForAdmin() {
  // Admin edits General fields only. Look for doc with auto (General) + catalog (General).
  const docs = await db('documents').select('id', 'doc_type', 'operator_id');
  const blockedIds = new Set(await db('diffs')
    .whereIn('status', ['pending_workflow', 'in_approval']).pluck('document_id'));
  for (const doc of docs) {
    if (blockedIds.has(doc.id)) continue;
    const baseline = await db('document_versions')
      .where({ document_id: doc.id, is_current_baseline: 1 }).first();
    if (!baseline || !baseline.extracted_fields) continue;
    await db('document_edit_locks').where({ document_id: doc.id }).del();
    const fields = JSON.parse(baseline.extracted_fields);
    let autoField = null, catalogField = null;
    for (const [fp, val] of Object.entries(fields)) {
      const r = await classifyField(fp, db, { docType: doc.doc_type || '*', operatorId: doc.operator_id });
      if (!autoField && r.owner_source === 'auto' && r.domain === 'General')
        autoField = { fp, val, r };
      if (!catalogField && r.owner_source === 'catalog' && r.domain === 'General')
        catalogField = { fp, val, r };
      if (autoField && catalogField) break;
    }
    if (autoField && catalogField)
      return { docId: doc.id, baseVersionId: baseline.id, autoField, catalogField };
  }
  return null;
}

/**
 * Find a doc with BOTH an 'auto' AND a 'catalog' field in the SAME non-General domain,
 * so a domain Approver can edit both.
 */
async function findMixedDocForDomainApprover() {
  const docs = await db('documents').select('id', 'doc_type', 'operator_id');
  const blockedIds = new Set(await db('diffs')
    .whereIn('status', ['pending_workflow', 'in_approval']).pluck('document_id'));
  for (const doc of docs) {
    if (blockedIds.has(doc.id)) continue;
    const baseline = await db('document_versions')
      .where({ document_id: doc.id, is_current_baseline: 1 }).first();
    if (!baseline || !baseline.extracted_fields) continue;
    await db('document_edit_locks').where({ document_id: doc.id }).del();
    const fields = JSON.parse(baseline.extracted_fields);
    const byDomain = {};
    for (const [fp, val] of Object.entries(fields)) {
      const r = await classifyField(fp, db, { docType: doc.doc_type || '*', operatorId: doc.operator_id });
      if (r.domain === 'General') continue;
      const d = r.domain;
      if (!byDomain[d]) byDomain[d] = {};
      if (!byDomain[d][r.owner_source]) byDomain[d][r.owner_source] = { fp, val, r };
    }
    for (const [domain, sources] of Object.entries(byDomain)) {
      if (sources['auto'] && sources['catalog']) {
        return {
          docId: doc.id, baseVersionId: baseline.id,
          domain, autoField: sources['auto'], catalogField: sources['catalog'],
        };
      }
    }
  }
  return null;
}

/** Cleanup a diff and its entire workflow. Also restores the prior baseline and workflow state. */
async function cleanupDiff(diffId) {
  const wf = await db('approval_workflows').where({ diff_id: diffId }).first();
  if (wf) {
    await db('approval_steps').where({ workflow_id: wf.id }).del();
    await db('approval_workflows').where({ id: wf.id }).del();
  }
  const diff = await db('diffs').where({ id: diffId }).first();
  let docId = null;
  if (diff) {
    docId = diff.document_id;
    await db('diff_items').where({ diff_id: diffId }).del();
    if (diff.to_version_id) {
      if (diff.from_version_id) {
        await db('document_versions').where({ document_id: docId }).update({ is_current_baseline: 0 });
        await db('document_versions').where({ id: diff.from_version_id }).update({ is_current_baseline: 1 });
        // Reset workflow state so the doc is not stuck in_approval
        await db('document_workflow_state').where({ document_id: docId })
          .update({ stage_status: 'approved', updated_at: new Date().toISOString() }).catch(() => {});
      }
      await db('document_versions').where({ id: diff.to_version_id }).del().catch(() => {});
    }
    await db('document_edit_locks').where({ document_id: docId }).del();
  }
  await db('diffs').where({ id: diffId }).del();

  // Sweep any other orphaned pending diffs on the same doc (from prior interrupted runs)
  if (docId) {
    const orphans = await db('diffs').where({ document_id: docId })
      .whereIn('status', ['pending_workflow', 'in_approval']);
    for (const od of orphans) {
      const owf = await db('approval_workflows').where({ diff_id: od.id }).first();
      if (owf) {
        await db('approval_steps').where({ workflow_id: owf.id }).del();
        await db('approval_workflows').where({ id: owf.id }).del();
      }
      await db('diff_items').where({ diff_id: od.id }).del();
      if (od.to_version_id) await db('document_versions').where({ id: od.to_version_id }).del().catch(() => {});
      await db('diffs').where({ id: od.id }).del();
    }
  }
}

/**
 * Ensure a specific document has its best-approved version marked as baseline.
 * Provides a clean starting state regardless of prior test runs.
 */
async function ensureDocBaseline(docId) {
  // Find the highest approved version
  const approved = await db('document_versions')
    .where({ document_id: docId, approval_status: 'approved' })
    .orderBy('version_number', 'desc').first();
  if (!approved) return;
  // Clear all baselines for this doc and set the approved one
  await db('document_versions').where({ document_id: docId }).update({ is_current_baseline: 0 });
  await db('document_versions').where({ id: approved.id }).update({ is_current_baseline: 1 });
  // Reset workflow state
  await db('document_workflow_state').where({ document_id: docId })
    .update({ stage_status: 'approved', updated_at: new Date().toISOString() }).catch(() => {});
  // Clear any lingering edit locks
  await db('document_edit_locks').where({ document_id: docId }).del();
}

// ═════════════════════════════════════════════════════════════════════════════
// A. AUTO-TIER ADMIN STEP
// ═════════════════════════════════════════════════════════════════════════════

async function testAutoTierStep() {
  console.log('\n════ A. AUTO-TIER ADMIN STEP ════\n');

  // Pre-condition: ensure the test doc has a clean baseline regardless of prior runs.
  // This is a best-effort scan — the finders will confirm field availability below.
  {
    const docs = await db('documents').select('id');
    for (const d of docs) {
      await ensureDocBaseline(d.id);
    }
  }

  // Two Admins so auto-tier step is always approvable (B5 tests the solo-Admin case separately)
  const admin1 = await createUser({ suffix: 'admin1', role: 'Admin', domains: null });
  const admin2 = await createUser({ suffix: 'admin2', role: 'Admin', domains: null }); // second Admin
  const admin1Token = await login(admin1.username);
  const admin2Token = await login(admin2.username);

  // ── A1: catalog-only field → no extra Admin step ───────────────────────────
  // Field must be editable by the test user.
  // Strategy: find a catalog field in ANY non-General domain, create a domain Approver.
  console.log('── A1: catalog-only diff → no extra Admin step ──');
  {
    const found = await findDocWithField('catalog', { excludeDomains: [] });
    if (!found) {
      console.log('  SKIP  A1 — no catalog-source field in any doc');
    } else {
      const domain = found.engineResult.domain;
      let editorToken, editorUser;
      if (domain === 'General') {
        editorUser  = admin1;
        editorToken = admin1Token;
      } else {
        editorUser  = await createUser({ suffix: 'a1approver', role: 'Approver', domains: [domain] });
        editorToken = await login(editorUser.username);
      }
      console.log(`  Field: "${found.fieldPath}"  domain=${domain}  source=catalog`);

      const pRes = await req('PATCH', `/api/documents/${found.docId}/fields`, {
        base_version_id: found.baseVersionId,
        changes: { [found.fieldPath]: `A1_${Date.now()}` },
        comment: 'A1: catalog-only field diff',
      }, editorToken);
      assert('A1 PATCH returns 200', pRes.status === 200,
        `got ${pRes.status}: ${JSON.stringify(pRes.body)}`);
      if (pRes.status === 200) {
        const diffId = pRes.body.diff_id;
        const wf = await db('approval_workflows').where({ diff_id: diffId }).first();
        const steps = wf ? await db('approval_steps').where({ workflow_id: wf.id }).orderBy('step_order') : [];
        const hasAdminReviewStep = steps.some(s => s.category === 'Admin Review' && s.step_order === 0);
        assert('A1 No extra Admin Review step at order=0', !hasAdminReviewStep,
          `steps: ${steps.map(s => `${s.category}(order=${s.step_order})`).join(', ')}`);
        const items = await db('diff_items').where({ diff_id: diffId });
        assert('A1 All diff_items have owner_source=catalog',
          items.every(i => i.owner_source === 'catalog'),
          `sources: ${items.map(i => i.owner_source).join(', ')}`);
        await cleanupDiff(diffId);
      }
      if (domain !== 'General') await db('users').where({ id: editorUser.id }).del();
    }
  }

  // ── A2: auto field → extra Admin step at order=0 ───────────────────────────
  // Admin can edit General/auto fields. Use admin1 (second admin guarantees approvability).
  console.log('\n── A2: auto field → extra Admin step first ──');
  {
    const found = await findDocWithField('auto', { requiredRole: 'Admin' });
    if (!found) {
      console.log('  SKIP  A2 — no auto-source General field in any doc');
    } else {
      console.log(`  Field: "${found.fieldPath}"  domain=${found.engineResult.domain}  source=auto`);
      const pRes = await req('PATCH', `/api/documents/${found.docId}/fields`, {
        base_version_id: found.baseVersionId,
        changes: { [found.fieldPath]: `A2_${Date.now()}` },
        comment: 'A2: auto-source field diff',
      }, admin1Token);
      assert('A2 PATCH returns 200', pRes.status === 200,
        `got ${pRes.status}: ${JSON.stringify(pRes.body)}`);
      if (pRes.status === 200) {
        const diffId = pRes.body.diff_id;
        const wf = await db('approval_workflows').where({ diff_id: diffId }).first();
        const steps = wf ? await db('approval_steps').where({ workflow_id: wf.id }).orderBy('step_order') : [];
        const adminStep = steps.find(s => s.category === 'Admin Review' && s.step_order === 0);
        assert('A2 Extra Admin Review step exists at order=0', !!adminStep,
          `steps: ${steps.map(s => `${s.category}(order=${s.step_order},status=${s.status})`).join(', ')}`);
        assert('A2 Admin Review step status = pending',
          adminStep && adminStep.status === 'pending',
          `status=${adminStep ? adminStep.status : '(missing)'}`);
        const domainSteps = steps.filter(s => s.category !== 'Admin Review');
        assert('A2 Domain step(s) status = waiting (blocked on Admin)',
          domainSteps.length === 0 || domainSteps.every(s => s.status === 'waiting'),
          `domain steps: ${domainSteps.map(s => `${s.category}=${s.status}`).join(', ')}`);
        assert('A2 Domain steps are at order >= 1',
          domainSteps.every(s => s.step_order >= 1),
          `orders: ${domainSteps.map(s => s.step_order).join(', ')}`);

        // A4: verify ordering
        assert('A4 Admin step (order=0) precedes all domain steps',
          !!adminStep && domainSteps.every(s => s.step_order > adminStep.step_order),
          `adminOrder=0 domainOrders=${domainSteps.map(s => s.step_order).join(',')}`);

        // A5: admin2 approves the Admin step (not admin1 who submitted)
        console.log('\n── A5: admin2 approves step 0 → domain step advances ──');
        const decideRes = await req('POST', `/api/approvals/${adminStep.token}/decide`,
          { action: 'approve', comment: 'A5: admin2 approves auto-tier step' }, admin2Token);
        assert('A5 Admin approve step returns 200', decideRes.status === 200,
          `got ${decideRes.status}: ${JSON.stringify(decideRes.body)}`);
        if (decideRes.status === 200 && domainSteps.length > 0) {
          const minDomainOrder = Math.min(...domainSteps.map(s => s.step_order));
          const advancedSteps = await db('approval_steps')
            .where({ workflow_id: wf.id, step_order: minDomainOrder });
          assert('A5 Domain step(s) now pending after Admin approval',
            advancedSteps.every(s => s.status === 'pending'),
            `statuses: ${advancedSteps.map(s => s.status).join(', ')}`);
        }
        await cleanupDiff(diffId);
      }
    }
  }

  // ── A3: mixed diff (auto + catalog) → still gets Admin step ───────────────
  // Try Admin-editable mix (both General) first, then domain-approver mix.
  console.log('\n── A3: mixed diff (auto + catalog) → extra Admin step ──');
  {
    // Try Admin path (both fields General)
    let mixed = await findMixedDocForAdmin();
    let editorToken = admin1Token;
    let editorLabel = 'Admin';

    // Fallback: find mix in a specific domain, use domain Approver
    let domainApproverUser = null;
    if (!mixed) {
      const mixedDomain = await findMixedDocForDomainApprover();
      if (mixedDomain) {
        mixed = { ...mixedDomain, baseVersionId: (await db('document_versions')
          .where({ document_id: mixedDomain.docId, is_current_baseline: 1 }).first()).id };
        domainApproverUser = await createUser({
          suffix: 'a3approver', role: 'Approver', domains: [mixedDomain.domain] });
        editorToken = await login(domainApproverUser.username);
        editorLabel = `Approver(${mixedDomain.domain})`;
      }
    }

    if (!mixed) {
      console.log('  SKIP  A3 — no doc with both auto and catalog fields for a single editor');
    } else {
      const changes = {
        [mixed.autoField.fp]:    `A3_auto_${Date.now()}`,
        [mixed.catalogField.fp]: `A3_catalog_${Date.now()}`,
      };
      console.log(`  Editor: ${editorLabel}`);
      console.log(`  auto field: "${mixed.autoField.fp}"  catalog field: "${mixed.catalogField.fp}"`);
      const pRes = await req('PATCH', `/api/documents/${mixed.docId}/fields`, {
        base_version_id: mixed.baseVersionId,
        changes,
        comment: 'A3: mixed auto+catalog diff',
      }, editorToken);
      assert('A3 PATCH returns 200', pRes.status === 200,
        `got ${pRes.status}: ${JSON.stringify(pRes.body)}`);
      if (pRes.status === 200) {
        const diffId = pRes.body.diff_id;
        const wf = await db('approval_workflows').where({ diff_id: diffId }).first();
        const steps = wf ? await db('approval_steps').where({ workflow_id: wf.id }).orderBy('step_order') : [];
        const adminStep = steps.find(s => s.category === 'Admin Review' && s.step_order === 0);
        assert('A3 Mixed diff: extra Admin step present', !!adminStep,
          `steps: ${steps.map(s => s.category).join(', ')}`);
        const items = await db('diff_items').where({ diff_id: diffId });
        const sources = [...new Set(items.map(i => i.owner_source))];
        assert('A3 diff_items contain both auto and catalog sources',
          sources.includes('auto') && sources.includes('catalog'),
          `sources: ${sources.join(', ')}`);
        await cleanupDiff(diffId);
      }
      if (domainApproverUser) await db('users').where({ id: domainApproverUser.id }).del();
    }
  }

  await db('users').where({ id: admin1.id }).del();
  await db('users').where({ id: admin2.id }).del();
}

// ═════════════════════════════════════════════════════════════════════════════
// B. SELF-APPROVAL ROUTING
// ═════════════════════════════════════════════════════════════════════════════

async function testSelfApprovalRouting() {
  console.log('\n════ B. SELF-APPROVAL ROUTING ════\n');

  // For B1-B4: need a non-General auto-source field (so a domain Approver can edit it)
  const found = await findDocWithField('auto', { requiredRole: 'Approver' });
  if (!found) {
    console.log('  SKIP  B1-B4 — no non-General auto-source field found in any doc');
  } else {
    const domain = found.engineResult.domain;
    console.log(`  Using domain: ${domain}  field: "${found.fieldPath}"\n`);

    // We need a secondary Admin to approve auto-tier Admin steps throughout B tests
    const adminBG = await createUser({ suffix: 'bgadmin', role: 'Admin', domains: null });
    const adminBGToken = await login(adminBG.username);

    // ── B1 + B2 + B3: 2+ approvers for domain, editor is one ─────────────────
    console.log('── B1/B2/B3: 2+ approvers, editor is one → excluded but others can act ──');
    {
      const editor1   = await createUser({ suffix: 'b1editor',    role: 'Approver', domains: [domain] });
      const approver2 = await createUser({ suffix: 'b1approver2', role: 'Approver', domains: [domain] });
      const editor1Token   = await login(editor1.username);
      const approver2Token = await login(approver2.username);

      const baseline = await db('document_versions')
        .where({ document_id: found.docId, is_current_baseline: 1 }).first();
      await db('document_edit_locks').where({ document_id: found.docId }).del();

      const pRes = await req('PATCH', `/api/documents/${found.docId}/fields`, {
        base_version_id: baseline.id,
        changes: { [found.fieldPath]: `B1_${Date.now()}` },
        comment: 'B1: self-approval routing test, 2 approvers',
      }, editor1Token);
      assert('B1 PATCH by domain approver returns 200', pRes.status === 200,
        `got ${pRes.status}: ${JSON.stringify(pRes.body)}`);

      if (pRes.status === 200) {
        const diffId = pRes.body.diff_id;
        const wf = await db('approval_workflows').where({ diff_id: diffId }).first();
        const steps = wf ? await db('approval_steps').where({ workflow_id: wf.id }) : [];
        const domainStep = steps.find(s => s.category === domain);

        assert('B1 Domain step created for correct category', !!domainStep,
          `steps: ${steps.map(s => s.category).join(', ')}`);
        assert('B1 Domain step has self_approval_excluded_user_id = editor1.id',
          domainStep && domainStep.self_approval_excluded_user_id === editor1.id,
          `excluded=${domainStep ? domainStep.self_approval_excluded_user_id : '(missing)'} editor=${editor1.id}`);

        // Approve auto-tier Admin step first (if present) using the bg Admin
        const adminStep = steps.find(s => s.category === 'Admin Review' && s.step_order === 0);
        if (adminStep) {
          const adRes = await req('POST', `/api/approvals/${adminStep.token}/decide`,
            { action: 'approve', comment: 'B setup: bgAdmin approves auto-tier step' }, adminBGToken);
          assert('B1 setup: bgAdmin approves auto-tier Admin step', adRes.status === 200,
            `got ${adRes.status}: ${JSON.stringify(adRes.body)}`);
        }

        // B2: editor1 (excluded) tries to approve domain step → 403
        const freshDomainStep = await db('approval_steps')
          .where({ workflow_id: wf.id, category: domain }).first();
        const selfRes = await req('POST', `/api/approvals/${freshDomainStep.token}/decide`,
          { action: 'approve', comment: 'B2: self-approval attempt' }, editor1Token);
        assert('B2 Self-approval attempt returns 403', selfRes.status === 403,
          `got ${selfRes.status}: ${JSON.stringify(selfRes.body)}`);
        assert('B2 Error mentions self-approval',
          selfRes.body && selfRes.body.error && selfRes.body.error.includes('Self-approval'),
          selfRes.body ? selfRes.body.error : '(no body)');

        // B3: approver2 (not the editor) CAN approve → 200
        const b3Res = await req('POST', `/api/approvals/${freshDomainStep.token}/decide`,
          { action: 'approve', comment: 'B3: other approver approves' }, approver2Token);
        assert('B3 Non-editor approver approves domain step → 200', b3Res.status === 200,
          `got ${b3Res.status}: ${JSON.stringify(b3Res.body)}`);

        await cleanupDiff(diffId);
      }
      await db('users').where({ id: editor1.id }).del();
      await db('users').where({ id: approver2.id }).del();
    }

    // ── B4: Only 1 approver for domain (= the editor) → routed to Admin ──────
    console.log('\n── B4: only 1 approver (= editor) → routed to Admin with note ──');
    {
      const soloEditor = await createUser({ suffix: 'b4solo', role: 'Approver', domains: [domain] });
      const soloToken  = await login(soloEditor.username);

      // Verify no other active Approver for this domain exists in the DB
      const allApprovers = await db('users').where({ role: 'Approver', status: 'active' });
      const othersForDomain = allApprovers.filter(u => {
        const d = JSON.parse(u.approved_domains || '[]');
        return d.includes(domain) && u.id !== soloEditor.id;
      });

      if (othersForDomain.length > 0) {
        console.log(`  SKIP  B4 — ${othersForDomain.length} other real approver(s) for ${domain} ` +
                    `exist in DB; cannot isolate without modifying prod accounts.`);
        // List them for diagnostics
        othersForDomain.forEach(u => console.log(`    - ${u.username} (${u.role})`));
      } else {
        const baseline = await db('document_versions')
          .where({ document_id: found.docId, is_current_baseline: 1 }).first();
        await db('document_edit_locks').where({ document_id: found.docId }).del();

        const pRes = await req('PATCH', `/api/documents/${found.docId}/fields`, {
          base_version_id: baseline.id,
          changes: { [found.fieldPath]: `B4_${Date.now()}` },
          comment: 'B4: only-approver rerouting test',
        }, soloToken);
        assert('B4 PATCH returns 200', pRes.status === 200,
          `got ${pRes.status}: ${JSON.stringify(pRes.body)}`);
        if (pRes.status === 200) {
          const diffId = pRes.body.diff_id;
          const wf = await db('approval_workflows').where({ diff_id: diffId }).first();
          const steps = wf ? await db('approval_steps').where({ workflow_id: wf.id }) : [];
          const domainStep = steps.find(s => s.category === domain);
          assert('B4 Domain step re-routed to role_title = Admin',
            domainStep && domainStep.role_title === 'Admin',
            `role_title=${domainStep ? domainStep.role_title : '(missing)'}`);
          assert('B4 Domain step routing_note mentions no other approver',
            domainStep && domainStep.routing_note &&
            domainStep.routing_note.includes('no other approver'),
            `note: ${domainStep ? domainStep.routing_note : '(missing)'}`);
          await cleanupDiff(diffId);
        }
      }
      await db('users').where({ id: soloEditor.id }).del();
    }

    await db('users').where({ id: adminBG.id }).del();
  }

  // ── B5: editor is the ONLY Admin + auto-tier required → PATCH returns 409 ──
  console.log('\n── B5: only Admin tries self-edit requiring auto-tier → 409 at submit ──');
  {
    // Need an auto-source General field (Admin can edit General fields)
    const autoFound = await findDocWithField('auto', { requiredRole: 'Admin' });
    if (!autoFound) {
      console.log('  SKIP  B5 — no auto-source General field found');
    } else {
      // Temporarily deactivate ALL existing Admin accounts (not _wp_test_)
      const prodAdmins = await db('users').where({ role: 'Admin', status: 'active' })
        .where('username', 'not like', '_wp_test_%');
      await db('users').where({ role: 'Admin', status: 'active' })
        .where('username', 'not like', '_wp_test_%').update({ status: 'inactive_b5' });

      const soloAdmin = await createUser({ suffix: 'b5soloadmin', role: 'Admin', domains: null });
      const soloToken = await login(soloAdmin.username);

      // Confirm soloAdmin is the only active Admin
      const activeAdmins = await db('users').where({ role: 'Admin', status: 'active' });
      if (activeAdmins.length !== 1 || activeAdmins[0].id !== soloAdmin.id) {
        console.log(`  SKIP  B5 — could not isolate to single Admin (found ${activeAdmins.length})`);
      } else {
        const baseline = await db('document_versions')
          .where({ document_id: autoFound.docId, is_current_baseline: 1 }).first();
        await db('document_edit_locks').where({ document_id: autoFound.docId }).del();

        const pRes = await req('PATCH', `/api/documents/${autoFound.docId}/fields`, {
          base_version_id: baseline.id,
          changes: { [autoFound.fieldPath]: `B5_${Date.now()}` },
          comment: 'B5: only-Admin self-edit with auto-tier',
        }, soloToken);
        assert('B5 Only-Admin self-edit returns 409', pRes.status === 409,
          `got ${pRes.status}: ${JSON.stringify(pRes.body)}`);
        assert('B5 Error code = SELF_APPROVAL_ONLY_ADMIN',
          pRes.body && pRes.body.code === 'SELF_APPROVAL_ONLY_ADMIN',
          `code=${pRes.body ? pRes.body.code : '(missing)'}`);
        assert('B5 Error message explains the conflict',
          pRes.body && pRes.body.error && pRes.body.error.includes('only active Admin'),
          `error: ${pRes.body ? pRes.body.error : '(missing)'}`);
        // Confirm no lock was left behind
        const lock = await db('document_edit_locks').where({ document_id: autoFound.docId }).first();
        assert('B5 No orphaned edit lock after 409', !lock,
          lock ? `lock_id=${lock.id}` : '');
      }

      await db('users').where({ id: soloAdmin.id }).del();
      // Restore prod Admins
      if (prodAdmins.length > 0) {
        await db('users').whereIn('id', prodAdmins.map(u => u.id)).update({ status: 'active' });
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═══ WORKFLOW POLICY TEST: auto-tier Admin step + self-approval routing ═══\n');

  const ping = await req('GET', '/api/auth/session', null, null).catch(() => ({ status: 0 }));
  if (ping.status === 0) { console.error('Server not reachable'); process.exit(1); }
  console.log('[server] Reachable\n');

  try {
    // ── Pre-run self-healing ─────────────────────────────────────────────────
    // 1. Delete orphaned pending diffs whose editor account was deleted
    //    (left by previous interrupted test runs)
    const activeUserIds = new Set(await db('users').pluck('id'));
    const stalePending = await db('diffs').whereIn('status', ['pending_workflow', 'in_approval']);
    for (const d of stalePending) {
      if (d.editor_user_id && !activeUserIds.has(d.editor_user_id)) {
        const owf = await db('approval_workflows').where({ diff_id: d.id }).first();
        if (owf) {
          await db('approval_steps').where({ workflow_id: owf.id }).del();
          await db('approval_workflows').where({ id: owf.id }).del();
        }
        await db('diff_items').where({ diff_id: d.id }).del();
        if (d.to_version_id) await db('document_versions').where({ id: d.to_version_id }).del().catch(() => {});
        await db('document_edit_locks').where({ document_id: d.document_id }).del();
        await db('diffs').where({ id: d.id }).del();
        console.log(`[pre-clean] Removed orphan diff ${d.id.slice(0, 8)} (editor account gone)`);
      }
    }
    // 2. Ensure all docs have a current baseline
    const allDocs = await db('documents').select('id');
    for (const d of allDocs) { await ensureDocBaseline(d.id); }

    await testAutoTierStep();
    await testSelfApprovalRouting();
  } finally {
    // Cleanup: remove any leftover test accounts and restore status_inactive_b5 accounts
    await db('users').where('username', 'like', '_wp_test_%').del();
    await db('users').where({ status: 'inactive_b5' }).update({ status: 'active' });
  }


  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed  (${passed + failed} total)`);
  if (failures.length > 0) {
    console.log('\n  FAILED:');
    failures.forEach(f => console.log(`    ✗ ${f}`));
  }
  console.log('═'.repeat(60));

  await db.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async err => {
  console.error('FATAL:', err.message);
  await db('users').where('username', 'like', '_wp_test_%').del().catch(() => {});
  await db('users').where({ status: 'inactive_b5' }).update({ status: 'active' }).catch(() => {});
  await db.destroy().catch(() => {});
  process.exit(1);
});
