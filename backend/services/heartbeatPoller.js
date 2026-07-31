const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('../db');
const ingestionService = require('./ingestionService');
const workflowEngine = require('./workflowEngine');

// Every operator in "heartbeat" mode gets a folder here. In a real deployment
// this would instead be an SFTP mailbox, a shared drive, or an API endpoint
// on the operator's side that gets polled — the "watch a folder" version is
// a faithful local stand-in for the exact same pattern: check a known
// location on a schedule, ingest whatever's new.
const WATCH_ROOT = path.join(__dirname, '..', 'heartbeat-watch');

function watchFolderFor(operatorId) {
  const dir = path.join(WATCH_ROOT, operatorId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let lastScanAt = null;
let lastScanSummary = [];

async function scanOperatorFolder(operator) {
  const dir = watchFolderFor(operator.id);
  const filenames = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
  const results = [];

  for (const filename of filenames) {
    const filePath = path.join(dir, filename);
    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }
    if (!stat.isFile()) continue;

    const mtime = String(stat.mtimeMs);
    const seen = db.prepare(`SELECT * FROM heartbeat_seen_files WHERE operator_id = ? AND filename = ?`).get(operator.id, filename);

    if (seen && seen.file_mtime === mtime) continue; // unchanged since last check — skip

    try {
      const ingestResult = await ingestionService.ingestDocumentVersion({
        operatorId: operator.id,
        docType: operator.default_doc_type || 'IR21',
        title: `${operator.default_doc_type || 'IR21'} - ${operator.name}`,
        filePath,
        originalFilename: filename,
        source: 'heartbeat',
      });

      if (seen) {
        db.prepare(`UPDATE heartbeat_seen_files SET file_mtime = ?, ingested_at = datetime('now') WHERE id = ?`).run(mtime, seen.id);
      } else {
        db.prepare(`INSERT INTO heartbeat_seen_files (id, operator_id, filename, file_mtime, ingested_at) VALUES (?,?,?,?,datetime('now'))`)
          .run(uuid(), operator.id, filename, mtime);
      }

      workflowEngine.logAudit('heartbeat', operator.id, 'scanned', 'system',
        `Heartbeat picked up "${filename}" for ${operator.name}` + (ingestResult.diff ? ` — ${ingestResult.diff.totalChanges} change(s) detected` : ' — stored as baseline version'));

      results.push({ operator: operator.name, filename, diff: ingestResult.diff });
    } catch (err) {
      workflowEngine.logAudit('heartbeat', operator.id, 'error', 'system', `Failed to ingest "${filename}" for ${operator.name}: ${err.message}`);
    }
  }

  return results;
}

async function scanAllOperators() {
  const operators = db.prepare(`SELECT * FROM operators WHERE ingest_mode = 'heartbeat' AND status = 'active'`).all();
  operators.forEach(op => watchFolderFor(op.id)); // ensure folders exist even with nothing dropped in yet

  const allResults = [];
  for (const operator of operators) {
    const results = await scanOperatorFolder(operator);
    allResults.push(...results);
  }

  lastScanAt = new Date().toISOString();
  lastScanSummary = allResults;
  return allResults;
}

let intervalHandle = null;

function start(intervalMs) {
  if (intervalHandle) return; // already running
  scanAllOperators().catch(err => console.error('Heartbeat initial scan failed:', err.message));
  intervalHandle = setInterval(() => {
    scanAllOperators().catch(err => console.error('Heartbeat scan failed:', err.message));
  }, intervalMs);
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

function status() {
  const operators = db.prepare(`SELECT id, name, country, default_doc_type FROM operators WHERE ingest_mode = 'heartbeat' AND status = 'active'`).all();
  return {
    running: !!intervalHandle,
    lastScanAt,
    lastScanSummary,
    watchedOperators: operators.map(o => ({ ...o, watchFolder: watchFolderFor(o.id) })),
  };
}

module.exports = { start, stop, scanAllOperators, watchFolderFor, status };
