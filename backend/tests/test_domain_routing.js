#!/usr/bin/env node
'use strict';

/**
 * tests/test_domain_routing.js
 *
 * Per-domain routing test (Item 2 from user review).
 *
 * For EACH of the 5 approval domains:
 *   - Find a field owned by that domain (via classifyField engine)
 *   - PATCH it as the DOMAIN APPROVER for that domain (the correct actor)
 *   - Verify:
 *       1. diff_items.owner_domain  == the domain  (engine classification stored)
 *       2. approval_steps.category  == the domain  (workflow router read it)
 *   This proves the person editing and the person approving are wired to the same domain.
 *
 * Uses ephemeral test accounts — no live account is mutated.
 * Exit 0 = all pass. Exit 1 = failures.
 */

const http   = require('http');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db     = require('../db');
const { classifyField } = require('../services/fieldOwnershipEngine');

const BASE_URL = process.env.VERIFY_URL || 'http://localhost:4021';

// ── HTTP helper ───────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
    };
    const req = http.request({
      hostname: url.hostname, port: url.port || 80,
      path: url.pathname, method, headers,
    }, res => {
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

// ── Assertions ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
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

// ── Domain → ephemeral approver accounts ─────────────────────────────────────

const TEST_PASS = 'DomainRoute_007!';
const DOMAINS = [
  'Security (IPsec)',
  'Routing (GT)',
  'Commercial (IOT)',
  'Packet Core (APN)',
  'Voice/SMS (IMSI)',
];

const EPHEMERAL = DOMAINS.map(d => ({
  username: `_drt_${d.replace(/[^a-z0-9]/gi, '_').toLowerCase()}@test.local`,
  role:     'Approver',
  domains:  JSON.stringify([d]),
  domain:   d,
}));

async function createEphemeralApprovers() {
  const hash = await bcrypt.hash(TEST_PASS, 8);
  const now  = new Date().toISOString();
  await db('users').where('username', 'like', '_drt_%').del();
  for (const acct of EPHEMERAL) {
    await db('users').insert({
      id:               uuid(),
      username:         acct.username,
      full_name:        `DRT ${acct.domain}`,
      password_hash:    hash,
      role:             acct.role,
      approved_domains: acct.domains,
      status:           'active',
      created_at:       now,
    });
  }
  console.log(`[setup] Created ${EPHEMERAL.length} ephemeral domain approver accounts\n`);
}

async function deleteEphemeralApprovers() {
  const n = await db('users').where('username', 'like', '_drt_%').del();
  console.log(`[teardown] Deleted ${n} ephemeral test accounts`);
}

async function login(username) {
  const r = await request('POST', '/api/auth/login', { username, password: TEST_PASS });
  if (r.status !== 200 || !r.body.token) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(r.body)}`);
  }
  return r.body.token;
}

// ── Find a clean doc with a field for the given domain ───────────────────────

async function findCleanFieldForDomain(domain) {
  const docs = await db('documents').select('id', 'doc_type', 'operator_id');
  for (const doc of docs) {
    const baseline = await db('document_versions')
      .where({ document_id: doc.id, is_current_baseline: 1 }).first();
    if (!baseline || !baseline.extracted_fields) continue;
    const pending = await db('diffs')
      .where({ document_id: doc.id })
      .whereIn('status', ['pending_workflow', 'in_approval']);
    if (pending.length > 0) continue;
    await db('document_edit_locks').where({ document_id: doc.id }).del();
    const fields = JSON.parse(baseline.extracted_fields);
    for (const [fieldPath, currentValue] of Object.entries(fields)) {
      const result = await classifyField(fieldPath, db, {
        docType: doc.doc_type || '*',
        operatorId: doc.operator_id,
      });
      if (result.domain === domain) {
        return {
          docId: doc.id,
          baseVersionId: baseline.id,
          fieldPath,
          currentValue,
          engineResult: result,
        };
      }
    }
  }
  return null;
}

// ── Test one domain ───────────────────────────────────────────────────────────

async function testDomain(domain, approverToken) {
  console.log(`\n  ── ${domain} ──`);
  const found = await findCleanFieldForDomain(domain);
  if (!found) {
    console.log(`  SKIP  ${domain} — no clean doc with a ${domain} field`);
    return;
  }

  const { docId, baseVersionId, fieldPath, currentValue, engineResult } = found;
  console.log(`  Field:  "${fieldPath}"`);
  console.log(`  Engine: domain=${engineResult.domain} source=${engineResult.owner_source} tier=${engineResult.tier_detail}`);
  console.log(`  Actor:  domain approver for ${domain}`);

  const newValue = `DRT_${Date.now()}`;
  const patchRes = await request('PATCH', `/api/documents/${docId}/fields`, {
    base_version_id: baseVersionId,
    changes: { [fieldPath]: newValue },
    comment: `Domain routing test — ${domain}`,
  }, approverToken);

  assert(`${domain}: PATCH by domain approver returns 200`, patchRes.status === 200,
    `got ${patchRes.status}: ${JSON.stringify(patchRes.body)}`);
  if (patchRes.status !== 200) return;

  const diffId = patchRes.body.diff_id;

  // 1. diff_items.owner_domain must equal the domain
  const items = await db('diff_items').where({ diff_id: diffId });
  const targetItem = items.find(i => i.field_path === fieldPath);
  assert(`${domain}: diff_items.owner_domain = "${domain}"`,
    targetItem && targetItem.owner_domain === domain,
    `got: ${targetItem ? targetItem.owner_domain : '(item not found)'}`);
  assert(`${domain}: diff_items.owner_source = "auto" or "catalog"`,
    targetItem && ['auto', 'catalog'].includes(targetItem.owner_source),
    `got: ${targetItem ? targetItem.owner_source : '(missing)'}`);
  assert(`${domain}: diff_items.rule_version >= 1`,
    targetItem && targetItem.rule_version >= 1,
    `got: ${targetItem ? targetItem.rule_version : '(missing)'}`);

  // 2. approval_steps.category must equal the domain
  const wf = await db('approval_workflows').where({ diff_id: diffId }).first();
  assert(`${domain}: approval_workflow created`, !!wf, `diff_id=${diffId}`);

  if (wf) {
    const steps = await db('approval_steps').where({ workflow_id: wf.id });
    const domainStep = steps.find(s => s.category === domain);
    assert(`${domain}: approval_steps.category = "${domain}"`,
      !!domainStep,
      `Steps: ${steps.map(s => `${s.category}/${s.status}`).join(', ') || '(none)'}`);
    if (domainStep) {
      console.log(`  Step:   role_title="${domainStep.role_title}" category="${domainStep.category}" status="${domainStep.status}"`);
      console.log(`  ✓ Editor domain == Approver step domain == "${domain}"`);
    }
  }

  // Cleanup immediately
  if (wf) {
    await db('approval_steps').where({ workflow_id: wf.id }).del();
    await db('approval_workflows').where({ id: wf.id }).del();
  }
  await db('diff_items').where({ diff_id: diffId }).del();
  await db('diffs').where({ id: diffId }).del();
  if (patchRes.body.version_id) {
    await db('document_versions').where({ id: patchRes.body.version_id }).del();
  }
  await db('document_edit_locks').where({ document_id: docId }).del();
}

// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══ DOMAIN ROUTING TEST: field editor ↔ approval step wiring ═══\n');
  console.log('Rule: domain approver edits a field → diff_items.owner_domain == approval_steps.category\n');

  await createEphemeralApprovers();

  // Login all domain approvers
  const domainTokens = {};
  for (const acct of EPHEMERAL) {
    domainTokens[acct.domain] = await login(acct.username);
  }
  console.log('[login] All domain approvers authenticated\n');

  for (const domain of DOMAINS) {
    await testDomain(domain, domainTokens[domain]);
  }

  await deleteEphemeralApprovers();

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
  await deleteEphemeralApprovers().catch(() => {});
  await db.destroy().catch(() => {});
  process.exit(1);
});
