'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// Field Ownership Map — IR.21 / RAEX Document Fields
//
// Deterministic classification of every extracted field path into an owning
// domain.  NO AI fallback — purely rule-based.  This single module drives both
// the viewer's per-field "editable" flag and the PATCH endpoint's per-field
// permission check (same function: isFieldEditable).
//
// All matching is TOKEN-BASED (not substring).  Field paths are split on
// whitespace / dots / underscores / hyphens into tokens, and keywords must
// appear as whole tokens (or consecutive tokens for multi-word keywords).
// This prevents short keywords like "gt", "apn", "moc" from matching inside
// unrelated words like "length", "japan", "democratic".
//
// Domain vocabulary matches category_routing (5 approval domains):
//   Routing (GT), Security (IPsec), Commercial (IOT),
//   Packet Core (APN), Voice/SMS (IMSI)
// Plus "General" for admin-only operator-profile / metadata fields.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Token matching utilities ─────────────────────────────────────────────────

/**
 * Split a field path into lowercase tokens.
 * Splits on: whitespace, dots, underscores, hyphens, slashes.
 */
function tokenize(path) {
  return String(path).toLowerCase().split(/[\s._\-/]+/).filter(Boolean);
}

/**
 * Check whether `tokens` contains the given pattern (single word or
 * multi-word phrase as consecutive tokens).
 *
 * @param  {string[]} tokens   Tokenized field path
 * @param  {string}   pattern  Keyword or phrase (e.g. "apn" or "global title")
 * @return {boolean}
 */
