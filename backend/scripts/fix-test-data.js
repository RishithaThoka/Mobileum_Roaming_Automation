const db = require('../db');
const txtParser = require('../services/parsers/txtParser');
const reportService = require('../services/reportService');
const ingestionService = require('../services/ingestionService');
const fs = require('fs');

async function fixData() {
  // 1. Fix the operator name in DB
  const op = db.prepare(`SELECT * FROM operators WHERE name = 'INDAT' OR normalized_name LIKE '%indat%'`).get();
  if (op) {
    console.log("Fixing operator:", op.id);
    db.prepare(`UPDATE operators SET name = 'Telefonica Espana', country = 'Spain', network_code = 'ESPTE' WHERE id = ?`).run(op.id);
  }

  // 2. Reparse the text files for this operator to fix the extracted_fields and diffs
  if (op) {
    const versions = db.prepare(`
      SELECT dv.*, d.id as doc_id 
      FROM document_versions dv 
      JOIN documents d ON dv.document_id = d.id 
      WHERE d.operator_id = ? AND dv.file_path LIKE '%.txt'
    `).all(op.id);

    for (const v of versions) {
      if (fs.existsSync(v.file_path)) {
        console.log("Reparsing:", v.file_path);
        const fields = txtParser.parse(v.file_path);
        db.prepare(`UPDATE document_versions SET extracted_fields = ? WHERE id = ?`).run(JSON.stringify(fields), v.id);
      }
    }

    console.log("Recalculating diffs...");
    await ingestionService.recalculateAllDiffs();
  }

  // 3. Regenerate the report
  if (op) {
    const outPath = require('path').join(__dirname, '..', 'reports', 'test_redesign_report.pdf');
    const writeStream = fs.createWriteStream(outPath);
    reportService.generateOperatorReportPDFStream(op.id, writeStream);
    console.log(`Generated fixed test report at: ${outPath}`);
  }
}

fixData().catch(console.error);
