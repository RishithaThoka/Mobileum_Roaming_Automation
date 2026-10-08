# Backend — Database Layer

## Overview

The database layer is built on **[Knex.js](https://knexjs.org/)**, a SQL query builder that supports SQLite (via `better-sqlite3`), PostgreSQL, MySQL/MariaDB, and Oracle DB.  All DB calls are `async/await` — no synchronous blocking on the event loop.

---

## Configuration

Set the following environment variables (copy `.env.example` to `.env`):

| Variable | Default | Description |
|---|---|---|
| `DB_CLIENT` | `better-sqlite3` | Dialect: `better-sqlite3` \| `pg` \| `mysql2` \| `oracledb` |
| `DB_FILENAME` | `./data/ir21_portal.db` | SQLite file path (SQLite only) |
| `DB_HOST` | `localhost` | Host (non-SQLite) |
| `DB_PORT` | dialect default | Port (non-SQLite) |
| `DB_USER` | — | Username (non-SQLite) |
| `DB_PASSWORD` | — | Password (non-SQLite) |
| `DB_NAME` | — | Database name (non-SQLite) |

**Only SQLite is verified end-to-end.** Postgres/MySQL/Oracle configs are implemented but must be validated against a live instance before production use.

---

## Boot Sequence

`server.js` calls `db.bootstrap()` before `app.listen()`:

```
db.bootstrap()
  ├── db.migrate.latest()          — runs pending Knex migrations
  ├── runStartupSeed()             — seeds category_routing if empty or stale
  ├── deduplicateOperators()       — merges operators sharing (name, country)
  └── deduplicateDocuments()       — merges documents sharing (operator_id, doc_type)
```

If bootstrap fails, the process exits with a non-zero code and a clear error message. HTTP traffic is never accepted with a broken schema.

---

## Migrations

Located in `db/migrations/`. Run automatically on every boot via `knex.migrate.latest()`. The migration state is tracked in the `knex_migrations` table.

| File | Purpose |
|---|---|
| `001_initial_schema.js` | Creates all 17 tables. Each `createTable` is guarded by `hasTable()` so existing databases are skipped cleanly. |
| `002_added_columns.js` | Adds the 15 columns that were added post-release via `ensureColumn()`. Each is guarded by `hasColumn()`. |

### Manual migration commands (optional)

```bash
# Run pending migrations
npx knex --knexfile db/knexfile.js migrate:latest

# Roll back the last batch
npx knex --knexfile db/knexfile.js migrate:rollback

# Check status
npx knex --knexfile db/knexfile.js migrate:status
```

---

## Tables (17)

| Table | Description |
|---|---|
| `operators` | Roaming partner operators |
| `documents` | One doc per (operator, doc_type) |
| `document_versions` | Uploaded file versions |
| `diffs` | Computed field-level diffs |
| `diff_items` | Individual changed fields |
| `category_routing` | Approval routing config (persisted across resets) |
| `approval_workflows` | Workflow instance per diff |
| `approval_steps` | Individual approver step |
| `audit_log` | Immutable event log |
| `email_log` | Sent/simulated approval emails |
| `settings` | Key/value store (reserved, unused) |
| `undo_slot` | Single-level undo snapshot |
| `heartbeat_seen_files` | Tracks which files the poller has already ingested |
| `notifications` | In-app notifications |
| `document_workflow_state` | UI screen position + SLA stage per document |
| `approval_signatures` | Cryptographic approval attestations |
| `deployment_log` | Deployment pipeline step results |

---

## Cross-dialect Helpers

`db.helpers.whereToday(column)` returns a Knex `raw` fragment for filtering by today's date, translated for each dialect:

```js
// SQLite:  date(column) = date('now')
// Postgres: column::date = current_date
// MySQL:   DATE(column) = CURDATE()
// Oracle:  TRUNC(column) = TRUNC(SYSDATE)

.whereRaw(db.helpers.whereToday('created_at'))
```

---

## Key Design Decisions

- **Pool**: SQLite uses `{ min: 1, max: 1 }` — only one writer at a time. Non-SQLite uses `{ min: 2, max: 10 }`.
- **WAL mode**: Enabled via `afterCreate` pool hook for SQLite (better read concurrency).
- **`useNullAsDefault: true`**: Required for SQLite so Knex doesn't warn about undefined columns; no-op on other dialects.
- **Timestamps**: Stored as ISO strings via `new Date().toISOString()`. `knex.fn.now()` is used as the DB default in migrations.
- **`onConflict().merge()`**: Used in `undoManager.js` as a cross-dialect replacement for SQLite's `INSERT OR REPLACE`.
- **Fire-and-forget audit logs**: `workflowEngine.logAudit()` is synchronous-feeling but uses `.catch()` internally so a log write failure never crashes the request.
