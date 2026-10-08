'use strict';

/**
 * Migration 004 -- AI risk scoring support.
 *
 * Adds scoring_method column to diff_items:
 *   'ai_evaluated'           -- risk_score and ai_analysis came from a real Groq call
 *   'deterministic_fallback' -- risk_score came from the static severity-bucket formula
 *
 * Existing rows default to 'deterministic_fallback' (accurate -- they were all
 * computed by the old static formula before this feature was enabled).
 *
 * This is additive-only; down() is intentionally a no-op.
 */

async function up(knex) {
  if (!(await knex.schema.hasColumn('diff_items', 'scoring_method'))) {
    await knex.schema.alterTable('diff_items', t => {
      t.string('scoring_method').defaultTo('deterministic_fallback');
    });
    console.log('[migration 004] Added diff_items.scoring_method column');
  }
}

async function down(knex) {
  // Intentional no-op -- dropping a column on SQLite requires table rebuild;
  // the column is harmless to leave in place, and rolling back this migration
  // cleanly is safer as a no-op than risking data loss.
}

module.exports = { up, down };
