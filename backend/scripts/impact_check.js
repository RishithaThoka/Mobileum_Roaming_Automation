'use strict';
/**
 * scripts/impact_check.js
 *
 * Shows which fields in the 64-entry GOLDEN set would change owner under
 * label-only keyword matching.  Reads the real GOLDEN array from
 * tests/goldenData.js — no hardcoded path list.
 *
 * Usage:  node scripts/impact_check.js
 */

const path = require('path');
const { GOLDEN, REGRESSION_TESTS } = require(path.join(__dirname, '..', 'tests', 'goldenData'));
const { getFieldOwner, CATALOG_OVERRIDES } = require(path.join(__dirname, '..', 'services', 'fieldOwnership'));

// ── Inline label-only keyword analysis (mirrors the label-only matching rules) ─

const KEYWORD_RULES = [
  { domain: 'Security (IPsec)', keywords: [
    'ipsec','vpn','crypto','encryption','authentication','ciphering',
    'firewall','steering of roaming','steering','ip security',
  ]},
  { domain: 'Routing (GT)', keywords: [
    'global title','sccp','signalling','signaling','point code',
    'stp','ss7','interconnect',
  ]},
  { domain: 'Packet Core (APN)', keywords: [
    'apn','pgw','sgw','epc','ggsn','sgsn','diameter','grx','ipx',
  ]},
  { domain: 'Voice/SMS (IMSI)', keywords: [
    'imsi','msc','vlr','hlr','camel',
    'msisdn','msrn','number range','sms range','sms center',
    'smsc','voice profile','short number',
  ]},
  { domain: 'Commercial (IOT)', keywords: [
    'iot','tariff','rate','discount','wholesale','billing',
    'settlement','currency','tap file','clearing house',
    'moc','mtc','tax','vat','invoice',
  ]},
];

function tokenize(s) {
  return String(s).toLowerCase().split(/[\s._\-/]+/).filter(Boolean);
}
function tokensMatch(tokens, pattern) {
  const pt = pattern.toLowerCase().split(/\s+/);
  if (pt.length === 1) return tokens.includes(pt[0]);
  for (let i = 0; i <= tokens.length - pt.length; i++) {
    if (pt.every((p, j) => tokens[i + j] === p)) return true;
  }
  return false;
}

// Combine GOLDEN + REGRESSION_TESTS for full coverage
const ALL_ENTRIES = [...GOLDEN, ...REGRESSION_TESTS];

console.log('Label-only keyword matching — impact analysis');
console.log(`Source: ${ALL_ENTRIES.length} entries from GOLDEN + REGRESSION_TESTS\n`);

let conflicts = 0;
let changed   = 0;
let unchanged = 0;

for (const entry of ALL_ENTRIES) {
  const fp = entry.path;
  const expectedDomain = entry.domain;

  const dot = fp.indexOf('.');
  const label = dot >= 0 ? fp.substring(dot + 1) : fp;
  const lt = tokenize(label);

  // Check catalog first
  const catalogKey = label.trim().toLowerCase();
  if (CATALOG_OVERRIDES.has(catalogKey)) {
    const catalogResult = CATALOG_OVERRIDES.get(catalogKey);
    const same = catalogResult.domain === expectedDomain;
    if (!same) {
      console.log(`CATALOG   ${fp}`);
      console.log(`  catalog resolves to ${catalogResult.domain}, golden expects ${expectedDomain}`);
    } else {
      unchanged++;
    }
    continue;
  }

  // Label-only keyword scan
  const hits = [];
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (tokensMatch(lt, kw)) hits.push({ domain: rule.domain, keyword: kw });
    }
  }
  const uniqueDomains = [...new Set(hits.map(h => h.domain))];

  if (uniqueDomains.length > 1) {
    const newDomain = 'General (admin_multi_domain_conflict)';
    const isChange = expectedDomain !== 'General';
    console.log(`CONFLICT  ${fp}`);
    console.log(`  label "${label}" tokens: [${lt.join(', ')}]`);
    console.log(`  hits: ${hits.map(h => `${h.domain}("${h.keyword}")`).join(', ')}`);
    if (isChange) {
      console.log(`  was: ${expectedDomain}  →  new: ${newDomain}`);
      changed++;
    } else {
      console.log(`  already General → no change`);
      unchanged++;
    }
    console.log('');
    conflicts++;
  } else {
    const resolvedDomain = uniqueDomains[0] || 'General';
    if (resolvedDomain !== expectedDomain && expectedDomain !== '(new)') {
      console.log(`CHANGED   ${fp}: ${expectedDomain} → ${resolvedDomain}`);
      changed++;
    } else {
      unchanged++;
    }
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${conflicts} multi-domain conflict(s) → General (admin_multi_domain_conflict)`);
console.log(`  ${changed} domain assignment(s) change`);
console.log(`  ${unchanged} unchanged`);
console.log(`  ${ALL_ENTRIES.length} total entries analysed`);
