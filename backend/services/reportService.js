const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../db');
const workflowEngine = require('./workflowEngine');

// -----------------------------------------------------------------------------
// Data Gathering
// -----------------------------------------------------------------------------

async function getOperatorReportData(operatorId) {
  const operator = await db('operators').where({ id: operatorId }).first();
  if (!operator) return null;

  const documents = await db('documents')
    .where({ operator_id: operator.id })
    .orderBy('created_at', 'desc');

  for (const doc of documents) {
    doc.versions = await db('document_versions')
      .where({ document_id: doc.id })
      .orderBy('version_number', 'desc');
  }

  const docIds = documents.map(d => d.id);
  let diffs = [];
  if (docIds.length > 0) {
    diffs = await db('diffs as d')
      .select(['d.*', 'doc.doc_type', 'doc.title as doc_title'])
      .join('documents as doc', 'd.document_id', 'doc.id')
      .whereIn('d.document_id', docIds)
      .orderBy('d.created_at', 'desc');
  }

  let diffItems = [];
  const diffIds = diffs.map(d => d.id);
  if (diffIds.length > 0) {
    diffItems = await db('diff_items').whereIn('diff_id', diffIds);
  }

  for (const diff of diffs) {
    diff.items = diffItems.filter(item => item.diff_id === diff.id);
  }

  let activeApprovals = [];
  let emailLogs = [];
  if (diffIds.length > 0) {
    activeApprovals = await db('approval_steps as s')
      .select(['s.*', 'w.diff_id', 'd.document_id', 'doc.doc_type', 'doc.title as doc_title'])
      .join('approval_workflows as w', 's.workflow_id', 'w.id')
      .join('diffs as d', 'w.diff_id', 'd.id')
      .join('documents as doc', 'd.document_id', 'doc.id')
      .whereIn('w.diff_id', diffIds)
      .orderBy('s.step_order', 'asc');

    const stepIds = activeApprovals.map(a => a.id);
    if (stepIds.length > 0) {
      emailLogs = await db('email_log').whereIn('approval_step_id', stepIds);
    }
  }

  return { operator, documents, diffs, activeApprovals, emailLogs };
}

// -----------------------------------------------------------------------------
// PDF Layout & Drawing Helpers
// -----------------------------------------------------------------------------

const COLORS = {
  primary: '#0F172A',
  accent: '#0EA5E9',
  bgLight: '#F1F5F9',
  bgAlt: '#F8FAFC',
  text: '#334155',
  textLight: '#64748B',
  border: '#E2E8F0',
  red: '#EF4444',
  amber: '#F59E0B',
  green: '#10B981',
  gray: '#94A3B8',
  white: '#FFFFFF'
};

function getStatusColor(status) {
  if (!status) return COLORS.gray;
  const s = status.toLowerCase();
  if (s.includes('reject') || s.includes('critical') || s.includes('fail')) return COLORS.red;
  if (s.includes('approve') || s.includes('minor') || s.includes('active') || s.includes('sent')) return COLORS.green;
  if (s.includes('pending') || s.includes('major') || s.includes('waiting')) return COLORS.amber;
  return COLORS.gray;
}

function checkPageBreak(doc, heightNeeded) {
  if (doc.y + heightNeeded > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    return true;
  }
  return false;
}

function drawHeader(doc, operator, date) {
  const margin = 50;
  // Remember original position to not mess up page additions
  doc.rect(0, 0, doc.page.width, 10).fill(COLORS.accent);
  
  // Left: Logo/Wordmark
  doc.fillColor(COLORS.accent).fontSize(20).text('MRA', margin, 35, { continued: false });
  doc.fillColor(COLORS.primary).fontSize(16).text('Operator Daily Report', margin + 50, 38, { continued: false });
  
  // Right: Operator Info
  const rightAlign = doc.page.width - margin - 200;
  doc.fontSize(10).fillColor(COLORS.textLight)
     .text(operator.name, rightAlign, 35, { align: 'right', width: 200 })
     .text(date, rightAlign, 49, { align: 'right', width: 200 });

  doc.moveTo(margin, 75).lineTo(doc.page.width - margin, 75).lineWidth(1).stroke(COLORS.border);
  doc.y = 95;
}

