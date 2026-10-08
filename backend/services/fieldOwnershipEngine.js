'use strict';

/**
 * services/fieldOwnershipEngine.js
 *
 * Generalised field ownership engine (B4).
 *
 * Classification precedence (highest → lowest):
 *   1. override   — field_ownership_overrides (operator-scoped beats global)
 *   2. catalog    — field_catalog (canonical label + aliases)
 *   3. auto       — field_ownership_rules (contact_override, explicit_general,
 *                   keyword[label-only, single domain], section)
 *   4. fallback   — General (Admin-only), when nothing else matches
 *
 * owner_source enum: 'override' | 'catalog' | 'auto' | 'fallback'
 *
 * Inside the auto tier, evaluation order is:
 *   a) contact_override rules  (pattern matches label or full path)
 *   b) explicit_general rules  (label match)
 *   c) keyword rules on the LABEL ONLY
 *      — 0 label keyword hits  → proceed to section
 *      — 1 unique domain hit   → domain = that domain (auto)
 *      — 2+ unique domain hits → Admin-only / fallback (multi-domain conflict logged)
 *   d) section rules (only when keyword yields 0 hits)
 *      — unambiguous section → domain (auto)
 *      — ambiguous section   → fallback
 *      — if keyword domain ≠ section domain → keyword wins + warning logged
 *   A section-only match (no keyword) DOES grant approver edit rights (consistent with
 *   prior behaviour for unambiguous sections like FINANCIAL BILLING). No golden values change.
 *
 * Label normalisation (B5):
 *   Unicode NFKC → strip diacritics → strip zero-width chars → lowercase →
 *   replace punctuation with space → collapse whitespace.
 *   Labels that normalise to empty, all-non-ASCII, or < 2 chars → fallback.
 *   Punctuation is replaced with a SPACE (not deleted), so "A.P.N" → "A P N" → tokens ["a","p","n"],
 *   preventing "apn" matching.
 *
 * Caching (B1):
 *   In-memory cache of rules, catalog, and overrides with TTL = 60s.
 *   Invalidated explicitly by admin route writes.
 *
 * Ruleset version (B1):
 *   A single global counter in the `ruleset_version` table (a one-row table).
 *   Incremented inside the same transaction as any rule/catalog/override change.
 *   Stored on diff_items at PATCH submit time (B7).
 *
 * Fail-closed (B6):
 *   Any error in classification returns { domain:'General', owner_source:'fallback' }.
 */

const { v4: uuid } = require('uuid');

// ─── Label normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a label string for matching.
 *
 * Steps:
 *   1. Unicode NFKC
 *   2. NFD + strip combining marks (diacritics)
 *   3. Strip zero-width / invisible characters
 *   4. Lowercase
 *   5. Replace punctuation with a single space (so "A.P.N" → "A P N")
 *   6. Collapse whitespace
 *
 * Returns null if the result is empty, < 2 chars, or all non-ASCII.
 */
function normalizeLabel(str) {
  if (!str || typeof str !== 'string') return null;
  try {
    // 1. NFKC
    let s = str.normalize('NFKC');
    // 2. Strip diacritics: NFD then remove Mn category
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // 3. Strip zero-width and other invisible chars
    s = s.replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, '');
    // 4. Lowercase
    s = s.toLowerCase();
    // 5. Replace punctuation with space (keep hyphens between word chars as space)
    s = s.replace(/[^\w\s]/g, ' ');
    // 6. Collapse whitespace
    s = s.trim().replace(/\s+/g, ' ');

    if (!s || s.length < 2) return null;
    // If all characters are non-ASCII (e.g. Arabic, Thai, CJK) → unreadable for rules
    if (/^[^\x00-\x7F]+$/.test(s)) return null;

    return s;
  } catch (_) {
    return null;
  }
}

/**
 * Tokenise a normalised label into words.
 * Uses space split only (normalization already converted other separators to spaces).
 */
