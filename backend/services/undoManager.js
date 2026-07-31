const db = require('../db');

// Saves a snapshot of rows that are about to be deleted, in the exact order
// they were deleted (children before parents, respecting FK constraints).
// Overwrites any previous slot — this is a single-level undo, not a full stack.
function saveUndoSlot(label, snapshotTablesInDeleteOrder) {
  db.prepare(`DELETE FROM undo_slot WHERE id = 'current'`).run();
  db.prepare(`
    INSERT INTO undo_slot (id, label, snapshot, state, updated_at)
    VALUES ('current', ?, ?, 'deleted', datetime('now'))
  `).run(label, JSON.stringify(snapshotTablesInDeleteOrder));
}

function getStatus() {
  const slot = db.prepare(`SELECT * FROM undo_slot WHERE id = 'current'`).get();
  if (!slot) return { canUndo: false, canRedo: false, label: null };
  return {
    canUndo: slot.state === 'deleted',
    canRedo: slot.state === 'restored',
    label: slot.label,
  };
}

// Re-inserts every snapshotted row, parents first (reverse of delete order),
// so foreign key constraints are satisfied on the way back in.
function undo() {
  const slot = db.prepare(`SELECT * FROM undo_slot WHERE id = 'current'`).get();
  if (!slot || slot.state !== 'deleted') return { error: 'Nothing to undo.' };

  const snapshotTables = JSON.parse(slot.snapshot);
  const insertOrder = [...snapshotTables].reverse();

  const tx = db.transaction(() => {
    for (const { table, rows } of insertOrder) {
      if (!rows || !rows.length) continue;
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(',');
      const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
      rows.forEach(r => stmt.run(...cols.map(c => r[c])));
    }
  });
  tx();

  db.prepare(`UPDATE undo_slot SET state = 'restored', updated_at = datetime('now') WHERE id = 'current'`).run();
  return { label: slot.label, restored: true };
}

// Re-deletes the same rows, in the original delete order (children first).
function redo() {
  const slot = db.prepare(`SELECT * FROM undo_slot WHERE id = 'current'`).get();
  if (!slot || slot.state !== 'restored') return { error: 'Nothing to redo.' };

  const snapshotTables = JSON.parse(slot.snapshot);

  const tx = db.transaction(() => {
    for (const { table, rows } of snapshotTables) {
      if (!rows || !rows.length) continue;
      const ids = rows.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).run(...ids);
    }
  });
  tx();

  db.prepare(`UPDATE undo_slot SET state = 'deleted', updated_at = datetime('now') WHERE id = 'current'`).run();
  return { label: slot.label, deleted: true };
}

module.exports = { saveUndoSlot, getStatus, undo, redo };
