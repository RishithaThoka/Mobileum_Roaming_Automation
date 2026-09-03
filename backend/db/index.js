'use strict';

require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const knex = require('knex');

// ─── Connection config ────────────────────────────────────────────────────────

const client = process.env.DB_CLIENT || 'better-sqlite3';

let connectionConfig;

if (client === 'better-sqlite3') {
  const DATA_DIR = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  connectionConfig = {
    filename: process.env.DB_FILENAME
      ? path.resolve(process.env.DB_FILENAME)
      : path.join(DATA_DIR, 'ir21_portal.db'),
  };
} else {
  connectionConfig = {
    host    : process.env.DB_HOST     || 'localhost',
    port    : Number(process.env.DB_PORT || defaultPort(client)),
    user    : process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

function defaultPort(c) {
  if (c === 'pg')       return 5432;
  if (c === 'mysql2')   return 3306;
  if (c === 'oracledb') return 1521;
  return 5432;
}

const db = knex({
  client,
  connection: connectionConfig,
  useNullAsDefault: true,   // Required for SQLite; no-op on other dialects
  pool: client === 'better-sqlite3'
    ? {
        min: 1,
        max: 1,             // SQLite supports only one writer at a time
        afterCreate(conn, done) {
          conn.pragma('journal_mode = WAL');
          conn.pragma('foreign_keys = ON');
          done(null, conn);
        },
      }
    : { min: 2, max: 10 },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
});

// ─── Cross-dialect helpers ────────────────────────────────────────────────────

/**
 * Returns a Knex Raw fragment that evaluates to TRUE when `column` stores
 * a timestamp from today.  Pass it to .whereRaw():
 *
 *   .whereRaw(db.helpers.whereToday('created_at'))
 */
function whereToday(column) {
  switch (client) {
    case 'pg':
      return db.raw(`${column}::date = current_date`);
    case 'mysql2':
    case 'mysql':
      return db.raw(`DATE(${column}) = CURDATE()`);
    case 'oracledb':
      return db.raw(`TRUNC(${column}) = TRUNC(SYSDATE)`);
    default: // better-sqlite3 / sqlite3
      return db.raw(`date(${column}) = date('now')`);
  }
}

db.helpers = {
  whereToday,
  getDialect: () => client,
};

// ─── Startup seed: category_routing ──────────────────────────────────────────

async function runStartupSeed() {
  try {
    const { c: routingCount } = await db('category_routing').count('* as c').first();
    const { c: oldRouting }   = await db('category_routing')
      .where({ category: 'Network/Technical' }).count('* as c').first();

    if (Number(routingCount) === 0 || Number(oldRouting) > 0) {
      if (Number(oldRouting) > 0) await db('category_routing').del();
      await db('category_routing').insert([
        { category: 'Routing (GT)',      role_title: 'Routing Manager',    approver_name: 'Head of Routing',                    approver_email: '', step_order: 1 },
        { category: 'Security (IPsec)',  role_title: 'Security Officer',   approver_name: 'Chief Information Security Officer', approver_email: '', step_order: 1 },
        { category: 'Commercial (IOT)',  role_title: 'Commercial Manager', approver_name: 'Commercial Roaming Manager',         approver_email: '', step_order: 2 },
        { category: 'Packet Core (APN)', role_title: 'Core Network Lead',  approver_name: 'Core Network Engineer',              approver_email: '', step_order: 1 },
        { category: 'Voice/SMS (IMSI)',  role_title: 'Voice Services Lead',approver_name: 'Voice/SMS Engineer',                 approver_email: '', step_order: 1 },
      ]);
    }
  } catch (err) {
    console.error('[db] Startup seed error:', err.message);
  }
}

// ─── Startup dedup: operators ─────────────────────────────────────────────────

async function deduplicateOperators() {
  const allOps = await db('operators')
    .select('id', 'name', 'country')
    .orderBy('created_at', 'asc');

  const opGroups = {};
  for (const op of allOps) {
    const key = `${op.name}|${op.country}`.toLowerCase();
    if (!opGroups[key]) opGroups[key] = [];
    opGroups[key].push(op);
  }

  await db.transaction(async trx => {
    for (const ops of Object.values(opGroups)) {
      if (ops.length <= 1) continue;
      const master = ops[0];
      for (const dup of ops.slice(1)) {
        await trx('documents').where({ operator_id: dup.id }).update({ operator_id: master.id });
        try {
          await trx('heartbeat_seen_files').where({ operator_id: dup.id }).update({ operator_id: master.id });
        } catch (_) { /* table may not exist on very first boot */ }
        await trx('operators').where({ id: dup.id }).del();
        console.log(`[db] Merged duplicate operator "${dup.name}" → master ${master.id}`);
      }
    }
  });
}

// ─── Startup dedup: documents ─────────────────────────────────────────────────

async function deduplicateDocuments() {
  const dupGroups = await db('documents')
    .select('operator_id', 'doc_type')
    .count('* as c')
    .groupBy('operator_id', 'doc_type')
    .havingRaw('COUNT(*) > 1');

  if (!dupGroups.length) return;

  await db.transaction(async trx => {
    for (const group of dupGroups) {
      const docs = await trx('documents')
        .select('id')
        .where({ operator_id: group.operator_id, doc_type: group.doc_type })
        .orderBy('created_at', 'asc');

      const master = docs[0];
      for (const dup of docs.slice(1)) {
        await trx('document_versions').where({ document_id: dup.id }).update({ document_id: master.id });
        await trx('diffs').where({ document_id: dup.id }).update({ document_id: master.id });
        await trx('documents').where({ id: dup.id }).del();
        console.log(`[db] Merged duplicate document ${dup.id} → master ${master.id}`);
      }
    }
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

/**
 * Run Knex migrations, then startup seed and deduplication.
 * Must be awaited before the HTTP server begins accepting requests.
 */
async function bootstrap() {
  await db.migrate.latest();
  await runStartupSeed();
  try { await deduplicateOperators(); }  catch (e) { console.error('[db] Operator dedup error:', e.message); }
  try { await deduplicateDocuments(); }  catch (e) { console.error('[db] Document dedup error:', e.message); }
}

db.bootstrap = bootstrap;

module.exports = db;
