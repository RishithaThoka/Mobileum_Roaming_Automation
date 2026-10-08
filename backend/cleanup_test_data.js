#!/usr/bin/env node
'use strict';
/**
 * cleanup_test_data.js
 *
 * Identifies and optionally deletes all test-created artifacts from the live DB.
 * Run with no flag to LIST ONLY (dry run).
 * Run with --delete to remove — all deletes are a single SQLite transaction.
 * A crash or FK violation rolls back the entire run; nothing is left half-deleted.
 *
 * Usage:
 *   node cleanup_test_data.js            -- dry run (list only, no changes)
 *   node cleanup_test_data.js --delete   -- permanently delete (transactional)
 */

const Database = require('better-sqlite3');
const path     = require('path');

const DRY_RUN = !process.argv.includes('--delete');
const db = new Database(path.join(__dirname, 'data', 'ir21_portal.db'));

// Match the server's FK enforcement.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  TEST DATA CLEANUP  (mode: ${DRY_RUN ? 'DRY RUN — no changes' : '⚠  DELETE — fully transactional'})`);
console.log('══════════════════════════════════════════════════════════════\n');
if (DRY_RUN) console.log('  Run with --delete to actually remove these records.\n');

// ── Helper: print rows ────────────────────────────────────────────────────────
function printTable(rows, label) {
  if (!rows || rows.length === 0) { console.log(`  [${label}] none found.\n`); return; }
  console.log(`  [${label}] Found ${rows.length} record(s):`);
  rows.forEach(r => console.log('   ', JSON.stringify(r)));
  console.log();
}

// ── Build FK dependency graph from PRAGMA foreign_key_list ────────────────────
//
// PRAGMA foreign_key_list(T) returns one row per FK column on T:
//   { id, seq, table, from, to, on_update, on_delete, match }
// where "table" is the referenced PARENT table and "from" is the FK column on T.
//
// We invert: for each parent we care about, collect every child table
// that references it.  Topological sort (post-order DFS) gives deletion order:
// deepest children first so parent rows can be deleted last without FK errors.

function buildFKGraph() {
  const allTables = db.prepare(
    `SELECT name FROM sqlite_master
     WHERE type='table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT IN ('knex_migrations','knex_migrations_lock')`
  ).all().map(r => r.name);

  // childrenOf[parent] = [ childTable, ... ]
  // fkColumn[childTable][parentTable] = columnName
  const childrenOf = {};
  const fkColumn   = {};

  for (const table of allTables) {
    const fks = db.pragma(`foreign_key_list(${table})`);
    for (const fk of fks) {
      const parent = fk.table;
      if (!childrenOf[parent])           childrenOf[parent] = [];
      if (!childrenOf[parent].includes(table)) childrenOf[parent].push(table);
      if (!fkColumn[table])              fkColumn[table] = {};
      fkColumn[table][parent] = fk.from; // the column on `table` that references `parent`
    }
  }
  return { childrenOf, fkColumn };
}

// Returns all tables that transitively depend on `rootTable`, deepest-first.
function dependentsOf(rootTable, childrenOf) {
  const visited = new Set();
  const order   = [];
  function visit(t) {
    if (visited.has(t)) return;
    visited.add(t);
    for (const child of (childrenOf[t] || [])) visit(child);
    if (t !== rootTable) order.push(t);
  }
  visit(rootTable);
  return order; // post-order: leaves first
}

const { childrenOf, fkColumn } = buildFKGraph();

const DOC_DEPENDENTS      = dependentsOf('documents', childrenOf);
const OPERATOR_DEPENDENTS = dependentsOf('operators', childrenOf);

console.log('── FK DEPENDENCY SCAN (PRAGMA foreign_key_list) ──────────────');
console.log('  Dependents of documents.id — delete order (children first):');
DOC_DEPENDENTS.forEach((t, i) => {
  const col = (fkColumn[t] || {})['documents'] || '(no direct FK — handled explicitly)';
  console.log(`    ${String(i + 1).padStart(2)}. ${t}  (FK col: ${col})`);
});
console.log();
console.log('  Dependents of operators.id — delete order (children first):');
OPERATOR_DEPENDENTS.forEach((t, i) => {
  const col = (fkColumn[t] || {})['operators'] || '(no direct FK)';
  console.log(`    ${String(i + 1).padStart(2)}. ${t}  (FK col: ${col})`);
});
console.log();

// Also explicitly report document_edit_locks PRAGMA result so it's visible in output
const delFKs = db.pragma('foreign_key_list(document_edit_locks)');
console.log(`  PRAGMA foreign_key_list(document_edit_locks): ${JSON.stringify(delFKs)}`);
console.log(`  → ${delFKs.length === 0 ? 'NO FK declared — delete handled by explicit name match in cascadeDeleteDoc' : 'FK declared: ' + JSON.stringify(delFKs)}`);
console.log();

// ── Core delete helpers ───────────────────────────────────────────────────────

