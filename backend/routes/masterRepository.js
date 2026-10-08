'use strict';

const express = require('express');
const db      = require('../db');
const router  = express.Router();

router.get('/', async (req, res) => {
  const operators = await db('operators').orderBy('name', 'asc');
  const documents = await db('documents as d')
    .select(['d.*', 'o.name as operator_name', 'o.region as operator_region', 'o.country as operator_country'])
    .join('operators as o', 'd.operator_id', 'o.id')
    .orderBy('d.created_at', 'desc');

  const versions = await db('document_versions as v')
    .select(['v.*', 'd.operator_id', 'd.doc_type', 'd.title as doc_title'])
    .join('documents as d', 'v.document_id', 'd.id')
    .orderBy('v.version_number', 'desc');

  const diffs = await db('diffs as df')
    .select(['df.*', 'd.operator_id'])
    .join('documents as d', 'df.document_id', 'd.id')
    .orderBy('df.created_at', 'desc');

  const diffItems = await db('diff_items').select('*');

  // Attach diff items to diffs
  const diffItemsMap = {};
  diffItems.forEach(item => {
    if (!diffItemsMap[item.diff_id]) diffItemsMap[item.diff_id] = [];
    diffItemsMap[item.diff_id].push(item);
  });
  diffs.forEach(df => { df.items = diffItemsMap[df.id] || []; });

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
    doc.diffs    = diffsMap[doc.id]    || [];
    doc.baselineVersion = doc.versions.find(v => v.is_current_baseline === 1)
      || doc.versions[doc.versions.length - 1] || null;
  });

  // Group documents by operator
  const opDocsMap = {};
  documents.forEach(doc => {
    if (!opDocsMap[doc.operator_id]) opDocsMap[doc.operator_id] = [];
    opDocsMap[doc.operator_id].push(doc);
  });

  operators.forEach(op => {
    op.documents = opDocsMap[op.id] || [];
    op.region    = op.region || 'Global';
  });

  // Group operators by region
  const regionsMap = {};
  operators.forEach(op => {
    const reg = op.region || 'Global';
    if (!regionsMap[reg]) regionsMap[reg] = [];
    regionsMap[reg].push(op);
  });

  const unassignedDocs = documents.filter(d => !d.operator_id || d.requires_review === 1);

  res.json({
    regions: Object.entries(regionsMap).map(([region, ops]) => ({ region, operators: ops })),
    unassigned: unassignedDocs,
  });
});

module.exports = router;
