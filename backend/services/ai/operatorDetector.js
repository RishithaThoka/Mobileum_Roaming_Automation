const { v4: uuid } = require('uuid');
const db = require('../../db');

/**
 * TADIG Code & Network ID lookup table mapping codes to canonical operator names & countries.
 */
const TADIG_LOOKUP = {
  'INDAT': { name: 'Bharti Airtel', country: 'India', region: 'Asia Pacific' },
  'INDJB': { name: 'Bharti Airtel', country: 'India', region: 'Asia Pacific' },
  'INDBS': { name: 'BSNL', country: 'India', region: 'Asia Pacific' },
  'DEUVF': { name: 'Vodafone Germany', country: 'Germany', region: 'Europe' },
  'FRAOR': { name: 'Orange France', country: 'France', region: 'Europe' },
  'ESPTE': { name: 'Telefonica Espana', country: 'Spain', region: 'Europe' },
  'USA310': { name: 'T-Mobile US', country: 'USA', region: 'North America' },
  'USA01': { name: 'T-Mobile US', country: 'USA', region: 'North America' }
};

/**
 * Normalizes an operator name into its canonical core identity string for matching.
 * Strips filler words (23 circles, Hexacom, IOT, dates, version numbers).
 */
const COUNTRY_ALIASES = {
  'united states': 'USA',
  'united states of america': 'USA',
  'u.s.a.': 'USA',
  'u.s.': 'USA',
  'united kingdom': 'UK',
  'great britain': 'UK',
  'espana': 'Spain',
  'españa': 'Spain',
};

function normalizeCountry(country) {
  if (!country) return country;
  const key = country.trim().toLowerCase();
  return COUNTRY_ALIASES[key] || country.trim();
}

function normalizeCanonicalName(name) {
  if (!name) return '';
  let clean = String(name).toLowerCase();

  // Strip filler phrases, circle numbers, dates, sub-brands
  clean = clean
    .replace(/\b(\d+)\s*(circles?|circle)\b/gi, '')
    .replace(/\b(hexacom|iot|aa14|ir21|raex|v\d+|updated|circles?|filing)\b/gi, '')
    .replace(/\b(\d{1,2}\s*[a-z]{3,9}\s*\d{2,4})\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(ltd|limited|inc|corp|corporation|mobile|group|sa|ag|plc|gmbh|co)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Canonical alias mappings
  if (clean.includes('airtel') || clean.includes('bharti')) return 'bharti airtel';
  if (clean.includes('bsnl')) return 'bsnl';
  if (clean.includes('orange')) return 'orange france';
  if (clean.includes('vodafone')) return 'vodafone germany';
  if (clean.includes('tmobile') || clean.includes('t mobile') || clean.includes('t mobile us')) return 't mobile us';
  if (clean.includes('telefonica')) return 'telefonica espana';

  return clean;
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
  const normA = normalizeCanonicalName(a);
  const normB = normalizeCanonicalName(b);
  if (!normA || !normB) return 0;
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) return 1.0;
  const dist = levenshtein(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return maxLen === 0 ? 1 : 1 - (dist / maxLen);
}

function inferRegion(countryName) {
  if (!countryName) return 'Global';
  const c = countryName.toLowerCase();
  if (/france|spain|germany|uk|united kingdom|italy|netherlands|sweden|norway|finland|poland|portugal|greece|belgium|austria|switzerland|ireland/.test(c)) return 'Europe';
  if (/singapore|japan|india|china|australia|korea|malaysia|indonesia|thailand|vietnam|philippines|new zealand/.test(c)) return 'Asia Pacific';
  if (/usa|united states|canada|mexico/.test(c)) return 'North America';
  if (/brazil|argentina|chile|colombia|peru|venezuela/.test(c)) return 'Latin America';
  if (/uae|saudi arabia|qatar|south africa|egypt|kenya|nigeria|israel/.test(c)) return 'MEA';
  return 'Global';
}

/**
 * AI fallback: when there's no labeled "Operator Name"/"Country" field at
 * all (e.g. an xlsx with only technical params, or a PDF whose title line
 * has no colon), ask the model to infer the operator from indirect signals
 * — email domains, APN strings, document titles — the way a human analyst
 * reading the doc would. Only runs when extractOperatorMetadata() already
 * came up empty, so it costs nothing on well-labeled documents.
 */
async function aiInferOperator(extractedFields) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.ENABLE_AI_OPERATOR_DETECTION !== 'true') return null;

  const fieldsText = Object.entries(extractedFields || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
    .slice(0, 6000);
  if (!fieldsText.trim()) return null;

  try {
    const { callGeminiJSON } = require('./aiClient');
    const result = await callGeminiJSON({
      system: 'You identify which real telecom network operator a roaming document belongs to, even when there is no explicit "Operator Name" field. Use indirect signals: email domains (e.g. fraud@telefonica-test.example implies Telefonica), APN strings (e.g. telefonica.es.roaming), document titles, TADIG-style codes. If you cannot confidently identify a specific real operator, return null values rather than guessing.',
      prompt: `Extracted fields from a telecom roaming document (no labeled operator/country field was found by the deterministic parser):\n\n${fieldsText}\n\nReturn ONLY JSON: {"operatorName": string|null, "country": string|null, "confidence": "high"|"medium"|"low", "reasoning": string}`,
      maxTokens: 300
    });
    if (result && result.operatorName && result.confidence !== 'low') {
      return { name: result.operatorName, country: result.country || '', reasoning: result.reasoning };
    }
  } catch (err) {
    console.warn('[operatorDetector] AI inference failed, leaving as Unassigned:', err.message);
  }
  return null;
}

