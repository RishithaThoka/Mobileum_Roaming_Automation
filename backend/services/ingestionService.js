'use strict';

const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('../db');
const diffEngine        = require('./diffEngine');
const workflowEngine    = require('./workflowEngine');
const operatorDetector  = require('./ai/operatorDetector');
const notificationService = require('./notificationService');

function formatFromExt(filename) {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  if (ext === 'xml')                return 'xml';
  if (ext === 'xlsx' || ext === 'xls')  return 'xlsx';
  if (ext === 'docx' || ext === 'doc')  return 'docx';
  if (ext === 'pdf')                return 'pdf';
  if (ext === 'csv')                return 'csv';
  if (ext === 'txt')                return 'txt';
  return ext || 'txt';
}

// The single code path for "a new document version has arrived" — used by
// both the manual/push upload route (routes/documents.js) and the automated
// heartbeat poller (services/heartbeatPoller.js).
async function ingestDocumentVersion({ operatorId, docType, title, filePath, originalFilename, source }) {
  const format = formatFromExt(originalFilename);

  const extractedFields = await diffEngine.extractFields(filePath, format, docType);

  // Resolve operator: use supplied ID, fall back to content-based detection
  let opRecord = null;
  if (operatorId) {
    opRecord = await db('operators').where({ id: operatorId }).first();
  }

  let isNewOpDetected = false;
  if (!opRecord || !operatorId) {
    const detected = await operatorDetector.detectAndGetOperator({ extractedFields });
    opRecord = detected.operator;
    operatorId = opRecord ? opRecord.id : null;
    isNewOpDetected = detected.isNewOperator;
    if (detected.detectedInfo && detected.detectedInfo.docType) {
      docType = docType || detected.detectedInfo.docType;
    }
  }

  if (!operatorId) {
    throw new Error('Unable to identify operator from document content. Flagged for review.');
  }

  docType = docType || (opRecord && opRecord.default_doc_type) || 'IR21';

  let document    = null;
  let versionCount = 0;
  const versionId  = uuid();

  // Atomic transaction for document/version creation
  await db.transaction(async trx => {
    document = await trx('documents').where({ operator_id: operatorId, doc_type: docType }).first();
    if (!document) {
      const docId = uuid();
      await trx('documents').insert({
        id: docId, operator_id: operatorId, doc_type: docType, format,
        title: title || `${docType} - ${(opRecord && opRecord.name) || 'Unassigned'}`,
      });
      document = await trx('documents').where({ id: docId }).first();
    }

    const { c } = await trx('document_versions').where({ document_id: document.id }).count('* as c').first();
    versionCount = Number(c);
    const isBaseline = versionCount === 0 ? 1 : 0;
    const initStatus = versionCount === 0 ? 'approved' : 'pending';
    const reqReview  = (!opRecord || opRecord.requires_review) ? 1 : 0;

    await trx('document_versions').insert({
      id: versionId, document_id: document.id,
      version_number: versionCount + 1,
      file_path: filePath, original_filename: originalFilename,
      source: source || 'push',
      extracted_fields: JSON.stringify(extractedFields),
      approval_status: initStatus,
      is_current_baseline: isBaseline,
      requires_review: reqReview,
    });

    await trx('documents').where({ id: document.id }).update({ current_version_id: versionId });
  });

  // Re-read after the transaction so the returned document reflects current_version_id.
  document = await db('documents').where({ id: document.id }).first();

  workflowEngine.logAudit('document_version', versionId, 'ingested', operatorId,
    `${source || 'push'} upload: ${originalFilename}`);


  // Notifications (fire-and-forget)
  if (isNewOpDetected && opRecord && opRecord.id) {
    notificationService.createNotification({
      operatorId: opRecord.id,
      type: 'new_operator',
      message: `New operator "${opRecord.name}" (${opRecord.country}) auto-detected from content`,
      recipient: 'admin',
    }).catch(() => {});
  }
  notificationService.createNotification({
    operatorId: opRecord.id,
    type: 'upload',
    message: `Document v${versionCount + 1} (${originalFilename}) uploaded for ${opRecord.name}`,
    recipient: 'admin, domain_approvers',
  }).catch(() => {});

  // Supersede any pending diffs/workflows for this document
  const pendingDiffs = await db('diffs')
    .select('id')
    .where({ document_id: document.id })
    .whereIn('status', ['pending_workflow', 'in_approval']);
  for (const d of pendingDiffs) {
    await db('diffs').where({ id: d.id }).update({ status: 'superseded' });
    await db('approval_workflows')
      .where({ diff_id: d.id, status: 'in_progress' })
      .update({ status: 'superseded' });
  }

  let diffResult = null;
  if (versionCount > 0) {
    // Use active baseline as the comparison base; fall back to most-recent version
    const prevVersion =
      await db('document_versions')
        .where({ document_id: document.id, is_current_baseline: 1 })
        .whereNot({ id: versionId })
        .first() ||
      await db('document_versions')
        .where({ document_id: document.id })
        .whereNot({ id: versionId })
        .orderBy('version_number', 'desc')
        .orderBy('uploaded_at', 'desc')
        .first();

    const prevFields = JSON.parse(prevVersion.extracted_fields || '{}');
    const versionInfo = {
      current: `v${versionCount + 1}`,
      against: `v${prevVersion.version_number}`,
      current_filename: originalFilename,
      against_filename: prevVersion.original_filename,
    };

    const { items, totalChanges, highestSeverity } = await diffEngine.computeDiff(prevFields, extractedFields, versionInfo);
    const totalRisk = items.reduce((sum, i) => sum + (i.risk_score || 0), 0);
    const diffId = uuid();

    await db('diffs').insert({
      id: diffId, document_id: document.id,
      from_version_id: prevVersion.id, to_version_id: versionId,
      total_changes: totalChanges, highest_severity: highestSeverity,
      status: totalChanges > 0 ? 'pending_workflow' : 'no_changes',
      overall_risk_score: totalRisk,
    });

    if (items.length > 0) {
      await db('diff_items').insert(items.map(i => ({
        id: uuid(), diff_id: diffId,
        field_path: i.field_path, category: i.category,
        domain: i.domain || i.category, change_type: i.change_type,
        old_value: i.old_value, new_value: i.new_value,
        severity: i.severity, needs_review: i.needs_review || 0,
        risk_score: i.risk_score || 0, impact_level: i.impact_level || 'Minor',
        ai_analysis: JSON.stringify(i.ai_analysis || {}),
        affected: JSON.stringify(i.affected || {}),
      })));
    }

    workflowEngine.logAudit('diff', diffId, 'computed', 'system',
      `${totalChanges} change(s) detected, highest severity: ${highestSeverity}`);

    let workflowId = null;
    if (totalChanges > 0) {
      workflowId = await workflowEngine.createWorkflowForDiff(diffId);
    }
    diffResult = { diffId, totalChanges, highestSeverity, workflowId };
  }

  return { document, versionId, diff: diffResult };
}

