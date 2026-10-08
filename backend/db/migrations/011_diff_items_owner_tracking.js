'use strict';

/**
 * Migration 011: diff_items — add owner tracking columns (B7)
 *
 * For manual_edit diffs, every diff_item now stores the field's
 * ownership metadata at the time of submission:
 *   owner_domain   — the domain resolved by the engine at PATCH time
 *   owner_source   — 'override'|'catalog'|'auto'|'fallback'
 *   rule_version   — the global ruleset version at PATCH time
 *
 * These three columns are written inside the same transaction as the PATCH,
 * so there is no window where a diff_item exists without ownership metadata.
 *
 * Workflow routing uses owner_domain from this table (not the AI domainClassifier
 * or any re-classification at approval time) — B7 requirement.
 */

exports.up = async function (db) {
  const hasDiffItems = await db.schema.hasTable('diff_items');
  if (!hasDiffItems) return;

  const hasOwnerDomain  = await db.schema.hasColumn('diff_items', 'owner_domain');
  const hasOwnerSource  = await db.schema.hasColumn('diff_items', 'owner_source');
  const hasRuleVersion  = await db.schema.hasColumn('diff_items', 'rule_version');

  if (!hasOwnerDomain || !hasOwnerSource || !hasRuleVersion) {
    await db.schema.alterTable('diff_items', (t) => {
      if (!hasOwnerDomain) t.string('owner_domain').nullable();
      if (!hasOwnerSource) t.string('owner_source').nullable();
      if (!hasRuleVersion) t.integer('rule_version').nullable();
    });
  }
};

exports.down = async function (db) {
  // SQLite does not support DROP COLUMN — no action
};
