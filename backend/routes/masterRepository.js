const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const operators = db.prepare(`SELECT * FROM operators ORDER BY name ASC`).all();
  const documents = db.prepare(`
    SELECT d.*, o.name as operator_name, o.region as operator_region, o.country as operator_country
    FROM documents d
    JOIN operators o ON d.operator_id = o.id
    ORDER BY d.created_at DESC
  `).all();

  const versions = db.prepare(`
    SELECT v.*, d.operator_id, d.doc_type, d.title as doc_title
    FROM document_versions v
    JOIN documents d ON v.document_id = d.id
    ORDER BY v.version_number DESC
  `).all();

  const diffs = db.prepare(`
    SELECT df.*, d.operator_id
    FROM diffs df
    JOIN documents d ON df.document_id = d.id
    ORDER BY df.created_at DESC
  `).all();

  const diffItems = db.prepare(`SELECT * FROM diff_items`).all();

  // Attach diff items to diffs
  const diffItemsMap = {};
  diffItems.forEach(item => {
    if (!diffItemsMap[item.diff_id]) diffItemsMap[item.diff_id] = [];
    diffItemsMap[item.diff_id].push(item);
  });

  diffs.forEach(df => {
    df.items = diffItemsMap[df.id] || [];
  });

  // Map versions and diffs to documents
  const versionsMap = {};
  versions.forEach(v => {
    if (!versionsMap[v.document_id]) versionsMap[v.document_id] = [];
    versionsMap[v.document_id].push(v);
  });

  const diffsMap = {};
  diffs.forEach(df => {
    if (!diffsMap[df.document_id]) diffsMap[df.document_id] = [];
    diffsMap[df.document_id].push(df);
  });

  documents.forEach(doc => {
    doc.versions = versionsMap[doc.id] || [];
    doc.diffs = diffsMap[doc.id] || [];
    doc.baselineVersion = doc.versions.find(v => v.is_current_baseline === 1) || doc.versions[doc.versions.length - 1] || null;
  });

  // Group documents by operator
  const opDocsMap = {};
  documents.forEach(doc => {
    if (!opDocsMap[doc.operator_id]) opDocsMap[doc.operator_id] = [];
    opDocsMap[doc.operator_id].push(doc);
  });

  operators.forEach(op => {
    op.documents = opDocsMap[op.id] || [];
    op.region = op.region || 'Global';
  });

  // Group operators by Region
  const regionsMap = {};
  operators.forEach(op => {
    const reg = op.region || 'Global';
    if (!regionsMap[reg]) regionsMap[reg] = [];
    regionsMap[reg].push(op);
  });

  // Unassigned / Needs Review bucket
  const unassignedDocs = documents.filter(d => !d.operator_id || d.requires_review === 1);

  res.json({
    regions: Object.entries(regionsMap).map(([region, ops]) => ({
      region,
      operators: ops
    })),
    unassigned: unassignedDocs
  });
});

module.exports = router;
