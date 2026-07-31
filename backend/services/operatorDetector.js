const { v4: uuid } = require('uuid');
const db = require('../db');

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\b(ltd|limited|inc|corp|corporation|telecom|mobile|group|sa|ag|plc|gmbh|co|spain|france|uk|usa|india|germany)\b/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
      }
    }
  }
  return matrix[a.length][b.length];
}

function getSimilarity(a, b) {
  if (!a || !b) return 0;
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  if (!normA || !normB) return 0;
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) return 1.0;
  const dist = levenshtein(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return maxLen === 0 ? 1 : 1 - (dist / maxLen);
}

function extractOperatorInfo(extractedFields, originalFilename = '') {
  let name = '';
  let country = '';
  let networkCode = '';
  let docType = 'IR21';

  // 1. Inspect extracted field paths and values for known GSMA fields
  for (const [key, val] of Object.entries(extractedFields || {})) {
    const k = key.toLowerCase();
    const v = String(val || '').trim();
    if (!v) continue;

    if (!name && (k.includes('operator') || k.includes('networkname') || k.includes('membername') || k.includes('organisation'))) {
      name = v;
    }
    if (!country && (k.includes('country') || k.includes('jurisdiction') || k.includes('territory'))) {
      country = v;
    }
    if (!networkCode && (k.includes('networkcode') || k.includes('tadig') || k.includes('mcc') || k.includes('mnc') || k.includes('plmn'))) {
      networkCode = v;
    }
    if (k.includes('raex') || originalFilename.toLowerCase().includes('raex')) {
      docType = 'RAEX';
    }
  }

  // 2. Fallback to filename pattern if name or country is missing
  if (!name && originalFilename) {
    const baseName = originalFilename.split('.')[0].replace(/[-_]?(v\d+|IR21|RAEX)/gi, '').trim();
    if (baseName) {
      // Split camelCase or words: "OrangeFrance" -> "Orange France", "TelefonicaEspana" -> "Telefonica Espana"
      name = baseName.replace(/([a-z])([A-Z])/g, '$1 $2');
    }
  }

  // Fallback defaults
  if (!name) name = 'Unknown Operator';
  if (!country) {
    // Attempt country inferral from name (e.g. "Orange France" -> "France")
    const words = name.split(' ');
    if (words.length > 1) {
      country = words[words.length - 1];
    } else {
      country = 'Global';
    }
  }

  return { name, country, networkCode, docType };
}

async function detectAndGetOperator({ extractedFields, originalFilename }) {
  const { name: detectedName, country: detectedCountry, networkCode, docType } = extractOperatorInfo(extractedFields, originalFilename);
  const normName = normalizeName(detectedName);

  // Check exact/normalized match in DB
  const existingOperators = db.prepare('SELECT * FROM operators').all();
  let matchedOp = null;

  for (const op of existingOperators) {
    const sim = getSimilarity(detectedName, op.name);
    if (sim >= 0.75 || (op.normalized_name && getSimilarity(normName, op.normalized_name) >= 0.75)) {
      matchedOp = op;
      break;
    }
  }

  if (matchedOp) {
    return { operator: matchedOp, isNewOperator: false, detectedInfo: { name: detectedName, country: detectedCountry, docType } };
  }

  // No match found -> auto-create new operator
  const newId = uuid();
  const newOpName = detectedName.trim();
  const newOpCountry = detectedCountry.trim() || 'Global';

  db.prepare(`
    INSERT INTO operators (id, name, country, normalized_name, network_code, ingest_mode, default_doc_type, auto_created, status)
    VALUES (?, ?, ?, ?, ?, 'push', ?, 1, 'active')
  `).run(newId, newOpName, newOpCountry, normName, networkCode || '', docType);

  const newOperator = db.prepare('SELECT * FROM operators WHERE id = ?').get(newId);

  return {
    operator: newOperator,
    isNewOperator: true,
    detectedInfo: { name: detectedName, country: detectedCountry, docType }
  };
}

module.exports = { detectAndGetOperator, extractOperatorInfo, normalizeName };
