const fs = require('fs');

function parse(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const fields = {};
  let currentSection = 'General';

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Check section header (all caps, or surrounded by brackets/dashes, or line ending with colon without key/val)
    if (/^[A-Z0-9_\s]{3,40}$/.test(line) || /^\[.*\]$/.test(line) || /^===.*===$/.test(line)) {
      currentSection = line.replace(/[^a-zA-Z0-9_\s]/g, '').trim() || 'General';
      continue;
    }

    // Match multiple key-value pairs on a single line
    // Keys are alphanumeric/spaces followed by : or =
    const regex = /([A-Za-z0-9\s\.\-_]+)[:=]\s*(.*?)(?=\s+[A-Za-z0-9\s\.\-_]+[:=]|$)/g;
    let matches;
    let found = false;
    
    while ((matches = regex.exec(line)) !== null) {
      const key = matches[1].trim();
      const val = matches[2].trim();
      if (key && val) {
        fields[`${currentSection}.${key}`] = val;
        found = true;
      }
    }

    if (!found) {
      // Fallback simple key-value matching
      const match = line.match(/^([^:=]+)[:=]\s*(.+)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim();
        if (key && val) {
          fields[`${currentSection}.${key}`] = val;
        }
      }
    }
  }

  return fields;
}

module.exports = { parse };
