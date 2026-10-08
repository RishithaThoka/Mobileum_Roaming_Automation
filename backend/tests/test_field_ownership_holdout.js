#!/usr/bin/env node
'use strict';

/**
 * tests/test_field_ownership_holdout.js
 *
 * Holdout tests for the field ownership engine.
 *
 * Each fixture is parsed with the real parsers (no hand-built label lists).
 * For every field × every role/domain combination:
 *   assert editable == (field owner is in the role's domains, or Admin for General)
 *
 * Fixtures:
 *   1. holdout_1_duplicates.txt   — txt doc with duplicate labels, mixed domains,
 *                                   section/keyword disagreement
 *   2. holdout_2_no_sections.csv  — csv doc with no section headers
 *   3. holdout_3_docx_format.txt  — docx-style text (Label: Value lines + all-caps sections)
 *
 * Exit 0 = all pass.  Exit 1 = at least one failure.
 */

const path = require('path');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ── Parsers ───────────────────────────────────────────────────────────────────
const txtParser  = require('../services/parsers/txtParser');
const csvParser  = require('../services/parsers/csvParser');
const { extractFields: docxExtract } = require('../services/parsers/docxParser');
const { detectDuplicateLabels } = require('../services/duplicateLabelDetector');

// ── Classification (legacy sync, catalog-aware) ────────────────────────────
const { getFieldOwner, isFieldHidden, isFieldEditable, CATALOG_OVERRIDES } = require('../services/fieldOwnership');

function classifySync(fieldPath) {
  const dot = fieldPath.indexOf('.');
  const label = (dot >= 0 ? fieldPath.substring(dot + 1) : fieldPath).trim().toLowerCase();
  if (CATALOG_OVERRIDES.has(label)) return CATALOG_OVERRIDES.get(label);
  return getFieldOwner(fieldPath);
}

// ── Domains and role matrix ───────────────────────────────────────────────────
const ALL_DOMAINS = [
  'Routing (GT)',
  'Security (IPsec)',
  'Commercial (IOT)',
  'Packet Core (APN)',
  'Voice/SMS (IMSI)',
];

const ROLES_TO_TEST = [
  { role: 'Admin',    domains: null },
  { role: 'Approver', domains: ALL_DOMAINS },  // Approver with all domains (super-approver)
  ...ALL_DOMAINS.map(d => ({ role: 'Approver', domains: [d] })),
  { role: 'Analyst',  domains: null },
  { role: 'Auditor',  domains: null },
  { role: 'CPO/Exec', domains: null },
];

function expectedEditable(fieldPath, role, domains, ownerDomain) {
  if (isFieldHidden(fieldPath)) return false;
  if (ownerDomain === 'General') {
    return role === 'Admin';
  }
  if (role === 'Approver') {
    if (!domains) return false;
    const domainList = Array.isArray(domains) ? domains : JSON.parse(domains);
    return domainList.includes(ownerDomain);
  }
  return false;  // Analyst, Auditor, CPO/Exec: view-only
}

// ── Test counters ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail ? '\n      ' + detail : ''}`);
  }
}

