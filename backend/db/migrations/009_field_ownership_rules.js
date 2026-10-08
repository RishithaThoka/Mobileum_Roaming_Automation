'use strict';

/**
 * Migration 009: field_ownership_rules
 *
 * Rules-as-data (B1). Seeds from the current hardcoded arrays in
 * fieldOwnership.js so the engine starts with identical behaviour.
 *
 * rule_type values:
 *   'keyword'          – keyword → domain mapping (label-only matching)
 *   'section'          – section prefix → domain mapping (null domain = ambiguous)
 *   'explicit_general' – label → General (Admin-only)
 *   'contact_override' – label pattern → domain (contact block rules)
 *   'hidden'           – label → hidden from viewer
 *
 * Also creates the ruleset_version table (one-row global counter).
 */

const { v4: uuid } = require('uuid');

exports.up = async function (db) {
  // ── ruleset_version (global counter for all rule/catalog/override changes) ──
  await db.schema.createTable('ruleset_version', (t) => {
    t.integer('version').notNullable().defaultTo(1);
    t.string('updated_at').notNullable();
  });

  // ── field_ownership_rules ─────────────────────────────────────────────────
  await db.schema.createTable('field_ownership_rules', (t) => {
    t.string('id').primary();
    t.string('rule_type').notNullable();   // keyword|section|explicit_general|contact_override|hidden
    t.string('pattern').notNullable();     // keyword string, section prefix, label pattern
    t.string('domain').nullable();         // null for explicit_general (always General) and hidden
    t.string('doc_type').notNullable().defaultTo('*');
    t.integer('priority').notNullable().defaultTo(0);   // higher = evaluated first in same type
    t.integer('is_active').notNullable().defaultTo(1);  // soft delete
    t.string('notes').nullable();
    t.string('created_by').nullable();
    t.string('created_at').notNullable();
    t.string('updated_at').notNullable();
  });

  const now = new Date().toISOString();

  // Helper
  const row = (rule_type, pattern, domain, priority = 0) => ({
    id: uuid(),
    rule_type,
    pattern,
    domain: domain || null,
    doc_type: '*',
    priority,
    is_active: 1,
    notes: 'Seeded from fieldOwnership.js on migration 009',
    created_by: 'system',
    created_at: now,
    updated_at: now,
  });

  // ── Seed: CONTACT_OVERRIDE rules ─────────────────────────────────────────
  const contactRules = [
    // Security (IPsec) contacts
    ['chief information security', 'Security (IPsec)', 100],
    ['security officer contact',   'Security (IPsec)', 99],
    ['ciso contact',               'Security (IPsec)', 98],
    ['fraud contact',              'Security (IPsec)', 97],
    ['security contact',           'Security (IPsec)', 96],
    // Routing (GT) contacts
    ['chief technology officer',   'Routing (GT)', 95],
    ['cto contact',                'Routing (GT)', 94],
    ['routing manager',            'Routing (GT)', 93],
    ['routing contact',            'Routing (GT)', 92],
    ['technical contact',          'Routing (GT)', 91],
    // Commercial (IOT) contacts
    ['chief marketing officer',    'Commercial (IOT)', 90],
    ['commercial manager',         'Commercial (IOT)', 89],
    ['cmo contact',                'Commercial (IOT)', 88],
    ['commercial contact',         'Commercial (IOT)', 87],
    ['financial contact',          'Commercial (IOT)', 86],
    ['billing contact',            'Commercial (IOT)', 85],
    // Packet Core (APN) contacts
    ['core network contact',       'Packet Core (APN)', 84],
    ['packet core contact',        'Packet Core (APN)', 83],
    ['network engineer contact',   'Packet Core (APN)', 82],
    // Voice/SMS (IMSI) contacts
    ['voice services contact',     'Voice/SMS (IMSI)', 81],
    ['voice sms contact',          'Voice/SMS (IMSI)', 80],
    ['sms contact',                'Voice/SMS (IMSI)', 79],
  ];
  await db('field_ownership_rules').insert(
    contactRules.map(([p, d, pri]) => row('contact_override', p, d, pri))
  );

  // ── Seed: EXPLICIT_GENERAL rules ─────────────────────────────────────────
  const explicitGeneralPatterns = [
    'operator name', 'country', 'network code', 'network id',
    'tadig', 'document type', 'document version',
    'effective date', 'revision', 'general contact', 'logo',
    'authorized representative', 'signatory',
  ];
  await db('field_ownership_rules').insert(
    explicitGeneralPatterns.map((p, i) => row('explicit_general', p, null, 50 - i))
  );

  // ── Seed: SECTION rules ───────────────────────────────────────────────────
  const sectionRules = [
    // Unambiguous sections
    ['financial billing',  'Commercial (IOT)', 40],
    ['destination bands',  'Commercial (IOT)', 39],
    ['commercial',         'Commercial (IOT)', 38],
    ['security',           'Security (IPsec)', 37],
    // Ambiguous sections (domain=null → keyword matching decides)
    ['network technical',  null, 30],
    ['gsma ir21',          null, 29],
    ['operator profile',   null, 28],
    ['general',            null, 27],
  ];
  await db('field_ownership_rules').insert(
    sectionRules.map(([p, d, pri]) => row('section', p, d, pri))
  );

  // ── Seed: KEYWORD rules ───────────────────────────────────────────────────
  // Precedence order: Security → Routing → Packet Core → Voice/SMS → Commercial
  const keywordRules = [
    // Security (IPsec) — priority 50..40
    ['ipsec',              'Security (IPsec)', 50],
    ['vpn',               'Security (IPsec)', 49],
    ['crypto',            'Security (IPsec)', 48],
    ['encryption',        'Security (IPsec)', 47],
    ['authentication',    'Security (IPsec)', 46],
    ['ciphering',         'Security (IPsec)', 45],
    ['firewall',          'Security (IPsec)', 44],
    ['steering of roaming','Security (IPsec)',43],
    ['steering',          'Security (IPsec)', 42],
    ['ip security',       'Security (IPsec)', 41],
    // Routing (GT) — priority 39..32
    ['global title',      'Routing (GT)', 39],
    ['sccp',              'Routing (GT)', 38],
    ['signalling',        'Routing (GT)', 37],
    ['signaling',         'Routing (GT)', 36],
    ['point code',        'Routing (GT)', 35],
    ['stp',               'Routing (GT)', 34],
    ['ss7',               'Routing (GT)', 33],
    ['interconnect',      'Routing (GT)', 32],
    // Packet Core (APN) — priority 31..23
    ['apn',               'Packet Core (APN)', 31],
    ['pgw',               'Packet Core (APN)', 30],
    ['sgw',               'Packet Core (APN)', 29],
    ['epc',               'Packet Core (APN)', 28],
    ['ggsn',              'Packet Core (APN)', 27],
    ['sgsn',              'Packet Core (APN)', 26],
    ['diameter',          'Packet Core (APN)', 25],
    ['grx',               'Packet Core (APN)', 24],
    ['ipx',               'Packet Core (APN)', 23],
    // Voice/SMS (IMSI) — priority 22..11
    ['imsi',              'Voice/SMS (IMSI)', 22],
    ['msc',               'Voice/SMS (IMSI)', 21],
    ['vlr',               'Voice/SMS (IMSI)', 20],
    ['hlr',               'Voice/SMS (IMSI)', 19],
    ['camel',             'Voice/SMS (IMSI)', 18],
    ['msisdn',            'Voice/SMS (IMSI)', 17],
    ['msrn',              'Voice/SMS (IMSI)', 16],
    ['number range',      'Voice/SMS (IMSI)', 15],
    ['sms range',         'Voice/SMS (IMSI)', 14],
    ['sms center',        'Voice/SMS (IMSI)', 13],
    ['smsc',              'Voice/SMS (IMSI)', 12],
    ['voice profile',     'Voice/SMS (IMSI)', 11],
    ['short number',      'Voice/SMS (IMSI)', 10],
    // Commercial (IOT) — priority 9..0
    ['iot',               'Commercial (IOT)', 9],
    ['tariff',            'Commercial (IOT)', 8],
    ['rate',              'Commercial (IOT)', 7],
    ['discount',          'Commercial (IOT)', 6],
    ['wholesale',         'Commercial (IOT)', 5],
    ['billing',           'Commercial (IOT)', 4],
    ['settlement',        'Commercial (IOT)', 3],
    ['currency',          'Commercial (IOT)', 2],
    ['tap file',          'Commercial (IOT)', 2],
    ['clearing house',    'Commercial (IOT)', 2],
    ['moc',               'Commercial (IOT)', 2],
    ['mtc',               'Commercial (IOT)', 2],
    ['tax',               'Commercial (IOT)', 2],
    ['vat',               'Commercial (IOT)', 2],
    ['invoice',           'Commercial (IOT)', 2],
  ];
  await db('field_ownership_rules').insert(
    keywordRules.map(([p, d, pri]) => row('keyword', p, d, pri))
  );

  // ── Seed: HIDDEN rules ────────────────────────────────────────────────────
  await db('field_ownership_rules').insert([
    row('hidden', 'General.Header', null, 100),
  ]);

  // ── Initialise ruleset_version ────────────────────────────────────────────
  await db('ruleset_version').insert({ version: 1, updated_at: now });
};

exports.down = async function (db) {
  await db.schema.dropTableIfExists('field_ownership_rules');
  await db.schema.dropTableIfExists('ruleset_version');
};
