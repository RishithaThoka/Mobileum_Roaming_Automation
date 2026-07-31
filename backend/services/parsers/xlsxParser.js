const XLSX = require('xlsx');

function parse(filePath) {
  const wb = XLSX.readFile(filePath);
  const flat = {};
  wb.SheetNames.forEach(sheetName => {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    // Treat as label/value pairs where col A = field label, col B = value
    // (common convention for IR.21-style operator data sheets)
    rows.forEach((row, rIdx) => {
      const label = row[0];
      const value = row[1];
      if (label && String(label).trim() !== '' && value !== undefined && value !== '') {
        flat[`${sheetName}.${String(label).trim()}`] = String(value);
      } else {
        // fallback: also record raw cell coordinates so nothing is missed
        row.forEach((cell, cIdx) => {
          if (cell !== '' && cell !== undefined) {
            flat[`${sheetName}!R${rIdx + 1}C${cIdx + 1}`] = String(cell);
          }
        });
      }
    });
  });
  return flat;
}

module.exports = { parse };
