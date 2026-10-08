#!/usr/bin/env node
'use strict';

/**
 * test_field_ownership.js
 *
 * Parses every sample document through the real parsers + SAR converter,
 * then runs each extracted field through fieldOwnership.getFieldOwner()
 * and isFieldEditable() for every seeded role.
 *
 * Usage:  node scripts/test_field_ownership.js
 */

const path = require('path');
const fs   = require('fs');

const txtParser    = require('../services/parsers/txtParser');
const csvParser    = require('../services/parsers/csvParser');
const sarConverter = require('../services/ai/sarConverter');
const { getFieldOwner, isFieldEditable } = require('../services/fieldOwnership');

// ── Sample documents ─────────────────────────────────────────────────────────
const SAMPLE_DIR = path.join(__dirname, '..', '..', 'sample-documents');

const SAMPLES = [
  { file: 'T-Mobile_IR21_v1.txt',           format: 'txt' },
  { file: 'RAEX_IOT_Orange_v1.txt',         format: 'txt' },
  { file: 'TMobileUS_IR21_v1.docx.txt',     format: 'txt' },
  { file: 'IR21-_Bharti_India_updated_with_7_new_circles_6_March_2024.doc.txt', format: 'txt' },
  { file: 'Singtel_IR21_v1.csv',            format: 'csv' },
];

// ── Roles to test ────────────────────────────────────────────────────────────
const ROLES = [
  { label: 'Admin',     role: 'Admin',    domains: null },
  { label: 'Sec',       role: 'Approver', domains: '["Security (IPsec)"]' },
  { label: 'Rout',      role: 'Approver', domains: '["Routing (GT)"]' },
  { label: 'Comm',      role: 'Approver', domains: '["Commercial (IOT)"]' },
  { label: 'PKT',       role: 'Approver', domains: '["Packet Core (APN)"]' },
  { label: 'VoSMS',     role: 'Approver', domains: '["Voice/SMS (IMSI)"]' },
  { label: 'Analyst',   role: 'Analyst',  domains: null },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function pad(str, len) { return String(str).substring(0, len).padEnd(len); }
function tick(b) { return b ? ' \u2713' : ' \u2717'; }

// ── Main ─────────────────────────────────────────────────────────────────────
let totalFields = 0;
let fallbackCount = 0;
let multiDomainCount = 0;

for (const sample of SAMPLES) {
  const filePath = path.join(SAMPLE_DIR, sample.file);
  if (!fs.existsSync(filePath)) {
    console.log(`\n  SKIP: ${sample.file} (file not found)`);
    continue;
  }

  // Parse
  let parsed;
  if (sample.format === 'csv') {
    parsed = csvParser.parse(filePath);
  } else {
    parsed = txtParser.parse(filePath);
  }

  // SAR conversion (normalizes nested structures; flat maps pass through)
  const fields = sarConverter.toSAR(parsed, '');
  const fieldPaths = Object.keys(fields);

  console.log(`\n${'='.repeat(130)}`);
  console.log(`  FILE: ${sample.file}  (${fieldPaths.length} fields extracted)`);
  console.log('='.repeat(130));

  // Table header
  const hdr =
    pad('Field Path', 52) +
    pad('Value (truncated)', 22) +
    pad('Owner Domain', 20) +
    pad('Source', 18) +
    pad('Admin', 6) +
    pad('Sec', 5) +
    pad('Rout', 5) +
    pad('Comm', 5) +
    pad('PKT', 5) +
    pad('VoSMS', 6) +
    pad('Anlst', 5);
  console.log(hdr);
  console.log('-'.repeat(130));

  for (const fp of fieldPaths) {
    const value = fields[fp];
    const owner = getFieldOwner(fp);
    totalFields++;

    const flag = owner.source === 'fallback' ? ' << FALLBACK' : '';
    if (owner.source === 'fallback') fallbackCount++;

    const row =
      pad(fp, 52) +
      pad(String(value).substring(0, 20), 22) +
      pad(owner.domain + flag, 20) +
      pad(`${owner.source}${owner.match ? '(' + owner.match + ')' : ''}`, 18) +
      pad(tick(isFieldEditable(fp, 'Admin',    null)),                      6) +
      pad(tick(isFieldEditable(fp, 'Approver', '["Security (IPsec)"]')),    5) +
      pad(tick(isFieldEditable(fp, 'Approver', '["Routing (GT)"]')),        5) +
      pad(tick(isFieldEditable(fp, 'Approver', '["Commercial (IOT)"]')),    5) +
      pad(tick(isFieldEditable(fp, 'Approver', '["Packet Core (APN)"]')),   5) +
      pad(tick(isFieldEditable(fp, 'Approver', '["Voice/SMS (IMSI)"]')),    6) +
      pad(tick(isFieldEditable(fp, 'Analyst',  null)),                      5);

    console.log(row);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(130)}`);
console.log(`  SUMMARY: ${totalFields} total fields across ${SAMPLES.length} documents`);
console.log(`  Fallback (General) fields: ${fallbackCount}  (flagged with << FALLBACK)`);
console.log(`  Multi-domain conflicts:    logged above as [fieldOwnership] warnings`);
console.log('='.repeat(130));
