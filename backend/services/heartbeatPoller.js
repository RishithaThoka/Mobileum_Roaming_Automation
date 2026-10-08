'use strict';

const fs   = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('../db');
const ingestionService = require('./ingestionService');
const workflowEngine   = require('./workflowEngine');

// Every operator in "heartbeat" mode gets a folder here.
const WATCH_ROOT = path.join(__dirname, '..', 'heartbeat-watch');

function watchFolderFor(operatorId) {
  const dir = path.join(WATCH_ROOT, operatorId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let lastScanAt      = null;
let lastScanSummary = [];

async function scanOperatorFolder(operator) {
  const dir       = watchFolderFor(operator.id);
  const filenames = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
  const results   = [];

  for (const filename of filenames) {
    const filePath = path.join(dir, filename);
    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }
    if (!stat.isFile()) continue;

    const mtime = String(stat.mtimeMs);
    const seen  = await db('heartbeat_seen_files')
      .where({ operator_id: operator.id, filename })
      .first();

    if (seen && seen.file_mtime === mtime) continue; // unchanged — skip

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
        await db('heartbeat_seen_files').where({ id: seen.id }).update({
          file_mtime: mtime,
          ingested_at: new Date().toISOString(),
        });
      } else {
        await db('heartbeat_seen_files').insert({
          id: uuid(),
          operator_id: operator.id,
          filename,
          file_mtime: mtime,
          ingested_at: new Date().toISOString(),
        });
      }

      workflowEngine.logAudit(
        'heartbeat', operator.id, 'scanned', 'system',
        `Heartbeat picked up "${filename}" for ${operator.name}` +
        (ingestResult.diff ? ` — ${ingestResult.diff.totalChanges} change(s) detected` : ' — stored as baseline version'),
      );

      results.push({ operator: operator.name, filename, diff: ingestResult.diff });
    } catch (err) {
      workflowEngine.logAudit(
        'heartbeat', operator.id, 'error', 'system',
        `Failed to ingest "${filename}" for ${operator.name}: ${err.message}`,
      );
    }
  }

  return results;
}

async function scanAllOperators() {
  const operators = await db('operators')
    .where({ ingest_mode: 'heartbeat', status: 'active' });
  operators.forEach(op => watchFolderFor(op.id)); // ensure folders exist

  const allResults = [];
  for (const operator of operators) {
    const results = await scanOperatorFolder(operator);
    allResults.push(...results);
  }

  lastScanAt      = new Date().toISOString();
  lastScanSummary = allResults;
  return allResults;
}

let intervalHandle = null;

function start(intervalMs) {
  if (intervalHandle) return;
  scanAllOperators().catch(err => console.error('Heartbeat initial scan failed:', err.message));
  intervalHandle = setInterval(() => {
    scanAllOperators().catch(err => console.error('Heartbeat scan failed:', err.message));
  }, intervalMs);
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

async function status() {
  const operators = await db('operators')
    .select('id', 'name', 'country', 'default_doc_type')
    .where({ ingest_mode: 'heartbeat', status: 'active' });
  return {
    running: !!intervalHandle,
    lastScanAt,
    lastScanSummary,
    watchedOperators: operators.map(o => ({ ...o, watchFolder: watchFolderFor(o.id) })),
  };
}

module.exports = { start, stop, scanAllOperators, watchFolderFor, status };
