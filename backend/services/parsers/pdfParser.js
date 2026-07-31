const fs = require('fs');
const pdfParse = require('pdf-parse');
const { extractFields } = require('./docxParser');

async function parse(filePath) {
  const buffer = fs.readFileSync(filePath);
  const result = await pdfParse(buffer);
  return extractFields(result.text);
}

module.exports = { parse };
