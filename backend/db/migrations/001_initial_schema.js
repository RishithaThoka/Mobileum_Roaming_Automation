'use strict';

/**
 * Migration 001 — Initial schema (all 17 tables with their FULL column set,
 * including every column that was added via ensureColumn() post-release).
 *
 * Each table is guarded with hasTable() so that existing SQLite installs
 * (which already have the tables) are skipped cleanly; only fresh databases
 * get the full CREATE TABLE path. Migration 002 handles adding missing columns
 * to pre-existing tables.
 */

// Creation order respects FK constraints (parents before children).
async function up(knex) {
  // 1. operators
  if (!(await knex.schema.hasTable('operators'))) {
    await knex.schema.createTable('operators', t => {
      t.string('id').primary();
      t.string('name').notNullable();
      t.string('country').notNullable();
      t.string('normalized_name').nullable();
      t.string('network_code').nullable();
      t.string('contact_email').nullable();
      t.string('ingest_mode').defaultTo('heartbeat');   // heartbeat | push
      t.string('status').defaultTo('active');
      t.datetime('created_at').defaultTo(knex.fn.now());
      // Columns added post-release (ensureColumn) — included here for fresh installs
      t.string('default_doc_type').defaultTo('IR21');
      t.integer('auto_created').defaultTo(0);
      t.string('region').defaultTo('Global');
      // Unique constraint for operator identity
      t.unique(['normalized_name', 'country'], { indexName: 'idx_operator_name_country' });
    });
  }

  // 2. documents
  if (!(await knex.schema.hasTable('documents'))) {
    await knex.schema.createTable('documents', t => {
      t.string('id').primary();
      t.string('operator_id').notNullable().references('id').inTable('operators');
      t.string('doc_type').notNullable();        // IR21 | RAEX
      t.string('format').notNullable();          // xml | xlsx | docx | pdf
      t.string('title').nullable();
      t.string('current_version_id').nullable();
      t.datetime('created_at').defaultTo(knex.fn.now());
    });
  }

  // 3. document_versions
  if (!(await knex.schema.hasTable('document_versions'))) {
    await knex.schema.createTable('document_versions', t => {
      t.string('id').primary();
      t.string('document_id').notNullable().references('id').inTable('documents');
      t.integer('version_number').notNullable();
      t.string('file_path').notNullable();
      t.string('original_filename').nullable();
      t.string('source').defaultTo('push');      // push | heartbeat
      t.text('extracted_fields').nullable();     // JSON blob
      t.datetime('uploaded_at').defaultTo(knex.fn.now());
      // ensureColumn additions
      t.integer('requires_review').defaultTo(0);
      t.string('approval_status').defaultTo('pending');
      t.integer('is_current_baseline').defaultTo(0);
    });
  }

  // 4. diffs
  if (!(await knex.schema.hasTable('diffs'))) {
    await knex.schema.createTable('diffs', t => {
      t.string('id').primary();
      t.string('document_id').notNullable().references('id').inTable('documents');
      t.string('from_version_id').nullable();
      t.string('to_version_id').notNullable();
      t.integer('total_changes').defaultTo(0);
      t.string('highest_severity').defaultTo('minor');
      // pending_workflow | in_approval | approved | rejected | locked | no_changes | superseded
      t.string('status').defaultTo('pending_workflow');
      t.datetime('created_at').defaultTo(knex.fn.now());
      // ensureColumn addition
      t.float('overall_risk_score').defaultTo(0);
    });
  }

  // 5. diff_items
  if (!(await knex.schema.hasTable('diff_items'))) {
    await knex.schema.createTable('diff_items', t => {
      t.string('id').primary();
      t.string('diff_id').notNullable().references('id').inTable('diffs');
      t.string('field_path').notNullable();
      t.string('category').notNullable();
      t.string('change_type').notNullable();     // added | removed | modified
      t.text('old_value').nullable();
      t.text('new_value').nullable();
      t.string('severity').defaultTo('minor');   // critical | major | minor
      // ensureColumn additions
      t.string('domain').nullable();
      t.integer('needs_review').defaultTo(0);
      t.float('risk_score').defaultTo(0);
      t.string('impact_level').defaultTo('Minor');
      t.text('ai_analysis').nullable();
      t.text('affected').nullable();
    });
  }

  // 6. category_routing  (TEXT primary key)
  if (!(await knex.schema.hasTable('category_routing'))) {
    await knex.schema.createTable('category_routing', t => {
      t.string('category').primary();
      t.string('role_title').notNullable();
      t.string('approver_name').nullable();
      t.string('approver_email').nullable();
      t.integer('step_order').defaultTo(1);
    });
  }

  // 7. approval_workflows
  if (!(await knex.schema.hasTable('approval_workflows'))) {
    await knex.schema.createTable('approval_workflows', t => {
      t.string('id').primary();
      t.string('diff_id').notNullable().references('id').inTable('diffs');
      t.string('status').defaultTo('in_progress'); // in_progress | approved | rejected | superseded
      t.datetime('created_at').defaultTo(knex.fn.now());
      t.datetime('completed_at').nullable();
    });
  }

  // 8. approval_steps
  if (!(await knex.schema.hasTable('approval_steps'))) {
    await knex.schema.createTable('approval_steps', t => {
      t.string('id').primary();
      t.string('workflow_id').notNullable().references('id').inTable('approval_workflows');
      t.integer('step_order').notNullable();
      t.string('category').notNullable();
      t.string('role_title').notNullable();
      t.string('approver_name').nullable();
      t.string('approver_email').notNullable();
      // waiting | pending | approved | rejected | escalated
      t.string('status').defaultTo('waiting');
      t.string('token').nullable();
      t.text('comment').nullable();
      t.datetime('notified_at').nullable();
      t.datetime('decided_at').nullable();
      t.datetime('escalated_at').nullable();
    });
  }

  // 9. audit_log
  if (!(await knex.schema.hasTable('audit_log'))) {
    await knex.schema.createTable('audit_log', t => {
      t.string('id').primary();
      t.string('entity_type').notNullable();
      t.string('entity_id').nullable();
      t.string('action').notNullable();
      t.string('actor').nullable();
      t.text('details').nullable();
      t.datetime('timestamp').defaultTo(knex.fn.now());
    });
  }

  // 10. email_log
  if (!(await knex.schema.hasTable('email_log'))) {
    await knex.schema.createTable('email_log', t => {
      t.string('id').primary();
      t.string('approval_step_id').nullable();
      t.string('to_email').notNullable();
      t.string('subject').nullable();
      t.text('body').nullable();
      t.string('mode').defaultTo('simulated');   // simulated | sent | failed
      t.text('error').nullable();
      t.datetime('sent_at').defaultTo(knex.fn.now());
      // ensureColumn additions
      t.string('document_id').nullable();
      t.string('workflow_stage').nullable();
    });
  }

  // 11. settings  (key/value store — defined but currently unused by any route)
  if (!(await knex.schema.hasTable('settings'))) {
    await knex.schema.createTable('settings', t => {
      t.string('key').primary();
      t.text('value').nullable();
    });
  }

  // 12. undo_slot  (single-row slot; always id='current')
  if (!(await knex.schema.hasTable('undo_slot'))) {
    await knex.schema.createTable('undo_slot', t => {
      t.string('id').primary();   // always 'current' — set explicitly on every insert
      t.text('label').nullable();
      t.text('snapshot').nullable();  // JSON blob
      t.string('state').nullable();   // 'deleted' | 'restored'
      t.datetime('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 13. heartbeat_seen_files
  if (!(await knex.schema.hasTable('heartbeat_seen_files'))) {
    await knex.schema.createTable('heartbeat_seen_files', t => {
      t.string('id').primary();
      t.string('operator_id').notNullable().references('id').inTable('operators');
      t.string('filename').notNullable();
      t.string('file_mtime').notNullable();
      t.datetime('ingested_at').defaultTo(knex.fn.now());
    });
  }

  // 14. notifications
  if (!(await knex.schema.hasTable('notifications'))) {
    await knex.schema.createTable('notifications', t => {
      t.string('id').primary();
      t.string('operator_id').nullable().references('id').inTable('operators');
      t.string('type').notNullable();   // upload | new_operator | approval
      t.text('message').notNullable();
      t.string('recipient').nullable();
      t.integer('read').defaultTo(0);
      t.datetime('created_at').defaultTo(knex.fn.now());
    });
  }

  // 15. document_workflow_state
  if (!(await knex.schema.hasTable('document_workflow_state'))) {
    await knex.schema.createTable('document_workflow_state', t => {
      t.string('id').primary();
      t.string('document_id').notNullable().references('id').inTable('documents');
      // 1: Extraction/Analysis  2: Approval Workflow  3: Deployment
      t.integer('current_screen').defaultTo(1);
      // running | ready_for_approval | in_approval | approved | rejected
      // deploying | deployed | failed | rolled_back
      t.string('stage_status').defaultTo('running');
      t.datetime('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 16. approval_signatures
  if (!(await knex.schema.hasTable('approval_signatures'))) {
    await knex.schema.createTable('approval_signatures', t => {
      t.string('id').primary();
      t.string('document_id').notNullable().references('id').inTable('documents');
      t.string('stage_role').notNullable();
      t.string('approver_name').notNullable();
      t.string('decision').notNullable();        // approved | rejected
      t.string('attestation_method').nullable();
      t.datetime('signed_at').defaultTo(knex.fn.now());
    });
  }

  // 17. deployment_log
  if (!(await knex.schema.hasTable('deployment_log'))) {
    await knex.schema.createTable('deployment_log', t => {
      t.string('id').primary();
      t.string('document_id').notNullable().references('id').inTable('documents');
      t.string('system').notNullable();
      t.string('scope').nullable();
      t.integer('order_executed').nullable();
      t.string('pass_fail').nullable();          // pass | fail
      t.integer('rollback_triggered').defaultTo(0);
      t.datetime('timestamp').defaultTo(knex.fn.now());
    });
  }
}

// Drop in reverse FK order (children first)
async function down(knex) {
  const tables = [
    'deployment_log', 'approval_signatures', 'document_workflow_state',
    'notifications', 'heartbeat_seen_files', 'undo_slot', 'settings',
    'email_log', 'audit_log', 'approval_steps', 'approval_workflows',
    'category_routing', 'diff_items', 'diffs', 'document_versions',
    'documents', 'operators',
  ];
  for (const t of tables) {
    await knex.schema.dropTableIfExists(t);
  }
}

module.exports = { up, down };
