/**
 * Stage 2: Auto SAR Converter (Standard Agreement Representation)
 * Converts arbitrary structured extraction JSON into normalized SAR internal representation.
 * Flattens nested structures into path-delimited key-value maps while maintaining section context.
 */

function toSAR(structuredData, docType = '') {
  if (!structuredData || typeof structuredData !== 'object') {
    return {};
  }

  const sarMap = {};

  // Branch by document type if document-type-specific normalization is required
  const typePrefix = docType ? docType.toUpperCase() : '';

  function recurse(obj, currentPath) {
    for (const [key, val] of Object.entries(obj || {})) {
      if (!key) continue;
      const pathSegment = key.replace(/[^a-zA-Z0-9_\s.-]/g, '').trim();
      const newPath = currentPath ? `${currentPath}.${pathSegment}` : pathSegment;

      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        recurse(val, newPath);
      } else if (Array.isArray(val)) {
        sarMap[newPath] = val.join(', ');
      } else {
        sarMap[newPath] = String(val ?? '').trim();
      }
    }
  }

  recurse(structuredData, '');

  return sarMap;
}

module.exports = { toSAR };
