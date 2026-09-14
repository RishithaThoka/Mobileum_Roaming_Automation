'use strict';

/**
 * AI-evaluated risk scoring for a batch of changed fields.
 *
 * Controlled by ENABLE_AI_RISK_SCORING=true in .env (off by default).
 * Requires GROQ_API_KEY to be set.
 *
 * Returns:
 *   Map<field_path, { risk_score, impact_level, ai_analysis }>
 *     - contains ONLY entries the AI returned that passed individual validation
 *     - partial results are fine; caller falls back per-field for anything missing
 *   null
 *     - catastrophic failure: network error, timeout, non-JSON / non-array response
 *     - caller keeps all items as deterministic_fallback
 */

const TIMEOUT_MS = 90000;  // 90s: covers up to 2 aiClient retries at max 30s Retry-After each + call time
                            // 15s was too short -- a single 429 backoff (observed 13-17s) consumed the budget
const VALID_IMPACT_LEVELS = new Set(['Critical', 'Moderate', 'Minor']);

const SYSTEM_PROMPT = `You are a telecom roaming risk analyst. Given a batch of \
configuration changes from an IR21/RAEX roaming agreement document, assess each \
change's risk individually based on its specific field name and actual old/new values.

Return ONLY a JSON array. Each element must have exactly these keys:
{
  "field_path": "<exact same string as in the input, character-for-character>",
  "risk_score": <integer 0-100>,
  "impact_level": "<use EXACTLY one of these three words: Critical, Moderate, Minor>",
  "summary": "<1 sentence: what specifically changed and why it matters for roaming>",
  "business_impact": "<1-2 sentences: operational or service continuity impact>",
  "rollback_recommendation": "<specific, actionable step to revert this change>"
}

IMPORTANT: For impact_level, use ONLY the exact words Critical, Moderate, or Minor.
Do not use synonyms such as Significant, High, Medium, Low, or any other word.

Risk score and impact_level calibration:
- 80-100 => Critical: security keys/certs, IPsec tunnel params, core GT/SCCP routing addresses
- 50-79  => Moderate: APN config, IMSI/MSISDN ranges, commercial tariff rates, GRX/IPX addresses
- 20-49  => Moderate: voice/SMS service params, non-critical routing updates, SLA thresholds
- 0-19   => Minor:    contact info, document metadata, version labels, description fields

Return ONLY the JSON array -- no markdown fences, no explanation text.`;

async function scoreChanges(changedFields) {
  // Guard: feature flag
  if (process.env.ENABLE_AI_RISK_SCORING !== 'true') {
    return null;
  }
  // Guard: API key
  if (!process.env.GROQ_API_KEY) {
    console.warn('[riskScorer] ENABLE_AI_RISK_SCORING=true but GROQ_API_KEY not set -- using deterministic fallback');
    return null;
  }
  // Guard: nothing to score
  if (!changedFields || changedFields.length === 0) {
    return null;
  }

  // Build the batched input -- truncate values to avoid blowing past token limits
  const inputPayload = changedFields.map(f => ({
    field_path: String(f.field_path),
    old_value:  truncate(f.old_value,  300),
    new_value:  truncate(f.new_value,  300),
    domain:     String(f.domain || 'Unknown')
  }));

  const userPrompt = 'Assess these ' + inputPayload.length + ' changes:\n' + JSON.stringify(inputPayload);

  try {
    const { callGeminiJSON } = require('./aiClient');

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('AI risk scoring timed out after ' + (TIMEOUT_MS / 1000) + 's')),
        TIMEOUT_MS
      )
    );

    const aiPromise = callGeminiJSON({
      system:    SYSTEM_PROMPT,
      prompt:    userPrompt,
      maxTokens: 3000   // ~26 fields x ~100 tokens each, with headroom
    });

    const rawResult = await Promise.race([aiPromise, timeoutPromise]);

    if (!Array.isArray(rawResult)) {
      console.warn('[riskScorer] AI returned non-array response -- using deterministic fallback for all fields');
      return null;
    }

    // Build result Map -- validate each entry individually (partial credit)
    const scoreMap = new Map();
    let skipped = 0;

    for (const entry of rawResult) {
      if (!entry || typeof entry.field_path !== 'string' || !entry.field_path) {
        skipped++;
        continue;
      }

      const score = Number(entry.risk_score);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        console.warn('[riskScorer] Invalid risk_score for "' + entry.field_path + '": ' + entry.risk_score + ' -- deterministic fallback for this field');
        skipped++;
        continue;
      }

      if (!VALID_IMPACT_LEVELS.has(entry.impact_level)) {
        console.warn('[riskScorer] Invalid impact_level for "' + entry.field_path + '": ' + entry.impact_level + ' -- deterministic fallback for this field');
        skipped++;
        continue;
      }

      scoreMap.set(entry.field_path, {
        risk_score:   Math.round(score),
        impact_level: entry.impact_level,
        ai_analysis: {
          summary:                 sanitize(entry.summary,                 500),
          business_impact:         sanitize(entry.business_impact,         1000),
          rollback_recommendation: sanitize(entry.rollback_recommendation, 500)
        }
      });
    }

    const valid = scoreMap.size;
    const total = changedFields.length;
    console.log('[riskScorer] AI scored ' + valid + '/' + total + ' fields (' + skipped + ' skipped -- deterministic fallback for those)');

    // If every single entry was malformed, treat as total failure
    if (valid === 0) {
      console.warn('[riskScorer] AI returned zero valid entries -- using deterministic fallback for all fields');
      return null;
    }

    return scoreMap;

  } catch (err) {
    console.warn('[riskScorer] AI risk scoring failed -- using deterministic fallback for all fields:', err.message);
    return null;
  }
}

// ---- Helpers ----------------------------------------------------------------

function truncate(val, maxLen) {
  if (val === null || val === undefined) return null;
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

function sanitize(val, maxLen) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

module.exports = { scoreChanges };