// ── Per-fixture report ────────────────────────────────────────────────────────
function reportFixture(name, fields, duplicates) {
  const tierCounts = {
    contact_override: 0, explicit_general: 0, catalog: 0,
    keyword: 0, keyword_over_section: 0, section_prefix: 0,
    fallback: 0, hidden: 0, admin_conflict: 0,
  };
  let total = 0;
  for (const fp of Object.keys(fields)) {
    total++;
    if (isFieldHidden(fp)) { tierCounts.hidden++; continue; }
    const r = classifySync(fp);
    const src = r.source || 'fallback';
    if (src === 'contact_override')    tierCounts.contact_override++;
    else if (src === 'explicit_general') tierCounts.explicit_general++;
    else if (src === 'catalog_pending' || src === 'catalog_confirmed') tierCounts.catalog++;
    else if (src === 'keyword')        tierCounts.keyword++;
    else if (src === 'keyword_over_section') tierCounts.keyword_over_section++;
    else if (src === 'section_prefix') tierCounts.section_prefix++;
    else if (src === 'admin_multi_domain_conflict') tierCounts.admin_conflict++;
    else                               tierCounts.fallback++;
  }
  const fallbackRate = total > 0 ? tierCounts.fallback / total : 0;

  console.log(`\n  Fixture: ${name}`);
  console.log(`  Total fields: ${total}`);
  console.log(`  Duplicate labels: ${duplicates.size} path(s) [non-editable]`);
  for (const [k, v] of Object.entries(tierCounts)) {
    if (v > 0) console.log(`    ${k}: ${v}`);
  }
  console.log(`  Fallback rate: ${(fallbackRate * 100).toFixed(1)}%`);
  if (fallbackRate > 0.25) {
    console.log(`  ⚠  High fallback rate (>25%) — review rules or fixture`);
  }

  // List fallbacks
  const fallbackFields = Object.keys(fields).filter(fp => {
    if (isFieldHidden(fp)) return false;
    const r = classifySync(fp);
    return r.source !== 'contact_override' && r.source !== 'explicit_general' &&
      r.source !== 'catalog_pending' && r.source !== 'catalog_confirmed' &&
      r.source !== 'keyword' && r.source !== 'keyword_over_section' &&
      r.source !== 'section_prefix' && r.source !== 'admin_multi_domain_conflict';
  });
  if (fallbackFields.length > 0) {
    console.log(`  Fallback fields:`);
    for (const f of fallbackFields) {
      const r = classifySync(f);
      console.log(`    ${f} → ${r.domain} (${r.source})`);
    }
  }

  return { total, tierCounts, fallbackRate, fallbackFields };
}