function tokenizeNormalized(normalized) {
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000; // 60 seconds

let _cache = null;

function invalidateCache() {
  _cache = null;
}

async function loadRules(db) {
  if (_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS) {
    return _cache;
  }

  const [rules, catalog, overrides, versionRow] = await Promise.all([
    db('field_ownership_rules').where({ is_active: 1 }).orderBy('priority', 'desc'),
    db('field_catalog').where({ is_active: 1 }),
    db('field_ownership_overrides').orderBy('operator_id', 'asc'), // operator-scoped first
    db('ruleset_version').first().catch(() => null),
  ]);

  _cache = {
    loadedAt: Date.now(),
    rules,
    catalog,
    overrides,
    rulesetVersion: versionRow ? versionRow.version : 1,
  };
  return _cache;
}

// ─── Generic word-boundary pattern match ─────────────────────────────────────

/**
 * Check whether `tokens` (array of lowercase strings) contains the given
 * keyword pattern as whole tokens (no substring match).
 *
 * Multi-word patterns require consecutive tokens.
 */
function tokensContain(tokens, pattern) {
  const pt = pattern.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (pt.length === 0) return false;
  if (pt.length === 1) return tokens.includes(pt[0]);
  for (let i = 0; i <= tokens.length - pt.length; i++) {
    if (pt.every((p, j) => tokens[i + j] === p)) return true;
  }
  return false;
}

// ─── Main classification function ────────────────────────────────────────────

/**
 * Classify a field path into its owning domain using the DB-backed engine.
 *
 * @param {string} fieldPath - Full field path, e.g. "NETWORK TECHNICAL.HLR Global Title"
 * @param {object} db        - Knex instance
 * @param {object} [opts]
 * @param {string} [opts.operatorId]  - Operator ID for override scoping
 * @param {string} [opts.docType]     - Document type ('IR21', 'RAEX', …)
 * @returns {Promise<{
 *   domain: string,
 *   owner_source: 'override'|'catalog'|'auto'|'fallback',
 *   match: string|null,
 *   pending_owner_confirmation: boolean,
 *   rule_version: number,
 *   tier_detail: string,   // fine-grained source for logging/debugging
 * }>}
 */
async function classifyField(fieldPath, db, { operatorId, docType = '*' } = {}) {
  try {
    const { rules, catalog, overrides, rulesetVersion } = await loadRules(db);

    const dot = fieldPath.indexOf('.');
    const rawSection = dot >= 0 ? fieldPath.substring(0, dot) : '';
    const rawLabel   = dot >= 0 ? fieldPath.substring(dot + 1) : fieldPath;

    // Normalise the label
    const normLabel = normalizeLabel(rawLabel);
    if (!normLabel) {
      // Non-readable label → fail closed
      return _fallback(rulesetVersion, 'non_readable_label');
    }
    const labelTokens = tokenizeNormalized(normLabel);

    // ── 1. Override ───────────────────────────────────────────────────────────
    // Operator-scoped overrides take priority over global overrides.
    // Also supports optional section_scope.
    const normSection = normalizeLabel(rawSection);
    for (const ov of overrides) {
      // Section scope check (if set)
      if (ov.section_scope) {
        const normSectionScope = normalizeLabel(ov.section_scope);
        if (!normSection || !normSection.includes(normSectionScope)) continue;
      }
      const ovNorm = normalizeLabel(ov.normalized_label);
      if (!ovNorm) continue;

      // Match label
      if (normLabel === ovNorm) {
        // Check operator scope
        const sentinel = ov.operator_id;
        if (sentinel && sentinel !== '__GLOBAL__' && sentinel !== operatorId) continue;
        return {
          domain: ov.domain,
          owner_source: 'override',
          match: ov.normalized_label,
          pending_owner_confirmation: false,
          rule_version: rulesetVersion,
          tier_detail: `override:${sentinel && sentinel !== '__GLOBAL__' ? 'operator' : 'global'}`,
        };
      }
    }

    // ── 2. Catalog ────────────────────────────────────────────────────────────
    // Match canonical label or aliases. Doc_type exact match > '*'.
    const matchingCatalog = catalog
      .filter(row => {
        // Doc type
        if (row.doc_type !== '*' && row.doc_type !== docType) return false;
        // Canonical label
        const canonNorm = normalizeLabel(row.field_label);
        if (canonNorm && canonNorm === normLabel) return true;
        // Aliases
        if (row.aliases) {
          try {
            const aliases = typeof row.aliases === 'string' ? JSON.parse(row.aliases) : row.aliases;
            for (const alias of aliases) {
              const aliasNorm = normalizeLabel(alias);
              if (aliasNorm && aliasNorm === normLabel) return true;
            }
          } catch (_) {}
        }
        return false;
      })
      .sort((a, b) => {
        // Exact doc_type wins over '*'
        if (a.doc_type === docType && b.doc_type !== docType) return -1;
        if (b.doc_type === docType && a.doc_type !== docType) return 1;
        return 0;
      });

    if (matchingCatalog.length > 0) {
      const row = matchingCatalog[0];
      const source = row.pending_owner_confirmation ? 'catalog_pending' : 'catalog_confirmed';
      return {
        domain: row.domain,
        owner_source: 'catalog',
        match: row.field_label,
        pending_owner_confirmation: !!row.pending_owner_confirmation,
        rule_version: rulesetVersion,
        tier_detail: source,
      };
    }

    // ── 3. Auto (rule-based) ──────────────────────────────────────────────────
    // Sub-order: contact_override → explicit_general → keyword → section

    // Split rules by type
    const contactRules   = rules.filter(r => r.rule_type === 'contact_override');
    const explicitRules  = rules.filter(r => r.rule_type === 'explicit_general');
    const keywordRules   = rules.filter(r => r.rule_type === 'keyword');
    const sectionRules   = rules.filter(r => r.rule_type === 'section');
    const hiddenRules    = rules.filter(r => r.rule_type === 'hidden');

    // 3a. Hidden check (before any domain assignment)
    for (const hr of hiddenRules) {
      const normPattern = normalizeLabel(hr.pattern);
      if (normPattern && normLabel === normPattern) {
        // Hidden fields return General/fallback, never shown to users
        return {
          domain: 'General',
          owner_source: 'fallback',
          match: hr.pattern,
          pending_owner_confirmation: false,
          rule_version: rulesetVersion,
          tier_detail: 'hidden',
          isHidden: true,
        };
      }
    }

    // 3b. Contact override rules (match label tokens — full pattern match)
    for (const cr of contactRules) {
      const normPattern = normalizeLabel(cr.pattern);
      if (!normPattern) continue;
      const patTokens = tokenizeNormalized(normPattern);
      if (tokensContain(labelTokens, normPattern)) {
        return {
          domain: cr.domain,
          owner_source: 'auto',
          match: cr.pattern,
          pending_owner_confirmation: false,
          rule_version: rulesetVersion,
          tier_detail: 'contact_override',
        };
      }
    }

    // 3c. Explicit general rules
    for (const eg of explicitRules) {
      const normPattern = normalizeLabel(eg.pattern);
      if (!normPattern) continue;
      if (normLabel === normPattern || tokensContain(labelTokens, normPattern)) {
        return {
          domain: 'General',
          owner_source: 'auto',
          match: eg.pattern,
          pending_owner_confirmation: false,
          rule_version: rulesetVersion,
          tier_detail: 'explicit_general',
        };
      }
    }

    // 3d. Keyword rules — LABEL ONLY
    // Group keyword rules by domain (sorted by rule priority desc, already applied by DB query)
    const domainKeywordHits = new Map(); // domain → [{ keyword, ruleId }]
    for (const kr of keywordRules) {
      const normKw = normalizeLabel(kr.pattern);
      if (!normKw) continue;
      if (tokensContain(labelTokens, normKw)) {
        if (!domainKeywordHits.has(kr.domain)) {
          domainKeywordHits.set(kr.domain, []);
        }
        domainKeywordHits.get(kr.domain).push({ keyword: kr.pattern, ruleId: kr.id });
      }
    }

    const hitDomains = [...domainKeywordHits.keys()];

    if (hitDomains.length === 1) {
      return {
        domain: hitDomains[0],
        owner_source: 'auto',
        match: domainKeywordHits.get(hitDomains[0])[0].keyword,
        pending_owner_confirmation: false,
        rule_version: rulesetVersion,
        tier_detail: 'keyword',
      };
    }

    if (hitDomains.length > 1) {
      // Multi-domain conflict → Admin-only, fail closed
      const conflictStr = hitDomains.join(' vs ');
      console.warn(`[fieldOwnershipEngine] Label multi-domain conflict for "${fieldPath}" (label: "${rawLabel}"): ${conflictStr}. Assigned to General (Admin-only).`);
      return {
        domain: 'General',
        owner_source: 'fallback',
        match: null,
        pending_owner_confirmation: false,
        rule_version: rulesetVersion,
        tier_detail: 'admin_multi_domain_conflict',
        conflictDomains: hitDomains,
      };
    }

    // 3e. Section rules (0 keyword hits)
    if (normSection) {
      const normSectionStr = normalizeLabel(rawSection);
      const sectionTokens  = normSectionStr ? tokenizeNormalized(normSectionStr) : [];
      let sectionDomain    = null;
      let sectionMatch     = null;

      for (const sr of sectionRules) {
        const normPrefix = normalizeLabel(sr.pattern);
        if (!normPrefix) continue;
        if (normSectionStr && normSectionStr.startsWith(normPrefix)) {
          sectionDomain = sr.domain; // may be null for ambiguous sections
          sectionMatch  = sr.pattern;
          break; // longest prefix first (enforced by priority desc order)
        }
      }

      if (sectionDomain) {
        return {
          domain: sectionDomain,
          owner_source: 'auto',
          match: sectionMatch,
          pending_owner_confirmation: false,
          rule_version: rulesetVersion,
          tier_detail: 'section',
        };
      }
    }

    // 4. Fallback
    return _fallback(rulesetVersion, 'no_match');

  } catch (err) {
    // B6: fail closed on any error
    console.error('[fieldOwnershipEngine] Classification error:', err.message);
    return _fallback(0, 'error');
  }
}

function _fallback(ruleVersion, detail) {
  return {
    domain: 'General',
    owner_source: 'fallback',
    match: null,
    pending_owner_confirmation: false,
    rule_version: ruleVersion || 0,
    tier_detail: detail || 'fallback',
  };
}

// ─── Ruleset version ──────────────────────────────────────────────────────────

/**
 * Get the current global ruleset version.
 * Returns 0 if the ruleset_version table doesn't exist yet.
 */
async function getRulesetVersion(db) {
  try {
    const row = await db('ruleset_version').first();
    return row ? row.version : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Increment the global ruleset version (inside an existing trx).
 * Must be called within every rule/catalog/override write transaction.
 */
async function bumpRulesetVersion(trx) {
  const existing = await trx('ruleset_version').first();
  if (existing) {
    await trx('ruleset_version').update({ version: existing.version + 1, updated_at: new Date().toISOString() });
    return existing.version + 1;
  } else {
    await trx('ruleset_version').insert({ version: 1, updated_at: new Date().toISOString() });
    return 1;
  }
}

// ─── Dry-run ──────────────────────────────────────────────────────────────────

/**
 * Preview the impact of adding or modifying a rule.
 *
 * Scans all documents with a baseline and runs the hypothetical new rule
 * against every field.  Returns changed fields grouped by document.
 *
 * @param {object} db
 * @param {object} proposedRule - { rule_type, pattern, domain, doc_type }
 * @param {string} [excludeRuleId] - ID of an existing rule being replaced (for PATCH)
 * @returns {Promise<{ preview_token: string, changes: Array, total_fields: number, affected: number }>}
 */
async function dryRunRule(db, proposedRule, excludeRuleId = null) {
  const { rule_type, pattern, domain, doc_type = '*' } = proposedRule;
  const normPattern = normalizeLabel(pattern);
  if (!normPattern) {
    return { error: 'Pattern normalises to empty string.' };
  }

  // Get all documents with baselines
  const docs = await db('documents').select('id', 'doc_type', 'operator_id');
  const changes = [];
  let totalFields = 0;

  for (const doc of docs) {
    const baseline = await db('document_versions')
      .where({ document_id: doc.id, is_current_baseline: 1 }).first();
    if (!baseline || !baseline.extracted_fields) continue;

    const fields = JSON.parse(baseline.extracted_fields);
    const docChanges = [];

    for (const [fieldPath, value] of Object.entries(fields)) {
      totalFields++;
      const currentResult = await classifyField(fieldPath, db, { docType: doc.doc_type || '*' });

      // Check if the proposed rule would match this field
      const dot = fieldPath.indexOf('.');
      const rawLabel = dot >= 0 ? fieldPath.substring(dot + 1) : fieldPath;
      const normLabel = normalizeLabel(rawLabel);
      if (!normLabel) continue;

      let wouldMatch = false;
      if (rule_type === 'keyword') {
        const labelTokens = tokenizeNormalized(normLabel);
        wouldMatch = tokensContain(labelTokens, normPattern);
      } else if (rule_type === 'explicit_general' || rule_type === 'contact_override') {
        wouldMatch = normLabel === normPattern ||
          tokensContain(tokenizeNormalized(normLabel), normPattern);
      } else if (rule_type === 'section') {
        const rawSection = dot >= 0 ? fieldPath.substring(0, dot) : '';
        const normSection = normalizeLabel(rawSection);
        wouldMatch = normSection ? normSection.startsWith(normPattern) : false;
      }

      if (!wouldMatch) continue;

      const newDomain = domain || 'General';
      if (newDomain !== currentResult.domain) {
        docChanges.push({
          field_path: fieldPath,
          current_domain: currentResult.domain,
          current_source: currentResult.owner_source,
          new_domain: newDomain,
        });
      }
    }

    if (docChanges.length > 0) {
      changes.push({
        document_id: doc.id,
        doc_type: doc.doc_type,
        fields_affected: docChanges,
      });
    }
  }

  const affected = changes.reduce((sum, c) => sum + c.fields_affected.length, 0);

  // Generate a preview token (short-lived, signed by a hash of the rule + timestamp)
  const crypto = require('crypto');
  const preview_token = crypto
    .createHash('sha256')
    .update(JSON.stringify(proposedRule) + Date.now().toString())
    .digest('hex')
    .slice(0, 32);

  return { preview_token, changes, total_fields: totalFields, affected };
}

// ─── Keyword validation ────────────────────────────────────────────────────────

const GENERIC_KEYWORDS = new Set([
  'data','name','type','code','number','value','text','info','id',
  'note','item','key','flag','date','time','ref','tag','set',
  // English stop-words — too generic to identify a domain
  'the','and','for','are','not','but','with','this','that','from',
  'has','its','was','all','can','had','her','his','how','may',
  'new','now','one','our','out','per','use','who','why','yes',
]);

/**
 * Validate a keyword before inserting as a rule.
 * Returns null if valid, or an error string.
 */
function validateKeyword(pattern) {
  const norm = normalizeLabel(pattern);
  if (!norm) return 'Pattern normalises to empty string.';
  const tokens = tokenizeNormalized(norm);
  for (const t of tokens) {
    if (t.length < 3) return `Token "${t}" is too short (minimum 3 characters).`;
    if (GENERIC_KEYWORDS.has(t)) return `Token "${t}" is a generic word and cannot be used as a keyword.`;
  }
  return null;
}

// ─── Ingestion tier logging (B10) ─────────────────────────────────────────────

/**
 * Log per-tier field counts for a batch of classified fields.
 * Called from ingestionService after classifying all fields in a document.
 *
 * @param {string} docId
 * @param {Array<{field_path: string, result: object}>} classifiedFields
 */
function logIngestionTierCounts(docId, classifiedFields) {
  const counts = {
    override: 0, catalog: 0, auto_contact: 0, auto_explicit: 0,
    auto_keyword: 0, auto_section: 0, fallback: 0, total: classifiedFields.length,
  };

  for (const { result } of classifiedFields) {
    const src = result.owner_source;
    const detail = result.tier_detail || '';
    if (src === 'override') counts.override++;
    else if (src === 'catalog') counts.catalog++;
    else if (src === 'auto') {
      if (detail === 'contact_override') counts.auto_contact++;
      else if (detail === 'explicit_general') counts.auto_explicit++;
      else if (detail === 'keyword') counts.auto_keyword++;
      else counts.auto_section++;
    } else {
      counts.fallback++;
    }
  }

  const fallbackRate = counts.total > 0 ? counts.fallback / counts.total : 0;
  console.log(
    `[ingestion] ${docId} tier counts: override=${counts.override} catalog=${counts.catalog}` +
    ` contact=${counts.auto_contact} explicit=${counts.auto_explicit}` +
    ` keyword=${counts.auto_keyword} section=${counts.auto_section}` +
    ` fallback=${counts.fallback} total=${counts.total}`
  );
  if (fallbackRate > 0.25) {
    console.warn(
      `[ingestion] WARNING: ${(fallbackRate * 100).toFixed(1)}% of fields in doc ${docId} fell back to Admin-only` +
      ` (threshold: 25%). Review for missing rules or unexpected field names.`
    );
  }

  return counts;
}

module.exports = {
  classifyField,
  getRulesetVersion,
  bumpRulesetVersion,
  dryRunRule,
  validateKeyword,
  normalizeLabel,
  tokenizeNormalized,
  tokensContain,
  logIngestionTierCounts,
  invalidateCache,
  GENERIC_KEYWORDS,
};
