'use strict';

/**
 * Migration 005 — Creates the `users` table for real authentication.
 *
 * Columns:
 *   id               TEXT PRIMARY KEY (UUID)
 *   username          TEXT NOT NULL UNIQUE (email-style login)
 *   password_hash    TEXT NOT NULL (bcrypt)
 *   role             TEXT NOT NULL ('Admin'|'Analyst'|'Approver'|'CPO/Exec'|'Auditor')
 *   full_name        TEXT NOT NULL DEFAULT ''
 *   approved_domains TEXT nullable (JSON array for Approver-role domain authorization)
 *   status           TEXT NOT NULL DEFAULT 'active' ('active'|'inactive')
 *   created_at       DATETIME
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (t) => {
      t.string('id').primary();
      t.string('username').notNullable().unique();
      t.string('password_hash').notNullable();
      t.string('role').notNullable();
      t.string('full_name').notNullable().defaultTo('');
      t.text('approved_domains').nullable();
      t.string('status').notNullable().defaultTo('active');
      t.datetime('created_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function (_knex) {
  // Intentional no-op — dropping the users table in production would lock everyone out.
};
