/**
 * run_migration_014.js
 * Applies migration 014 (decided_by columns) to the live database.
 * Safe to re-run — Knex checks if columns already exist via try/catch.
 */
'use strict';

const db = require('./db');

async function main() {
  console.log('[migration-014] Adding decided_by columns to approval_steps...');
  
  try {
    // Check if columns already exist
    const cols = await db.raw("PRAGMA table_info(approval_steps)");
    const existing = cols.map(c => c.name);
    
    if (existing.includes('decided_by_email')) {
      console.log('[migration-014] Columns already exist — skipping.');
      await db.destroy();
      return;
    }
  } catch (e) {
    // PRAGMA failed on non-SQLite? just attempt the alter.
  }

  try {
    await db.schema.table('approval_steps', (t) => {
      t.string('decided_by_user_id').nullable();
      t.string('decided_by_name').nullable();
      t.string('decided_by_email').nullable();
    });
    console.log('[migration-014] ✅ Columns added: decided_by_user_id, decided_by_name, decided_by_email');
  } catch (e) {
    if (e.message && e.message.includes('already exists')) {
      console.log('[migration-014] Columns already exist (caught from alter) — skipping.');
    } else {
      throw e;
    }
  }

  await db.destroy();
}

main().catch(e => {
  console.error('[migration-014] ERROR:', e.message);
  process.exit(1);
});
