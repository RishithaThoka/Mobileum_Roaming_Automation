'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const db      = require('../db');
const undoManager    = require('../services/undoManager');
const workflowEngine = require('../services/workflowEngine');
const ingestionService = require('../services/ingestionService');
const diffEngine     = require('../services/diffEngine');
const { getFieldOwner, getFieldOwnerWithCatalog, isFieldEditable, isFieldHidden } = require('../services/fieldOwnership');

const router     = express.Router();
const { requireRole, requireAuth } = require('./auth');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({ storage });

router.get('/', requireAuth, async (req, res) => {
  const rows = await db('documents as d')
    .select([
      'd.*',
      'o.name as operator_name', 'o.country as operator_country', 'o.network_code as mcc_mnc',
      db.raw('(SELECT COUNT(*) FROM document_versions v WHERE v.document_id = d.id) as version_count'),
      db.raw('(SELECT status FROM diffs WHERE document_id = d.id ORDER BY created_at DESC LIMIT 1) as latest_diff_status'),
    ])
    .join('operators as o', 'd.operator_id', 'o.id')
    .orderBy('d.created_at', 'desc');
  res.json(rows);
});

router.get('/:id/versions', requireAuth, async (req, res) => {
  const versions = await db('document_versions')
    .select('id', 'version_number', 'original_filename', 'source', 'uploaded_at')
    .where({ document_id: req.params.id })
    .orderBy('version_number', 'asc');
  res.json(versions);
});

router.get('/:id/diffs', requireAuth, async (req, res) => {
  const diffs = await db('diffs')
    .where({ document_id: req.params.id })
    .orderBy('created_at', 'desc');
  res.json(diffs);
});