function tokensMatch(tokens, pattern) {
  const patTokens = pattern.toLowerCase().split(/\s+/);
  if (patTokens.length === 1) {
    return tokens.includes(patTokens[0]);
  }
  // Multi-word: require consecutive token match
  for (let i = 0; i <= tokens.length - patTokens.length; i++) {
    let match = true;
    for (let j = 0; j < patTokens.length; j++) {
      if (tokens[i + j] !== patTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

// ── 1. Contact field overrides (HIGHEST precedence) ──────────────────────────
// Ordered longest-pattern-first so "chief information security" beats bare
// "security".  Evaluated top-to-bottom; first match wins.
const CONTACT_OVERRIDES = [
  // Security (IPsec) contacts
  { pattern: 'chief information security',  domain: 'Security (IPsec)' },
  { pattern: 'security officer contact',    domain: 'Security (IPsec)' },
  { pattern: 'ciso contact',               domain: 'Security (IPsec)' },
  { pattern: 'fraud contact',              domain: 'Security (IPsec)' },
  { pattern: 'security contact',           domain: 'Security (IPsec)' },
  // Routing (GT) contacts
  { pattern: 'chief technology officer',   domain: 'Routing (GT)' },
  { pattern: 'cto contact',               domain: 'Routing (GT)' },
  { pattern: 'routing manager',            domain: 'Routing (GT)' },
  { pattern: 'routing contact',            domain: 'Routing (GT)' },
  { pattern: 'technical contact',          domain: 'Routing (GT)' },
  // Commercial (IOT) contacts
  { pattern: 'chief marketing officer',    domain: 'Commercial (IOT)' },
  { pattern: 'commercial manager',         domain: 'Commercial (IOT)' },
  { pattern: 'cmo contact',               domain: 'Commercial (IOT)' },
  { pattern: 'commercial contact',         domain: 'Commercial (IOT)' },
  { pattern: 'financial contact',          domain: 'Commercial (IOT)' },
  { pattern: 'billing contact',            domain: 'Commercial (IOT)' },
  // Packet Core (APN) contacts
  { pattern: 'core network contact',       domain: 'Packet Core (APN)' },
  { pattern: 'packet core contact',        domain: 'Packet Core (APN)' },
  { pattern: 'network engineer contact',   domain: 'Packet Core (APN)' },
  // Voice/SMS (IMSI) contacts
  { pattern: 'voice services contact',     domain: 'Voice/SMS (IMSI)' },
  { pattern: 'voice sms contact',          domain: 'Voice/SMS (IMSI)' },
  { pattern: 'sms contact',               domain: 'Voice/SMS (IMSI)' },
];

// ── 2. Explicit General-field patterns ───────────────────────────────────────
// Checked BEFORE keyword matching.  These fields belong to General (Admin-only)
// regardless of what section they sit under.
const EXPLICIT_GENERAL = [
  'operator name', 'country', 'network code', 'network id',
  'tadig', 'document type', 'document version',
  'effective date', 'revision', 'general contact', 'logo',
  'authorized representative', 'signatory',
];

// ── 3. Section prefix → domain mapping ───────────────────────────────────────
// domain = null  → ambiguous section, fall through to keyword matching only.
// domain = 'X'   → specific domain, but keywords may still DISAGREE and override.
//
// NOTE: The txtParser's section-header regex ( /^[A-Z0-9_\s]{3,40}$/ ) does
// NOT detect section names containing "&" (e.g. "SECURITY & CHARGING POLICY",
// "DESTINATION BANDS & CALL TYPES").  Fields from those sections land under the
// previous detected section.  Keyword matching catches them correctly, and if
// section_prefix and keyword disagree, keyword wins with a logged warning.
const SECTION_RULES = [
  // Unambiguous sections → direct domain mapping (keywords may override)
  { prefix: 'financial billing',       domain: 'Commercial (IOT)' },
  { prefix: 'destination bands',       domain: 'Commercial (IOT)' },
  { prefix: 'commercial',              domain: 'Commercial (IOT)' },
  { prefix: 'security',                domain: 'Security (IPsec)' },
  // Ambiguous sections → keyword matching decides
  { prefix: 'network technical',       domain: null },
  { prefix: 'gsma ir21',               domain: null },
  { prefix: 'operator profile',        domain: null },
  { prefix: 'general',                 domain: null },
];
// Sort longest-prefix-first for correct matching
SECTION_RULES.sort((a, b) => b.prefix.length - a.prefix.length);

// ── 4. Keyword → domain mapping (fixed precedence order) ─────────────────────
// Iterated top-to-bottom.  If a field matches keywords from multiple domains,
// the FIRST (higher-precedence) domain wins and the conflict is logged.
//
// PRECEDENCE ORDER (highest → lowest):
//   1. Security (IPsec)
//   2. Routing (GT)
//   3. Packet Core (APN)
//   4. Voice/SMS (IMSI)
//   5. Commercial (IOT)
const KEYWORD_RULES = [
  { domain: 'Security (IPsec)', keywords: [
    'ipsec', 'vpn', 'crypto', 'encryption', 'authentication', 'ciphering',
    'firewall', 'steering of roaming', 'steering', 'ip security',
  ]},
  { domain: 'Routing (GT)', keywords: [
    'global title', 'sccp', 'signalling', 'signaling', 'point code',
    'stp', 'ss7', 'interconnect',
  ]},
  { domain: 'Packet Core (APN)', keywords: [
    'apn', 'pgw', 'sgw', 'epc', 'ggsn', 'sgsn', 'diameter', 'grx', 'ipx',
  ]},
  { domain: 'Voice/SMS (IMSI)', keywords: [
    'imsi', 'msc', 'vlr', 'hlr', 'camel',
    'msisdn', 'msrn', 'number range', 'sms range', 'sms center',
    'smsc', 'voice profile', 'short number',
  ]},
  { domain: 'Commercial (IOT)', keywords: [
    'iot', 'tariff', 'rate', 'discount', 'wholesale', 'billing',
    'settlement', 'currency', 'tap file', 'clearing house',
    'moc', 'mtc', 'tax', 'vat', 'invoice',
  ]},
];

// ── 5. Hidden fields ─────────────────────────────────────────────────────────
// Fields that exist in extracted_fields but should be hidden in the viewer
// and blocked from editing.  Do NOT change the parser to remove them —
// that would create false diffs against versions already in the DB.
const HIDDEN_FIELDS = [
  'General.Header',   // CSV parser artifact: column header row parsed as data
];

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Classify a field path into its owning domain.
 *
 * Classification tiers (evaluated in order):
 *   1. Contact override   — explicit contact-block → domain map
 *   2. Explicit general    — known operator-profile fields → General
 *   3. Section prefix      — unambiguous section headers (may be overridden by keywords)
 *      +  Keyword matching — token-based keyword → domain with fixed precedence
 *      If section_prefix and keyword DISAGREE, keyword wins and the
 *      disagreement is logged.  This handles parser misclassification
 *      (e.g. txtParser missing section headers that contain "&").
 *   4. Fallback            — no match → General (Admin-only)
 *
 * @param  {string} fieldPath  SAR-formatted path e.g. "NETWORK TECHNICAL.HLR Global Title"
 * @return {{ domain: string, source: string, match: string|null }}
 */
function getFieldOwner(fieldPath) {
  // Full-path tokens: used for contact_override and explicit_general only.
  // These two tiers intentionally match on the full path because their
  // patterns (e.g. "fraud contact", "operator name") appear in the label
  // and never conflict with section names.
  const tokens = tokenize(fieldPath);

  // ── 1. Contact override (highest precedence) ──────────────────────────────
  for (const override of CONTACT_OVERRIDES) {
    if (tokensMatch(tokens, override.pattern)) {
      return { domain: override.domain, source: 'contact_override', match: override.pattern };
    }
  }

  // ── 2. Explicit General patterns ──────────────────────────────────────────
  for (const pattern of EXPLICIT_GENERAL) {
    if (tokensMatch(tokens, pattern)) {
      return { domain: 'General', source: 'explicit_general', match: pattern };
    }
  }

  // ── 3a. Section prefix ────────────────────────────────────────────────────
  // Classify using the section part only (left of the first '.').
  const dotIdx = fieldPath.indexOf('.');
  const section = dotIdx >= 0 ? fieldPath.substring(0, dotIdx) : '';
  const sectionLower = section.toLowerCase().trim();

  // Extract the label (right of the first '.') for keyword matching.
  // Keyword matching uses the LABEL ONLY — never the section — to prevent
  // section-name tokens from leaking into domain classification.
  // e.g. 'FINANCIAL BILLING.IPsec Policy' must not let 'billing' (Commercial)
  // shadow the label's 'ipsec' (Security).
  const label = dotIdx >= 0 ? fieldPath.substring(dotIdx + 1) : fieldPath;
  const labelTokens = tokenize(label);

  let sectionDomain;   // undefined = no rule matched
  for (const rule of SECTION_RULES) {
    if (sectionLower === rule.prefix || sectionLower.startsWith(rule.prefix)) {
      sectionDomain = rule.domain;   // null = ambiguous, string = specific
      break;
    }
  }

  // ── 3b. Keyword matching on LABEL TOKENS ONLY ─────────────────────────────
  // If the label alone matches keywords from two or more different domains,
  // the field is Admin-only (General).  No precedence winner — an ambiguous
  // label must be resolved by adding it to CONTACT_OVERRIDES or
  // EXPLICIT_GENERAL, not by arbitrary precedence.
  const allKeywordMatches = [];
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (tokensMatch(labelTokens, kw)) {
        allKeywordMatches.push({ domain: rule.domain, keyword: kw });
      }
    }
  }

  const uniqueKeywordDomains = [...new Set(allKeywordMatches.map(m => m.domain))];

  // Multi-domain label conflict → Admin-only, no permission granted to any approver
  if (uniqueKeywordDomains.length > 1) {
    console.warn(
      `[fieldOwnership] Label multi-domain conflict for "${fieldPath}" ` +
      `(label: "${label}"): ` +
      allKeywordMatches.map(m => `${m.domain}("${m.keyword}")`).join(', ') +
      `. Assigned to General (Admin-only). Add to CONTACT_OVERRIDES or ` +
      `EXPLICIT_GENERAL to resolve deterministically.`
    );
    return { domain: 'General', source: 'admin_multi_domain_conflict', match: null };
  }

  const keywordDomain = allKeywordMatches.length > 0 ? allKeywordMatches[0].domain : null;
  const keywordMatch  = allKeywordMatches.length > 0 ? allKeywordMatches[0].keyword : null;

  // ── 3c. Resolve section vs keyword ────────────────────────────────────────
  if (typeof sectionDomain === 'string') {
    // Section has a specific domain.  Check if the label's keyword disagrees.
    if (keywordDomain && keywordDomain !== sectionDomain) {
      // Label keyword is more specific than section → keyword wins, log it.
      console.warn(
        `[fieldOwnership] Section/keyword disagreement for "${fieldPath}": ` +
        `section="${sectionDomain}" vs label keyword="${keywordDomain}"("${keywordMatch}"). ` +
        `Using label keyword result.`
      );
      return { domain: keywordDomain, source: 'keyword_over_section', match: keywordMatch };
    }
    // Agree or no keyword match: section is authoritative
    return { domain: sectionDomain, source: 'section_prefix', match: sectionLower };
  }

  // Section is null (ambiguous) or undefined (no rule matched): label keyword decides
  if (keywordDomain) {
    return { domain: keywordDomain, source: 'keyword', match: keywordMatch };
  }

  // ── 4. Default → General (Admin-only) ─────────────────────────────────────
  return { domain: 'General', source: 'fallback', match: null };
}

/**
 * Check whether a field should be hidden from the viewer entirely.
 */
function isFieldHidden(fieldPath) {
  return HIDDEN_FIELDS.includes(fieldPath);
}

/**
 * Check whether a specific user can edit a specific field.
 * Used by BOTH the GET viewer (editable flag) and the PATCH endpoint.
 *
 * @param  {string}        fieldPath           SAR field path
 * @param  {string}        userRole            'Admin'|'Approver'|'Analyst'|'CPO/Exec'|'Auditor'
 * @param  {string|null}   approvedDomains     JSON string array or null
 * @param  {string}        [precomputedDomain] Optional: domain already resolved by getFieldOwnerWithCatalog.
 *                                             When provided, skips the getFieldOwner() call.
 * @return {boolean}
 */
function isFieldEditable(fieldPath, userRole, approvedDomains, precomputedDomain) {
  // Hidden fields are never editable
  if (isFieldHidden(fieldPath)) return false;

  const domain = precomputedDomain !== undefined ? precomputedDomain : getFieldOwner(fieldPath).domain;

  // Admin: can edit General fields only (operator profile / metadata)
  if (userRole === 'Admin') {
    return domain === 'General';
  }

  // Approver: can edit fields in their own approved domain(s) — NOT General
  if (userRole === 'Approver') {
    if (domain === 'General') return false;
    const domains = typeof approvedDomains === 'string'
      ? JSON.parse(approvedDomains)
      : (approvedDomains || []);
    return domains.includes(domain);
  }

  // Analyst, CPO/Exec, Auditor: view only
  return false;
}

/**
 * Returns the Set of field paths this user can edit within a given field map.
 */
function getEditableFields(fields, userRole, approvedDomains) {
  const editable = new Set();
  for (const fieldPath of Object.keys(fields)) {
    if (isFieldEditable(fieldPath, userRole, approvedDomains)) {
      editable.add(fieldPath);
    }
  }
  return editable;
}

/**
 * In-memory catalog overrides — mirrors the field_catalog seed rows.
 * Used by the golden test (which has no DB) to inject the same classification
 * tier without hitting a database.
 *
 * Keys:  normalised label (lowercase, single space), case-insensitive match.
 * Values: { domain, source, pending_owner_confirmation }
 *
 * When the DB table diverges from this map (i.e. someone updated field_catalog
 * without updating this), the golden test will catch it because the route layer
 * (which reads DB) would return a different result from the golden test
 * (which reads this map).
 */
const CATALOG_OVERRIDES = new Map([
  // field_label (normalised) → catalog entry
  ['hlr global title', {
    domain: 'Routing (GT)',
    source: 'catalog_pending',
    pending_owner_confirmation: true,
    notes: 'Auto-resolved conflict: pending sign-off by Routing (GT) and Voice/SMS (IMSI) owners.',
  }],
]);

/**
 * Async version of getFieldOwner that checks the field_catalog DB table first.
 *
 * Priority:
 *   1. contact_override  (in-code, handled by sync getFieldOwner)
 *   2. explicit_general  (in-code, handled by sync getFieldOwner)
 *   3. field_catalog     ← DB lookup by label (case-insensitive, doc_type '*' or exact)
 *   4. section_prefix / keyword / fallback  (handled by sync getFieldOwner)
 *
 * @param {string} fieldPath  - Full field path, e.g. "NETWORK TECHNICAL.HLR Global Title"
 * @param {object} db         - Knex instance
 * @param {string} [docType]  - Document type for catalog lookup ('IR21', 'RAEX', …)
 * @returns {Promise<{domain: string, source: string, match: string|null, pending_owner_confirmation?: boolean}>}
 */
async function getFieldOwnerWithCatalog(fieldPath, db, docType = '*') {
  const dotIdx = fieldPath.indexOf('.');
  const label  = (dotIdx >= 0 ? fieldPath.substring(dotIdx + 1) : fieldPath).trim();
  const labelNorm = label.toLowerCase();

  // ── 1-2. contact_override + explicit_general: handled by sync path
  //    Run them first to catch early exits before hitting the DB
  const syncResult = getFieldOwner(fieldPath);
  if (syncResult.source === 'contact_override' || syncResult.source === 'explicit_general') {
    return syncResult;
  }

  // ── 3. Field catalog — DB lookup ─────────────────────────────────────────────
  // Match doc_type exactly or '*' (wildcard). Exact doc_type wins over '*'.
  const catalogRows = await db('field_catalog')
    .whereRaw('LOWER(field_label) = ?', [labelNorm])
    .whereIn('doc_type', [docType, '*'])
    .orderByRaw("CASE WHEN doc_type = ? THEN 0 ELSE 1 END", [docType])
    .limit(1);

  if (catalogRows.length > 0) {
    const row = catalogRows[0];
    const source = row.pending_owner_confirmation ? 'catalog_pending' : 'catalog_confirmed';
    return {
      domain: row.domain,
      source,
      match: row.field_label,
      pending_owner_confirmation: !!row.pending_owner_confirmation,
    };
  }

  // ── 4. Fall back to sync classification (section + keyword) ──────────────────
  return syncResult;
}

module.exports = {
  getFieldOwner,
  getFieldOwnerWithCatalog,
  isFieldEditable,
  isFieldHidden,
  getEditableFields,
  CATALOG_OVERRIDES,
  // Exported for test introspection:
  tokenize,
  tokensMatch,
  CONTACT_OVERRIDES,
  KEYWORD_RULES,
  SECTION_RULES,
  EXPLICIT_GENERAL,
  HIDDEN_FIELDS,
};