function drawFooter(doc) {
  const margin = 50;
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    const bottomY = doc.page.height - 40;
    doc.moveTo(margin, bottomY).lineTo(doc.page.width - margin, bottomY).lineWidth(1).stroke(COLORS.border);
    // Use lineBreak: false to prevent PDFKit from triggering auto-pagination when drawing in the margin
    doc.fontSize(8).fillColor(COLORS.textLight).text('Confidential — Internal Use Only', margin, bottomY + 10, { lineBreak: false });
    doc.text(`Page ${i + 1} of ${pageCount}`, margin, bottomY + 10, { align: 'right', lineBreak: false });
  }
}

function drawBadge(doc, text, color, x, y, fixedWidth = null) {
  doc.fontSize(8);
  const textStr = (text || '').toUpperCase();
  const textWidth = doc.widthOfString(textStr);
  const width = fixedWidth || (textWidth + 16);
  const height = 16;
  
  doc.roundedRect(x, y, width, height, 4).fill(color);
  const textX = x + (width - textWidth) / 2; // Center text in badge
  doc.fillColor(COLORS.white).text(textStr, textX, y + 4.5, { lineBreak: false });
  return width;
}

function drawTable(doc, startX, startY, columns, rows) {
  let y = startY;
  const tableWidth = doc.page.width - startX * 2;
  const minRowHeight = 25;

  // Header drawing helper
  const drawHeaderRow = (currentY) => {
    doc.rect(startX, currentY, tableWidth, minRowHeight).fill(COLORS.primary);
    let x = startX;
    for (const col of columns) {
      doc.fillColor(COLORS.white).fontSize(9).text(col.header, x + 5, currentY + 8, { width: col.width - 10, align: col.align || 'left' });
      x += col.width;
    }
  };

  drawHeaderRow(y);
  y += minRowHeight;

  // Rows
  let altRow = true;
  for (const row of rows) {
    // 1. Calculate required height for this row
    let maxCellHeight = minRowHeight;
    doc.fontSize(9);
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const val = row[i];
      if (val && typeof val === 'object' && val.type === 'badge') {
        // Badges are fixed height 16px
        maxCellHeight = Math.max(maxCellHeight, 20);
      } else {
        const textStr = val !== null && val !== undefined ? String(val).replace(/\r\n/g, '\n') : '-';
        const textHeight = doc.heightOfString(textStr, { width: col.width - 10 });
        maxCellHeight = Math.max(maxCellHeight, textHeight + 10);
      }
    }
    const rowHeight = maxCellHeight;

    const isNewPage = checkPageBreak(doc, rowHeight);
    if (doc.y !== y) { 
      y = doc.y; 
      altRow = true; 
      if (isNewPage || doc.y < doc.page.margins.top + 60) {
        drawHeaderRow(y);
        y += minRowHeight;
      }
    }
    
    if (altRow) doc.rect(startX, y, tableWidth, rowHeight).fill(COLORS.bgAlt);
    else doc.rect(startX, y, tableWidth, rowHeight).fill(COLORS.white);

    let colX = startX;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const val = row[i];
      if (val && typeof val === 'object' && val.type === 'badge') {
        const badgeWidth = col.width > 20 ? col.width - 10 : null; // max available width
        // Center vertically in the row
        const badgeY = y + (rowHeight - 16) / 2;
        drawBadge(doc, val.text, val.color, colX + 5, badgeY, val.fixedWidth || badgeWidth);
      } else {
        const textStr = val !== null && val !== undefined ? String(val).replace(/\r\n/g, '\n') : '-';
        const textHeight = doc.heightOfString(textStr, { width: col.width - 10 });
        const textY = y + (rowHeight - textHeight) / 2;
        doc.fillColor(COLORS.text).fontSize(9).text(textStr, colX + 5, textY, { width: col.width - 10, align: col.align || 'left' });
      }
      colX += col.width;
    }
    
    y += rowHeight;
    altRow = !altRow;
    doc.y = y;
  }
  doc.moveTo(startX, y).lineTo(startX + tableWidth, y).lineWidth(1).stroke(COLORS.border);
  doc.y = y + 15;
}

