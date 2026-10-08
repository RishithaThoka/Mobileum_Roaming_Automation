'use strict';

/**
 * Migration 013: approval_policy + self-approval exclusion
 *
 * 1. approval_policy table — one row per named policy.
 *    Seeds the 'auto_tier_admin_step' policy (enabled = 1).
 *
 * 2. Adds approval_steps.self_approval_excluded_user_id:
 *    When set, the user with this ID is barred from acting on this step
 *    (self-approval prevention). Stored here so the check is persistent
 *    even if account domain membership changes between creation and action.
 *
 * 3. Adds approval_steps.routing_note:
 *    Free-text explanation recorded when routing is non-standard
 *    (e.g. "no other approver for Routing (GT), routed to Admin").
 */

const { v4: uuid } = require('uuid');

exports.up = async function (db) {
  // ── approval_policy ────────────────────────────────────────────────────────
  await db.schema.createTable('approval_policy', (t) => {
    t.string('id').primary();
    t.string('applies_to').notNullable().unique();  // 'auto_tier_admin_step' | future
    t.integer('enabled').notNullable().defaultTo(1);
    t.string('notes').nullable();
    t.string('created_at').notNullable();
    t.string('updated_at').notNullable();
  });

  const now = new Date().toISOString();
  await db('approval_policy').insert({
    id:         uuid(),
    applies_to: 'auto_tier_admin_step',
    enabled:    1,
    notes:      'When any diff_item has owner_source = "auto" (keyword/section match), ' +
                'insert a mandatory Admin review step at step_order = 0 before the domain ' +
                'approver step. Disable this row (enabled = 0) to remove the extra step ' +
                'without a code change.',
    created_at: now,
    updated_at: now,
  });

  // ── approval_steps: self_approval_excluded_user_id + routing_note ──────────
  await db.schema.table('approval_steps', (t) => {
    t.string('self_approval_excluded_user_id').nullable();
    t.string('routing_note').nullable();
  });
};

exports.down = async function (db) {
  await db.schema.dropTableIfExists('approval_policy');
  await db.schema.table('approval_steps', (t) => {
    t.dropColumn('self_approval_excluded_user_id');
    t.dropColumn('routing_note');
  });
};
