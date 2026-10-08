#!/usr/bin/env node
'use strict';

/**
 * create_perf_doc.js
 *
 * Creates a synthetic document version with 500 fields directly in the DB,
 * covering all 5 ownership domains, for performance testing of DocumentViewer.
 *
 * Usage:
 *   node backend/scripts/create_perf_doc.js
 *
 * The script prints the document ID at the end. Open DocumentViewer on that
 * document to run the Q1 performance measurement.
 *
 * Safe to run multiple times — it inserts a NEW operator + document each time
 * with a unique name so it never collides.
 */

const { v4: uuid } = require('uuid');
const db = require('../db');

// ── Field generation ───────────────────────────────────────────────────────────

// Each domain has a set of realistic section/label patterns that the ownership
// engine will correctly classify via keyword or section rules.
const DOMAIN_TEMPLATES = [
  // Routing (GT) — 100 fields
  { section: 'Global Title Routing',    labelPrefix: 'GT Address',          count: 25 },
  { section: 'Global Title Routing',    labelPrefix: 'Translation Type',    count: 25 },
  { section: 'SCCP Routing',            labelPrefix: 'Signalling Point Code',count: 25 },
  { section: 'SCCP Routing',            labelPrefix: 'Subsystem Number',    count: 25 },
  // Security (IPsec) — 100 fields
  { section: 'IPsec Configuration',     labelPrefix: 'IPsec Tunnel',        count: 25 },
  { section: 'IPsec Configuration',     labelPrefix: 'IKE Version',         count: 25 },
  { section: 'Firewall Rules',          labelPrefix: 'Encryption Algorithm', count: 25 },
  { section: 'Firewall Rules',          labelPrefix: 'Authentication Key',   count: 25 },
  // Commercial (IOT) — 100 fields
  { section: 'IOT Rates',               labelPrefix: 'Wholesale Tariff Rate',count: 25 },
  { section: 'IOT Rates',               labelPrefix: 'Discount Percentage',  count: 25 },
  { section: 'Billing Parameters',      labelPrefix: 'Invoice Currency',     count: 25 },
  { section: 'Billing Parameters',      labelPrefix: 'Settlement Period',    count: 25 },
  // Network (Core) — 100 fields
  { section: 'Core Network',            labelPrefix: 'APN Configuration',    count: 25 },
  { section: 'Core Network',            labelPrefix: 'DNS Primary',          count: 25 },
  { section: 'PDP Context',             labelPrefix: 'Packet Gateway IP',    count: 25 },
  { section: 'PDP Context',             labelPrefix: 'QoS Profile',          count: 25 },
  // General / Voice/SMS (IMSI) — 100 fields
  { section: 'General',                 labelPrefix: 'Operator Name',        count: 10 },
  { section: 'General',                 labelPrefix: 'Country Code',         count: 10 },
  { section: 'General',                 labelPrefix: 'MCC MNC',              count: 10 },
  { section: 'IMSI Range',              labelPrefix: 'IMSI Series Start',    count: 20 },
  { section: 'IMSI Range',              labelPrefix: 'HLR Address',          count: 25 },
  { section: 'Contact Details',         labelPrefix: 'Security Fraud Contact',count: 25 },
];

