#!/usr/bin/env node
'use strict';

/**
 * test_field_ownership_golden.js
 *
 * Golden test: every field path extracted from the 5 sample documents is
 * mapped to its expected owner domain.  If anyone changes a keyword, the
 * precedence order, or the section rules, this test MUST fail rather than
 * silently changing who can edit which field.
 *
 * Assertion breakdown:
 *   64 GOLDEN entries × 1 domain+source assertion each = 64
 *    1 hidden-flag assertion (General.Header)          =  1
 *    3 HLR conflict assertions (raw getFieldOwner)     =  3
 *   21 PERMISSION_CHECKS                               = 21
 *    4 REGRESSION_TESTS (label-only leakage)           =  4
 *   ─────────────────────────────────────────────────────
 *   Total                                              = 93
 *
 * GOLDEN entries use classifyWithCatalog() which mirrors the DB-backed
 * getFieldOwnerWithCatalog().  HLR Global Title resolves to
 * Routing (GT) / catalog_pending (via CATALOG_OVERRIDES seed entry).
 * CONFLICT_CHECKS call raw getFieldOwner() to prove the underlying
 * keyword conflict is still detected when the catalog is bypassed.
 *
 * Usage:  node tests/test_field_ownership_golden.js
 * Exit 0 = all pass.  Exit 1 = at least one mismatch.
 */

// Data lives in goldenData.js — no side effects on require().
const { GOLDEN, CONFLICT_CHECKS, REGRESSION_TESTS, PERMISSION_CHECKS } = require('./goldenData');
const { getFieldOwner, isFieldEditable, isFieldHidden, CATALOG_OVERRIDES } = require('../services/fieldOwnership');

/**
 * Catalog-aware classify: checks CATALOG_OVERRIDES (mirrors the DB seed rows)
 * before falling back to the sync getFieldOwner().  This simulates the two-tier
 * classification that the route layer performs via getFieldOwnerWithCatalog().
 *
 * The golden test calls this for GOLDEN + permission checks.
 * CONFLICT_CHECKS call raw getFieldOwner() to prove the underlying keyword
 * conflict IS detected when the catalog is NOT consulted.
 */
function classifyWithCatalog(fieldPath) {
  const dot = fieldPath.indexOf('.');
  const label = (dot >= 0 ? fieldPath.substring(dot + 1) : fieldPath).trim().toLowerCase();
  if (CATALOG_OVERRIDES.has(label)) {
    return CATALOG_OVERRIDES.get(label);
  }
  return getFieldOwner(fieldPath);
}

// ── Capture console.warn so known conflicts don't leak to stderr ─────────────
const capturedWarnings = [];
const _originalWarn = console.warn;
console.warn = (...args) => capturedWarnings.push(args.join(' '));

// ═══════════════════════════════════════════════════════════════════════════════
// Run tests
// ═══════════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

console.log('═══ GOLDEN TEST: Field Ownership Classification ═══');
console.log(`    (${GOLDEN.length} entries)\n`);

for (const entry of GOLDEN) {
  const result = classifyWithCatalog(entry.path);
  const domainOk = result.domain === entry.domain;
  const sourceOk = result.source === entry.source;

  if (!domainOk || !sourceOk) {
    console.log(`FAIL  ${entry.path}`);
    if (!domainOk) console.log(`  domain: expected "${entry.domain}" got "${result.domain}"`);
    if (!sourceOk) console.log(`  source: expected "${entry.source}" got "${result.source}"`);
    failed++;
  } else {
    passed++;
  }

  // Hidden flag assertion (only for entries that declare it)
  if (entry.hidden !== undefined) {
    const hiddenResult = isFieldHidden(entry.path);
    if (hiddenResult !== entry.hidden) {
      console.log(`FAIL  ${entry.path} — hidden: expected ${entry.hidden} got ${hiddenResult}`);
      failed++;
    } else {
      passed++;
    }
  }
}

