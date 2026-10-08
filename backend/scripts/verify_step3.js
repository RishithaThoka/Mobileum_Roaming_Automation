'use strict';
/**
 * verify_step3.js — deterministic, self-contained Step 3 verification.
 *
 * V1: Creates a brand-new operator + uploads ONE file via HTTP multipart.
 *     Immediately GETs workflow state. Does not depend on any pre-existing
 *     DB rows. Immune to what verify.js did before this run.
 *
 * V2: Walks existing documents for one with all 4 substages complete
 *     with real timestamps. (Produced by verify.js Test 5b.)
 *
 * V3: Takes a real resolved document, directly sets one substage row to
 *     status='pending' via raw DB write (bypassing app logic on purpose —
 *     we are testing the /advance endpoint's own guard, not ingestion).
 *     Calls POST /advance {screen:2}. Confirms HTTP 409 + unresolved[].
 *     Restores the substage row afterward.
 *
 * Run: node scripts/verify_step3.js
 * Requires: server running on 4021.
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Direct DB access for V3's controlled substage mutation ────────────────────
process.chdir(path.join(__dirname, '..'));
const db = require('../db');

// ── HTTP helpers ──────────────────────────────────────────────────────────────

let TOKEN = null;

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const r = http.request(
      { hostname: 'localhost', port: 4021, path: urlPath, method, headers },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(d); } catch { parsed = d; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// Multipart upload: sends one file to POST /api/documents/upload
function uploadFile(filePath, operatorId, docType, title) {
  return new Promise((resolve, reject) => {
    const fileBytes = fs.readFileSync(filePath);
    const filename  = path.basename(filePath);
    const boundary  = '----Step3Boundary' + Date.now();
    const CRLF      = '\r\n';

    let body = Buffer.alloc(0);
    const append    = s  => { body = Buffer.concat([body, Buffer.from(s, 'utf8')]); };
    const appendBuf = b  => { body = Buffer.concat([body, b]); };

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="operator_id"${CRLF}${CRLF}`);
    append(`${operatorId}${CRLF}`);

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="doc_type"${CRLF}${CRLF}`);
    append(`${docType}${CRLF}`);

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="title"${CRLF}${CRLF}`);
    append(`${title}${CRLF}`);

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="source"${CRLF}${CRLF}`);
    append(`push${CRLF}`);

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}`);
    append(`Content-Type: text/csv${CRLF}${CRLF}`);
    appendBuf(fileBytes);
    append(`${CRLF}--${boundary}--${CRLF}`);

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
      'Authorization': 'Bearer ' + TOKEN,
    };
    const r = http.request(
      { hostname: 'localhost', port: 4021, path: '/api/documents/upload', method: 'POST', headers },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(d); } catch { parsed = d; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await db.bootstrap();

  // Login
  const loginCreds = {
    username: process.env.VERIFY_USERNAME || '',
    password: process.env.VERIFY_PASSWORD || '',
  };
  if (!loginCreds.username || !loginCreds.password) {
    console.error('FATAL: VERIFY_USERNAME and VERIFY_PASSWORD env vars required.');
    process.exit(1);
  }
  const loginRes = await req('POST', '/api/auth/login', loginCreds);
  TOKEN = loginRes.body.token;
  if (!TOKEN) { console.error('LOGIN FAILED'); process.exit(1); }
  console.log('✓ Logged in\n');

  let allPassed = true;

  // ═══════════════════════════════════════════════════════════════════════════
  // V1 — Self-contained: brand-new operator + single file → not_applicable
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('V1: Brand-new operator + first-ever upload → not_applicable');
  console.log('═══════════════════════════════════════════════════════════');

  // Operator name is timestamped so it's guaranteed unique on every run
  const uniqueOpName = `V3TestOp_${Date.now()}`;
  const createOpRes  = await req('POST', '/api/operators', {
    name: uniqueOpName,
    country: 'Neverland',
    network_code: 'NVL99',
    ingest_mode: 'push',
    default_doc_type: 'IR21',
  });
  const operatorId = createOpRes.body?.operator?.id;
  if (!operatorId) {
    console.error('✗ V1 FAIL — could not create operator:', JSON.stringify(createOpRes.body));
    allPassed = false;
  } else {
    console.log(`  Created operator: ${uniqueOpName} (${operatorId})`);

    // Upload exactly ONE file — Singtel_IR21_v1.csv, first ever for this operator+doctype
    const sampleFile = path.join(__dirname, '..', '..', 'sample-documents', 'Singtel_IR21_v1.csv');
    if (!fs.existsSync(sampleFile)) {
      console.error('✗ V1 FAIL — sample file not found:', sampleFile);
      allPassed = false;
    } else {
      const upRes = await uploadFile(sampleFile, operatorId, 'IR21', 'V1 First-ever upload');
      const docId = upRes.body?.document?.id;
      if (!docId) {
        console.error('✗ V1 FAIL — upload failed:', JSON.stringify(upRes.body));
        allPassed = false;
      } else {
        console.log(`  Uploaded document: ${docId}`);
        console.log(`  Upload diff: ${JSON.stringify(upRes.body.diff)}`);

        // Immediately GET workflow state
        const wfRes = await req('GET', `/api/workflow/${docId}`);
        const wf    = wfRes.body;
        console.log(`\n  HTTP ${wfRes.status}  GET /api/workflow/${docId}`);
        console.log(`  stage_status: ${wf?.state?.stage_status}`);
        if (wf?.subStages) {
          wf.subStages.forEach(s => {
            const ts     = s.completed_at ? ` @ ${s.completed_at}` : '';
            const reason = s.reason ? ` (reason: ${s.reason})` : '';
            console.log(`    substage ${s.id}: ${s.status}${ts}${reason}`);
          });
        }

        const extraction = wf?.subStages?.find(s => s.id === 'extraction');
        const comparison = wf?.subStages?.find(s => s.id === 'comparison');
        const diff       = wf?.subStages?.find(s => s.id === 'diff');
        const risk       = wf?.subStages?.find(s => s.id === 'risk');
        const stageSt    = wf?.state?.stage_status;

        const pass =
          extraction?.status === 'complete' &&
          comparison?.status === 'not_applicable' &&
          diff?.status      === 'not_applicable' &&
          risk?.status      === 'not_applicable' &&
          stageSt           === 'ready_for_approval';

        console.log(`\nV1 result: ${pass ? '✓ PASS' : '✗ FAIL'}`);
        if (!pass) {
          allPassed = false;
          console.log('  Expected: extraction=complete, comparison/diff/risk=not_applicable, stage_status=ready_for_approval');
          console.log('  Got:     ', JSON.stringify({ extraction: extraction?.status, comparison: comparison?.status, diff: diff?.status, risk: risk?.status, stageSt }));
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // V2 — Multi-version document: all 4 substages complete with real timestamps
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('V2: Multi-version document → all substages complete');
  console.log('═══════════════════════════════════════════════════════════');

  const { body: allDocs } = await req('GET', '/api/documents');
  let completeDoc = null;
  for (const doc of (allDocs || [])) {
    const { body: wf } = await req('GET', `/api/workflow/${doc.id}`);
    if (wf?.subStages?.every(s => s.status === 'complete' && s.completed_at)) {
      completeDoc = { doc, wf };
      break;
    }
  }

  if (!completeDoc) {
    console.log('○ V2 SKIP — no document with all 4 substages complete found.');
    console.log('  Run verify.js first (Tests 5 + 5b upload v1 then v2 for Telenor Myanmar),');
    console.log('  then re-run this script.\n');
  } else {
    const { doc, wf } = completeDoc;
    console.log(`  Document: ${doc.id} (${doc.title || doc.doc_type})`);
    console.log(`  stage_status: ${wf.state.stage_status}`);
    wf.subStages.forEach(s => {
      console.log(`    substage ${s.id}: ${s.status}  completed_at: ${s.completed_at}`);
    });
    const allComplete = wf.subStages.every(s => s.status === 'complete' && s.completed_at);
    console.log(`\nV2 result: ${allComplete ? '✓ PASS' : '✗ FAIL'}`);
    if (!allComplete) allPassed = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // V3 — Server-side gating: force a substage to pending via raw DB write,
  //      then confirm POST /advance {screen:2} returns HTTP 409.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('V3: Server-side gating — POST /advance rejected with 409');
  console.log('═══════════════════════════════════════════════════════════');

  // Find any document that has substage rows we can temporarily mutate
  const subjectRow = await db('document_workflow_substages').first();
  if (!subjectRow) {
    console.log('✗ V3 FAIL — no document_workflow_substages rows in DB at all.');
    allPassed = false;
  } else {
    const targetDocId   = subjectRow.document_id;
    const targetSubId   = subjectRow.substage_id;
    const originalStatus = subjectRow.status;

    console.log(`  Using document: ${targetDocId}`);
    console.log(`  Mutating substage "${targetSubId}": ${originalStatus} → pending`);

    // Directly set substage to pending — bypasses app logic on purpose.
    // We are testing the /advance guard, not ingestion.
    await db('document_workflow_substages')
      .where({ document_id: targetDocId, substage_id: targetSubId })
      .update({ status: 'pending' });

    // Hit the endpoint
    const advRes = await req('POST', `/api/workflow/${targetDocId}/advance`, { screen: 2 });

    console.log(`\n  Request:  POST /api/workflow/${targetDocId}/advance  { screen: 2 }`);
    console.log(`  Response: HTTP ${advRes.status}`);
    console.log(JSON.stringify(advRes.body, null, 2).replace(/^/gm, '  '));

    // Restore the substage to its original state
    await db('document_workflow_substages')
      .where({ document_id: targetDocId, substage_id: targetSubId })
      .update({ status: originalStatus });
    console.log(`\n  Restored substage "${targetSubId}" back to: ${originalStatus}`);

    const pass =
      advRes.status === 409 &&
      typeof advRes.body?.error === 'string' &&
      Array.isArray(advRes.body?.unresolved) &&
      advRes.body.unresolved.includes(targetSubId);

    console.log(`\nV3 result: ${pass ? '✓ PASS (409 + unresolved[] contains mutated substage)' : '✗ FAIL — expected HTTP 409 with unresolved array containing "' + targetSubId + '"'}`);
    if (!pass) allPassed = false;
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`Overall: ${allPassed ? '✓ ALL CHECKS PASSED' : '✗ ONE OR MORE CHECKS FAILED'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => { console.error('Script error:', err); process.exit(1); });
