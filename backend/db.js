const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ir21_portal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  normalized_name TEXT,
  network_code TEXT,
  contact_email TEXT,
  ingest_mode TEXT DEFAULT 'heartbeat', -- heartbeat | push
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

try {
  db.prepare('SELECT normalized_name FROM operators LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE operators ADD COLUMN normalized_name TEXT');
}

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_name_country ON operators(normalized_name, country)');

db.exec(`

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operators(id),
  doc_type TEXT NOT NULL,       -- IR21 | RAEX
  format TEXT NOT NULL,         -- xml | xlsx | docx | pdf
  title TEXT,
  current_version_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  version_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  original_filename TEXT,
  source TEXT DEFAULT 'push',   -- push | heartbeat
  extracted_fields TEXT,        -- JSON blob of flattened field->value
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diffs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  from_version_id TEXT,
  to_version_id TEXT NOT NULL,
  total_changes INTEGER DEFAULT 0,
  highest_severity TEXT DEFAULT 'minor',
  status TEXT DEFAULT 'pending_workflow', -- pending_workflow | in_approval | approved | rejected | locked | no_changes
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diff_items (
  id TEXT PRIMARY KEY,
  diff_id TEXT NOT NULL REFERENCES diffs(id),
  field_path TEXT NOT NULL,
  category TEXT NOT NULL,       -- Network/Technical, Financial/Billing, Commercial, Legal/Compliance, Security, Operations
  change_type TEXT NOT NULL,    -- added | removed | modified
  old_value TEXT,
  new_value TEXT,
  severity TEXT DEFAULT 'minor' -- critical | major | minor
);

CREATE TABLE IF NOT EXISTS category_routing (
  category TEXT PRIMARY KEY,
  role_title TEXT NOT NULL,     -- e.g. CTO, CFO, CMO, Legal Counsel, CISO, Roaming Operations Manager
  approver_name TEXT,
  approver_email TEXT,
  step_order INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS approval_workflows (
  id TEXT PRIMARY KEY,
  diff_id TEXT NOT NULL REFERENCES diffs(id),
  status TEXT DEFAULT 'in_progress', -- in_progress | approved | rejected
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES approval_workflows(id),
  step_order INTEGER NOT NULL,
  category TEXT NOT NULL,
  role_title TEXT NOT NULL,
  approver_name TEXT,
  approver_email TEXT NOT NULL,
  status TEXT DEFAULT 'waiting', -- waiting | pending | approved | rejected | escalated
  token TEXT,
  comment TEXT,
  notified_at TEXT,
  decided_at TEXT,
  escalated_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  actor TEXT,
  details TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  approval_step_id TEXT,
  to_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  mode TEXT DEFAULT 'simulated', -- simulated | sent | failed
  error TEXT,
  sent_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Single-slot undo/redo. Holds a snapshot of the most recent destructive
-- action (delete operator / delete document / reset all data) so it can be
-- reversed once. A new destructive action overwrites this slot.
CREATE TABLE IF NOT EXISTS undo_slot (
  id TEXT PRIMARY KEY DEFAULT 'current',
  label TEXT,
  snapshot TEXT,   -- JSON: [{ table, rows: [...] }, ...] in delete-order (children first)
  state TEXT,      -- 'deleted' (action just happened, can undo) | 'restored' (undone, can redo)
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tracks which files the heartbeat poller has already ingested from each
-- operator's watch folder, keyed by filename + last-modified time, so it
-- never re-ingests an unchanged file on every scan, but does pick up a file
-- that was overwritten with new content.
CREATE TABLE IF NOT EXISTS heartbeat_seen_files (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operators(id),
  filename TEXT NOT NULL,
  file_mtime TEXT NOT NULL,
  ingested_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  operator_id TEXT REFERENCES operators(id),
  type TEXT NOT NULL,          -- upload | new_operator | approval
  message TEXT NOT NULL,
  recipient TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_workflow_state (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  current_screen INTEGER DEFAULT 1, -- 1: Extraction/Analysis, 2: Approval Workflow, 3: Deployment
  stage_status TEXT DEFAULT 'running', -- running | ready_for_approval | in_approval | approved | rejected | deploying | deployed | failed
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approval_signatures (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  stage_role TEXT NOT NULL,
  approver_name TEXT NOT NULL,
  decision TEXT NOT NULL, -- approved | rejected
  attestation_method TEXT,
  signed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deployment_log (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  system TEXT NOT NULL,
  scope TEXT,
  order_executed INTEGER,
  pass_fail TEXT, -- pass | fail
  rollback_triggered INTEGER DEFAULT 0,
  timestamp TEXT DEFAULT (datetime('now'))
);
`);

