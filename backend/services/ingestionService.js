  const path = require('path');
  const { v4: uuid } = require('uuid');
  const db = require('../db');
  const diffEngine = require('./diffEngine');
  const workflowEngine = require('./workflowEngine');
  const operatorDetector = require('./ai/operatorDetector');
  const notificationService = require('./notificationService');

  function formatFromExt(filename) {
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    if (ext === 'xml') return 'xml';
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
    if (ext === 'docx' || ext === 'doc') return 'docx';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'csv') return 'csv';
    if (ext === 'txt') return 'txt';
    return ext || 'txt';
  }

  // The single code path for "a new document version has arrived" — used by
  // both the manual/push upload route (routes/documents.js) and the automated
  // heartbeat poller (services/heartbeatPoller.js). Whichever mode ingests a
  // file, it runs through the exact same extraction, diff, and workflow logic.
  async function ingestDocumentVersion({ operatorId, docType, title, filePath, originalFilename, source }) {
    const format = formatFromExt(originalFilename);

    // First extract fields to feed into operator detector and diff engine (Stage 1 & Stage 2 SAR conversion)
    const extractedFields = await diffEngine.extractFields(filePath, format, docType);

    // Automatic Operator Detection if operatorId is omitted or needs verification
    let opRecord = null;
    if (operatorId) {
      opRecord = db.prepare(`SELECT * FROM operators WHERE id = ?`).get(operatorId);
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

    let document = null;
    let versionCount = 0;
    const versionId = uuid();

    // Atomic database transaction for document and version creation
    const tx = db.transaction(() => {
      document = db.prepare(`SELECT * FROM documents WHERE operator_id = ? AND doc_type = ?`).get(operatorId, docType);
      if (!document) {
        const docId = uuid();
        db.prepare(`INSERT INTO documents (id, operator_id, doc_type, format, title) VALUES (?,?,?,?,?)`)
          .run(docId, operatorId, docType, format, title || `${docType} - ${(opRecord && opRecord.name) || 'Unassigned'}`);
        document = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(docId);
      }

      versionCount = db.prepare(`SELECT COUNT(*) c FROM document_versions WHERE document_id = ?`).get(document.id).c;
      const isBaseline = versionCount === 0 ? 1 : 0;
      const initStatus = versionCount === 0 ? 'approved' : 'pending';
      const reqReview = (!opRecord || opRecord.requires_review) ? 1 : 0;

      db.prepare(`
        INSERT INTO document_versions (id, document_id, version_number, file_path, original_filename, source, extracted_fields, approval_status, is_current_baseline, requires_review)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(versionId, document.id, versionCount + 1, filePath, originalFilename, source || 'push', JSON.stringify(extractedFields), initStatus, isBaseline, reqReview);

      db.prepare(`UPDATE documents SET current_version_id = ? WHERE id = ?`).run(versionId, document.id);
    });
    tx();

    workflowEngine.logAudit('document_version', versionId, 'ingested', operatorId, `${source || 'push'} upload: ${originalFilename}`);

    // Create new operator notification ONLY after transaction succeeds
    if (isNewOpDetected && opRecord && opRecord.id) {
      notificationService.createNotification({
        operatorId: opRecord.id,
        type: 'new_operator',
        message: `New operator "${opRecord.name}" (${opRecord.country}) auto-detected from content`,
        recipient: 'admin'
      });
    }

    // Create upload notification
    notificationService.createNotification({
      operatorId: opRecord.id,
      type: 'upload',
      message: `Document v${versionCount + 1} (${originalFilename}) uploaded for ${opRecord.name}`,
      recipient: 'admin, domain_approvers'
    });

    // Supersede any pending diffs/workflows for this document since a newer version arrived
    const pendingDiffs = db.prepare(`SELECT id FROM diffs WHERE document_id = ? AND status IN ('pending_workflow', 'in_approval')`).all(document.id);
    for (const d of pendingDiffs) {
      db.prepare(`UPDATE diffs SET status = 'superseded' WHERE id = ?`).run(d.id);
      db.prepare(`UPDATE approval_workflows SET status = 'superseded' WHERE diff_id = ? AND status = 'in_progress'`).run(d.id);
    }

    let diffResult = null;
    if (versionCount > 0) {
      // Find the specific previous version to compare against (the active baseline)
      const prevVersion = db.prepare(`
        SELECT * FROM document_versions
        WHERE document_id = ? AND is_current_baseline = 1 AND id != ?
      `).get(document.id, versionId) || db.prepare(`
        SELECT * FROM document_versions
        WHERE document_id = ? AND id != ?
        ORDER BY version_number DESC, uploaded_at DESC
        LIMIT 1
      `).get(document.id, versionId);
      const prevFields = JSON.parse(prevVersion.extracted_fields || '{}');

      const versionInfo = {
        current: `v${versionCount + 1}`,
        against: `v${prevVersion.version_number}`,
        current_filename: originalFilename,
        against_filename: prevVersion.original_filename
      };

      const { items, totalChanges, highestSeverity } = await diffEngine.computeDiff(prevFields, extractedFields, versionInfo);

      const diffId = uuid();
      db.prepare(`
        INSERT INTO diffs (id, document_id, from_version_id, to_version_id, total_changes, highest_severity, status, overall_risk_score)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(diffId, document.id, prevVersion.id, versionId, totalChanges, highestSeverity, totalChanges > 0 ? 'pending_workflow' : 'no_changes', items.reduce((sum, i) => sum + (i.risk_score || 0), 0));

      const insertItem = db.prepare(`
        INSERT INTO diff_items (id, diff_id, field_path, category, domain, change_type, old_value, new_value, severity, needs_review, risk_score, impact_level, ai_analysis, affected)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      items.forEach(i => insertItem.run(
        uuid(), diffId, i.field_path, i.category, i.domain || i.category, i.change_type, 
        i.old_value, i.new_value, i.severity, i.needs_review || 0,
        i.risk_score || 0, i.impact_level || 'Minor', JSON.stringify(i.ai_analysis || {}), JSON.stringify(i.affected || {})
      ));

      workflowEngine.logAudit('diff', diffId, 'computed', 'system', `${totalChanges} change(s) detected, highest severity: ${highestSeverity}`);

      let workflowId = null;
      if (totalChanges > 0) {
        workflowId = workflowEngine.createWorkflowForDiff(diffId);
      }
      diffResult = { diffId, totalChanges, highestSeverity, workflowId };
    }

    return { document, versionId, diff: diffResult };
  }

  async function recalculateAllDiffs() {
    const documents = db.prepare('SELECT id FROM documents').all();
    let updatedCount = 0;

    for (const doc of documents) {
      const versions = db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number ASC').all(doc.id);
      for (let i = 1; i < versions.length; i++) {
        const prevVer = versions[i - 1];
        const currVer = versions[i];

        let prevFields = {};
        let currFields = {};
        try { prevFields = JSON.parse(prevVer.extracted_fields || '{}'); } catch (e) {}
        try { currFields = JSON.parse(currVer.extracted_fields || '{}'); } catch (e) {}

        const { items, totalChanges, highestSeverity } = await diffEngine.computeDiff(prevFields, currFields);

        let existingDiff = db.prepare('SELECT * FROM diffs WHERE document_id = ? AND to_version_id = ?').get(doc.id, currVer.id);
        let diffId;
        if (existingDiff) {
          diffId = existingDiff.id;
          const newStatus = totalChanges > 0 ? (existingDiff.status === 'no_changes' ? 'pending_workflow' : existingDiff.status) : 'no_changes';
          const totalRisk = items.reduce((sum, i) => sum + (i.risk_score || 0), 0);
          db.prepare('UPDATE diffs SET from_version_id = ?, total_changes = ?, highest_severity = ?, status = ?, overall_risk_score = ? WHERE id = ?')
            .run(prevVer.id, totalChanges, highestSeverity, newStatus, totalRisk, diffId);
        } else {
          diffId = uuid();
          const totalRisk = items.reduce((sum, i) => sum + (i.risk_score || 0), 0);
          db.prepare('INSERT INTO diffs (id, document_id, from_version_id, to_version_id, total_changes, highest_severity, status, overall_risk_score) VALUES (?,?,?,?,?,?,?,?)')
            .run(diffId, doc.id, prevVer.id, currVer.id, totalChanges, highestSeverity, totalChanges > 0 ? 'pending_workflow' : 'no_changes', totalRisk);
        }

        db.prepare('DELETE FROM diff_items WHERE diff_id = ?').run(diffId);
        const insertItem = db.prepare('INSERT INTO diff_items (id, diff_id, field_path, category, domain, change_type, old_value, new_value, severity, needs_review, risk_score, impact_level, ai_analysis, affected) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        items.forEach(i => insertItem.run(
          uuid(), diffId, i.field_path, i.category, i.domain || i.category, i.change_type, 
          i.old_value, i.new_value, i.severity, i.needs_review || 0,
          i.risk_score || 0, i.impact_level || 'Minor', JSON.stringify(i.ai_analysis || {}), JSON.stringify(i.affected || {})
        ));

        if (totalChanges > 0) {
          const existingWf = db.prepare('SELECT id FROM approval_workflows WHERE diff_id = ?').get(diffId);
          if (!existingWf) {
            workflowEngine.createWorkflowForDiff(diffId);
          }
        }
        updatedCount++;
      }
    }
    return updatedCount;
  }

  module.exports = { ingestDocumentVersion, formatFromExt, recalculateAllDiffs };
