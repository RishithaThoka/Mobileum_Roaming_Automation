// Run with: node scripts/evaluateExtraction.js
// Tests the real extraction pipeline (parsers + operatorDetector) against
// the labeled documents in sample-documents/, with and without AI fallback.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const diffEngine = require('../services/diffEngine');
const operatorDetector = require('../services/ai/operatorDetector');

const SAMPLES_DIR = path.join(__dirname, '..', '..', 'sample-documents');
const groundTruth = JSON.parse(fs.readFileSync(path.join(__dirname, 'groundTruth.json'), 'utf8'));

(async () => {
  const aiEnabled = !!process.env.GEMINI_API_KEY && process.env.ENABLE_AI_OPERATOR_DETECTION === 'true';
  console.log(`AI fallback: ${aiEnabled ? 'ENABLED' : 'DISABLED (set GEMINI_API_KEY + ENABLE_AI_OPERATOR_DETECTION=true to test it)'}\n`);

  let pass = 0;
  for (const c of groundTruth) {
    const fp = path.join(SAMPLES_DIR, c.file);
    let fields;
    try {
      fields = await diffEngine.extractFields(fp, c.format, '');
    } catch (e) {
      console.log(`ERROR  ${c.file.padEnd(65)} extraction failed: ${e.message}`);
      continue;
    }

    let meta = operatorDetector.extractOperatorMetadata(fields);
    let aiGuess = null;
    if (meta.requiresReview === 1 && aiEnabled) {
      aiGuess = await operatorDetector.aiInferOperator(fields);
      if (aiGuess) {
        aiGuess.country = operatorDetector.normalizeCountry(aiGuess.country);
        meta = { ...meta, name: aiGuess.name, country: aiGuess.country, requiresReview: 0 };
      }
    }

    if (c.file.includes('BSNL')) {
      console.log(`\n[DEBUG] BSNL File: ${c.file}`);
      console.log(`[DEBUG] Raw Extracted Fields:`, fields);
      if (aiGuess) console.log(`[DEBUG] AI Guess:`, aiGuess);
      console.log();
    }

    const opOk = meta.name.toLowerCase().includes(c.expectOperator.toLowerCase());
    const countryOk = (meta.country || '').toLowerCase().includes(c.expectCountry.toLowerCase());
    const ok = opOk && countryOk;
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.file.padEnd(65)} got name="${meta.name}" country="${meta.country}"`);
    
    // Add a 15 second delay to prevent hitting the free-tier 15 requests/minute rate limit
    if (aiEnabled) await new Promise(r => setTimeout(r, 15000));
  }

  const pct = (100 * pass / groundTruth.length).toFixed(1);
  console.log(`\n${pass}/${groundTruth.length} = ${pct}%  ${pct >= 80 ? '✅ above 80% target' : '❌ below 80% target'}`);
})();
