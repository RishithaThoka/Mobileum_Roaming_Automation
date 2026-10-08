'use strict';

/**
 * Migration 010: field_ownership_overrides (B3)
 *
 * Per-label, optionally operator-scoped ownership overrides.
 * Takes precedence over catalog and auto rules.
 *
 * NULL uniqueness problem: SQL NULL != NULL, so UNIQUE(normalized_label, operator_id)
 * allows duplicates when operator_id IS NULL.
 * Fix: use a sentinel value '__GLOBAL__' instead of NULL for global overrides.
 * This is enforced in the application layer (admin route).
 *
 * Also extends field_catalog to add:
 *   - aliases (JSON array of alternative labels)
 *   - is_active (soft-delete support)
 */

const { v4: uuid } = require('uuid');

exports.up = async function (db) {
  // ── field_ownership_overrides ─────────────────────────────────────────────
  await db.schema.createTable('field_ownership_overrides', (t) => {
    t.string('id').primary();
    t.string('normalized_label').notNullable();
    // operator_id = '__GLOBAL__' means applies to all operators (sentinel for NULL uniqueness)
    t.string('operator_id').notNullable().defaultTo('__GLOBAL__');
    t.string('section_scope').nullable();  // optional: only apply within this section prefix
    t.string('domain').notNullable();
    t.string('notes').nullable();
    t.string('created_by').nullable();
    t.string('created_at').notNullable();
    t.string('updated_at').notNullable();

    // Unique constraint: one override per (label, operator).
    // '__GLOBAL__' sentinel allows UNIQUE to work correctly for global overrides.
    t.unique(['normalized_label', 'operator_id']);
  });

  // ── Extend field_catalog ──────────────────────────────────────────────────
  // Add aliases column (JSON array of alternative label strings)
  const hasCatalog = await db.schema.hasTable('field_catalog');
  if (hasCatalog) {
    const hasAliases  = await db.schema.hasColumn('field_catalog', 'aliases');
    const hasIsActive = await db.schema.hasColumn('field_catalog', 'is_active');

    if (!hasAliases || !hasIsActive) {
      await db.schema.alterTable('field_catalog', (t) => {
        if (!hasAliases)  t.text('aliases').nullable();
        if (!hasIsActive) t.integer('is_active').notNullable().defaultTo(1);
      });
    }

    // Activate the existing HLR Global Title entry
    await db('field_catalog')
      .where({ field_label: 'HLR Global Title' })
      .update({ is_active: 1 });
  }

};

exports.down = async function (db) {
  await db.schema.dropTableIfExists('field_ownership_overrides');
  // Revert field_catalog columns (best effort — SQLite doesn't support DROP COLUMN)
  // No action needed for down on SQLite; columns simply remain.
};