/**
 * Extracts operator metadata strictly from document content fields.
 * NEVER reads or falls back to originalFilename.
 */
function extractOperatorMetadata(extractedFields) {
  let name = '';
  let country = '';
  let networkCode = '';
  let docType = 'IR21';
  let requiresReview = 0;

  // 1. First check TADIG or Network Code matches in extracted fields
  for (const [key, val] of Object.entries(extractedFields || {})) {
    const k = key.toLowerCase();
    const v = String(val || '').trim();
    if (!v) continue;

    if (k.includes('raex') || k.includes('iot') || k.includes('aa14')) {
      docType = 'RAEX';
    }

    // Inspect TADIG or Network Code
    if (!networkCode && (k.includes('tadig') || k.includes('networkid') || k.includes('networkcode') || k.includes('mcc'))) {
      networkCode = v;
      const upperVal = v.toUpperCase();
      for (const [code, lookup] of Object.entries(TADIG_LOOKUP)) {
        if (upperVal.includes(code)) {
          name = lookup.name;
          country = lookup.country;
          break;
        }
      }
    }
  }

  // 2. Inspect Content Header Key-Values for Operator Name & Country
  for (const [key, val] of Object.entries(extractedFields || {})) {
    const k = key.toLowerCase();
    const v = String(val || '').trim();
    if (!v) continue;

    if (!name && (
      k.includes('operatorname') || k.includes('operator_name') || k.includes('operator') ||
      k.includes('carrier') || k.includes('sender') || k.includes('vpmn') || k.includes('hpmn') ||
      k.includes('organisation') || k.includes('membername') || k.includes('iot identifier')
    )) {
      name = v;
    }

    if (!country && (k.includes('country') || k.includes('jurisdiction') || k.includes('territory'))) {
      country = v;
    }
  }

  // 3. Apply Canonical Mapping to extracted name
  if (name) {
    const norm = normalizeCanonicalName(name);
    if (norm === 'bharti airtel') {
      name = 'Bharti Airtel';
      country = country || 'India';
    } else if (norm === 'bsnl') {
      name = 'BSNL';
      country = country || 'India';
    } else if (norm === 'orange france') {
      name = 'Orange France';
      country = country || 'France';
    } else if (norm === 'vodafone germany') {
      name = 'Vodafone Germany';
      country = country || 'Germany';
    } else if (norm === 't mobile us') {
      name = 'T-Mobile US';
      country = country || 'USA';
    } else if (norm === 'telefonica espana') {
      name = 'Telefonica Espana';
      country = country || 'Spain';
    }
  }

  // 4. Low-Confidence handling: Do NOT fallback to filename. Flag for review.
  if (!name || name.trim().length === 0) {
    name = 'Unassigned Operator';
    country = 'Global';
    requiresReview = 1;
  }

  country = normalizeCountry(country);
  const region = inferRegion(country);

  return { name, country, region, networkCode, docType, requiresReview };
}

/**
 * Detects existing operator or creates a new operator record synchronously in DB.
 * ALWAYS returns a valid operator object with a non-null id.
 */
async function detectAndGetOperator({ extractedFields }) {
  let meta = extractOperatorMetadata(extractedFields);

  // Deterministic pass found nothing — try AI inference from indirect
  // signals before giving up and flagging for manual review.
  if (meta.requiresReview === 1) {
    const aiGuess = await aiInferOperator(extractedFields);
    if (aiGuess) {
      let country = aiGuess.country || meta.country;
      country = normalizeCountry(country);
      meta = {
        ...meta,
        name: aiGuess.name,
        country,
        region: inferRegion(country),
        requiresReview: 0,
        aiInferred: true
      };
    }
  }

  const normTarget = normalizeCanonicalName(meta.name);

  if (meta.requiresReview === 1) {
    let unassignedOp = db.prepare(`SELECT * FROM operators WHERE name = 'Unassigned Operator'`).get();
    if (!unassignedOp) {
      const uId = uuid();
      db.prepare(`
        INSERT INTO operators (id, name, country, region, network_code, default_doc_type, auto_created, normalized_name)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(uId, 'Unassigned Operator', 'Global', 'Global', '', 'IR21', 1, 'unassigned operator');
      unassignedOp = db.prepare(`SELECT * FROM operators WHERE id = ?`).get(uId);
    }
    return {
      operator: unassignedOp,
      isNewOperator: false,
      detectedInfo: meta
    };
  }

  const allOps = db.prepare(`SELECT * FROM operators`).all();
  let matchedOp = null;
  let highestSim = 0;

  for (const op of allOps) {
    const sim = getSimilarity(op.name, meta.name);
    if (sim > highestSim && sim >= 0.70) {
      highestSim = sim;
      matchedOp = op;
    }
  }

  if (matchedOp) {
    return { operator: matchedOp, isNewOperator: false, detectedInfo: meta };
  }

  // Auto-create brand new operator record synchronously in DB
  const newId = uuid();
  db.prepare(`
    INSERT INTO operators (id, name, country, region, network_code, default_doc_type, auto_created, normalized_name)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(newId, meta.name, meta.country, meta.region, meta.networkCode, meta.docType, 1, normTarget);

  const createdOp = db.prepare(`SELECT * FROM operators WHERE id = ?`).get(newId);
  return { operator: createdOp, isNewOperator: true, detectedInfo: meta };
}

module.exports = {
  detectAndGetOperator,
  extractOperatorMetadata,
  normalizeCanonicalName,
  normalizeCountry,
  getSimilarity,
  aiInferOperator
};