// --- lightweight schema migrations for columns added after initial release ---
// CREATE TABLE IF NOT EXISTS only helps brand-new tables; an operators table
// that already existed on someone's machine before this column was added
// needs it bolted on explicitly. Safe to run on every boot.
function ensureColumn(table, column, addColumnDDL) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!existing.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${addColumnDDL}`);
  }
}
ensureColumn('operators', 'default_doc_type', `default_doc_type TEXT DEFAULT 'IR21'`);
ensureColumn('operators', 'auto_created', `auto_created INTEGER DEFAULT 0`);
ensureColumn('operators', 'region', `region TEXT DEFAULT 'Global'`);
ensureColumn('diff_items', 'domain', `domain TEXT`);
ensureColumn('diff_items', 'needs_review', `needs_review INTEGER DEFAULT 0`);
ensureColumn('document_versions', 'requires_review', `requires_review INTEGER DEFAULT 0`);
ensureColumn('document_versions', 'approval_status', `approval_status TEXT DEFAULT 'pending'`);
ensureColumn('document_versions', 'is_current_baseline', `is_current_baseline INTEGER DEFAULT 0`);
ensureColumn('email_log', 'document_id', `document_id TEXT`);
ensureColumn('email_log', 'workflow_stage', `workflow_stage TEXT`);

// New diff_items columns
ensureColumn('diff_items', 'risk_score', `risk_score REAL DEFAULT 0`);
ensureColumn('diff_items', 'impact_level', `impact_level TEXT DEFAULT 'Minor'`);
ensureColumn('diff_items', 'ai_analysis', `ai_analysis TEXT`);
ensureColumn('diff_items', 'affected', `affected TEXT`);

// New diffs columns
ensureColumn('diffs', 'overall_risk_score', `overall_risk_score REAL DEFAULT 0`);


// seed default category -> role routing if empty or old
const routingCount = db.prepare('SELECT COUNT(*) c FROM category_routing').get().c;
const oldRouting = db.prepare('SELECT COUNT(*) c FROM category_routing WHERE category = ?').get('Network/Technical').c;

if (routingCount === 0 || oldRouting > 0) {
  if (oldRouting > 0) db.exec('DELETE FROM category_routing');
  const insert = db.prepare(`INSERT INTO category_routing (category, role_title, approver_name, approver_email, step_order) VALUES (?, ?, ?, ?, ?)`);
  const seed = [
    ['Routing (GT)', 'Routing Manager', 'Head of Routing', '', 1],
    ['Security (IPsec)', 'Security Officer', 'Chief Information Security Officer', '', 1],
    ['Commercial (IOT)', 'Commercial Manager', 'Commercial Roaming Manager', '', 2],
    ['Packet Core (APN)', 'Core Network Lead', 'Core Network Engineer', '', 1],
    ['Voice/SMS (IMSI)', 'Voice Services Lead', 'Voice/SMS Engineer', '', 1],
  ];
  const tx = db.transaction((rows) => rows.forEach(r => insert.run(...r)));
  tx(seed);
}

module.exports = db;

// DEDUPLICATION SCRIPT START
try {
  const allOps = db.prepare('SELECT id, name, country FROM operators ORDER BY created_at ASC').all();
  const opGroups = {};
  allOps.forEach(op => {
      const key = (op.name + '|' + op.country).toLowerCase();
      if (!opGroups[key]) opGroups[key] = [];
      opGroups[key].push(op);
  });
  db.transaction(() => {
      for (const key in opGroups) {
          const ops = opGroups[key];
          if (ops.length > 1) {
              const master = ops[0];
              const duplicates = ops.slice(1);
              for (const dup of duplicates) {
                  db.prepare('UPDATE documents SET operator_id = ? WHERE operator_id = ?').run(master.id, dup.id);
                  try { db.prepare('UPDATE heartbeat_seen_files SET operator_id = ? WHERE operator_id = ?').run(master.id, dup.id); } catch(e){}
                  db.prepare('DELETE FROM operators WHERE id = ?').run(dup.id);
                  console.log(`Merged duplicate operator ${dup.name} into master ${master.id}`);
              }
          }
      }
  })();
} catch(err) {
  console.error("Dedup error:", err);
}
// DEDUPLICATION SCRIPT END

// DOCUMENT DEDUPLICATION SCRIPT START
try {
  const duplicateDocsQuery = db.prepare(`
    SELECT operator_id, doc_type, COUNT(*) as c
    FROM documents
    GROUP BY operator_id, doc_type
    HAVING c > 1
  `).all();

  db.transaction(() => {
    for (const dupGroup of duplicateDocsQuery) {
      const docs = db.prepare(`
        SELECT id FROM documents 
        WHERE operator_id = ? AND doc_type = ? 
        ORDER BY created_at ASC
      `).all(dupGroup.operator_id, dupGroup.doc_type);
      
      const masterDoc = docs[0];
      const dupDocs = docs.slice(1);
      
      for (const dup of dupDocs) {
        db.prepare('UPDATE document_versions SET document_id = ? WHERE document_id = ?').run(masterDoc.id, dup.id);
        db.prepare('UPDATE diffs SET document_id = ? WHERE document_id = ?').run(masterDoc.id, dup.id);
        db.prepare('DELETE FROM documents WHERE id = ?').run(dup.id);
        console.log(`Merged duplicate document ${dup.id} into master ${masterDoc.id}`);
      }
    }
  })();
} catch(err) {
  console.error("Doc Dedup error:", err);
}
// DOCUMENT DEDUPLICATION SCRIPT END
