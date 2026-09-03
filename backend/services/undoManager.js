'use strict';

const db = require('../db');

// Saves a snapshot of rows that are about to be deleted, in the exact order
// they were deleted (children before parents, respecting FK constraints).
// Overwrites any previous slot — this is a single-level undo, not a full stack.
async function saveUndoSlot(label, snapshotTablesInDeleteOrder) {
  await db('undo_slot')
    .insert({
      id: 'current',
      label,
      snapshot: JSON.stringify(snapshotTablesInDeleteOrder),
      state: 'deleted',
      updated_at: new Date().toISOString(),
    })
    .onConflict('id')
    .merge(); // upsert: replaces the existing 'current' row if present
}

async function getStatus() {
  const slot = await db('undo_slot').where({ id: 'current' }).first();
  if (!slot) return { canUndo: false, canRedo: false, label: null };
  return {
    canUndo: slot.state === 'deleted',
    canRedo: slot.state === 'restored',
    label: slot.label,
  };
}

// Re-inserts every snapshotted row, parents first (reverse of delete order),
// so foreign key constraints are satisfied on the way back in.
// INSERT OR REPLACE semantics are preserved via onConflict().merge() which
// Knex translates per-dialect (ON CONFLICT DO UPDATE / ON DUPLICATE KEY UPDATE).
async function undo() {
  const slot = await db('undo_slot').where({ id: 'current' }).first();
  if (!slot || slot.state !== 'deleted') return { error: 'Nothing to undo.' };

  const snapshotTables = JSON.parse(slot.snapshot);
  const insertOrder = [...snapshotTables].reverse(); // parents first

  await db.transaction(async trx => {
    for (const { table, rows } of insertOrder) {
      if (!rows || !rows.length) continue;
      // Batch upsert: equivalent to INSERT OR REPLACE on all dialects
      await trx(table).insert(rows).onConflict('id').merge();
    }
  });

  await db('undo_slot').where({ id: 'current' }).update({
    state: 'restored',
    updated_at: new Date().toISOString(),
  });
  return { label: slot.label, restored: true };
}

// Re-deletes the same rows, in the original delete order (children first).
async function redo() {
  const slot = await db('undo_slot').where({ id: 'current' }).first();
  if (!slot || slot.state !== 'restored') return { error: 'Nothing to redo.' };

  const snapshotTables = JSON.parse(slot.snapshot);

  await db.transaction(async trx => {
    for (const { table, rows } of snapshotTables) {
      if (!rows || !rows.length) continue;
      const ids = rows.map(r => r.id);
      await trx(table).whereIn('id', ids).del();
    }
  });

  await db('undo_slot').where({ id: 'current' }).update({
    state: 'deleted',
    updated_at: new Date().toISOString(),
  });
  return { label: slot.label, deleted: true };
}

module.exports = { saveUndoSlot, getStatus, undo, redo };