// -----------------------------------------------------------------------------
// Report Generation
// -----------------------------------------------------------------------------

async function generateOperatorReportPDFStream(operatorId, outStream) {
  const data = await getOperatorReportData(operatorId);
  if (!data) throw new Error('Operator not found');
  const { operator, documents, diffs, activeApprovals, emailLogs } = data;

  // Use bottom margin 80 to avoid overlapping with footer
  const doc = new PDFDocument({ margin: 50, margins: { top: 50, bottom: 80, left: 50, right: 50 }, bufferPages: true, autoFirstPage: true });
  doc.pipe(outStream);
  
  const dateStr = new Date().toLocaleDateString();

  // Draw header on every newly added page automatically
  doc.on('pageAdded', () => {
    drawHeader(doc, operator, dateStr);
  });

  const margin = 50;
  const contentWidth = doc.page.width - margin * 2;

  // Draw header for the very first page
  drawHeader(doc, operator, dateStr);

  // --- Operator Details Card ---
  const initialY = doc.y;
  doc.roundedRect(margin, initialY, contentWidth, 95, 6).fillAndStroke(COLORS.bgLight, COLORS.border);
  doc.fillColor(COLORS.primary).fontSize(12).text('Operator Profile', margin + 15, initialY + 15);
  doc.moveTo(margin + 15, initialY + 35).lineTo(margin + contentWidth - 15, initialY + 35).lineWidth(0.5).stroke(COLORS.border);
  
  const col1 = margin + 15;
  const col2 = margin + contentWidth / 2;
  let detailY = initialY + 45;

  doc.fontSize(9).fillColor(COLORS.textLight).text('Name:', col1, detailY);
  doc.fillColor(COLORS.text).text(operator.name, col1 + 80, detailY);
  doc.fillColor(COLORS.textLight).text('Network Code:', col2, detailY);
  doc.fillColor(COLORS.text).text(operator.network_code || 'N/A', col2 + 80, detailY);

  detailY += 15;
  doc.fillColor(COLORS.textLight).text('Country:', col1, detailY);
  doc.fillColor(COLORS.text).text(operator.country, col1 + 80, detailY);
  doc.fillColor(COLORS.textLight).text('Contact Email:', col2, detailY);
  doc.fillColor(COLORS.text).text(operator.contact_email || 'N/A', col2 + 80, detailY);

  detailY += 15;
  doc.fillColor(COLORS.textLight).text('Ingest Mode:', col1, detailY);
  doc.fillColor(COLORS.text).text((operator.ingest_mode || 'Push').toUpperCase(), col1 + 80, detailY);

  doc.y = initialY + 110;

  // --- Summary Statistics Cards ---
  // To strictly match the detailed tables below, we only count the latest diff of each document
  let latestDiffIds = [];
  for (const doc of documents) {
    const docDiffs = diffs.filter(d => d.document_id === doc.id);
    if (docDiffs.length > 0) {
      latestDiffIds.push(docDiffs[0].id);
    }
  }

  // Count active approvals ONLY for the latest diffs (what is shown in the tables)
  const renderedApprovals = activeApprovals.filter(a => latestDiffIds.includes(a.diff_id));
  const pendingApprovals = renderedApprovals.filter(a => ['pending', 'waiting'].includes((a.status || '').toLowerCase())).length;
  const approvedApprovals = renderedApprovals.filter(a => (a.status || '').toLowerCase() === 'approved').length;

  const stats = [
    { label: 'Total Documents', val: documents.length, color: COLORS.accent },
    { label: 'Pending Approvals', val: pendingApprovals, color: COLORS.amber },
    { label: 'Approved Steps', val: approvedApprovals, color: COLORS.green }
  ];

  const cardWidth = (contentWidth - 20) / 3;
  let cardX = margin;
  const cardsY = doc.y;
  for (const stat of stats) {
    doc.roundedRect(cardX, cardsY, cardWidth, 60, 6).fillAndStroke(COLORS.white, COLORS.border);
    doc.rect(cardX, cardsY + 56, cardWidth, 4).fill(stat.color); // bottom accent
    
    doc.fillColor(COLORS.primary).fontSize(20).text(stat.val, cardX, cardsY + 15, { align: 'center', width: cardWidth });
    doc.fillColor(COLORS.textLight).fontSize(9).text(stat.label, cardX, cardsY + 40, { align: 'center', width: cardWidth });
    cardX += cardWidth + 10;
  }
  doc.y = cardsY + 85;

  // --- Documents Section ---
  doc.fontSize(14).fillColor(COLORS.primary).text('Document Portfolio', margin, doc.y);
  doc.y += 15;

  if (documents.length === 0) {
    doc.fontSize(10).fillColor(COLORS.textLight).text('No documents on file for this operator.');
  }

  for (const document of documents) {
    checkPageBreak(doc, 100);
    
    const docStartY = doc.y;
    // Document Card Header
    doc.roundedRect(margin, docStartY, contentWidth, 40, 4).fill(COLORS.primary);
    
    const badgeW = drawBadge(doc, document.format, COLORS.accent, margin + 12, docStartY + 12);
    // Be careful to explicitly set color and position for doc.text after drawing badge
    doc.fillColor(COLORS.white).fontSize(11).text(document.title || 'Untitled Document', margin + 12 + badgeW + 10, docStartY + 14);
    
    doc.fontSize(9).fillColor(COLORS.textLight).text(`Versions: ${document.versions.length}`, margin, docStartY + 15, { align: 'right', width: contentWidth - 10 });
    
    doc.y = docStartY + 55;

    // Version History Table
    if (document.versions && document.versions.length > 0) {
      doc.fontSize(10).fillColor(COLORS.text).text('Version History', margin, doc.y);
      doc.y += 8;
      const vCols = [
        { header: 'Version', width: 60 },
        { header: 'Uploaded At', width: 120 },
        { header: 'Source', width: 80 },
        { header: 'Original Filename', width: contentWidth - 260 }
      ];
      const vRows = document.versions.map(v => [
        `v${v.version_number}`,
        v.uploaded_at ? v.uploaded_at.slice(0, 16).replace('T', ' ') : 'N/A',
        (v.source || 'push').toUpperCase(),
        v.original_filename || 'Unknown'
      ]);
      drawTable(doc, margin, doc.y, vCols, vRows);
    }

    const docDiffs = diffs.filter(d => d.document_id === document.id);
    if (docDiffs.length > 0) {
      const latestDiff = docDiffs[0];
      
      // Inline Status Row
      doc.y += 10;
      doc.fontSize(10).fillColor(COLORS.text).text('Latest Diff Status:', margin, doc.y);
      let inlineX = margin + doc.widthOfString('Latest Diff Status:') + 10;
      
      inlineX += drawBadge(doc, latestDiff.status, getStatusColor(latestDiff.status), inlineX, doc.y - 3) + 8;
      inlineX += drawBadge(doc, latestDiff.highest_severity, getStatusColor(latestDiff.highest_severity), inlineX, doc.y - 3) + 8;
      
      doc.fillColor(COLORS.textLight).fontSize(9).text(`Total Changes: ${latestDiff.total_changes}`, inlineX, doc.y);
      doc.y += 25;

      // Changes Details
      if (latestDiff.items && latestDiff.items.length > 0) {
        
        // Category Breakdown
        const cats = {};
        const { categorize } = require('./categorize');
        for (const item of latestDiff.items) {
          // diff_items.category in the DB currently stores granular domains like "Routing (GT)". 
          // We map it back to the 6 broad enums (Network/Technical, etc.) using categorize() to match the UI.
          const cat = categorize(item.field_path).category;
          cats[cat] = (cats[cat] || 0) + 1;
        }
        const catStr = Object.entries(cats).map(([k, v]) => `${k}: ${v}`).join('  |  ');
        doc.fontSize(9).fillColor(COLORS.textLight).text(`Category Breakdown: ${catStr}`, margin, doc.y);
        doc.y += 15;

        doc.fontSize(10).fillColor(COLORS.primary).text('Changes Details', margin, doc.y);
        doc.y += 10;
        const colW = contentWidth / 5;
        const columns = [
          { header: 'Severity', width: 65 }, // widened for CRITICAL
          { header: 'Field', width: colW * 2 - 65 },
          { header: 'Type', width: 60 },
          { header: 'Old Value', width: colW * 1.5 },
          { header: 'New Value', width: colW * 1.5 }
        ];
        const rows = latestDiff.items.map(item => [
          { type: 'badge', text: item.severity, color: getStatusColor(item.severity) },
          item.field_path,
          item.change_type,
          item.old_value,
          item.new_value
        ]);
        drawTable(doc, margin, doc.y, columns, rows);
      }

      // Approval Timeline Table
      const diffApprovals = activeApprovals.filter(a => a.diff_id === latestDiff.id);
      if (diffApprovals.length > 0) {
        checkPageBreak(doc, 60);
        doc.fontSize(10).fillColor(COLORS.primary).text('Approval Workflow', margin, doc.y);
        doc.y += 10;
        
        const colW = contentWidth / 4;
        const columns = [
          { header: 'Step', width: 40 },
          { header: 'Role / Approver', width: colW * 1.2 },
          { header: 'Status', width: 75 },
          { header: 'Timestamps', width: 90 },
          { header: 'Comment', width: colW * 2.8 - 205 }
        ];
        const rows = diffApprovals.map((step, index) => {
          let timeStr = '';
          if (step.notified_at) timeStr += `Notified: ${step.notified_at.slice(5,16).replace('T',' ')}\n`;
          if (step.decided_at) timeStr += `Decided: ${step.decided_at.slice(5,16).replace('T',' ')}`;
          if (!timeStr) timeStr = 'Pending';
          
          return [
            `#${index + 1}`, // Sequential 1-based index instead of global step_order priority grouping
            `${step.role_title} (${step.approver_name || 'N/A'})`,
            { type: 'badge', text: step.status, color: getStatusColor(step.status) },
            timeStr.trim(),
            step.comment || ''
          ];
        });
        drawTable(doc, margin, doc.y, columns, rows);

        // Email delivery note
        const diffEmailLogs = emailLogs.filter(e => diffApprovals.some(a => a.id === e.approval_step_id));
        if (diffEmailLogs.length > 0) {
          const sent = diffEmailLogs.filter(e => e.mode === 'sent' || e.mode === 'simulated').length;
          const failed = diffEmailLogs.filter(e => e.mode === 'failed').length;
          doc.fontSize(9).fillColor(COLORS.textLight).text(`Email Delivery: ${sent} notifications sent, ${failed} failed.`, margin, doc.y);
          doc.y += 20;
        }
      }
    } else {
      doc.fontSize(9).fillColor(COLORS.textLight).text('No recent changes or active workflows.', margin, doc.y);
      doc.y += 20;
    }
    
    doc.y += 15;
  }

  drawFooter(doc);
  doc.end();
}

async function generateAllOperatorReports() {
  const operators = await db('operators').where({ status: 'active' });
  const dateStr = new Date().toISOString().split('T')[0];
  const reportsDir = path.join(__dirname, '..', 'reports', dateStr);

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  for (const operator of operators) {
    const filename = `${operator.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.pdf`;
    const filePath = path.join(reportsDir, filename);
    const writeStream = fs.createWriteStream(filePath);

    try {
      await generateOperatorReportPDFStream(operator.id, writeStream);
      workflowEngine.logAudit('operator', operator.id, 'report_generated', 'system', `Generated daily PDF report for operator saved to ${filePath}`);
    } catch (e) {
      console.error(`Error generating report for operator ${operator.id}:`, e);
      workflowEngine.logAudit('operator', operator.id, 'report_generation_error', 'system', `Error: ${e.message}`);
    }
  }
}

module.exports = {
  getOperatorReportData,
  generateOperatorReportPDFStream,
  generateAllOperatorReports
};
