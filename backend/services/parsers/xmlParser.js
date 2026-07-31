const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

function flatten(obj, prefix, out) {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== 'object') {
    out[prefix] = String(obj);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => flatten(item, `${prefix}[${idx}]`, out));
    return;
  }
  for (const key of Object.keys(obj)) {
    const cleanKey = key.replace(/^@_/, '');
    const newPrefix = prefix ? `${prefix}.${cleanKey}` : cleanKey;
    flatten(obj[key], newPrefix, out);
  }
}

function parse(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const json = parser.parse(xml);
  const flat = {};
  flatten(json, '', flat);
  return flat;
}

module.exports = { parse };
