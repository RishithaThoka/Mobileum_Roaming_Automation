const fs = require('fs');

function parse(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const fields = {};

  if (lines.length === 0) return fields;

  let currentCategory = 'General';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Parse CSV line (supporting comma or tab delimiters)
    const cols = line.split(/[,;\t]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length >= 2) {
      const key = cols[0];
      const val = cols[1];
      if (key && val && key !== 'Field' && key !== 'Key' && key !== 'Parameter') {
        fields[`${currentCategory}.${key}`] = val;
      }
    } else if (cols.length === 1 && cols[0]) {
      // Header/Section line
      currentCategory = cols[0].replace(/[^a-zA-Z0-9_\s]/g, '').trim() || 'General';
    }
  }

  return fields;
}

module.exports = { parse };
