'use strict';

/**
 * tests/goldenData.js
 *
 * Pure data module — no assertions, no side effects.
 * Required by both test_field_ownership_golden.js and scripts/impact_check.js.
 *
 * GOLDEN:          64 field paths → expected { domain, source } (+ optional hidden flag)
 * CONFLICT_CHECKS: 3 paths that must produce admin_multi_domain_conflict
 * REGRESSION_TESTS: 4 label-only-leakage paths
 * PERMISSION_CHECKS: 21 role × field permission expectations
 */

// ─── GOLDEN ──────────────────────────────────────────────────────────────────

const GOLDEN = [
  // ── T-Mobile IR21 (T-Mobile_IR21_v1.txt) ──────────────────────────────── [13]
  { path: 'OPERATOR PROFILE.Operator Name',                    domain: 'General',           source: 'explicit_general' },
  { path: 'OPERATOR PROFILE.Country',                          domain: 'General',           source: 'explicit_general' },
  { path: 'OPERATOR PROFILE.Network Code',                     domain: 'General',           source: 'explicit_general' },
  { path: 'OPERATOR PROFILE.Document Type',                    domain: 'General',           source: 'explicit_general' },
  { path: 'NETWORK TECHNICAL.HLR Global Title',                domain: 'Routing (GT)',      source: 'catalog_pending' },
  { path: 'NETWORK TECHNICAL.Signalling Point Code',           domain: 'Routing (GT)',      source: 'keyword' },
  { path: 'NETWORK TECHNICAL.GRX IPX Provider',                domain: 'Packet Core (APN)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL.APN Roaming',                     domain: 'Packet Core (APN)', source: 'keyword' },
  { path: 'FINANCIAL BILLING.Wholesale Voice Rate',             domain: 'Commercial (IOT)',  source: 'section_prefix' },
  { path: 'FINANCIAL BILLING.Wholesale Data Rate Per MB',       domain: 'Commercial (IOT)',  source: 'section_prefix' },
  { path: 'FINANCIAL BILLING.Currency',                         domain: 'Commercial (IOT)',  source: 'section_prefix' },
  { path: 'SECURITY.Fraud Contact Email',                       domain: 'Security (IPsec)',  source: 'contact_override' },
  { path: 'SECURITY.Steering Of Roaming Supported',             domain: 'Security (IPsec)',  source: 'section_prefix' },

  // ── Orange RAEX (RAEX_IOT_Orange_v1.txt) ─────────────────────────────── [17]
  // Parser misses "DESTINATION BANDS & CALL TYPES" and "SECURITY & CHARGING
  // POLICY" (& not matched by regex).  Rate fields land under OPERATOR PROFILE,
  // security fields under NETWORK TECHNICAL CONFIG.  Keywords classify correctly.
  { path: 'OPERATOR PROFILE.Operator Name',                    domain: 'General',           source: 'explicit_general' },
  { path: 'OPERATOR PROFILE.Country',                          domain: 'General',           source: 'explicit_general' },
  { path: 'OPERATOR PROFILE.Network ID',                       domain: 'General',           source: 'explicit_general' },
  { path: 'OPERATOR PROFILE.Document Type',                    domain: 'General',           source: 'explicit_general' },
  { path: 'OPERATOR PROFILE.MOC National Rate',                domain: 'Commercial (IOT)',  source: 'keyword' },
  { path: 'OPERATOR PROFILE.MOC International Rate',           domain: 'Commercial (IOT)',  source: 'keyword' },
  { path: 'OPERATOR PROFILE.MTC Voice Rate',                   domain: 'Commercial (IOT)',  source: 'keyword' },
  { path: 'OPERATOR PROFILE.MOC SMS Rate',                     domain: 'Commercial (IOT)',  source: 'keyword' },
  { path: 'OPERATOR PROFILE.PS Data Rate Per MB',              domain: 'Commercial (IOT)',  source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.HLR Global Title',         domain: 'Routing (GT)',      source: 'catalog_pending' },
  { path: 'NETWORK TECHNICAL CONFIG.Signalling Point Code',    domain: 'Routing (GT)',      source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.GRX IPX Provider',         domain: 'Packet Core (APN)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.APN Roaming',              domain: 'Packet Core (APN)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.Steering Of Roaming Supported', domain: 'Security (IPsec)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.Fraud Contact Email',      domain: 'Security (IPsec)',  source: 'contact_override' },
  { path: 'NETWORK TECHNICAL CONFIG.Tax Policy Standard VAT',  domain: 'Commercial (IOT)',  source: 'keyword' },

  // ── T-Mobile US DOCX (TMobileUS_IR21_v1.docx.txt) ────────────────────── [13]
  // Parser misses "SECURITY & CHARGING POLICY" — billing + security fields
  // land under NETWORK TECHNICAL CONFIG.  Keywords classify correctly.
  { path: 'GSMA IR21 OPERATOR DOCUMENT.Operator Name',         domain: 'General',           source: 'explicit_general' },
  { path: 'GSMA IR21 OPERATOR DOCUMENT.Country',               domain: 'General',           source: 'explicit_general' },
  { path: 'GSMA IR21 OPERATOR DOCUMENT.TADIG Code',            domain: 'General',           source: 'explicit_general' },
  { path: 'GSMA IR21 OPERATOR DOCUMENT.Document Type',         domain: 'General',           source: 'explicit_general' },
  { path: 'NETWORK TECHNICAL CONFIG.HLR Global Title',         domain: 'Routing (GT)',      source: 'catalog_pending' },
  { path: 'NETWORK TECHNICAL CONFIG.Signalling Point Code',    domain: 'Routing (GT)',      source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.GRX IPX Provider',         domain: 'Packet Core (APN)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.APN Roaming',             domain: 'Packet Core (APN)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.Steering Of Roaming Supported', domain: 'Security (IPsec)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.Fraud Contact Email',      domain: 'Security (IPsec)',  source: 'contact_override' },
  { path: 'NETWORK TECHNICAL CONFIG.Wholesale Voice Rate',     domain: 'Commercial (IOT)',  source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.Wholesale Data Rate Per MB', domain: 'Commercial (IOT)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL CONFIG.Currency',                 domain: 'Commercial (IOT)',  source: 'keyword' },

  // ── Bharti Airtel India (IR21-_Bharti...doc.txt) ─────────────────────── [11]
  // Parser misses "SECURITY & OPERATIONS" — security fields land under
  // NETWORK TECHNICAL DETAILS.  Keywords classify correctly.
  { path: 'GSMA IR21 OPERATOR DOCUMENT.Operator Name',         domain: 'General',           source: 'explicit_general' },
  { path: 'GSMA IR21 OPERATOR DOCUMENT.Country',               domain: 'General',           source: 'explicit_general' },
  { path: 'GSMA IR21 OPERATOR DOCUMENT.TADIG Code',            domain: 'General',           source: 'explicit_general' },
  { path: 'GSMA IR21 OPERATOR DOCUMENT.Document Type',         domain: 'General',           source: 'explicit_general' },
  { path: 'NETWORK TECHNICAL DETAILS.HLR Global Title',        domain: 'Routing (GT)',      source: 'catalog_pending' },
  { path: 'NETWORK TECHNICAL DETAILS.Signalling Point Code',   domain: 'Routing (GT)',      source: 'keyword' },
  { path: 'NETWORK TECHNICAL DETAILS.GRX IPX Provider',        domain: 'Packet Core (APN)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL DETAILS.APN Roaming',             domain: 'Packet Core (APN)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL DETAILS.Steering Of Roaming Supported', domain: 'Security (IPsec)', source: 'keyword' },
  { path: 'NETWORK TECHNICAL DETAILS.Fraud Contact Email',     domain: 'Security (IPsec)',  source: 'contact_override' },
  { path: 'NETWORK TECHNICAL DETAILS.Support Hours',           domain: 'General',           source: 'fallback' },

  // ── Singtel CSV (Singtel_IR21_v1.csv) ────────────────────────────────── [10]
  // CSV has no section headers — everything under "General".  Keywords classify.
  // General.Header is hidden (not editable by anyone); counted below.
  { path: 'General.Header',                                    domain: 'General',           source: 'fallback', hidden: true },
  { path: 'General.Operator Name',                             domain: 'General',           source: 'explicit_general' },
  { path: 'General.Country',                                   domain: 'General',           source: 'explicit_general' },
  { path: 'General.Network Code',                              domain: 'General',           source: 'explicit_general' },
  { path: 'General.Document Type',                             domain: 'General',           source: 'explicit_general' },
  { path: 'General.IMSI Range',                                domain: 'Voice/SMS (IMSI)',  source: 'keyword' },
  { path: 'General.HLR Global Title',                          domain: 'Routing (GT)',      source: 'catalog_pending' },
  { path: 'General.Wholesale Tariff Rate',                     domain: 'Commercial (IOT)',  source: 'keyword' },
  { path: 'General.Signalling Point Code',                     domain: 'Routing (GT)',      source: 'keyword' },
  { path: 'General.Security Fraud Contact',                    domain: 'Security (IPsec)',  source: 'contact_override' },
  { path: 'General.Legal Jurisdiction',                        domain: 'General',           source: 'fallback' },
];
// T-Mobile=13, Orange=17, TMobileUS=13, Bharti=11, Singtel=11 → 65 entries (incl. hidden Header)

// ─── CONFLICT_CHECKS ──────────────────────────────────────────────────────────

const CONFLICT_CHECKS = [
  { path: 'NETWORK TECHNICAL.HLR Global Title',         conflictDomains: ['Routing (GT)', 'Voice/SMS (IMSI)'] },
  { path: 'NETWORK TECHNICAL CONFIG.HLR Global Title',  conflictDomains: ['Routing (GT)', 'Voice/SMS (IMSI)'] },
  { path: 'General.HLR Global Title',                   conflictDomains: ['Routing (GT)', 'Voice/SMS (IMSI)'] },
];

// ─── REGRESSION_TESTS ─────────────────────────────────────────────────────────

const REGRESSION_TESTS = [
  // Section word 'authentication' must NOT leak into keyword matching.
  { path: 'AUTHENTICATION POLICY.Tariff Code',     domain: 'Commercial (IOT)',  source: 'keyword' },
  // Label 'IPsec Policy' → Security keyword overrides Commercial section.
  { path: 'FINANCIAL BILLING.IPsec Policy',        domain: 'Security (IPsec)', source: 'keyword_over_section' },
  // Label 'Something Unrelated' → no keyword → section (Commercial) wins.
  { path: 'FINANCIAL BILLING.Something Unrelated', domain: 'Commercial (IOT)', source: 'section_prefix' },
  // Label 'Currency' → Commercial keyword overrides Security section.
  { path: 'SECURITY.Currency',                     domain: 'Commercial (IOT)', source: 'keyword_over_section' },
];

// ─── PERMISSION_CHECKS ────────────────────────────────────────────────────────

const PERMISSION_CHECKS = [
  // Admin can edit General fields
  { path: 'OPERATOR PROFILE.Operator Name',             role: 'Admin',    domains: null,                    expect: true },
  { path: 'OPERATOR PROFILE.Country',                   role: 'Admin',    domains: null,                    expect: true },
  // Admin CANNOT edit catalog-resolved Routing fields (domain ≠ General)
  { path: 'NETWORK TECHNICAL.HLR Global Title',         role: 'Admin',    domains: null,                    expect: false },
  { path: 'SECURITY.Fraud Contact Email',               role: 'Admin',    domains: null,                    expect: false },
  { path: 'FINANCIAL BILLING.Currency',                  role: 'Admin',    domains: null,                    expect: false },
  // Security Approver: can edit Security, cannot edit others
  { path: 'SECURITY.Steering Of Roaming Supported',     role: 'Approver', domains: '[\"Security (IPsec)\"]',  expect: true },
  { path: 'SECURITY.Fraud Contact Email',               role: 'Approver', domains: '[\"Security (IPsec)\"]',  expect: true },
  { path: 'NETWORK TECHNICAL.HLR Global Title',         role: 'Approver', domains: '[\"Security (IPsec)\"]',  expect: false },
  { path: 'FINANCIAL BILLING.Currency',                  role: 'Approver', domains: '[\"Security (IPsec)\"]',  expect: false },
  { path: 'OPERATOR PROFILE.Country',                   role: 'Approver', domains: '[\"Security (IPsec)\"]',  expect: false },
  // Routing Approver: HLR catalog_pending → Routing (GT) → CAN edit
  { path: 'NETWORK TECHNICAL.HLR Global Title',         role: 'Approver', domains: '[\"Routing (GT)\"]',      expect: true },
  { path: 'NETWORK TECHNICAL.Signalling Point Code',    role: 'Approver', domains: '[\"Routing (GT)\"]',      expect: true },
  // Commercial Approver
  { path: 'FINANCIAL BILLING.Currency',                  role: 'Approver', domains: '[\"Commercial (IOT)\"]',  expect: true },
  { path: 'OPERATOR PROFILE.MOC National Rate',         role: 'Approver', domains: '[\"Commercial (IOT)\"]',  expect: true },
  // Packet Core Approver
  { path: 'NETWORK TECHNICAL.APN Roaming',              role: 'Approver', domains: '[\"Packet Core (APN)\"]', expect: true },
  // Voice/SMS Approver
  { path: 'General.IMSI Range',                         role: 'Approver', domains: '[\"Voice/SMS (IMSI)\"]',  expect: true },
  // Analyst: view only
  { path: 'OPERATOR PROFILE.Operator Name',             role: 'Analyst',  domains: null,                    expect: false },
  { path: 'NETWORK TECHNICAL.HLR Global Title',         role: 'Analyst',  domains: null,                    expect: false },
  // CPO/Exec: view only
  { path: 'OPERATOR PROFILE.Operator Name',             role: 'CPO/Exec', domains: null,                    expect: false },
  // Auditor: view only
  { path: 'SECURITY.Fraud Contact Email',               role: 'Auditor',  domains: null,                    expect: false },
  // Hidden field: NEVER editable, even for Admin
  { path: 'General.Header',                             role: 'Admin',    domains: null,                    expect: false },
];

module.exports = { GOLDEN, CONFLICT_CHECKS, REGRESSION_TESTS, PERMISSION_CHECKS };
