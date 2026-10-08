'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'ir21_portal.db'));

// Q1: PRAGMA check on document_edit_locks
console.log('=== PRAGMA foreign_key_list(document_edit_locks) ===');
const delFKs = db.pragma('foreign_key_list(document_edit_locks)');
console.log(JSON.stringify(delFKs, null, 2));
console.log('Row count:', delFKs.length);
console.log('');

// Also check all tables and their FKs for completeness
console.log('=== All tables and FK counts ===');
const allTables = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
).all().map(r => r.name);

for (const t of allTables) {
  const fks = db.pragma(`foreign_key_list(${t})`);
  if (fks.length > 0) {
    console.log(`${t}:`);
    fks.forEach(fk => console.log(`  .${fk.from} → ${fk.table}.${fk.to}`));
  }
}

db.close();
