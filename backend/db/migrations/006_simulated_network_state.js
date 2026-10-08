'use strict';

/**
 * Migration 006 — Simulated Network State ("digital twin").
 *
 * One row per (document_id, field_path) pair.  Stores the "live" value
 * that the deployment pipeline writes when applying a diff's changes.
 * Used by the Production stage (write), Reconciliation stage (read-back
 * comparison), and Rollback (revert to old values).
 */

async function up(knex) {
  if (!(await knex.schema.hasTable('simulated_network_state'))) {
    await knex.schema.createTable('simulated_network_state', t => {
      t.string('id').primary();                                     // uuid
      t.string('document_id').notNullable().references('id').inTable('documents');
      t.string('field_path').notNullable();                         // e.g. "NETWORK TECHNICAL.HLR Global Title"
      t.text('current_value').nullable();                           // the "live" value
      t.string('applied_by_diff_id').nullable();                    // provenance: which diff wrote this
      t.datetime('updated_at').defaultTo(knex.fn.now());
      t.unique(['document_id', 'field_path'], { indexName: 'idx_sns_doc_field' });
    });
    console.log('[migration 006] Created simulated_network_state table');
  }
}

async function down(knex) {
  await knex.schema.dropTableIfExists('simulated_network_state');
}

module.exports = { up, down };
