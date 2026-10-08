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

  if (!name && originalFilename) {
    const baseName = originalFilename.split('.')[0].replace(/[-_]?(v\d+|IR21|RAEX)/gi, '').trim();
    if (baseName) name = baseName.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  if (!name) name = 'Unknown Operator';
  if (!country) {
    const words = name.split(' ');
    country = words.length > 1 ? words[words.length - 1] : 'Global';
  }

  return { name, country, networkCode, docType };
}

async function detectAndGetOperator({ extractedFields, originalFilename }) {
  const { name: detectedName, country: detectedCountry, networkCode, docType } = extractOperatorInfo(extractedFields, originalFilename);
  const normName = normalizeName(detectedName);

  const existingOperators = await db('operators').select('*');
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

  const newId = uuid();
  await db('operators').insert({
    id: newId,
    name: detectedName.trim(),
    country: (detectedCountry.trim() || 'Global'),
    normalized_name: normName,
    network_code: networkCode || '',
    ingest_mode: 'push',
    default_doc_type: docType,
    auto_created: 1,
    status: 'active',
  });

  const newOperator = await db('operators').where({ id: newId }).first();
  return {
    operator: newOperator,
    isNewOperator: true,
    detectedInfo: { name: detectedName, country: detectedCountry, docType },
  };
}

module.exports = { detectAndGetOperator, extractOperatorInfo, normalizeName };
