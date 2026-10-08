'use strict';

/**
 * Migration 008: field_catalog table
 *
 * Stores per-document-type, per-field-path domain assignments that override
 * the keyword / section classification in fieldOwnership.js.
 *
 * Priority in getFieldOwner():
 *   1. contact_override (in-code)
 *   2. explicit_general (in-code)
 *   3. field_catalog  ← NEW — takes precedence over section + keyword
 *   4. section_prefix (in-code)
 *   5. keyword label-only (in-code)
 *   6. fallback → General
 *
 * pending_owner_confirmation = 1  means the domain assignment was added
 * automatically or by the system (not yet signed off by a named domain owner).
 * The GET /fields viewer returns this flag so the UI can show an "unconfirmed"
 * badge without blocking reads or edits.
 *
 * Seed row: HLR Global Title → Routing (GT), pending confirmation.
 * This resolves the multi-domain keyword conflict (hlr + global title) by
 * giving a deterministic assignment until the Routing and Voice/SMS domain
 * owners confirm it.
 */

exports.up = async function (db) {
  await db.schema.createTable('field_catalog', (t) => {
    t.string('id').primary();                     // UUID
    t.string('doc_type').notNullable();           // 'IR21' | 'RAEX' | '*' (any)
    t.string('field_label').notNullable();        // The label part only (after the dot).
                                                  // Matched case-insensitively against
                                                  // the incoming field path's label.
    t.string('domain').notNullable();             // Owning domain string
    t.integer('pending_owner_confirmation')       // 1 = awaiting sign-off, 0 = confirmed
       .notNullable().defaultTo(1);
    t.string('notes').nullable();                 // Free-text rationale
    t.string('created_by').nullable();            // username who set the entry
    t.string('created_at').notNullable();
    t.string('updated_at').notNullable();

    t.unique(['doc_type', 'field_label']);        // one catalog entry per label per doc_type
  });

  // ── Seed: HLR Global Title ─────────────────────────────────────────────────
  // The label "HLR Global Title" hits both Routing (GT) via "global title" and
  // Voice/SMS (IMSI) via "hlr".  Routing (GT) is the correct owner in virtually
  // all IR.21 docs, but this must be confirmed by the Routing and Voice/SMS
  // domain owners.  Until then, pending_owner_confirmation = 1.
  const now = new Date().toISOString();
  await db('field_catalog').insert({
    id: require('crypto').randomUUID(),
    doc_type: '*',
    field_label: 'HLR Global Title',
    domain: 'Routing (GT)',
    pending_owner_confirmation: 1,
    notes: 'Auto-resolved from admin_multi_domain_conflict (hlr=Voice/SMS, global title=Routing). Pending confirmation by Routing (GT) and Voice/SMS (IMSI) domain owners.',
    created_by: 'system',
    created_at: now,
    updated_at: now,
  });
};

exports.down = async function (db) {
  await db.schema.dropTableIfExists('field_catalog');
};
