/**
 * run_all_tests.js
 * Runs each test suite sequentially, captures combined stdout+stderr,
 * and prints a master summary with pass/fail counts per suite.
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..', 'backend');

const SUITES = [
  { name: 'golden',           script: 'tests/test_field_ownership_golden.js' },
  { name: 'holdout',          script: 'tests/test_field_ownership_holdout.js' },
  { name: 'domain-routing',   script: 'tests/test_domain_routing.js' },
  { name: 'ownership-admin',  script: 'tests/test_ownership_admin.js' },
  { name: 'workflow-policy',  script: 'tests/test_workflow_policy.js' },
  { name: 'workflow-engine-unit', script: 'tests/test_workflow_engine_unit.js' },
];

const results = [];

for (const suite of SUITES) {
  const scriptPath = path.join(BACKEND_DIR, suite.script);
  console.log('\n' + '='.repeat(72));
  console.log(`  SUITE: ${suite.name}`);
  console.log('='.repeat(72));

  let output = '';
  let exitCode = 0;
  const start = Date.now();

  try {
    output = execSync(`node "${scriptPath}"`, {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
  } catch (e) {
    output = (e.stdout || '') + (e.stderr || '');
    exitCode = e.status || 1;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Print full raw output
  process.stdout.write(output);

  // Parse pass/fail from common patterns:
  //   "✔ N passed", "N passed", "PASS: N", "FAIL: N", "N failed", etc.
  let passed = 0, failed = 0;
  for (const line of output.split('\n')) {
    const pMatch = line.match(/(\d+)\s+passed/i) || line.match(/PASS[:\s]+(\d+)/i) || line.match(/✔\s+(\d+)/i);
    const fMatch = line.match(/(\d+)\s+fail(?:ed)?/i) || line.match(/FAIL[:\s]+(\d+)/i) || line.match(/✗\s+(\d+)/i);
    if (pMatch) passed = Math.max(passed, parseInt(pMatch[1], 10));
    if (fMatch) failed = Math.max(failed, parseInt(fMatch[1], 10));
  }

  // If we couldn't parse counts from output, infer from exit code
  if (passed === 0 && failed === 0) {
    if (exitCode === 0) {
      // Count ✔ / ✗ lines as proxy
      passed = (output.match(/[✔✓]/g) || []).length;
      failed = (output.match(/[✗✘]/g) || []).length;
    }
  }

  results.push({ name: suite.name, passed, failed, exitCode, elapsed });
}

// ── Master summary ────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(72));
console.log('  MASTER SUMMARY');
console.log('='.repeat(72));
console.log(`${'Suite'.padEnd(28)} ${'Pass'.padStart(6)} ${'Fail'.padStart(6)} ${'Time'.padStart(7)} ${'Status'}`);
console.log('-'.repeat(72));

let totalPassed = 0, totalFailed = 0, anyFail = false;
for (const r of results) {
  const status = r.exitCode === 0 && r.failed === 0 ? '✅ OK' : `❌ FAIL (exit ${r.exitCode})`;
  if (r.failed > 0 || r.exitCode !== 0) anyFail = true;
  totalPassed += r.passed;
  totalFailed += r.failed;
  console.log(`${r.name.padEnd(28)} ${String(r.passed).padStart(6)} ${String(r.failed).padStart(6)} ${(r.elapsed + 's').padStart(7)}  ${status}`);
}

console.log('-'.repeat(72));
console.log(`${'TOTAL'.padEnd(28)} ${String(totalPassed).padStart(6)} ${String(totalFailed).padStart(6)}`);
console.log('='.repeat(72));
console.log(anyFail ? '\n❌  REGRESSION DETECTED — see output above' : '\n✅  ALL SUITES PASSED — no regression');
console.log('');