function buildFields() {
  const fields = {};
  let seq = 1;
  for (const tpl of DOMAIN_TEMPLATES) {
    for (let i = 1; i <= tpl.count; i++) {
      const key = `${tpl.section}.${tpl.labelPrefix} ${seq}`;
      // Realistic-looking values
      if (tpl.labelPrefix.includes('Address') || tpl.labelPrefix.includes('IP') || tpl.labelPrefix.includes('Gateway') || tpl.labelPrefix.includes('DNS')) {
        fields[key] = `10.${(seq % 254) + 1}.${Math.floor(seq / 254) + 1}.${(seq % 200) + 1}`;
      } else if (tpl.labelPrefix.includes('Rate') || tpl.labelPrefix.includes('Percentage')) {
        fields[key] = `${(seq % 100) / 10} EUR`;
      } else if (tpl.labelPrefix.includes('Code') || tpl.labelPrefix.includes('Number') || tpl.labelPrefix.includes('Type') || tpl.labelPrefix.includes('SPC') || tpl.labelPrefix.includes('Series')) {
        fields[key] = String(seq * 7 % 9999).padStart(4, '0');
      } else if (tpl.labelPrefix.includes('Version')) {
        fields[key] = `IKEv${(seq % 2) + 1}`;
      } else if (tpl.labelPrefix.includes('Algorithm')) {
        const algs = ['AES-256-GCM', 'AES-128-CBC', 'ChaCha20-Poly1305'];
        fields[key] = algs[seq % 3];
      } else if (tpl.labelPrefix.includes('Currency')) {
        fields[key] = ['EUR', 'USD', 'GBP', 'JPY'][seq % 4];
      } else if (tpl.labelPrefix.includes('Period')) {
        fields[key] = `${(seq % 3) + 1} months`;
      } else if (tpl.labelPrefix.includes('Profile')) {
        fields[key] = `QCI-${(seq % 9) + 1}`;
      } else if (tpl.labelPrefix.includes('Contact')) {
        fields[key] = `fraud-contact-${seq}@operator-perf.example.com`;
      } else if (tpl.labelPrefix.includes('IMSI')) {
        fields[key] = `310${String(seq * 11 % 999).padStart(10, '0')}`;
      } else if (tpl.labelPrefix.includes('Operator Name')) {
        fields[key] = `PerfTest Operator ${seq}`;
      } else if (tpl.labelPrefix.includes('Country Code')) {
        fields[key] = `+${(seq % 900) + 1}`;
      } else if (tpl.labelPrefix.includes('MCC')) {
        fields[key] = `${310 + (seq % 20)}/${String(seq * 3 % 999).padStart(3, '0')}`;
      } else {
        fields[key] = `value-${seq}`;
      }
      seq++;
    }
  }
  return fields;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  // Bootstrap DB (runs migrations if needed)
  await db.bootstrap();

  const fields = buildFields();
  const fieldCount = Object.keys(fields).length;
  console.log(`\nBuilt ${fieldCount} synthetic fields across 5 domains.`);

  const tag = Date.now();
  const operatorId  = uuid();
  const documentId  = uuid();
  const versionId   = uuid();

  const now = new Date().toISOString();

  // 1. Operator
  await db('operators').insert({
    id:              operatorId,
    name:            `PerfTest Operator ${tag}`,
    country:         'Synthetic',
    normalized_name: `perftest_${tag}`,
    network_code:    `999/${String(tag % 999).padStart(3, '0')}`,
    ingest_mode:     'push',
    status:          'active',
    created_at:      now,
  });

  // 2. Document
  await db('documents').insert({
    id:          documentId,
    operator_id: operatorId,
    doc_type:    'IR21',
    format:      'txt',
    title:       `PerfTest IR.21 — ${fieldCount} fields (${tag})`,
    created_at:  now,
  });

  // 3. Document version (marked as current baseline + approved)
  await db('document_versions').insert({
    id:                  versionId,
    document_id:         documentId,
    version_number:      1,
    file_path:           `/dev/null`,
    original_filename:   `perf_test_${tag}.txt`,
    source:              'push',
    extracted_fields:    JSON.stringify(fields),
    uploaded_at:         now,
    requires_review:     0,
    approval_status:     'approved',
    is_current_baseline: 1,
  });

  // 4. Update document's current_version_id
  await db('documents').where({ id: documentId }).update({ current_version_id: versionId });

  console.log('\n=== Synthetic performance document created ===');
  console.log(`  Document ID  : ${documentId}`);
  console.log(`  Operator ID  : ${operatorId}`);
  console.log(`  Version ID   : ${versionId}`);
  console.log(`  Field count  : ${fieldCount}`);
  console.log(`  Title        : PerfTest IR.21 — ${fieldCount} fields (${tag})`);
  console.log('\nOpen DocumentViewer on this document for Q1 performance measurement.');
  console.log('It will appear in the Documents Ingest list as "PerfTest Operator".\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed to create performance document:', err.message);
  process.exit(1);
});
