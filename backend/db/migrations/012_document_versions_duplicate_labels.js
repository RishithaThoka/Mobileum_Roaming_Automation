'use strict';

/**
 * Migration 012: document_versions — add duplicate_label_paths column (B8)
 *
 * Stores a JSON array of field paths that had duplicate labels in the source
 * document (i.e. two lines with the same Section.Label, where the second
 * silently overwrites the first).
 *
 * These paths are:
 *   - Flagged in the viewer with an "ambiguous value" badge
 *   - Blocked from manual edits (PATCH returns 400 with reason)
 *
 * Null = scan not yet run or format not scannable (pdf/xml/xlsx).
 * [] = scan ran, no duplicates found.
 * ["Section.Field", ...] = those paths had >1 occurrence.
 */

exports.up = async function (db) {
  const hasTable = await db.schema.hasTable('document_versions');
  if (!hasTable) return;
  const hasCol = await db.schema.hasColumn('document_versions', 'duplicate_label_paths');
  if (!hasCol) {
    await db.schema.alterTable('document_versions', (t) => {
      t.text('duplicate_label_paths').nullable();
    });
  }
};

exports.down = async function (db) {
  // SQLite: cannot drop column; no-op
};
