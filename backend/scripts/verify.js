/**
 * Verification script — tests the 14 endpoints listed in the approved plan.
 * Run with: node verify.js
 * Assumes the server is already running on port 4021.
 *
 * Authentication: uses the default admin credentials from auth.js
 * (admin / admin) to get a token first, then attaches it to every request.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const BASE  = 'http://localhost:4021';
const CREDS = { username: 'admin', password: 'admin' };

let adminToken = null;

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const url = new URL(BASE + path);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers };

    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, 200); }
        resolve({ status: res.statusCode, body: parsed, raw: raw.slice(0, 500) });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── State captured during tests ──────────────────────────────────────────────

let firstOperatorId  = null;
let patchedOpId      = null;
let deletedOpId      = null;
let uploadedDocId    = null;
let firstDiffId      = null;
let firstDocId       = null;
let firstApprovalToken = null;

// ─── Test runner ──────────────────────────────────────────────────────────────

const results = [];

async function test(number, label, fn) {
  process.stdout.write(`\n── Test ${number}: ${label}\n`);
  try {
    const r = await fn();
    const ok = r.status >= 200 && r.status < 300;
    results.push({ number, label, status: r.status, ok });
    console.log(`   STATUS: ${r.status}  ${ok ? '✓' : '✗ FAIL'}`);
    const preview = JSON.stringify(r.body, null, 2).split('\n').slice(0, 30).join('\n');
    console.log(`   BODY (first 30 lines):\n${preview.replace(/^/gm, '   ')}`);
    return r;
  } catch (err) {
    results.push({ number, label, status: 'ERROR', ok: false, err: err.message });
    console.log(`   ERROR: ${err.message}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Endpoint Verification against SQLite instance at', BASE, '===\n');

  // ── Auth (prerequisite — not in the 14 but needed for Bearer token) ──────────
  console.log('── Auth (prerequisite): POST /api/auth/login');
  const loginRes = await request('POST', '/api/auth/login', CREDS);
  console.log('   STATUS:', loginRes.status, '  BODY:', JSON.stringify(loginRes.body));
  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.error('\n   FATAL: Cannot get auth token — aborting. Check credentials in routes/auth.js');
    process.exit(1);
  }
  adminToken = loginRes.body.token;
  console.log('   token obtained:', adminToken.slice(0, 12) + '...');

  // ── 1. GET /api/operators ─────────────────────────────────────────────────────
  const r1 = await test(1, 'GET /api/operators', async () => {
    const r = await request('GET', '/api/operators', null, adminToken);
    if (Array.isArray(r.body) && r.body.length > 0) {
      firstOperatorId = r.body[0].id;
      firstDocId = null; // will be populated by test 5
    }
    return r;
  });

  // ── 2. POST /api/operators (create) ──────────────────────────────────────────
  const r2 = await test(2, 'POST /api/operators (create)', async () => {
    const r = await request('POST', '/api/operators', {
      name: 'Verification Test Telco',
      country: 'Testland',
      network_code: 'TST99',
      ingest_mode: 'push',
      default_doc_type: 'IR21',
    }, adminToken);
    if (r.body && r.body.operator) patchedOpId = r.body.operator.id;
    return r;
  });

  // ── 3. PATCH /api/operators/:id (update) ─────────────────────────────────────
  await test(3, `PATCH /api/operators/:id (update)`, async () => {
    if (!patchedOpId) return { status: 'SKIP — no operator created in test 2', body: {} };
    return request('PATCH', `/api/operators/${patchedOpId}`, {
      contact_email: 'test@telco.example',
      status: 'active',
    }, adminToken);
  });

  // ── 4. DELETE /api/operators/:id then undo/redo ───────────────────────────────
  await test(4, 'DELETE /api/operators/:id', async () => {
    if (!patchedOpId) return { status: 'SKIP', body: {} };
    deletedOpId = patchedOpId;
    return request('DELETE', `/api/operators/${deletedOpId}`, null, adminToken);
  });

  await test('4a', 'GET /api/admin/undo-status (after delete)', async () => {
    return request('GET', '/api/admin/undo-status', null, adminToken);
  });

  await test('4b', 'POST /api/admin/undo', async () => {
    return request('POST', '/api/admin/undo', null, adminToken);
  });

  await test('4c', 'POST /api/admin/redo', async () => {
    return request('POST', '/api/admin/redo', null, adminToken);
  });

  // ── 5. POST /api/documents/upload — real multipart POST ─────────────────────
  // File: the T-Mobile IR21 .docx that already exists in uploads/ from a prior session.
  // Operator: first operator returned by test 1 (Bharti Airtel or whichever is first).
  await test(5, 'POST /api/documents/upload (real multipart with uploads/1785357107642_TMobileUS_IR21_v1.docx)', async () => {
    const filePath = path.join(__dirname, '..', 'uploads', '1785357107642_TMobileUS_IR21_v1.docx');
    if (!fs.existsSync(filePath)) {
      return { status: 'SKIP', body: { note: 'File not found: ' + filePath } };
    }
    const fileBytes  = fs.readFileSync(filePath);
    const boundary   = '----VerifyBoundary' + Date.now();
    const CRLF       = '\r\n';
    const operatorId = firstOperatorId || '';

    // Build multipart body manually (no external deps)
    let body = Buffer.alloc(0);
    const append = (str) => { body = Buffer.concat([body, Buffer.from(str, 'utf8')]); };
    const appendBuf = (buf) => { body = Buffer.concat([body, buf]); };

    // Part 1: operator_id
    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="operator_id"${CRLF}${CRLF}`);
    append(`${operatorId}${CRLF}`);

    // Part 2: doc_type
    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="doc_type"${CRLF}${CRLF}`);
    append(`IR21${CRLF}`);

    // Part 3: title
    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="title"${CRLF}${CRLF}`);
    append(`Verify Upload Test${CRLF}`);

    // Part 4: source
    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="source"${CRLF}${CRLF}`);
    append(`push${CRLF}`);

    // Part 5: file
    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="file"; filename="TMobileUS_IR21_v1.docx"${CRLF}`);
    append(`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document${CRLF}${CRLF}`);
    appendBuf(fileBytes);
    append(`${CRLF}`);

    // Close
    append(`--${boundary}--${CRLF}`);

    return new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Authorization': `Bearer ${adminToken}`,
      };
      const opts = {
        hostname: 'localhost', port: 4021,
        path: '/api/documents/upload', method: 'POST', headers,
      };
      const req = http.request(opts, res => {
        let raw = '';
        res.on('data', d => { raw += d; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, 500); }
          if (parsed && parsed.document) {
            uploadedDocId = parsed.document.id || (parsed.document && parsed.document.id);
            firstDocId = firstDocId || uploadedDocId;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  });

  // ── 5b. Upload TMobileUS_IR21_v2.docx — same operator + doc_type as Test 5 ─────
  // This is the genuine v2 (different content from v1). Because the operator+doc_type
  // combination already has v1 in the DB (from Test 5), ingestionService will:
  //   - find the existing document row
  //   - insert a new document_version (v2)
  //   - compute extractedFields for both versions
  //   - run diffEngine.computeDiff(v1Fields, v2Fields)
  //   - INSERT into diffs + diff_items
  //   - return { document, versionId, diff: { diffId, totalChanges, ... } }
  let newDiffId = null;
  await test('5b', 'POST /api/documents/upload — TMobileUS_IR21_v2.docx (genuine v2, same operator+doc_type → should produce a live diff)', async () => {
    const filePath = path.join(__dirname, '..', '..', 'sample-documents', 'ir21-docx', 'TMobileUS_IR21_v2.docx');
    if (!fs.existsSync(filePath)) {
      return { status: 'SKIP', body: { note: 'File not found: ' + filePath } };
    }
    const fileBytes = fs.readFileSync(filePath);
    const boundary  = '----VerifyBoundaryV2' + Date.now();
    const CRLF      = '\r\n';

    let body = Buffer.alloc(0);
    const append    = (str) => { body = Buffer.concat([body, Buffer.from(str, 'utf8')]); };
    const appendBuf = (buf) => { body = Buffer.concat([body, buf]); };

    // operator_id: Bharti Airtel (first operator, same as Test 5)
    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="operator_id"${CRLF}${CRLF}`);
    append(`${firstOperatorId}${CRLF}`);

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="doc_type"${CRLF}${CRLF}`);
    append(`IR21${CRLF}`);

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="title"${CRLF}${CRLF}`);
    append(`Verify Upload Test${CRLF}`);

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="source"${CRLF}${CRLF}`);
    append(`push${CRLF}`);

    append(`--${boundary}${CRLF}`);
    append(`Content-Disposition: form-data; name="file"; filename="TMobileUS_IR21_v2.docx"${CRLF}`);
    append(`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document${CRLF}${CRLF}`);
    appendBuf(fileBytes);
    append(`${CRLF}`);
    append(`--${boundary}--${CRLF}`);

    return new Promise((resolve, reject) => {
      const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Authorization': `Bearer ${adminToken}`,
      };
      const req = http.request(
        { hostname: 'localhost', port: 4021, path: '/api/documents/upload', method: 'POST', headers },
        res => {
          let raw = '';
          res.on('data', d => { raw += d; });
          res.on('end', () => {
            let parsed;
            try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, 500); }
            if (parsed && parsed.diff && parsed.diff.diffId) {
              newDiffId = parsed.diff.diffId;
            }
            resolve({ status: res.statusCode, body: parsed });
          });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  });

  // ── 6. GET /api/diffs/:id — live diff from Test 5b v2 upload ─────────────────
  // Prefer the diff produced by Test 5b (newDiffId). Fall back to any pre-existing
  // diff in the DB if 5b produced diff:null (e.g. AI extractor returned empty fields).
  await test(6, 'GET /api/diffs/:id (using diff from Test 5b v2 upload, or pre-existing if 5b returned no diff)', async () => {
    // Primary: diff produced by the v2 upload
    if (newDiffId) {
      firstDiffId = newDiffId;
    }

    // Fallback: GET /api/diffs list — each row is a diff_item with a diff_id column
    if (!firstDiffId) {
      const listRes = await request('GET', '/api/diffs', null, adminToken);
      if (Array.isArray(listRes.body) && listRes.body.length > 0) {
        firstDiffId = listRes.body[0].diff_id;
      }
    }

    // Second fallback: walk documents for one with a known diff
    if (!firstDiffId) {
      const docs = await request('GET', '/api/documents', null, adminToken);
      if (Array.isArray(docs.body)) {
        for (const doc of docs.body) {
          if (doc.latest_diff_status) {
            const dr = await request('GET', `/api/documents/${doc.id}/diffs`, null, adminToken);
            if (Array.isArray(dr.body) && dr.body.length > 0) {
              firstDiffId = dr.body[0].id;
              break;
            }
          }
        }
      }
    }

    if (!firstDiffId) {
      return { status: 'SKIP', body: { note: 'No diffs in DB — requires at least two versions of the same document' } };
    }
    return request('GET', `/api/diffs/${firstDiffId}`, null, adminToken);
  });


  // ── 7. GET /api/dashboard/stats ───────────────────────────────────────────────
  await test(7, 'GET /api/dashboard/stats', async () => {
    return request('GET', '/api/dashboard/stats', null, adminToken);
  });

  // ── 8a. GET /api/settings/routing ────────────────────────────────────────────
  await test('8a', 'GET /api/settings/routing', async () => {
    return request('GET', '/api/settings/routing', null, adminToken);
  });

  // ── 8b. PATCH /api/settings/routing/:category ────────────────────────────────
  await test('8b', 'PATCH /api/settings/routing/:category', async () => {
    return request('PATCH', '/api/settings/routing/Routing%20(GT)', {
      approver_email: 'verify-test@example.com',
    }, adminToken);
  });

  // ── 9. POST /api/admin/reset (we do this AFTER other data tests) ─────────────
  // Skipping destructive reset in automated test — it would wipe all data.
  await test(9, 'POST /api/admin/reset — INTENTIONALLY SKIPPED (destructive; wipes all data)', async () => {
    return { status: 204, body: { note: 'Skipped: destructive. Manually run if needed — POST /api/admin/reset.' } };
  });

  // ── 10. GET /api/notifications ───────────────────────────────────────────────
  await test(10, 'GET /api/notifications', async () => {
    return request('GET', '/api/notifications', null, adminToken);
  });

  // ── 11. GET /api/workflow/:docId ─────────────────────────────────────────────
  await test(11, 'GET /api/workflow/:docId', async () => {
    if (!firstDocId) return { status: 'SKIP — no documents in DB', body: {} };
    return request('GET', `/api/workflow/${firstDocId}`, null, adminToken);
  });

  // ── 12. GET /api/network/sla ──────────────────────────────────────────────────
  await test(12, 'GET /api/network/sla', async () => {
    return request('GET', '/api/network/sla', null, adminToken);
  });

  // ── 13. GET /api/master-repository ───────────────────────────────────────────
  await test(13, 'GET /api/master-repository', async () => {
    return request('GET', '/api/master-repository', null, adminToken);
  });

  // ── 14. GET /api/approvals/token/:token ──────────────────────────────────────
  await test(14, 'GET /api/approvals/token/:token', async () => {
    // Try to get a real token from the DB via the approval list
    const approvalList = await request('GET', '/api/approvals', null, adminToken);
    if (Array.isArray(approvalList.body) && approvalList.body.length > 0) {
      const step = approvalList.body.find(s => s.token);
      if (step) firstApprovalToken = step.token;
    }
    if (!firstApprovalToken) {
      return { status: 'SKIP — no approval steps with tokens in DB yet (requires a full document upload + diff cycle)', body: { note: 'Upload a document with changes to generate an approval token' } };
    }
    return request('GET', `/api/approvals/token/${firstApprovalToken}`, null, adminToken);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n\n══ SUMMARY ══════════════════════════════════════════════════════');
  let passed = 0, failed = 0, skipped = 0;
  for (const r of results) {
    // A result is a skip when: label contains 'SKIP', status is the string 'SKIP',
    // or it was the intentionally-skipped reset test (status 204, note in body).
    const isSkip = String(r.status) === 'SKIP'
      || (r.status === 204 && r.label && r.label.includes('INTENTIONALLY SKIPPED'));
    const icon = isSkip ? '○' : (r.ok ? '✓' : '✗');
    if (isSkip) skipped++; else if (r.ok) passed++; else failed++;
    const suffix = isSkip ? ' (skipped)' : (r.err ? ' ERR: ' + r.err : '');
    console.log(`  ${icon} Test ${r.number}: ${r.label} — HTTP ${r.status}${suffix}`);
  }
  console.log(`\n  Legend: ✓ pass   ○ intentional skip   ✗ fail`);
  console.log(`  Passed: ${passed}  Skipped: ${skipped}  Failed: ${failed}`);
  console.log('══════════════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Script error:', err); process.exit(1); });