async function recalculateAllDiffs() {
  const documents = await db('documents').select('id');
  let updatedCount = 0;

  for (const doc of documents) {
    const versions = await db('document_versions')
      .where({ document_id: doc.id })
      .orderBy('version_number', 'asc');

    for (let i = 1; i < versions.length; i++) {
      const prevVer = versions[i - 1];
      const currVer = versions[i];

      let prevFields = {}, currFields = {};
      try { prevFields = JSON.parse(prevVer.extracted_fields || '{}'); } catch (_) {}
      try { currFields = JSON.parse(currVer.extracted_fields || '{}'); } catch (_) {}

      const { items, totalChanges, highestSeverity } = await diffEngine.computeDiff(prevFields, currFields);
      const totalRisk = items.reduce((sum, it) => sum + (it.risk_score || 0), 0);

      let existingDiff = await db('diffs').where({ document_id: doc.id, to_version_id: currVer.id }).first();
      let diffId;

      if (existingDiff) {
        diffId = existingDiff.id;
        const newStatus = totalChanges > 0
          ? (existingDiff.status === 'no_changes' ? 'pending_workflow' : existingDiff.status)
          : 'no_changes';
        await db('diffs').where({ id: diffId }).update({
          from_version_id: prevVer.id, total_changes: totalChanges,
          highest_severity: highestSeverity, status: newStatus,
          overall_risk_score: totalRisk,
        });
      } else {
        diffId = uuid();
        await db('diffs').insert({
          id: diffId, document_id: doc.id,
          from_version_id: prevVer.id, to_version_id: currVer.id,
          total_changes: totalChanges, highest_severity: highestSeverity,
          status: totalChanges > 0 ? 'pending_workflow' : 'no_changes',
          overall_risk_score: totalRisk,
        });
      }

      await db('diff_items').where({ diff_id: diffId }).del();
      if (items.length > 0) {
        await db('diff_items').insert(items.map(it => ({
          id: uuid(), diff_id: diffId,
          field_path: it.field_path, category: it.category,
          domain: it.domain || it.category, change_type: it.change_type,
          old_value: it.old_value, new_value: it.new_value,
          severity: it.severity, needs_review: it.needs_review || 0,
          risk_score: it.risk_score || 0, impact_level: it.impact_level || 'Minor',
          ai_analysis: JSON.stringify(it.ai_analysis || {}),
          affected: JSON.stringify(it.affected || {}),
        })));
      }

      if (totalChanges > 0) {
        const existingWf = await db('approval_workflows').where({ diff_id: diffId }).first();
        if (!existingWf) {
          await workflowEngine.createWorkflowForDiff(diffId);
        }
      }
      updatedCount++;
    }
  }
  return updatedCount;
}

module.exports = { ingestDocumentVersion, formatFromExt, recalculateAllDiffs };
