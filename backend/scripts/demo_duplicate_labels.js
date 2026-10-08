#!/usr/bin/env node
'use strict';

/**
 * scripts/demo_duplicate_labels.js
 *
 * Demonstrates B8 duplicate label detection end-to-end using a
 * real tmpfile parsed through the actual txtParser.
 *
 * Shows:
 *   1. What extracted_fields looks like after the parser processes a doc
 *      with two identical "Section.Label" keys.
 *   2. What the duplicate scanner sees and builds into duplicate_label_paths.
 *   3. How the PATCH handler blocks edits on those paths.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const txtParser = require('../services/parsers/txtParser');
const { detectDuplicateLabels } = require('../services/duplicateLabelDetector');

// ── Create a temporary .txt file with a real duplicate label ─────────────────

const rawContent = `OPERATOR PROFILE
Operator Name: Acme Wireless
Country: Germany
Network Code: 26290

FINANCIAL BILLING
Currency: EUR
Wholesale Data Rate Per MB: 0.0005
Discount Rate: 10%

FINANCIAL BILLING
Currency: USD
Discount Rate: 15%

NETWORK TECHNICAL
Signalling Point Code: 3-123-5
`;

const tmpFile = path.join(os.tmpdir(), `dup_demo_${Date.now()}.txt`);
fs.writeFileSync(tmpFile, rawContent, 'utf8');

async function main() {
  console.log('═══ DUPLICATE LABEL DEMO: end-to-end ═══\n');

  // Step 1: Parse through the real txtParser
  console.log('── Step 1: Raw file content ──');
  console.log(rawContent);

  console.log('── Step 2: extracted_fields after txtParser.parse() ──');
  const extracted = txtParser.parse(tmpFile);
  console.log(JSON.stringify(extracted, null, 2));

  // Explain what happened
  const dupKeys = [];
  const seen = {};
  // Simulate what the parser does — track overwrites
  const lines = rawContent.split('\n');
  let section = 'General';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[A-Z0-9_\s]{3,40}$/.test(line)) { section = line.trim(); continue; }
    const m = line.match(/^([^:=]+)[:=]\s*(.+)$/);
    if (m) {
      const key = `${section}.${m[1].trim()}`;
      if (seen[key]) dupKeys.push(key);
      seen[key] = true;
    }
  }

  console.log('\n── Step 3: Duplicates in the raw file (lost by parser) ──');
  console.log('The following Section.Label combinations appeared more than once.');
  console.log('The PARSER kept only the LAST value (silent overwrite):\n');
  dupKeys.forEach(k => {
    const finalValue = extracted[k];
    console.log(`  ${k}`);
    console.log(`    Final value in extracted_fields: ${JSON.stringify(finalValue)}`);
    console.log(`    (earlier occurrence was silently dropped)`);
  });

  // Step 4: Run the duplicate scanner
  console.log('\n── Step 4: detectDuplicateLabels() output ──');
  const dupSet = await detectDuplicateLabels(tmpFile, 'txt');
  console.log('duplicate_label_paths =', JSON.stringify([...dupSet], null, 2));

  // Step 5: Show how this maps to the column stored in document_versions
  console.log('\n── Step 5: What is stored in document_versions.duplicate_label_paths ──');
  const storedValue = dupSet.size > 0 ? JSON.stringify([...dupSet]) : null;
  console.log('duplicate_label_paths column value:', storedValue);

  // Step 6: Show what the PATCH handler does
  console.log('\n── Step 6: PATCH behaviour for duplicate paths ──');
  const dupPaths = storedValue ? JSON.parse(storedValue) : [];
  if (dupPaths.length > 0) {
    console.log('If a PATCH request tries to edit any of these paths:');
    dupPaths.forEach(p => console.log(`  changes["${p}"] = "new value"`));
    console.log('\nThe handler returns HTTP 400:');
    console.log(JSON.stringify({
      error: 'Cannot edit duplicate-label fields — these fields had ambiguous values in the source document and are non-editable.',
      duplicate_label_paths: dupPaths,
    }, null, 2));
  }

  // Cleanup
  fs.unlinkSync(tmpFile);
  console.log('\n[done] Temp file removed.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
