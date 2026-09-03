'use strict';

/**
 * Migration 002 — Post-release column additions.
 *
 * These columns were bolted onto existing tables via ensureColumn() in the
 * original db.js.  On a FRESH install, migration 001 already includes all of
 * them, so every hasColumn() check here will return true and nothing runs.
 * On an EXISTING SQLite install, only the missing columns are added.
 *
 * Pattern: await addIfMissing(knex, 'table', 'column', tableBuilder => t.xxx())
 */

async function addIfMissing(knex, table, column, builderFn) {
  if (!(await knex.schema.hasColumn(table, column))) {
    await knex.schema.alterTable(table, builderFn);
  }
}

async function up(knex) {
  // operators
  await addIfMissing(knex, 'operators', 'normalized_name',  t => t.string('normalized_name').nullable());
  await addIfMissing(knex, 'operators', 'default_doc_type', t => t.string('default_doc_type').defaultTo('IR21'));
  await addIfMissing(knex, 'operators', 'auto_created',     t => t.integer('auto_created').defaultTo(0));
  await addIfMissing(knex, 'operators', 'region',           t => t.string('region').defaultTo('Global'));

  // diff_items
  await addIfMissing(knex, 'diff_items', 'domain',       t => t.string('domain').nullable());
  await addIfMissing(knex, 'diff_items', 'needs_review', t => t.integer('needs_review').defaultTo(0));
  await addIfMissing(knex, 'diff_items', 'risk_score',   t => t.float('risk_score').defaultTo(0));
  await addIfMissing(knex, 'diff_items', 'impact_level', t => t.string('impact_level').defaultTo('Minor'));
  await addIfMissing(knex, 'diff_items', 'ai_analysis',  t => t.text('ai_analysis').nullable());
  await addIfMissing(knex, 'diff_items', 'affected',     t => t.text('affected').nullable());

  // document_versions
  await addIfMissing(knex, 'document_versions', 'requires_review',      t => t.integer('requires_review').defaultTo(0));
  await addIfMissing(knex, 'document_versions', 'approval_status',      t => t.string('approval_status').defaultTo('pending'));
  await addIfMissing(knex, 'document_versions', 'is_current_baseline',  t => t.integer('is_current_baseline').defaultTo(0));

  // email_log
  await addIfMissing(knex, 'email_log', 'document_id',    t => t.string('document_id').nullable());
  await addIfMissing(knex, 'email_log', 'workflow_stage', t => t.string('workflow_stage').nullable());

  // diffs
  await addIfMissing(knex, 'diffs', 'overall_risk_score', t => t.float('overall_risk_score').defaultTo(0));
}

// Dropping columns is destructive and is not needed for a rollback of this
// migration (all added columns are additive/non-breaking).  A no-op down is
// safer than risking data loss via ALTER TABLE DROP COLUMN.
async function down(knex) {
  // intentional no-op
}

module.exports = { up, down };
