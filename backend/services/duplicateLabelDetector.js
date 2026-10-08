'use strict';

/**
 * services/duplicateLabelDetector.js
 *
 * Detects duplicate field labels within a parsed document (B8).
 *
 * The parsers (txtParser, csvParser, docxParser) write to a plain JS object,
 * which means a second occurrence of the same `Section.Label` silently
 * overwrites the first.  This module detects those collisions by replaying
 * the raw file through a counting scan (without changing any parser).
 *
 * Returns a Set of field paths that had at least one duplicate.
 * Those paths are written into `document_versions.duplicate_label_paths`
 * (a JSON column) and blocked from manual edits by the PATCH handler.
 *
 * Parser is NOT modified — this module only reads the file.
 */

const fs   = require('fs');
const path = require('path');

/**
 * Scan a raw text/csv file and count how many times each `Section.Label`
 * would be produced by the respective parser.
 *
 * @param {string} filePath - Absolute path to the raw file
 * @param {string} format   - 'txt' | 'csv' | 'docx' | other
 * @returns {Promise<Set<string>>} Set of fieldPaths that had duplicates
 */
async function detectDuplicateLabels(filePath, format) {
  const duplicates = new Set();

  try {
    if (format === 'txt') {
      duplicates.addAll(_scanTxt(filePath));
    } else if (format === 'csv') {
      duplicates.addAll(_scanCsv(filePath));
    } else if (format === 'docx') {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ path: filePath });
      duplicates.addAll(_scanTextLines(result.value.split(/\r?\n/)));
    }
    // pdf, xml, xlsx: no reliable line-by-line duplicate scan possible
    // without changing parsers → leave duplicates empty (no penalty)
  } catch (err) {
    console.warn(`[duplicateLabelDetector] Scan failed for ${filePath}: ${err.message}. Continuing without duplicate detection.`);
  }

  return duplicates;
}

// Monkey-patch Set to add addAll for convenience
Set.prototype.addAll = function (iterable) {
  for (const v of iterable) this.add(v);
  return this;
};

function _scanTxt(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split(/\r?\n/);
  const counts  = {};
  let currentSection = 'General';

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Section header detection (mirrors txtParser.js)
    if (/^[A-Z0-9_\s]{3,40}$/.test(line) || /^\[.*\]$/.test(line) || /^===.*===$/.test(line)) {
      currentSection = line.replace(/[^a-zA-Z0-9_\s]/g, '').trim() || 'General';
      continue;
    }

    // Key extraction (mirrors txtParser.js primary regex)
    const regex = /([A-Za-z0-9\s\.\_\-]+)[:=]\s*(.*?)(?=\s+[A-Za-z0-9\s\.\_\-]+[:=]|$)/g;
    let matches;
    let found = false;
    while ((matches = regex.exec(line)) !== null) {
      const key = matches[1].trim();
      const val = matches[2].trim();
      if (key && val) {
        const fp = `${currentSection}.${key}`;
        counts[fp] = (counts[fp] || 0) + 1;
        found = true;
      }
    }

    if (!found) {
      const match = line.match(/^([^:=]+)[:=]\s*(.+)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim();
        if (key && val) {
          const fp = `${currentSection}.${key}`;
          counts[fp] = (counts[fp] || 0) + 1;
        }
      }
    }
  }

  return Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => k);
}

function _scanCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const counts  = {};
  let currentCategory = 'General';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const cols = line.split(/[,;\t]/).map(c => c.trim().replace(/^['"]|['"]$/g, ''));
    if (cols.length >= 2) {
      const key = cols[0];
      const val = cols[1];
      if (key && val && key !== 'Field' && key !== 'Key' && key !== 'Parameter') {
        const fp = `${currentCategory}.${key}`;
        counts[fp] = (counts[fp] || 0) + 1;
      }
    } else if (cols.length === 1 && cols[0]) {
      currentCategory = cols[0].replace(/[^a-zA-Z0-9_\s]/g, '').trim() || 'General';
    }
  }

  return Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => k);
}

function _scanTextLines(lines) {
  const counts = {};
  let currentSection = 'General';

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Section detection (mirrors docxParser.js)
    if (!trimmed.includes(':') && trimmed.length < 60 && /^[A-Z0-9 &/()-]+$/.test(trimmed)) {
      currentSection = trimmed;
      continue;
    }

    const match = trimmed.match(/^([A-Za-z0-9 /().&-]{2,60}):\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const fp    = `${currentSection}.${label}`;
      counts[fp]  = (counts[fp] || 0) + 1;
    }
  }

  return Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => k);
}

module.exports = { detectDuplicateLabels };
