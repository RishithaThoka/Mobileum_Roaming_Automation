const mammoth = require('mammoth');

// Extract "Label: Value" style lines from an IR21 master document.
// This mirrors how real IR.21 Word/PDF templates lay out fields
// (one field per line, "Field Name: Value").
function extractFields(text) {
  const flat = {};
  const lines = text.split(/\r?\n/);
  let currentSection = 'General';
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // Section headers are short all-caps or Title Case lines without a colon
    if (!trimmed.includes(':') && trimmed.length < 60 && /^[A-Z0-9 &/()-]+$/.test(trimmed)) {
      currentSection = trimmed;
      return;
    }
    const match = trimmed.match(/^([A-Za-z0-9 /().&-]{2,60}):\s*(.+)$/);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      flat[`${currentSection}.${label}`] = value;
    }
  });
  return flat;
}

async function parse(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return extractFields(result.value);
}

module.exports = { parse, extractFields };
