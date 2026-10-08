'use strict';

/**
 * Migration 007 — Document Edit Lock + Manual Edit Provenance.
 *
 * 1. document_edit_locks — table to block concurrent edits while a diff
 *    is pending approval / deployment.  PK on document_id ensures at most
 *    one lock per document.  Two simultaneous PATCH calls produce a unique
 *    constraint violation (→ 409) instead of both succeeding.
 *
 * 2. diffs.source — provenance column: 'ingestion' (default) | 'manual_edit'.
 * 3. diffs.edit_comment — free-text comment required on manual edits.
 * 4. diffs.editor_user_id — FK-less reference to the users row who made the edit.
 */

async function up(knex) {
  // ── 1. document_edit_locks ─────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('document_edit_locks'))) {
    await knex.schema.createTable('document_edit_locks', t => {
      t.string('document_id').primary();                               // one lock per doc
      t.string('locked_by_diff_id').notNullable();
      t.string('locked_by_user_id').nullable();
      t.datetime('locked_at').defaultTo(knex.fn.now());
    });
    console.log('[migration 007] Created document_edit_locks table');
  }

  // ── 2–4. diffs columns ────────────────────────────────────────────────────
  if (!(await knex.schema.hasColumn('diffs', 'source'))) {
    await knex.schema.alterTable('diffs', t => {
      t.string('source').defaultTo('ingestion');
    });
    console.log('[migration 007] Added diffs.source column');
  }

  if (!(await knex.schema.hasColumn('diffs', 'edit_comment'))) {
    await knex.schema.alterTable('diffs', t => {
      t.text('edit_comment').nullable();
    });
    console.log('[migration 007] Added diffs.edit_comment column');
  }

  if (!(await knex.schema.hasColumn('diffs', 'editor_user_id'))) {
    await knex.schema.alterTable('diffs', t => {
      t.string('editor_user_id').nullable();
    });
    console.log('[migration 007] Added diffs.editor_user_id column');
  }
}

async function down(knex) {
  await knex.schema.dropTableIfExists('document_edit_locks');
  // Column drops on SQLite require table rebuild — intentional no-op for
  // diffs.source / diffs.edit_comment / diffs.editor_user_id.
}

module.exports = { up, down };