// Delete a document and ALL dependent rows.
// diffs has a two-level chain (diffs → approval_workflows → approval_steps)
// that must be walked row-by-row; everything else is handled generically
// via the FK graph.
function cascadeDeleteDoc(docId) {
  // 1. Collect all diff IDs for this document (version-linked + document-linked)
  const allDiffIds = new Set();
  const versionIds = db.prepare(`SELECT id FROM document_versions WHERE document_id = ?`)
    .all(docId).map(r => r.id);
  for (const vid of versionIds) {
    db.prepare(`SELECT id FROM diffs WHERE from_version_id = ? OR to_version_id = ?`)
      .all(vid, vid).forEach(r => allDiffIds.add(r.id));
  }
  db.prepare(`SELECT id FROM diffs WHERE document_id = ?`).all(docId).forEach(r => allDiffIds.add(r.id));

  // 2. Delete approval_steps → approval_workflows → diff_items → diffs
  for (const diffId of allDiffIds) {
    const wfIds = db.prepare(`SELECT id FROM approval_workflows WHERE diff_id = ?`)
      .all(diffId).map(r => r.id);
    for (const wfId of wfIds) {
      db.prepare(`DELETE FROM approval_steps WHERE workflow_id = ?`).run(wfId);
    }
    db.prepare(`DELETE FROM approval_workflows WHERE diff_id = ?`).run(diffId);
    db.prepare(`DELETE FROM diff_items        WHERE diff_id = ?`).run(diffId);
    db.prepare(`DELETE FROM diffs             WHERE id = ?`).run(diffId);
  }

  // 3. All other document-dependent tables (discovered from PRAGMA FK graph),
  //    skipping the ones already handled above.
  const alreadyHandled = new Set([
    'document_versions', 'diffs', 'diff_items', 'approval_workflows', 'approval_steps'
  ]);
  for (const depTable of DOC_DEPENDENTS) {
    if (alreadyHandled.has(depTable)) continue;
    const col = (fkColumn[depTable] || {})['documents'];
    if (col) db.prepare(`DELETE FROM ${depTable} WHERE ${col} = ?`).run(docId);
  }

  // 4. document_edit_locks: PK is document_id (no FK declared) — always delete explicitly
  db.prepare(`DELETE FROM document_edit_locks WHERE document_id = ?`).run(docId);

  // 5. document_versions (now safe — diffs referencing their IDs are gone)
  db.prepare(`DELETE FROM document_versions WHERE document_id = ?`).run(docId);

  // 6. The document row itself
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(docId);
}