console.log('\n═══ GOLDEN TEST: Conflict / Precedence Assertions ═══');
console.log(`    (${CONFLICT_CHECKS.length} entries — all should return General/admin_multi_domain_conflict)\n`);

for (const check of CONFLICT_CHECKS) {
  const result = getFieldOwner(check.path);
  const isConflict = result.source === 'admin_multi_domain_conflict' && result.domain === 'General';
  if (!isConflict) {
    console.log(`FAIL  ${check.path}`);
    console.log(`  expected General/admin_multi_domain_conflict, got ${result.domain}/${result.source}`);
    failed++;
  } else {
    passed++;
    console.log(`PASS  ${check.path}: admin_multi_domain_conflict (conflicts: ${check.conflictDomains.join(' vs ')})`);
  }
}

/**
 * Catalog-aware permission check.
 * Uses classifyWithCatalog() for the domain, then applies the same
 * Admin/Approver/Analyst rules as isFieldEditable().
 */
function checkEditable(fieldPath, role, approvedDomains) {
  if (isFieldHidden(fieldPath)) return false;
  const { domain } = classifyWithCatalog(fieldPath);
  if (role === 'Admin') return domain === 'General';
  if (role === 'Approver') {
    if (domain === 'General') return false;
    const domains = typeof approvedDomains === 'string' ? JSON.parse(approvedDomains) : (approvedDomains || []);
    return domains.includes(domain);
  }
  return false;
}

console.log('\n═══ GOLDEN TEST: Permission Checks ═══');
console.log(`    (${PERMISSION_CHECKS.length} entries)\n`);

for (const check of PERMISSION_CHECKS) {
  const result = checkEditable(check.path, check.role, check.domains);
  if (result !== check.expect) {
    console.log(`FAIL  ${check.role}${check.domains ? '(' + check.domains + ')' : ''} → ${check.path}`);
    console.log(`  expected ${check.expect}, got ${result}`);
    failed++;
  } else {
    passed++;
  }
}

console.log('\n═══ GOLDEN TEST: Regression Tests (label-only leakage) ═══');
console.log(`    (${REGRESSION_TESTS.length} entries)\n`);

for (const entry of REGRESSION_TESTS) {
  const result = getFieldOwner(entry.path);
  const domainOk = result.domain === entry.domain;
  const sourceOk = result.source === entry.source;
  if (!domainOk || !sourceOk) {
    console.log(`FAIL  ${entry.path}`);
    if (!domainOk) console.log(`  domain: expected "${entry.domain}" got "${result.domain}"`);
    if (!sourceOk) console.log(`  source: expected "${entry.source}" got "${result.source}"`);
    failed++;
  } else {
    passed++;
    console.log(`PASS  ${entry.path}: ${result.domain} (${result.source})`);
  }
}

// Restore console.warn and report any unexpected warnings
console.warn = _originalWarn;
const unexpectedWarnings = capturedWarnings.filter(w =>
  // HLR Global Title conflict is the expected admin_multi_domain_conflict warning
  !w.includes('HLR Global Title') &&
  // Regression test paths produce expected Section/keyword disagreement warnings
  !w.includes('FINANCIAL BILLING.IPsec Policy') &&
  !w.includes('SECURITY.Currency')
);
if (unexpectedWarnings.length > 0) {
  console.log('\n⚠  UNEXPECTED WARNINGS (not asserted):');
  unexpectedWarnings.forEach(w => console.log('  ' + w));
  failed += unexpectedWarnings.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════

const total = passed + failed;
console.log(`\n${'═'.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed  (${total} total assertions)`);
console.log(`  Expected breakdown:`);
console.log(`    ${GOLDEN.length} field classification + 1 hidden flag = ${GOLDEN.length + 1}`);
console.log(`    ${CONFLICT_CHECKS.length} conflict/admin-only assertions`);
console.log(`    ${PERMISSION_CHECKS.length} permission checks`);
console.log(`    ${REGRESSION_TESTS.length} label-leakage regression tests`);
console.log('═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);
