'use strict';

/**
 * routes/ownershipAdmin.js
 *
 * Admin-only routes for managing field ownership rules, catalog, and overrides.
 * All routes require the 'Admin' role (enforced by server.js mounting).
 *
 * Endpoints:
 *
 *   Rules (field_ownership_rules):
 *     GET    /api/ownership/rules              — list active rules
 *     POST   /api/ownership/rules/dry-run      — preview impact of a new rule
 *     POST   /api/ownership/rules              — add rule (requires preview_token)
 *     PATCH  /api/ownership/rules/:id          — update rule (audited)
 *     DELETE /api/ownership/rules/:id          — soft-delete (audited)
 *
 *   Catalog (field_catalog):
 *     GET    /api/ownership/catalog            — list all catalog entries
 *     POST   /api/ownership/catalog            — add entry (audited)
 *     PATCH  /api/ownership/catalog/:id        — update entry (audited)
 *     DELETE /api/ownership/catalog/:id        — soft-delete (audited)
 *
 *   Overrides (field_ownership_overrides):
 *     GET    /api/ownership/overrides          — list all overrides
 *     POST   /api/ownership/overrides/bulk-preview  — pattern preview
 *     POST   /api/ownership/overrides          — add override (audited)
 *     PATCH  /api/ownership/overrides/:id      — update (audited)
 *     DELETE /api/ownership/overrides/:id      — delete (audited)
 *
 * Every write:
 *   1. Validates input
 *   2. Bumps the global ruleset_version in the same transaction
 *   3. Writes an audit_log entry in the same transaction
 *   4. Calls invalidateCache() to flush the in-memory rule cache
 */

const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const {
  dryRunRule,
  validateKeyword,
  normalizeLabel,
  bumpRulesetVersion,
  invalidateCache,
} = require('../services/fieldOwnershipEngine');

const router = express.Router();

// In-memory store for valid preview tokens (keyed by token, value = proposedRule)
// In production this would be Redis with TTL — here we use a Map with a 5-min timeout.
const PREVIEW_TOKENS = new Map();
const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000;

function storePreviewToken(token, rule) {
  PREVIEW_TOKENS.set(token, { rule, createdAt: Date.now() });
  // Prune expired tokens
  for (const [k, v] of PREVIEW_TOKENS) {
    if (Date.now() - v.createdAt > PREVIEW_TOKEN_TTL_MS) PREVIEW_TOKENS.delete(k);
  }
}