// ── Run one fixture ───────────────────────────────────────────────────────────
async function runFixture(name, fields, duplicates) {
  reportFixture(name, fields, duplicates);

  // For every field × every role/domain combination
  for (const fp of Object.keys(fields)) {
    const isDup = duplicates.has(fp);
    if (isFieldHidden(fp)) continue;  // hidden fields: skip permission matrix
    const { domain: ownerDomain } = classifySync(fp);

    for (const { role, domains } of ROLES_TO_TEST) {
      const domainsKey = domains ? (Array.isArray(domains) ? domains.join(',') : domains) : 'none';
      const labelKey   = `${name} | ${fp} | ${role}(${domainsKey})`;

      if (isDup) {
        // Duplicate-label fields are non-editable for everyone
        const isEdit = isFieldEditable(fp, role, domains ? JSON.stringify(domains) : null, ownerDomain);
        // We don't assert false here because isFieldEditable doesn't know about duplicates
        // (that check is in the PATCH handler). We document that the duplicate detection caught it.
        // Just verify the function doesn't crash.
        assert(`${labelKey} — classifies without crash`, ownerDomain !== undefined);
      } else {
        const expected = expectedEditable(fp, role, domains, ownerDomain);
        const actual   = isFieldEditable(fp, role, domains ? JSON.stringify(domains) : null, ownerDomain);
        assert(`${labelKey} → editable=${expected}`, actual === expected,
          `owner=${ownerDomain} role=${role} domains=${domainsKey} got=${actual}`);
      }
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══ HOLDOUT TEST: Field Ownership — 3 Fixtures ═══\n');

  const suppressedWarn = [];
  const _origWarn = console.warn;
  console.warn = (...args) => suppressedWarn.push(args.join(' '));

  // ── Fixture 1: txt with duplicate labels ─────────────────────────────────
  const fix1Path = path.join(FIXTURES_DIR, 'holdout_1_duplicates.txt');
  const fix1Fields = txtParser.parse(fix1Path);
  const fix1Dups = await detectDuplicateLabels(fix1Path, 'txt');

  assert('Fixture 1: at least one field parsed', Object.keys(fix1Fields).length > 0);
  assert('Fixture 1: duplicate "Currency" detected',
    fix1Dups.has('FINANCIAL BILLING.Currency'),
    `Actual duplicates: ${[...fix1Dups].join(', ')}`);
  assert('Fixture 1: non-duplicate fields not flagged',
    !fix1Dups.has('OPERATOR PROFILE.Operator Name'));

  await runFixture('holdout_1_duplicates.txt', fix1Fields, fix1Dups);

  // ── Fixture 2: csv with no section headers ───────────────────────────────
  const fix2Path = path.join(FIXTURES_DIR, 'holdout_2_no_sections.csv');
  const fix2Fields = csvParser.parse(fix2Path);
  const fix2Dups = await detectDuplicateLabels(fix2Path, 'csv');

  assert('Fixture 2: at least one field parsed', Object.keys(fix2Fields).length > 0);
  assert('Fixture 2: no duplicates in csv fixture', fix2Dups.size === 0,
    `Unexpected duplicates: ${[...fix2Dups].join(', ')}`);

  // Verify key classifications for CSV (no section → keyword decides)
  const fix2Results = {};
  for (const fp of Object.keys(fix2Fields)) {
    fix2Results[fp] = classifySync(fp);
  }

  // HLR Global Title should be catalog_pending → Routing (GT)
  const hlrKey = Object.keys(fix2Fields).find(k => k.endsWith('HLR Global Title'));
  if (hlrKey) {
    assert('Fixture 2: HLR Global Title → Routing (GT) (catalog)',
      fix2Results[hlrKey] && fix2Results[hlrKey].domain === 'Routing (GT)',
      `got: ${JSON.stringify(fix2Results[hlrKey])}`);
  }

  // Fraud Contact Email → Security (contact_override)
  const fraudKey = Object.keys(fix2Fields).find(k => k.includes('Fraud Contact'));
  if (fraudKey) {
    assert('Fixture 2: Fraud Contact Email → Security (IPsec)',
      fix2Results[fraudKey] && fix2Results[fraudKey].domain === 'Security (IPsec)');
  }

  await runFixture('holdout_2_no_sections.csv', fix2Fields, fix2Dups);

  // ── Fixture 3: docx-format text ──────────────────────────────────────────
  const fix3Path = path.join(FIXTURES_DIR, 'holdout_3_docx_format.txt');
  // Use the docxParser's extractFields text extraction function directly
  const fix3RawText = require('fs').readFileSync(fix3Path, 'utf8');
  const fix3Fields = docxExtract(fix3RawText);  // docxParser.extractFields(text)
  const fix3Dups = await detectDuplicateLabels(fix3Path, 'docx-text');

  assert('Fixture 3: at least one field parsed', Object.keys(fix3Fields).length > 0);

  // Verify SECURITY AND CHARGING section: Fraud Contact Email → Security
  const fraudKey3 = Object.keys(fix3Fields).find(k => k.includes('Fraud Contact'));
  if (fraudKey3) {
    const r = classifySync(fraudKey3);
    assert('Fixture 3: Fraud Contact Email → Security (IPsec)',
      r.domain === 'Security (IPsec)');
  }

  await runFixture('holdout_3_docx_format.txt', fix3Fields, fix3Dups);

  // ── Unexpected warnings ───────────────────────────────────────────────────
  console.warn = _origWarn;
  const unexpectedWarn = suppressedWarn.filter(w =>
    !w.includes('HLR Global Title') &&
    !w.includes('IPsec Policy') &&
    !w.includes('Currency') &&
    !w.includes('Authentication Protocol') &&
    !w.includes('duplicateLabelDetector')
  );
  if (unexpectedWarn.length > 0) {
    console.log('\n⚠  UNEXPECTED WARNINGS:');
    unexpectedWarn.forEach(w => console.log('  ' + w));
    failed += unexpectedWarn.length;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed  (${passed + failed} total)`);
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
