'use strict';
// Run: node scripts/db_audit_q1q2.js  (from backend/ dir)
const db = require('../db');

async function main() {
  // ── Q1: operators with 2+ active (non-cancelled, non-superseded) workflows ──
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Q1: Multiple workflows per operator');
  console.log('═══════════════════════════════════════════════════════════════');

  const q1 = await db('approval_workflows as w')
    .select([
      'o.name as operator',
      'd.id as diff_id',
      'd.status as diff_status',
      'd.created_at as diff_created_at',
      'd.total_changes',
      'w.id as workflow_id',
      'w.status as workflow_status',
      'w.completed_at as workflow_completed_at',
    ])
    .join('diffs as d',        'w.diff_id',       'd.id')
    .join('documents as doc',  'd.document_id',   'doc.id')
    .join('operators as o',    'doc.operator_id', 'o.id')
    .where('w.status', '!=', 'cancelled')
    .whereNot('d.status', 'superseded')
    .orderBy('o.name')
    .orderBy('d.created_at');

  const byOp = {};
  for (const r of q1) {
    if (!byOp[r.operator]) byOp[r.operator] = [];
    byOp[r.operator].push(r);
  }

  let foundMultiple = false;
  for (const [op, rows] of Object.entries(byOp)) {
    if (rows.length < 2) continue;
    foundMultiple = true;
    console.log(`\nOperator: ${op}  (${rows.length} active workflows)`);
    for (const r of rows) {
      const sameDiff = rows.filter(x => x.diff_id === r.diff_id).length > 1;
      console.log(`  diff_id=${r.diff_id}  diff_status=${r.diff_status}  total_changes=${r.total_changes}`);
      console.log(`    diff_created_at=${r.diff_created_at}`);
      console.log(`    workflow_id=${r.workflow_id}  workflow_status=${r.workflow_status}`);
      console.log(`    workflow_completed_at=${r.workflow_completed_at || 'null (still in progress)'}`);
      if (sameDiff) console.log(`    *** SAME diff_id as another row — genuine duplicate ***`);
    }
  }
  if (!foundMultiple) {
    console.log('  No operator has 2+ active non-cancelled workflows.');
    console.log('  → GET / filter is working. Dual cards in UI are a rendering/cache issue, not a DB issue.');
  }

  // ── Q2: ALL diffs for Telenor Myanmar ─────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Q2: All diffs for Telenor Myanmar (every status)');
  console.log('═══════════════════════════════════════════════════════════════');

  // Find operator
  const tmOp = await db('operators').whereRaw("name LIKE '%elenor%' OR name LIKE '%yanmar%'");
  if (tmOp.length === 0) {
    console.log('  No operator matching Telenor/Myanmar found.');
  }

  for (const op of tmOp) {
    console.log(`\n  Operator: ${op.name} (id=${op.id})`);
    const docs = await db('documents').where({ operator_id: op.id });
    for (const doc of docs) {
      console.log(`  Document: ${doc.title} (id=${doc.id})`);
      const diffs = await db('diffs').where({ document_id: doc.id }).orderBy('created_at', 'desc');
      if (diffs.length === 0) { console.log('    No diffs.'); continue; }
      for (const diff of diffs) {
        const items = await db('diff_items').where({ diff_id: diff.id });
        const unresolved = items.filter(i => i.needs_review === 1).length;
        const isActive = !['superseded','rejected','cancelled'].includes(diff.status);
        console.log(`\n    diff_id=${diff.id}  status=${diff.status}${isActive ? '  ← ACTIVE (picked by fixed fetchDeltas)' : ''}`);
        console.log(`      total_changes=${diff.total_changes}  actual_items=${items.length}  unresolved=${unresolved}`);
        console.log(`      created_at=${diff.created_at}`);
        if (isActive) {
          console.log(`      → After backend fix, Difference Checker should show: ${unresolved} Unresolved`);
          if (unresolved !== 28) {
            console.log(`      → Mismatch: "28 Unresolved" in UI ≠ ${unresolved} in DB. Diff ${diff.id} has ${items.length} items, ${unresolved} unresolved.`);
          } else {
            console.log(`      → "28 Unresolved" in UI MATCHES DB — the number is correct, not inflated.`);
          }
        }
      }
    }
  }

  // ── Q3: What does the fixed GET /api/diffs return for Telenor Myanmar? ─────
  // Replicate the backend fix: latest non-superseded/rejected diff per document
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Q3: fetchDeltas scope after backend fix');
  console.log('    (latest active diff per doc, what the UI actually sees)');
  console.log('═══════════════════════════════════════════════════════════════');

  const activeDiffs = await db('diffs as d')
    .select(['d.id as diff_id', 'd.document_id', 'd.status', 'd.created_at'])
    .whereNotIn('d.status', ['superseded', 'rejected'])
    .orderBy('d.created_at', 'desc');

  const latestByDoc = {};
  for (const d of activeDiffs) {
    if (!latestByDoc[d.document_id]) latestByDoc[d.document_id] = d.diff_id;
  }

  for (const op of tmOp) {
    const docs = await db('documents').where({ operator_id: op.id });
    for (const doc of docs) {
      const activeDiffId = latestByDoc[doc.id];
      if (!activeDiffId) { console.log(`  ${op.name}: no active diff in scope`); continue; }
      const cnt = await db('diff_items').where({ diff_id: activeDiffId }).count('id as n').first();
      const unres = await db('diff_items').where({ diff_id: activeDiffId, needs_review: 1 }).count('id as n').first();
      console.log(`\n  ${op.name} — ${doc.title}`);
      console.log(`    Active diff_id=${activeDiffId}`);
      console.log(`    Items returned by fixed GET /api/diffs: ${cnt.n}`);
      console.log(`    Of which unresolved: ${unres.n}`);
      console.log(`    → "X Unresolved in View" should show: ${unres.n}`);
    }
  }

  await db.destroy();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