function consumePreviewToken(token) {
  const entry = PREVIEW_TOKENS.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PREVIEW_TOKEN_TTL_MS) {
    PREVIEW_TOKENS.delete(token);
    return null;
  }
  PREVIEW_TOKENS.delete(token); // one-time use
  return entry.rule;
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function writeAudit(trx, { actor, action, entityType, entityId, oldValue, newValue, comment }) {
  await trx('audit_log').insert({
    id:          `audit_own_${Date.now()}_${entityId ? entityId.slice(0, 8) : 'x'}`,
    entity_type: entityType || 'ownership',
    entity_id:   entityId   || null,
    action,
    actor:       actor || 'admin',
    details:     JSON.stringify({ old: oldValue || null, new: newValue || null, comment: comment || null }),
    timestamp:   new Date().toISOString(),
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// RULES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/rules', async (req, res) => {
  try {
    const rows = await db('field_ownership_rules')
      .where({ is_active: 1 })
      .orderBy([{ column: 'rule_type' }, { column: 'priority', order: 'desc' }]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rules/dry-run', async (req, res) => {
  try {
    const { rule_type, pattern, domain, doc_type } = req.body;
    if (!rule_type || !pattern) {
      return res.status(400).json({ error: 'rule_type and pattern are required.' });
    }
    if (rule_type === 'keyword') {
      const kwError = validateKeyword(pattern);
      if (kwError) return res.status(400).json({ error: kwError });
    }
    const proposedRule = { rule_type, pattern, domain, doc_type: doc_type || '*' };
    const preview = await dryRunRule(db, proposedRule);
    if (preview.error) return res.status(400).json({ error: preview.error });

    storePreviewToken(preview.preview_token, proposedRule);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rules', async (req, res) => {
  try {
    const { preview_token, rule_type, pattern, domain, doc_type, priority, notes } = req.body;
    if (!preview_token) {
      return res.status(400).json({
        error: 'preview_token is required. Call POST /rules/dry-run first and include the returned token.',
      });
    }
    const validated = consumePreviewToken(preview_token);
    if (!validated) {
      return res.status(400).json({ error: 'preview_token is invalid or expired (5 min TTL). Repeat the dry-run.' });
    }

    if (rule_type === 'keyword') {
      const kwError = validateKeyword(pattern || validated.pattern);
      if (kwError) return res.status(400).json({ error: kwError });
    }

    const now = new Date().toISOString();
    const id = uuid();
    const actor = req.user && req.user.username ? req.user.username : 'admin';

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_ownership_rules').insert({
        id,
        rule_type:  rule_type  || validated.rule_type,
        pattern:    pattern    || validated.pattern,
        domain:     domain     || validated.domain || null,
        doc_type:   doc_type   || validated.doc_type || '*',
        priority:   priority   !== undefined ? priority : 0,
        is_active: 1,
        notes: notes || null,
        created_by: actor,
        created_at: now,
        updated_at: now,
      });
      await writeAudit(trx, {
        actor, action: 'rule_created', entityType: 'field_ownership_rules', entityId: id,
        newValue: { rule_type, pattern, domain },
        comment: `Rule created. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    const newRule = await db('field_ownership_rules').where({ id }).first();
    res.status(201).json(newRule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db('field_ownership_rules').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Rule not found.' });

    const { pattern, domain, priority, is_active, notes } = req.body;
    if (existing.rule_type === 'keyword' && pattern) {
      const kwError = validateKeyword(pattern);
      if (kwError) return res.status(400).json({ error: kwError });
    }

    const now = new Date().toISOString();
    const actor = req.user && req.user.username ? req.user.username : 'admin';

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_ownership_rules').where({ id }).update({
        ...(pattern     !== undefined ? { pattern }     : {}),
        ...(domain      !== undefined ? { domain }      : {}),
        ...(priority    !== undefined ? { priority }    : {}),
        ...(is_active   !== undefined ? { is_active }   : {}),
        ...(notes       !== undefined ? { notes }       : {}),
        updated_at: now,
      });
      await writeAudit(trx, {
        actor, action: 'rule_updated', entityType: 'field_ownership_rules', entityId: id,
        oldValue: existing, newValue: req.body,
        comment: `Rule updated. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    res.json(await db('field_ownership_rules').where({ id }).first());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db('field_ownership_rules').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Rule not found.' });

    const actor = req.user && req.user.username ? req.user.username : 'admin';
    const now = new Date().toISOString();

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_ownership_rules').where({ id }).update({ is_active: 0, updated_at: now });
      await writeAudit(trx, {
        actor, action: 'rule_deleted', entityType: 'field_ownership_rules', entityId: id,
        oldValue: existing,
        comment: `Rule soft-deleted. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    res.json({ deleted: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOG
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/catalog', async (req, res) => {
  try {
    const rows = await db('field_catalog').orderBy('field_label');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/catalog', async (req, res) => {
  try {
    const { field_label, domain, doc_type, aliases, pending_owner_confirmation, notes } = req.body;
    if (!field_label || !domain) {
      return res.status(400).json({ error: 'field_label and domain are required.' });
    }
    const id = uuid();
    const actor = req.user && req.user.username ? req.user.username : 'admin';
    const now = new Date().toISOString();

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_catalog').insert({
        id, field_label, domain,
        doc_type: doc_type || '*',
        aliases: aliases ? JSON.stringify(aliases) : null,
        pending_owner_confirmation: pending_owner_confirmation !== undefined ? pending_owner_confirmation : 0,
        is_active: 1,
        notes: notes || null,
        created_by: actor,
        created_at: now,
        updated_at: now,
      });
      await writeAudit(trx, {
        actor, action: 'catalog_created', entityType: 'field_catalog', entityId: id,
        newValue: { field_label, domain },
        comment: `Catalog entry created. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    res.status(201).json(await db('field_catalog').where({ id }).first());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/catalog/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db('field_catalog').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Catalog entry not found.' });

    const actor = req.user && req.user.username ? req.user.username : 'admin';
    const now = new Date().toISOString();
    const updates = {};
    for (const k of ['field_label','domain','doc_type','pending_owner_confirmation','is_active','notes']) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (req.body.aliases !== undefined) {
      updates.aliases = Array.isArray(req.body.aliases) ? JSON.stringify(req.body.aliases) : req.body.aliases;
    }

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_catalog').where({ id }).update({ ...updates, updated_at: now });
      await writeAudit(trx, {
        actor, action: 'catalog_updated', entityType: 'field_catalog', entityId: id,
        oldValue: existing, newValue: updates,
        comment: `Catalog entry updated. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    res.json(await db('field_catalog').where({ id }).first());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/catalog/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db('field_catalog').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Catalog entry not found.' });

    const actor = req.user && req.user.username ? req.user.username : 'admin';
    const now = new Date().toISOString();

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_catalog').where({ id }).update({ is_active: 0, updated_at: now });
      await writeAudit(trx, {
        actor, action: 'catalog_deleted', entityType: 'field_catalog', entityId: id,
        oldValue: existing,
        comment: `Catalog soft-deleted. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    res.json({ deleted: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OVERRIDES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/overrides', async (req, res) => {
  try {
    const rows = await db('field_ownership_overrides').orderBy('normalized_label');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/overrides/bulk-preview', async (req, res) => {
  try {
    const { pattern, domain, operator_id } = req.body;
    if (!pattern || !domain) {
      return res.status(400).json({ error: 'pattern and domain are required.' });
    }

    let regex;
    try { regex = new RegExp(pattern, 'i'); } catch (e) {
      return res.status(400).json({ error: `Invalid regex pattern: ${e.message}` });
    }

    const docs = await db('documents').select('id', 'doc_type', 'operator_id');
    const matches = [];

    for (const doc of docs) {
      if (operator_id && operator_id !== '__GLOBAL__' && doc.operator_id !== operator_id) continue;
      const baseline = await db('document_versions')
        .where({ document_id: doc.id, is_current_baseline: 1 }).first();
      if (!baseline || !baseline.extracted_fields) continue;
      const fields = JSON.parse(baseline.extracted_fields);
      for (const fieldPath of Object.keys(fields)) {
        const dot = fieldPath.indexOf('.');
        const label = dot >= 0 ? fieldPath.substring(dot + 1) : fieldPath;
        if (regex.test(label)) {
          const normLabel = normalizeLabel(label);
          matches.push({
            document_id: doc.id,
            field_path: fieldPath,
            normalized_label: normLabel,
            proposed_domain: domain,
          });
        }
      }
    }

    res.json({ match_count: matches.length, matches: matches.slice(0, 200) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/overrides', async (req, res) => {
  try {
    const { label, operator_id, section_scope, domain, notes } = req.body;
    if (!label || !domain) {
      return res.status(400).json({ error: 'label and domain are required.' });
    }
    const normLabel = normalizeLabel(label);
    if (!normLabel) {
      return res.status(400).json({ error: 'Label normalises to empty string.' });
    }
    const operatorSentinel = operator_id || '__GLOBAL__';
    const id = uuid();
    const actor = req.user && req.user.username ? req.user.username : 'admin';
    const now = new Date().toISOString();

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_ownership_overrides').insert({
        id,
        normalized_label: normLabel,
        operator_id: operatorSentinel,
        section_scope: section_scope || null,
        domain,
        notes: notes || null,
        created_by: actor,
        created_at: now,
        updated_at: now,
      });
      await writeAudit(trx, {
        actor, action: 'override_created', entityType: 'field_ownership_overrides', entityId: id,
        newValue: { normalized_label: normLabel, operator_id: operatorSentinel, domain },
        comment: `Override created. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    res.status(201).json(await db('field_ownership_overrides').where({ id }).first());
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({
        error: 'An override for this label/operator combination already exists. Use PATCH to update it.',
      });
    }
    res.status(500).json({ error: err.message });
  }
});

router.patch('/overrides/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db('field_ownership_overrides').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Override not found.' });

    const actor = req.user && req.user.username ? req.user.username : 'admin';
    const now = new Date().toISOString();

    const updates = {};
    if (req.body.label !== undefined) {
      const normLabel = normalizeLabel(req.body.label);
      if (!normLabel) return res.status(400).json({ error: 'Label normalises to empty.' });
      updates.normalized_label = normLabel;
    }
    for (const k of ['domain','section_scope','notes']) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_ownership_overrides').where({ id }).update({ ...updates, updated_at: now });
      await writeAudit(trx, {
        actor, action: 'override_updated', entityType: 'field_ownership_overrides', entityId: id,
        oldValue: existing, newValue: updates,
        comment: `Override updated. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    res.json(await db('field_ownership_overrides').where({ id }).first());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/overrides/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db('field_ownership_overrides').where({ id }).first();
    if (!existing) return res.status(404).json({ error: 'Override not found.' });

    const actor = req.user && req.user.username ? req.user.username : 'admin';
    const now = new Date().toISOString();

    await db.transaction(async trx => {
      const newVersion = await bumpRulesetVersion(trx);
      await trx('field_ownership_overrides').where({ id }).del();
      await writeAudit(trx, {
        actor, action: 'override_deleted', entityType: 'field_ownership_overrides', entityId: id,
        oldValue: existing,
        comment: `Override deleted. Ruleset version bumped to ${newVersion}.`,
      });
    });

    invalidateCache();
    res.json({ deleted: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
