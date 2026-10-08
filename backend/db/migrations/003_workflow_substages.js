'use strict';

/**
 * Migration 003 — Workflow sub-stage tracking.
 *
 * 1. Creates document_workflow_substages table for real, event-driven
 *    sub-stage state (replaces the fake elapsed-time logic).
 * 2. Adds a UNIQUE index on document_workflow_state.document_id to prevent
 *    duplicate workflow-state rows from concurrent insert races.
 *    Any pre-existing duplicates are deduplicated first (earliest row kept).
 */

async function up(knex) {
  // ── 1. New table: document_workflow_substages ──────────────────────────────
  if (!(await knex.schema.hasTable('document_workflow_substages'))) {
    await knex.schema.createTable('document_workflow_substages', t => {
      t.string('id').primary();
      t.string('document_id').notNullable().references('id').inTable('documents');
      t.string('substage_id').notNullable();  // extraction | comparison | diff | risk
      // pending | complete | failed | not_applicable
      t.string('status').notNullable().defaultTo('pending');
      t.datetime('completed_at').nullable();
      t.text('error_message').nullable();
      t.text('reason').nullable();
      t.unique(['document_id', 'substage_id'], { indexName: 'idx_substage_doc_stage' });
    });
  }

  // ── 2. Unique index on document_workflow_state.document_id ─────────────────
  if (await knex.schema.hasTable('document_workflow_state')) {
    // Deduplicate any existing rows first (keep earliest per document_id)
    const dupes = await knex('document_workflow_state')
      .select('document_id')
      .count('* as c')
      .groupBy('document_id')
      .havingRaw('COUNT(*) > 1');

    for (const dupe of dupes) {
      const rows = await knex('document_workflow_state')
        .where({ document_id: dupe.document_id })
        .orderBy('updated_at', 'asc');
      // Delete all but the first (earliest) row
      for (let i = 1; i < rows.length; i++) {
        await knex('document_workflow_state').where({ id: rows[i].id }).del();
      }
    }

    // Add unique index — idempotent via IF NOT EXISTS
    await knex.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_wf_state_doc_id ON document_workflow_state(document_id)'
    );
  }
}

async function down(knex) {
  await knex.schema.dropTableIfExists('document_workflow_substages');
  // The unique index on document_workflow_state is additive/non-breaking —
  // dropping it is optional but we do it for a clean rollback.
  try {
    await knex.raw('DROP INDEX IF EXISTS idx_wf_state_doc_id');
  } catch (_) { /* index may not exist */ }
}

module.exports = { up, down };
