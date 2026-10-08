/**
 * full_test_run.js
 * 
 * Runs migration 014, seeds the override scenario, then runs all 6 test suites.
 * Writes full output to console AND to test_results.txt.
 * 
 * Usage: node full_test_run.js  (run from "New Portal" root)
 */
'use strict';

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ROOT       = __dirname;
const BACKEND    = path.join(ROOT, 'backend');
const OUT_FILE   = path.join(ROOT, 'test_results.txt');

function run(label, cmd, cwd) {
  const sep = '='.repeat(72);
  const header = `\n${sep}\n  ${label}\n${sep}\n`;
  process.stdout.write(header);
  fs.appendFileSync(OUT_FILE, header);

  const result = spawnSync(cmd, { shell: true, cwd, encoding: 'utf8', timeout: 180_000 });
  const out = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(out || '(no output)\n');
  fs.appendFileSync(OUT_FILE, out || '(no output)\n');
  return { out, code: result.status };
}

// Clear old results
fs.writeFileSync(OUT_FILE, `Test run started: ${new Date().toISOString()}\n`);

// ── Step 1: Apply migration 014 ───────────────────────────────────────────────
run('STEP 1: Apply Migration 014 (decided_by columns)', 'node run_migration_014.js', BACKEND);

// ── Step 2: Seed override scenario ───────────────────────────────────────────
run('STEP 2: Seed Override Scenario (Admin force-advance demo)', 'node seed_override_scenario.js', BACKEND);

// ── Steps 3-8: Test suites ────────────────────────────────────────────────────
const SUITES = [
  { name: 'golden            (field-ownership-golden)',    cmd: 'node tests/test_field_ownership_golden.js'  },
  { name: 'holdout           (field-ownership-holdout)',   cmd: 'node tests/test_field_ownership_holdout.js' },
  { name: 'domain-routing    (test_domain_routing)',       cmd: 'node tests/test_domain_routing.js'          },
  { name: 'ownership-admin   (test_ownership_admin)',      cmd: 'node tests/test_ownership_admin.js'         },
  { name: 'workflow-policy   (test_workflow_policy)',      cmd: 'node tests/test_workflow_policy.js'         },
  { name: 'workflow-engine-unit (test_workflow_engine_unit)', cmd: 'node tests/test_workflow_engine_unit.js' },
];

const results = [];

for (let i = 0; i < SUITES.length; i++) {
  const s = SUITES[i];
  const stepNum = i + 3;
  const { out, code } = run(`STEP ${stepNum}: ${s.name}`, s.cmd, BACKEND);

  // Count ✔ / ✗  and "X passed / Y failed" patterns
  let passed = (out.match(/[✔✓]/g) || []).length;
  let failed = (out.match(/[✗✘]/g) || []).length;

  for (const line of out.split('\n')) {
    const pm = line.match(/(\d+)\s+passed/i) || line.match(/PASS(?:ED)?[:\s]+(\d+)/i);
    const fm = line.match(/(\d+)\s+fail(?:ed)?/i) || line.match(/FAIL(?:ED)?[:\s]+(\d+)/i);
    if (pm) passed = Math.max(passed, parseInt(pm[1], 10));
    if (fm) failed = Math.max(failed, parseInt(fm[1], 10));
  }

  results.push({ name: s.name.split('(')[0].trim(), passed, failed, code });
}

// ── Master summary ────────────────────────────────────────────────────────────
const sep = '='.repeat(72);
let summary = `\n${sep}\n  MASTER SUMMARY\n${sep}\n`;
summary += `${'Suite'.padEnd(30)} ${'✔ Pass'.padStart(8)} ${'✗ Fail'.padStart(8)}  Status\n`;
summary += '-'.repeat(72) + '\n';

let anyFail = false;
for (const r of results) {
  const ok = r.code === 0 && r.failed === 0;
  if (!ok) anyFail = true;
  const status = ok ? '✅ PASS' : `❌ FAIL (exit ${r.code})`;
  summary += `${r.name.padEnd(30)} ${String(r.passed).padStart(8)} ${String(r.failed).padStart(8)}  ${status}\n`;
}

const totalP = results.reduce((a, r) => a + r.passed, 0);
const totalF = results.reduce((a, r) => a + r.failed, 0);
summary += '-'.repeat(72) + '\n';
summary += `${'TOTAL'.padEnd(30)} ${String(totalP).padStart(8)} ${String(totalF).padStart(8)}\n`;
summary += sep + '\n';
summary += anyFail
  ? '\n❌  REGRESSION DETECTED — see raw output above\n'
  : '\n✅  ALL SUITES PASSED — no regression from decided_by changes\n';
summary += `\nFull output saved to: ${OUT_FILE}\n`;

process.stdout.write(summary);
fs.appendFileSync(OUT_FILE, summary);