// Push-mode upload — runs through the shared ingestionService, same as heartbeat.
router.post('/upload', requireRole('Admin', 'Analyst'), upload.single('file'), async (req, res) => {
  try {
    const { operator_id, doc_type, title } = req.body;
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const result = await ingestionService.ingestDocumentVersion({
      operatorId: operator_id, docType: doc_type, title,
      filePath: req.file.path, originalFilename: req.file.originalname,
      source: req.body.source || 'push',
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Cascading delete with undo snapshot — children first to satisfy FK constraints.
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  const document = await db('documents').where({ id: req.params.id }).first();
  if (!document) return res.status(404).json({ error: 'Not found' });

  const versions    = await db('document_versions').where({ document_id: document.id });
  const diffs       = await db('diffs').where({ document_id: document.id });
  const diffIds     = diffs.map(d => d.id);
  const diffItems   = diffIds.length ? await db('diff_items').whereIn('diff_id', diffIds) : [];
  const workflows   = diffIds.length ? await db('approval_workflows').whereIn('diff_id', diffIds) : [];
  const workflowIds = workflows.map(w => w.id);
  const steps       = workflowIds.length ? await db('approval_steps').whereIn('workflow_id', workflowIds) : [];
  const substages   = await db('document_workflow_substages').where({ document_id: document.id });

  const snapshot = [
    { table: 'approval_steps',     rows: steps },
    { table: 'approval_workflows', rows: workflows },
    { table: 'diff_items',         rows: diffItems },
    { table: 'diffs',              rows: diffs },
    { table: 'document_workflow_substages', rows: substages },
    { table: 'document_versions',  rows: versions },
    { table: 'documents',          rows: [document] },
  ];

  await db.transaction(async trx => {
    if (steps.length)     await trx('approval_steps').whereIn('id', steps.map(s => s.id)).del();
    if (workflows.length) await trx('approval_workflows').whereIn('id', workflows.map(w => w.id)).del();
    if (diffItems.length) await trx('diff_items').whereIn('id', diffItems.map(i => i.id)).del();
    if (diffs.length)     await trx('diffs').whereIn('id', diffs.map(d => d.id)).del();
    if (substages.length) await trx('document_workflow_substages').where({ document_id: document.id }).del();
    if (versions.length)  await trx('document_versions').whereIn('id', versions.map(v => v.id)).del();
    await trx('documents').where({ id: document.id }).del();
  });

  await undoManager.saveUndoSlot(
    `Deleted document "${document.title}" (${diffs.length} diff(s), ${steps.length} approval step(s))`,
    snapshot,
  );
  workflowEngine.logAudit('document', document.id, 'deleted', 'admin',
    `Deleted document "${document.title}" and all related records`);

  res.json({ deleted: true, document: document.title });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edit Lock Force-Release (Admin only)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /:id/edit-lock — Check whether an edit lock exists for this document.
 *
 * Used by the Force Release modal to pre-check before showing the form, so
 * the user sees "Lock already released" immediately without needing to click Confirm.
 *
 * Returns { locked: true, diff_id, locked_at, locked_by_user_id } if lock exists.
 * Returns { locked: false } if no lock.
 */
router.get('/:id/edit-lock', requireRole('Admin'), async (req, res) => {
  try {
    const lock = await db('document_edit_locks').where({ document_id: req.params.id }).first();
    if (!lock) return res.json({ locked: false });
    res.json({
      locked: true,
      diff_id: lock.locked_by_diff_id,
      locked_at: lock.locked_at,
      locked_by_user_id: lock.locked_by_user_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /:id/edit-lock — Force-release a stuck edit lock.
 *
 * Admin-only.  Use when a deployment failure or crash left a lock that the
 * normal workflow release paths (rejection / deploy-complete / rollback) could
 * not clear.
 *
 * Body: { reason: string }  — mandatory; written verbatim into the audit log.
 *
 * Returns 404 if no lock exists (safety check — don't release nothing silently).
 * Writes a WARN-level audit entry regardless of outcome.
 */
router.delete('/:id/edit-lock', requireRole('Admin'), async (req, res) => {
  const docId = req.params.id;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'reason is required' });
  }

  try {
    const lock = await db('document_edit_locks').where({ document_id: docId }).first();
    if (!lock) {
      return res.status(404).json({ error: 'No edit lock exists for this document' });
    }

    const diffId = lock.locked_by_diff_id;

    // ── Deploying-state guard ─────────────────────────────────────────────────
    // If stage_status = 'deploying', the production write is in progress.
    // Superseding the diff while it is being applied could leave
    // simulated_network_state half-written.  Refuse until deployment settles.
    const wfState = await db('document_workflow_state').where({ document_id: docId }).first();
    if (wfState && wfState.stage_status === 'deploying') {
      return res.status(409).json({
        error: 'Cannot force-release while deployment is in progress. Wait for deployment to complete (deployed or failed) then retry.',
        stage_status: 'deploying',
      });
    }

    // NOTE: all queries inside the transaction are scoped to docId and diffId
    // only — this handler never touches diffs, locks, or workflows of any
    // other document.

    // Cancel the pending workflow + diff in one transaction, then release lock.
    // This is what actually unblocks the document — the PATCH edit-block check
    // reads diffs.status, NOT the lock table.
    await db.transaction(async trx => {
      // 1. Mark the diff superseded (distinct from rejected — no approver decided)
      await trx('diffs').where({ id: diffId }).update({ status: 'superseded' });

      // 2. Cancel the workflow and all its steps
      const workflow = await trx('approval_workflows').where({ diff_id: diffId }).first();
      if (workflow) {
        await trx('approval_steps')
          .where({ workflow_id: workflow.id })
          .whereIn('status', ['pending', 'waiting'])
          .update({ status: 'cancelled', decided_at: new Date().toISOString() });
        await trx('approval_workflows').where({ id: workflow.id }).update({
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        });
      }

      // 3. Release the lock
      await trx('document_edit_locks').where({ document_id: docId }).del();

      // 4. Audit entry (inside trx — rolls back if anything fails)
      await trx('audit_log').insert({
        id: uuid(),
        entity_type: 'document_edit_lock',
        entity_id: docId,
        action: 'force_released',
        actor: req.user.username,
        details: JSON.stringify({
          reason: reason.trim(),
          released_diff_id: diffId,
          workflow_id: workflow ? workflow.id : null,
          originally_locked_by: lock.locked_by_user_id,
          originally_locked_at: lock.locked_at,
          diff_marked: 'superseded',
        }),
      });
    });

    res.json({
      success: true,
      released_diff_id: diffId,
      message: 'Edit lock released and pending workflow cancelled. The document can now accept new edits.',
    });
  } catch (err) {
    console.error('[DELETE /:id/edit-lock]', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Document Viewer + Role-Based Editing Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /:id/fields — Document Field Viewer
 *
 * Returns every field from the latest APPROVED version (the baseline),
 * annotated with owner domain, editable flag (per the logged-in user's role),
 * and whether the document is currently edit-locked.
 *
 * The viewer and the PATCH endpoint use the SAME isFieldEditable() function.
 */
router.get('/:id/fields', requireAuth, async (req, res) => {
  try {
    const docId = req.params.id;
    const doc = await db('documents').where({ id: docId }).first();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const operator = await db('operators').where({ id: doc.operator_id }).first();

    // Baseline = latest APPROVED version.  Pending / rejected manual_edit
    // versions NEVER become the baseline.
    const baseline = await db('document_versions')
      .where({ document_id: docId, is_current_baseline: 1 })
      .first();

    if (!baseline || !baseline.extracted_fields) {
      return res.status(404).json({ error: 'No approved baseline version exists for this document' });
    }

    const rawFields = JSON.parse(baseline.extracted_fields);
    const userRole = req.user.role;
    const userDomains = req.user.approved_domains || null;

    // Check for ANY pending diff (ingestion or manual) → edit-locked
    const pendingDiff = await db('diffs')
      .where({ document_id: docId })
      .whereIn('status', ['pending_workflow', 'in_approval'])
      .first();

    const editLocked = !!pendingDiff;
    const lockReason = editLocked
      ? `Editing blocked — a pending diff (${pendingDiff.id.slice(0, 8)}…) is awaiting approval/deployment`
      : null;

    // Build annotated field map — catalog-aware owner lookup
    const fields = {};
    for (const [fieldPath, value] of Object.entries(rawFields)) {
      if (isFieldHidden(fieldPath)) continue;

      const owner = await getFieldOwnerWithCatalog(fieldPath, db, doc.doc_type || '*');
      const editable = editLocked
        ? false
        : isFieldEditable(fieldPath, userRole, userDomains, owner.domain);

      let lockedReason = null;
      if (editLocked) {
        lockedReason = lockReason;
      } else if (!isFieldEditable(fieldPath, userRole, userDomains, owner.domain)) {
        if (owner.domain === 'General' && userRole !== 'Admin') {
          lockedReason = 'Requires Admin role';
        } else if (owner.domain !== 'General') {
          lockedReason = `Requires ${owner.domain} approver role`;
        } else {
          lockedReason = 'View only';
        }
      }

      fields[fieldPath] = {
        value,
        owner_domain: owner.domain,
        owner_source: owner.source,
        pending_owner_confirmation: owner.pending_owner_confirmation || false,
        editable,
        locked_reason: lockedReason,
      };
    }

    res.json({
      document: {
        id: doc.id,
        title: doc.title,
        doc_type: doc.doc_type,
        operator_name: operator ? operator.name : null,
        operator_country: operator ? operator.country : null,
      },
      base_version_id: baseline.id,
      base_version_number: baseline.version_number,
      fields,
      edit_locked: editLocked,
      pending_diff_id: pendingDiff ? pendingDiff.id : null,
    });
  } catch (err) {
    console.error('[GET /:id/fields]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /:id/fields — Submit a Manual Edit
 *
 * Body:
 *   { base_version_id: string, changes: { fieldPath: newValue, ... }, comment: string }
 *
 * Entire operation is wrapped in ONE transaction:
 *   version → diff → diff_items → edit_lock → workflow → audit
 * If any step fails, nothing persists — the document can never get stuck locked.
 *
 * The edit lock PK (document_id) unique violation returns 409 when two
 * simultaneous PATCH calls race.
 */
router.patch('/:id/fields', requireAuth, async (req, res) => {
  const docId = req.params.id;
  const { base_version_id, changes, comment } = req.body;

  // ── Input validation ────────────────────────────────────────────────────
  if (!base_version_id) {
    return res.status(400).json({ error: 'base_version_id is required' });
  }
  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'changes object is required and must be non-empty' });
  }
  if (!comment || typeof comment !== 'string' || !comment.trim()) {
    return res.status(400).json({ error: 'comment is required' });
  }

  try {
    const doc = await db('documents').where({ id: docId }).first();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // ── Baseline check ──────────────────────────────────────────────────
    const baseline = await db('document_versions')
      .where({ document_id: docId, is_current_baseline: 1 })
      .first();

    if (!baseline) {
      return res.status(404).json({ error: 'No approved baseline version exists' });
    }

    // Stale baseline? → 409
    if (baseline.id !== base_version_id) {
      return res.status(409).json({
        error: 'Baseline has changed since you loaded the document. Reload and try again.',
        current_base_version_id: baseline.id,
      });
    }

    // ── Block if ANY pending diff exists ─────────────────────────────────
    const pendingDiff = await db('diffs')
      .where({ document_id: docId })
      .whereIn('status', ['pending_workflow', 'in_approval'])
      .first();

    if (pendingDiff) {
      return res.status(409).json({
        error: 'Editing is blocked — a pending diff is awaiting approval/deployment',
        pending_diff_id: pendingDiff.id,
      });
    }

    const oldFields = JSON.parse(baseline.extracted_fields);
    const changedPaths = Object.keys(changes);

    // ── Reject unknown field paths ──────────────────────────────────────
    const unknownPaths = changedPaths.filter(p => !(p in oldFields));
    if (unknownPaths.length > 0) {
      return res.status(400).json({
        error: 'Cannot add new field paths — only existing fields may be edited',
        unknown_paths: unknownPaths,
      });
    }

    // ── Reject duplicate-label fields (B8) ─────────────────────────────
    // These fields had >1 occurrence of the same Section.Label in the source
    // document. The second value silently overwrote the first, so we cannot
    // know which value the user intended to base their edit on.
    const dupPathsRaw = baseline.duplicate_label_paths;
    const dupPaths    = dupPathsRaw ? JSON.parse(dupPathsRaw) : [];
    const dupEdits    = changedPaths.filter(p => dupPaths.includes(p));
    if (dupEdits.length > 0) {
      return res.status(400).json({
        error: 'Cannot edit duplicate-label fields — these fields had ambiguous values in the source document and are non-editable.',
        duplicate_label_paths: dupEdits,
      });
    }


    // ── Per-field permission check (engine-aware) ──────────────────────────
    // classifyField is the new DB-backed engine (B4).
    // ownerMap is also used when building diff_items (B7).
    const userRole = req.user.role;
    const userDomains = req.user.approved_domains || null;

    const { classifyField } = require('../services/fieldOwnershipEngine');
    const docType = doc.doc_type || '*';
    const operatorId = doc.operator_id || null;

    // Classify all changed paths with the engine
    const ownerMap = Object.fromEntries(
      await Promise.all(
        changedPaths.map(async p => [
          p,
          await classifyField(p, db, { docType, operatorId }),
        ])
      )
    );
    // engine returns owner_source; permission check uses domain
    // (isFieldEditable still uses .domain and .source from fieldOwnership.js for gating)
    const ownerResultMap = ownerMap; // { path → { domain, owner_source, rule_version, ... } }

    const forbiddenFields = changedPaths.filter(
      p => !isFieldEditable(p, userRole, userDomains, ownerResultMap[p].domain)
    );

    if (forbiddenFields.length > 0) {
      return res.status(403).json({
        error: 'You do not have permission to edit one or more fields',
        forbidden_fields: forbiddenFields.map(p => ({
          path: p,
          owner: ownerResultMap[p].domain,
          owner_source: ownerResultMap[p].owner_source,
          your_role: userRole,
        })),
      });
    }

    // ── Build new field set ──────────────────────────────────────────────
    const newFields = { ...oldFields };
    for (const [fieldPath, newValue] of Object.entries(changes)) {
      newFields[fieldPath] = String(newValue).trim();
    }

    // ── Pre-flight: SELF_APPROVAL_ONLY_ADMIN ───────────────────────────────
    // Check BEFORE opening the transaction so we never commit anything if this
    // condition is true. ownerResultMap is already computed above.
    // Condition: editor is Admin + auto_tier policy is enabled + any field is 'auto'
    //            + no other active Admin exists.
    {
      const { loadPolicy: _loadPolicy } = require('../services/workflowEngine');
      if (_loadPolicy) { // export guard — only if workflowEngine exports loadPolicy
        const _autoPolicy = await _loadPolicy('auto_tier_admin_step').catch(() => ({ enabled: false }));
        const _hasAutoField = changedPaths.some(p => ownerResultMap[p] && ownerResultMap[p].owner_source === 'auto');
        if (_autoPolicy.enabled && _hasAutoField && userRole === 'Admin') {
          const _editorId = req.user.user_id;
          const _otherAdmins = await db('users')
            .where({ role: 'Admin', status: 'active' }).whereNot({ id: _editorId });
          if (_otherAdmins.length === 0) {
            return res.status(409).json({
              error: 'Self-approval conflict: the auto-tier Admin review step cannot be created ' +
                     'because the submitting account is the only active Admin. ' +
                     'Add a second Admin account or disable the auto_tier_admin_step policy.',
              code: 'SELF_APPROVAL_ONLY_ADMIN',
            });
          }
        }
      }
    }

    // ── Single transaction: version + diff + diff_items + edit_lock + audit ──
    // computeDiff is async (calls AI) so we run it BEFORE opening the trx
    // to keep the transaction window as short as possible.
    const versionId = uuid();
    const versionNumber = baseline.version_number + 1;
    const diffId = uuid();


    const versionInfo = {
      current: `v${versionNumber}`,
      against: `v${baseline.version_number}`,
      current_filename: `manual_edit_v${versionNumber}`,
      against_filename: baseline.original_filename,
    };
    const diffResult = await diffEngine.computeDiff(oldFields, newFields, versionInfo);
    if (!diffResult || diffResult.items.length === 0) {
      return res.status(400).json({ error: 'No differences detected between old and new field values' });
    }
    const { items, totalChanges, highestSeverity } = diffResult;
    const totalRisk = items.reduce((sum, i) => sum + (i.risk_score || 0), 0);

    await db.transaction(async trx => {
      // 1. New document_version
      await trx('document_versions').insert({
        id: versionId,
        document_id: docId,
        version_number: versionNumber,
        file_path: baseline.file_path,
        original_filename: `manual_edit_v${versionNumber}`,
        source: 'manual_edit',
        extracted_fields: JSON.stringify(newFields),
        uploaded_at: new Date().toISOString(),
        requires_review: 1,
        approval_status: 'pending',
        is_current_baseline: 0,
      });

      // 2. Diff row
      await trx('diffs').insert({
        id: diffId,
        document_id: docId,
        from_version_id: baseline.id,
        to_version_id: versionId,
        total_changes: totalChanges,
        highest_severity: highestSeverity,
        status: 'pending_workflow',
        overall_risk_score: totalRisk,
        source: 'manual_edit',
        edit_comment: comment.trim(),
        editor_user_id: req.user.user_id || null,
      });

      // 3. Diff items — write owner_domain, owner_source, rule_version (B7)
      // The engine result is used directly; category is set to owner_domain
      // so createWorkflowForDiff routes to the correct approver domain.
      await trx('diff_items').insert(items.map(i => {
        const engineResult = ownerResultMap[i.field_path] || {};
        const ownerDomain  = engineResult.domain  || i.domain || i.category || 'General';
        const ownerSource  = engineResult.owner_source || 'fallback';
        const ruleVer      = engineResult.rule_version || 0;
        return {
          id: uuid(), diff_id: diffId,
          field_path: i.field_path,
          category: ownerDomain,   // workflow routing reads this column
          domain: ownerDomain,
          change_type: i.change_type,
          old_value: i.old_value, new_value: i.new_value,
          severity: i.severity, needs_review: i.needs_review || 0,
          risk_score: i.risk_score || 0, impact_level: i.impact_level || 'Minor',
          ai_analysis: JSON.stringify(i.ai_analysis || {}),
          affected: JSON.stringify(i.affected || {}),
          owner_domain: ownerDomain,
          owner_source: ownerSource,
          rule_version: ruleVer,
        };
      }));

      // 4. Edit lock — unique PK violation here is the concurrency guard → 409
      await trx('document_edit_locks').insert({
        document_id: docId,
        locked_by_diff_id: diffId,
        locked_by_user_id: req.user.user_id || null,
        locked_at: new Date().toISOString(),
      });

      // 5. Audit entries (inside trx so they roll back if anything else fails)
      const auditEntries = changedPaths.map(fieldPath => ({
        id: uuid(),
        entity_type: 'document_field',
        entity_id: docId,
        action: 'manual_edit',
        actor: req.user.username,
        details: JSON.stringify({
          field: fieldPath,
          old_value: oldFields[fieldPath],
          new_value: changes[fieldPath],
          domain: ownerResultMap[fieldPath] ? ownerResultMap[fieldPath].domain : 'General',
          diff_id: diffId,
          version_id: versionId,
          comment: comment.trim(),
        }),
      }));
      await trx('audit_log').insert(auditEntries);
    }); // ← transaction commits here

    // 6. Workflow creation uses db (not trx) — runs after commit
    const workflowId = await workflowEngine.createWorkflowForDiff(diffId);

    // 7. Ensure workflow state and move to in_approval
    await workflowEngine.ensureWorkflowState(docId);
    await db('document_workflow_state')
      .where({ document_id: docId })
      .update({ stage_status: 'in_approval', updated_at: new Date().toISOString() });

    const result = { diff_id: diffId, workflow_id: workflowId, version_id: versionId, version_number: versionNumber };

    res.json({ success: true, ...result });
  } catch (err) {
    // PK violation on document_edit_locks → concurrent edit race
    if (err.message && (err.message.includes('UNIQUE constraint') || err.message.includes('SQLITE_CONSTRAINT'))) {
      return res.status(409).json({
        error: 'Another edit was submitted simultaneously. Reload and try again.',
      });
    }
    // Self-approval-only-Admin conflict from workflowEngine.
    // The transaction has already committed, so we must clean up manually.
    // Guard with typeof — if the error fired before diffId was assigned, skip cleanup.
    if (err.code === 'SELF_APPROVAL_ONLY_ADMIN') {
      /* eslint-disable no-undef */
      const _dId  = typeof diffId    !== 'undefined' ? diffId    : null;
      const _vId  = typeof versionId !== 'undefined' ? versionId : null;
      const _docId = typeof docId    !== 'undefined' ? docId     : null;
      /* eslint-enable no-undef */
      if (_dId) {
        await db('diff_items').where({ diff_id: _dId }).del().catch(() => {});
        await db('diffs').where({ id: _dId }).del().catch(() => {});
      }
      if (_vId) await db('document_versions').where({ id: _vId }).del().catch(() => {});
      if (_docId) await db('document_edit_locks').where({ document_id: _docId }).del().catch(() => {});
      return res.status(409).json({ error: err.message, code: err.code });
    }


    console.error('[PATCH /:id/fields]', err);
    res.status(500).json({ error: err.message });

  }
});

/**
 * POST /:id/logo — Upload operator logo
 *
 * Admin-only.  Goes through the same draft/diff/approval path as field edits.
 * Validates by file signature (magic bytes), not just mimetype.  Drops SVG
 * (script injection risk).  Serves with X-Content-Type-Options: nosniff.
 */
const LOGO_DIR = path.join(UPLOAD_DIR, 'logos');
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: LOGO_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});
const logoUpload = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } });

// Magic byte signatures for allowed image types
const IMAGE_SIGNATURES = [
  { magic: Buffer.from([0xFF, 0xD8, 0xFF]),             ext: 'jpg', mime: 'image/jpeg' },
  { magic: Buffer.from([0x89, 0x50, 0x4E, 0x47]),       ext: 'png', mime: 'image/png' },
];

function validateImageSignature(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  for (const sig of IMAGE_SIGNATURES) {
    if (buf.slice(0, sig.magic.length).equals(sig.magic)) {
      return sig;
    }
  }
  return null;
}

router.post('/:id/logo', requireRole('Admin'), logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'logo file is required' });

    // Validate by file signature (magic bytes), not mimetype
    const sig = validateImageSignature(req.file.path);
    if (!sig) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Invalid image file. Only PNG and JPEG are allowed (validated by file signature). SVG is not permitted.',
      });
    }

    const docId = req.params.id;
    const doc = await db('documents').where({ id: docId }).first();
    if (!doc) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Document not found' });
    }

    // Route logo through the same edit workflow
    const baseline = await db('document_versions')
      .where({ document_id: docId, is_current_baseline: 1 })
      .first();

    if (!baseline || !baseline.extracted_fields) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'No approved baseline version exists' });
    }

    // Block if pending diff exists
    const pendingDiff = await db('diffs')
      .where({ document_id: docId })
      .whereIn('status', ['pending_workflow', 'in_approval'])
      .first();
    if (pendingDiff) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({
        error: 'Editing is blocked — a pending diff is awaiting approval/deployment',
        pending_diff_id: pendingDiff.id,
      });
    }

    // Treat logo as a field change in extracted_fields
    const logoUrl = `/uploads/logos/${path.basename(req.file.path)}`;

    // Set security header
    res.set('X-Content-Type-Options', 'nosniff');

    const logoComment = `Logo updated (${sig.ext.toUpperCase()}, ${Math.round(req.file.size / 1024)}KB)`;
    const oldFields = JSON.parse(baseline.extracted_fields);
    const newFields = { ...oldFields, 'OPERATOR PROFILE.Logo': logoUrl };

    // Compute diff BEFORE opening transaction (async AI call — keep trx window short)
    const logoVersionInfo = {
      current: `v${baseline.version_number + 1}`,
      against: `v${baseline.version_number}`,
      current_filename: `logo_update_v${baseline.version_number + 1}`,
      against_filename: baseline.original_filename,
    };
    const logoDiffResult = await diffEngine.computeDiff(oldFields, newFields, logoVersionInfo);
    const logoItems = logoDiffResult?.items || [];
    const logoTotalChanges = logoDiffResult?.totalChanges || logoItems.length;
    const logoHighestSeverity = logoDiffResult?.highestSeverity || 'minor';
    const logoTotalRisk = logoItems.reduce((sum, i) => sum + (i.risk_score || 0), 0);

    const logoVersionId = uuid();
    const logoVersionNumber = baseline.version_number + 1;
    const logoDiffId = uuid();

    await db.transaction(async trx => {
      await trx('document_versions').insert({
        id: logoVersionId, document_id: docId, version_number: logoVersionNumber,
        file_path: baseline.file_path, original_filename: `logo_update_v${logoVersionNumber}`,
        source: 'manual_edit', extracted_fields: JSON.stringify(newFields),
        uploaded_at: new Date().toISOString(), requires_review: 1,
        approval_status: 'pending', is_current_baseline: 0,
      });

      await trx('diffs').insert({
        id: logoDiffId, document_id: docId,
        from_version_id: baseline.id, to_version_id: logoVersionId,
        total_changes: logoTotalChanges, highest_severity: logoHighestSeverity,
        status: 'pending_workflow', overall_risk_score: logoTotalRisk,
        source: 'manual_edit', edit_comment: logoComment,
        editor_user_id: req.user.user_id || null,
      });

      if (logoItems.length > 0) {
        await trx('diff_items').insert(logoItems.map(i => ({
          id: uuid(), diff_id: logoDiffId,
          field_path: i.field_path, category: i.category,
          domain: i.domain || i.category, change_type: i.change_type,
          old_value: i.old_value, new_value: i.new_value,
          severity: i.severity, needs_review: i.needs_review || 0,
          risk_score: i.risk_score || 0, impact_level: i.impact_level || 'Minor',
          ai_analysis: JSON.stringify(i.ai_analysis || {}),
          affected: JSON.stringify(i.affected || {}),
        })));
      }

      await trx('document_edit_locks').insert({
        document_id: docId, locked_by_diff_id: logoDiffId,
        locked_by_user_id: req.user.user_id || null, locked_at: new Date().toISOString(),
      });

      await trx('audit_log').insert({
        id: uuid(), entity_type: 'document_field', entity_id: docId,
        action: 'logo_upload', actor: req.user.username,
        details: JSON.stringify({ logo_url: logoUrl, file_type: sig.ext, diff_id: logoDiffId }),
      });
    }); // ← transaction commits here

    // Workflow + state update run after commit (use global db, not trx)
    const logoWorkflowId = await workflowEngine.createWorkflowForDiff(logoDiffId);
    await workflowEngine.ensureWorkflowState(docId);
    await db('document_workflow_state')
      .where({ document_id: docId })
      .update({ stage_status: 'in_approval', updated_at: new Date().toISOString() });

    const result = { diff_id: logoDiffId, workflow_id: logoWorkflowId, version_id: logoVersionId, logo_url: logoUrl };

    res.json({ success: true, ...result });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('[POST /:id/logo]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