// Delete an operator and all its non-document dependents.
// (Documents must be cascade-deleted BEFORE calling this.)
function cascadeDeleteOperator(opId) {
  for (const depTable of OPERATOR_DEPENDENTS) {
    if (depTable === 'documents') continue; // documents handled separately
    const col = (fkColumn[depTable] || {})['operators'];
    if (col) db.prepare(`DELETE FROM ${depTable} WHERE ${col} = ?`).run(opId);
  }
  db.prepare(`DELETE FROM operators WHERE id = ?`).run(opId);
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTIFICATION — always runs (dry-run and delete mode)
// ─────────────────────────────────────────────────────────────────────────────

console.log('── 1. OPERATORS ──────────────────────────────────────────────');
const testOperators = db.prepare(`
  SELECT id, name, country, created_at
  FROM operators
  WHERE name LIKE 'V3TestOp_%'
     OR name LIKE 'DomainTestOp_%'
     OR country = 'Neverland'
  ORDER BY created_at DESC
`).all();
printTable(testOperators, 'operators');

// Q2 FIX: show operator-owned documents in dry-run, not just at delete-time
console.log('── 2. DOCUMENTS OWNED BY TEST OPERATORS ──────────────────────');
let opOwnedDocs = [];
if (testOperators.length > 0) {
  const phs = testOperators.map(() => '?').join(',');
  opOwnedDocs = db.prepare(`
    SELECT d.id, d.title, op.name AS operator_name, d.created_at
    FROM documents d
    JOIN operators op ON op.id = d.operator_id
    WHERE d.operator_id IN (${phs})
    ORDER BY d.created_at DESC
  `).all(...testOperators.map(o => o.id));
}
printTable(opOwnedDocs, 'documents (owned by test operators — deleted with their operator)');

console.log('── 3. STANDALONE TEST DOCUMENTS (title match, not op-owned) ──');
const opOwnedDocIds = new Set(opOwnedDocs.map(d => d.id));
const allTitleDocs  = db.prepare(`
  SELECT d.id, d.title, op.name AS operator_name, d.created_at
  FROM documents d
  LEFT JOIN operators op ON op.id = d.operator_id
  WHERE d.title = 'Verify Upload Test'
  ORDER BY d.created_at DESC
`).all();
const standaloneDocs = allTitleDocs.filter(d => !opOwnedDocIds.has(d.id));
printTable(standaloneDocs, 'documents (standalone, title-matched)');

console.log('── 4. FIELD CATALOG (_test_catalog_*) ────────────────────────');
const testCatalog = db.prepare(`
  SELECT id, field_label, domain, is_active, created_at
  FROM field_catalog
  WHERE field_label LIKE '_test_catalog_%'
  ORDER BY created_at DESC
`).all();
printTable(testCatalog, 'field_catalog');

console.log('── 5. FIELD OWNERSHIP OVERRIDES (_test_override_*) ───────────');
const testOverrides = db.prepare(`
  SELECT id, normalized_label, domain, operator_id, created_at
  FROM field_ownership_overrides
  WHERE normalized_label LIKE '_test_override_%'
  ORDER BY created_at DESC
`).all();
printTable(testOverrides, 'field_ownership_overrides');

console.log('── 6. FIELD OWNERSHIP RULES (auto-test) ──────────────────────');
const testRules = db.prepare(`
  SELECT id, rule_type, pattern, domain, notes, created_at
  FROM field_ownership_rules
  WHERE notes LIKE '%auto-test%'
     OR notes LIKE '%updated by test%'
  ORDER BY created_at DESC
`).all();
printTable(testRules, 'field_ownership_rules');

console.log('── 7. EPHEMERAL TEST USERS (_verify_test_*) ──────────────────');
const testUsers = db.prepare(`
  SELECT id, username, role, status, created_at
  FROM users
  WHERE username LIKE '_verify_test_%'
  ORDER BY created_at DESC
`).all();
printTable(testUsers, 'users');

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
const totalDirectItems =
  testOperators.length + opOwnedDocs.length + standaloneDocs.length +
  testCatalog.length   + testOverrides.length + testRules.length + testUsers.length;

console.log('══════════════════════════════════════════════════════════════');
if (DRY_RUN) {
  if (totalDirectItems === 0) {
    console.log('  ✓ No test artifacts found. DB is clean.');
  } else {
    console.log(`  ⚠  ${totalDirectItems} top-level artifact(s) will be deleted:`);
    if (testOperators.length)  console.log(`       ${testOperators.length}  operator(s)`);
    if (opOwnedDocs.length)    console.log(`       ${opOwnedDocs.length}  document(s) owned by those operators`);
    if (standaloneDocs.length) console.log(`       ${standaloneDocs.length}  standalone test document(s)`);
    if (testCatalog.length)    console.log(`       ${testCatalog.length}  field catalog entry/entries`);
    if (testOverrides.length)  console.log(`       ${testOverrides.length}  field override(s)`);
    if (testRules.length)      console.log(`       ${testRules.length}  ownership rule(s)`);
    if (testUsers.length)      console.log(`       ${testUsers.length}  ephemeral test user(s)`);
    console.log('');
    console.log('  Each document deletion also removes all dependent rows in:');
    DOC_DEPENDENTS.forEach(t => console.log(`    - ${t}`));
    console.log('  Plus explicit: document_edit_locks (PK=document_id, no FK declared)');
    console.log('');
    console.log('  Review the list above, then run:');
    console.log('    node cleanup_test_data.js --delete\n');
  }
  db.close();
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE PHASE — only reached with --delete
// Single transaction: throw anywhere = full rollback, DB unchanged.
// ─────────────────────────────────────────────────────────────────────────────
if (totalDirectItems === 0) {
  console.log('  ✓ Nothing to delete. DB is clean.');
  db.close();
  process.exit(0);
}

console.log('\n  Starting transactional delete...\n');

const runDelete = db.transaction(() => {
  for (const doc of opOwnedDocs) {
    cascadeDeleteDoc(doc.id);
    console.log(`  ✓ Deleted operator-owned doc: "${doc.title}" (${doc.id})`);
  }
  for (const op of testOperators) {
    cascadeDeleteOperator(op.id);
    console.log(`  ✓ Deleted operator: "${op.name}" (${op.id})`);
  }
  for (const doc of standaloneDocs) {
    cascadeDeleteDoc(doc.id);
    console.log(`  ✓ Deleted standalone doc: "${doc.title}" (${doc.id})`);
  }
  for (const e of testCatalog)   { db.prepare(`DELETE FROM field_catalog WHERE id = ?`).run(e.id);                    console.log(`  ✓ Deleted catalog: ${e.field_label}`); }
  for (const o of testOverrides) { db.prepare(`DELETE FROM field_ownership_overrides WHERE id = ?`).run(o.id);        console.log(`  ✓ Deleted override: ${o.normalized_label}`); }
  for (const r of testRules)     { db.prepare(`DELETE FROM field_ownership_rules WHERE id = ?`).run(r.id);            console.log(`  ✓ Deleted rule: ${r.pattern}`); }
  for (const u of testUsers)     { db.prepare(`DELETE FROM users WHERE id = ?`).run(u.id);                            console.log(`  ✓ Deleted user: ${u.username}`); }
});

try {
  runDelete();
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  ✓ Cleanup complete — ${totalDirectItems} artifact(s) deleted.`);
  console.log('    Transaction committed. All dependent rows removed.');
  console.log('══════════════════════════════════════════════════════════════\n');
} catch (err) {
  // better-sqlite3 auto-rolls back the transaction on throw
  console.error('\n══════════════════════════════════════════════════════════════');
  console.error('  ✗ DELETE FAILED — transaction rolled back. DB is unchanged.');
  console.error(`  Error: ${err.message}`);
  console.error('══════════════════════════════════════════════════════════════\n');
  db.close();
  process.exit(1);
}

db.close();
