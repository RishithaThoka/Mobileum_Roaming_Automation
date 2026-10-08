/**
 * run_phase1_verification.js
 * 
 * Phase 1 verification script. Run from New Portal root:
 *   node run_phase1_verification.js
 * 
 * Requires the backend server to be running on port 4021 for the
 * HTTP-based tests (workflow-policy, ownership-admin, domain-routing).
 * Golden, holdout, and engine-unit tests run directly against the DB.
 */
'use strict';

const { spawnSync }  = require('child_process');
const path           = require('path');
const fs             = require('fs');

const BACKEND  = path.join(__dirname, 'backend');
const LOG_FILE = path.join(__dirname, 'phase1_test_results.txt');

const ts = () => new Date().toISOString();

function log(str) {
  process.stdout.write(str);
  fs.appendFileSync(LOG_FILE, str);
}

// Clear log
fs.writeFileSync(LOG_FILE, `Phase 1 Verification Run\nStarted: ${ts()}\n\n`);

log(`${'='.repeat(72)}\n`);
log(`  Phase 1 Verification — decided_by regression check\n`);
log(`  Server expected at: http://localhost:4021\n`);
log(`  Started: ${ts()}\n`);
log(`${'='.repeat(72)}\n\n`);

// ── Step 0: Apply migration 014 inline ───────────────────────────────────────
log(`\n${'─'.repeat(72)}\n  MIGRATION 014: Add decided_by columns\n${'─'.repeat(72)}\n`);
try {
  const db = require('./backend/db');
  (async () => {
    try {
      const cols = await db.raw("PRAGMA table_info(approval_steps)");
      const names = cols.map(c => c.name);
      if (names.includes('decided_by_email')) {
        log(`  ✅ Columns already exist — migration already applied.\n`);
      } else {
        await db.schema.table('approval_steps', t => {
          t.string('decided_by_user_id').nullable();
          t.string('decided_by_name').nullable();
          t.string('decided_by_email').nullable();
        });
        log(`  ✅ Migration 014 applied: decided_by_user_id, decided_by_name, decided_by_email added.\n`);
      }
    } catch (e) {
      if (e.message && e.message.toLowerCase().includes('already exists')) {
        log(`  ✅ Columns already exist (alter caught).\n`);
      } else {
        log(`  ⚠️  Migration warning: ${e.message}\n`);
      }
    }
    await db.destroy();
  })().catch(e => log(`  ERROR in migration: ${e.message}\n`));
} catch (e) {
  log(`  ERROR loading db: ${e.message}\n`);
}

// Small delay to let the async migration settle before tests run
const waitMs = 1500;
const waitStart = Date.now();
while (Date.now() - waitStart < waitMs) { /* spin */ }

// ── Test suites ───────────────────────────────────────────────────────────────
const SUITES = [
  {
    name:   'golden',
    label:  'Field Ownership Golden',
    script: 'tests/test_field_ownership_golden.js',
    note:   'Direct DB — no server needed',
  },
  {
    name:   'holdout',
    label:  'Field Ownership Holdout',
    script: 'tests/test_field_ownership_holdout.js',
    note:   'Direct DB — no server needed',
  },
  {
    name:   'domain-routing',
    label:  'Domain Routing',
    script: 'tests/test_domain_routing.js',
    note:   'HTTP → localhost:4021',
  },
  {
    name:   'ownership-admin',
    label:  'Ownership Admin',
    script: 'tests/test_ownership_admin.js',
    note:   'HTTP → localhost:4021',
  },
  {
    name:   'workflow-policy',
    label:  'Workflow Policy (auto-tier + self-approval)',
    script: 'tests/test_workflow_policy.js',
    note:   'HTTP → localhost:4021 — exercises decideStep via /api/approvals/:token/decide',
  },
  {
    name:   'workflow-engine-unit',
    label:  'Workflow Engine Unit',
    script: 'tests/test_workflow_engine_unit.js',
    note:   'Direct DB — tests decideStep sequencing / terminal guards',
  },
];

const results = [];

for (const suite of SUITES) {
  log(`\n${'─'.repeat(72)}\n  SUITE: ${suite.label}\n  Note: ${suite.note}\n${'─'.repeat(72)}\n`);

  const t0 = Date.now();
  const r  = spawnSync('node', [suite.script], {
    cwd:      BACKEND,
    encoding: 'utf8',
    timeout:  180_000,
    env:      { ...process.env, PORT: '4021' },
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const raw = (r.stdout || '') + (r.stderr || '');
  log(raw || '  (no output)\n');

  // Parse pass/fail counts
  let passed = 0, failed = 0;
  for (const line of raw.split('\n')) {
    // "  PASS  something" or "  FAIL  something"
    if (/^\s+PASS\s/i.test(line))  passed++;
    if (/^\s+FAIL\s/i.test(line))  failed++;
    // "N passed" / "N failed"
    const pm = line.match(/(\d+)\s+passed/i) || line.match(/passed:\s*(\d+)/i);
    const fm = line.match(/(\d+)\s+fail(?:ed)?/i) || line.match(/failed:\s*(\d+)/i);
    if (pm) passed = Math.max(passed, +pm[1]);
    if (fm) failed = Math.max(failed, +fm[1]);
  }

  // Fallback: count ✔ / ✗
  if (passed === 0 && failed === 0) {
    passed = (raw.match(/[✔✓]/g) || []).length;
    failed = (raw.match(/[✗✘]/g) || []).length;
  }

  results.push({ name: suite.name, label: suite.label, passed, failed, code: r.status, elapsed });
}

// ── Master summary ────────────────────────────────────────────────────────────
const SEP = '='.repeat(72);
log(`\n${SEP}\n  MASTER SUMMARY\n${SEP}\n`);
log(`${'Suite'.padEnd(26)} ${'Pass'.padStart(6)} ${'Fail'.padStart(6)} ${'Time'.padStart(8)}  Status\n`);
log(`${'─'.repeat(72)}\n`);

let anyFail = false;
for (const r of results) {
  const ok = r.code === 0 && r.failed === 0;
  if (!ok) anyFail = true;
  const status = ok ? '✅ PASS' : `❌ FAIL (exit ${r.code})`;
  log(`${r.name.padEnd(26)} ${String(r.passed).padStart(6)} ${String(r.failed).padStart(6)} ${(r.elapsed+'s').padStart(8)}  ${status}\n`);
}

const totP = results.reduce((s, r) => s + r.passed, 0);
const totF = results.reduce((s, r) => s + r.failed, 0);
log(`${'─'.repeat(72)}\n`);
log(`${'TOTAL'.padEnd(26)} ${String(totP).padStart(6)} ${String(totF).padStart(6)}\n`);
log(`${SEP}\n`);
log(anyFail
  ? `\n❌  REGRESSION DETECTED — review raw output above\n`
  : `\n✅  ALL SUITES PASSED — no regression from decided_by changes\n`);
log(`\nCompleted: ${ts()}\nFull log: ${LOG_FILE}\n`);
