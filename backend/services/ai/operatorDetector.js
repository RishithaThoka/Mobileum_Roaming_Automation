const { v4: uuid } = require('uuid');
const db = require('../../db');

const TADIG_LOOKUP = {
  'INDAT': { name: 'Bharti Airtel', country: 'India', region: 'Asia Pacific' },
  'INDJB': { name: 'Bharti Airtel', country: 'India', region: 'Asia Pacific' },
  'INDBS': { name: 'BSNL', country: 'India', region: 'Asia Pacific' },
  'DEUVF': { name: 'Vodafone Germany', country: 'Germany', region: 'Europe' },
  'FRAOR': { name: 'Orange France', country: 'France', region: 'Europe' },
  'ESPTE': { name: 'Telefonica Espana', country: 'Spain', region: 'Europe' },
  'USA310': { name: 'T-Mobile US', country: 'USA', region: 'North America' },
  'USA01': { name: 'T-Mobile US', country: 'USA', region: 'North America' },
};

const COUNTRY_ALIASES = {
  'united states': 'USA', 'united states of america': 'USA',
  'u.s.a.': 'USA', 'u.s.': 'USA',
  'united kingdom': 'UK', 'great britain': 'UK',
  'espana': 'Spain', 'españa': 'Spain',
};

function normalizeCountry(country) {
  if (!country) return country;
  const key = country.trim().toLowerCase();
  return COUNTRY_ALIASES[key] || country.trim();
}

function normalizeCanonicalName(name) {
  if (!name) return '';
  let clean = String(name).toLowerCase()
    .replace(/\b(\d+)\s*(circles?|circle)\b/gi, '')
    .replace(/\b(hexacom|iot|aa14|ir21|raex|v\d+|updated|circles?|filing)\b/gi, '')
    .replace(/\b(\d{1,2}\s*[a-z]{3,9}\s*\d{2,4})\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(ltd|limited|inc|corp|corporation|mobile|group|sa|ag|plc|gmbh|co)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.includes('airtel') || clean.includes('bharti')) return 'bharti airtel';
  if (clean.includes('bsnl'))      return 'bsnl';
  if (clean.includes('orange'))    return 'orange france';
  if (clean.includes('vodafone'))  return 'vodafone germany';
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
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
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
      maxTokens: 300,
    });
    if (result && result.operatorName && result.confidence !== 'low') {
      return { name: result.operatorName, country: result.country || '', reasoning: result.reasoning };
    }
  } catch (err) {
    console.warn('[operatorDetector] AI inference failed, leaving as Unassigned:', err.message);
  }
  return null;
}

function extractOperatorMetadata(extractedFields) {
  let name = '', country = '', networkCode = '', docType = 'IR21', requiresReview = 0;

  for (const [key, val] of Object.entries(extractedFields || {})) {
    const k = key.toLowerCase();
    const v = String(val || '').trim();
    if (!v) continue;

    if (k.includes('raex') || k.includes('iot') || k.includes('aa14')) docType = 'RAEX';

    if (!networkCode && (k.includes('tadig') || k.includes('networkid') || k.includes('networkcode') || k.includes('mcc'))) {
      networkCode = v;
      const upperVal = v.toUpperCase();
      for (const [code, lookup] of Object.entries(TADIG_LOOKUP)) {
        if (upperVal.includes(code)) { name = lookup.name; country = lookup.country; break; }
      }
    }
  }

  for (const [key, val] of Object.entries(extractedFields || {})) {
    const k = key.toLowerCase();
    const v = String(val || '').trim();
    if (!v) continue;

    if (!name && (
      k.includes('operatorname') || k.includes('operator_name') || k.includes('operator') ||
      k.includes('carrier') || k.includes('sender') || k.includes('vpmn') || k.includes('hpmn') ||
      k.includes('organisation') || k.includes('membername') || k.includes('iot identifier')
    )) { name = v; }

    if (!country && (k.includes('country') || k.includes('jurisdiction') || k.includes('territory'))) {
      country = v;
    }
  }

  if (name) {
    const norm = normalizeCanonicalName(name);
    if (norm === 'bharti airtel')    { name = 'Bharti Airtel';    country = country || 'India'; }
    else if (norm === 'bsnl')        { name = 'BSNL';             country = country || 'India'; }
    else if (norm === 'orange france') { name = 'Orange France';  country = country || 'France'; }
    else if (norm === 'vodafone germany') { name = 'Vodafone Germany'; country = country || 'Germany'; }
    else if (norm === 't mobile us') { name = 'T-Mobile US';      country = country || 'USA'; }
    else if (norm === 'telefonica espana') { name = 'Telefonica Espana'; country = country || 'Spain'; }
  }

  if (!name || name.trim().length === 0) { name = 'Unassigned Operator'; country = 'Global'; requiresReview = 1; }

  country = normalizeCountry(country);
  const region = inferRegion(country);
  return { name, country, region, networkCode, docType, requiresReview };
}

async function detectAndGetOperator({ extractedFields }) {
  let meta = extractOperatorMetadata(extractedFields);

  if (meta.requiresReview === 1) {
    const aiGuess = await aiInferOperator(extractedFields);
    if (aiGuess) {
      let country = normalizeCountry(aiGuess.country || meta.country);
      meta = { ...meta, name: aiGuess.name, country, region: inferRegion(country), requiresReview: 0, aiInferred: true };
    }
  }

  const normTarget = normalizeCanonicalName(meta.name);

  if (meta.requiresReview === 1) {
    let unassignedOp = await db('operators').where({ name: 'Unassigned Operator' }).first();
    if (!unassignedOp) {
      const uId = uuid();
      await db('operators').insert({
        id: uId, name: 'Unassigned Operator', country: 'Global', region: 'Global',
        network_code: '', default_doc_type: 'IR21', auto_created: 1, normalized_name: 'unassigned operator',
      });
      unassignedOp = await db('operators').where({ id: uId }).first();
    }
    return { operator: unassignedOp, isNewOperator: false, detectedInfo: meta };
  }

  const allOps = await db('operators').select('*');
  let matchedOp = null, highestSim = 0;
  for (const op of allOps) {
    const sim = getSimilarity(op.name, meta.name);
    if (sim > highestSim && sim >= 0.70) { highestSim = sim; matchedOp = op; }
  }
  if (matchedOp) return { operator: matchedOp, isNewOperator: false, detectedInfo: meta };

  const newId = uuid();
  await db('operators').insert({
    id: newId, name: meta.name, country: meta.country, region: meta.region,
    network_code: meta.networkCode, default_doc_type: meta.docType, auto_created: 1, normalized_name: normTarget,
  });
  const createdOp = await db('operators').where({ id: newId }).first();
  return { operator: createdOp, isNewOperator: true, detectedInfo: meta };
}

module.exports = { detectAndGetOperator, extractOperatorMetadata, normalizeCanonicalName, normalizeCountry, getSimilarity, aiInferOperator };
