const path = require('path');
const reportService = require('../services/reportService');
const db = require('../db');
const fs = require('fs');

async function run() {
  const operators = db.prepare(`SELECT * FROM operators WHERE name IN ('Telefonica Espana', 'Bharti Airtel', 'Orange France', 'Singtel Singapore') OR name = 'INDAT' OR name = 'Singtel'`).all();
  if (operators.length === 0) {
    console.log("No test operators found in DB.");
    return;
  }

  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  for (const op of operators) {
    const outPath = path.join(reportsDir, `test_report_${op.name.replace(/\s+/g, '_')}.pdf`);
    const writeStream = fs.createWriteStream(outPath);
    try {
      reportService.generateOperatorReportPDFStream(op.id, writeStream);
      console.log(`Generated test report for ${op.name} at: ${outPath}`);
    } catch (err) {
      console.error(`Error generating report for ${op.name}:`, err);
    }
  }
}

run();
