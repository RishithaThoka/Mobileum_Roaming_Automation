const xmlParser = require('./parsers/xmlParser');
const xlsxParser = require('./parsers/xlsxParser');
const docxParser = require('./parsers/docxParser');
const pdfParser = require('./parsers/pdfParser');
const csvParser = require('./parsers/csvParser');
const txtParser = require('./parsers/txtParser');
const documentExtractor = require('./ai/documentExtractor');
const sarConverter = require('./ai/sarConverter');
const domainClassifier = require('./ai/domainClassifier');
const { categorize } = require('./categorize');

/**
 * Stage 1 & Stage 2: Extract text/structure -> Convert to SAR (Standard Agreement Representation)
 */
async function extractFields(filePath, format, docType = '') {
  let rawStructuredData = null;

  try {
    switch (format) {
      case 'xml': rawStructuredData = xmlParser.parse(filePath); break;
      case 'xlsx': rawStructuredData = xlsxParser.parse(filePath); break;
      case 'docx': rawStructuredData = await docxParser.parse(filePath); break;
      case 'pdf': rawStructuredData = await pdfParser.parse(filePath); break;
      case 'csv': rawStructuredData = csvParser.parse(filePath); break;
      case 'txt': rawStructuredData = txtParser.parse(filePath); break;
      default: rawStructuredData = await documentExtractor.extract(filePath, format); break;
    }
  } catch (err) {
    console.warn(`[diffEngine] Primary parser for format '${format}' encountered error: ${err.message}. Falling back to AI extractor.`);
    rawStructuredData = await documentExtractor.extract(filePath, format);
  }

  // Convert extracted structure to normalized SAR key-value map
  const sarMap = sarConverter.toSAR(rawStructuredData, docType);
  return sarMap;
}

const SEVERITY_RANK = { minor: 1, major: 2, critical: 3 };

/**
 * Stage 3 & Stage 4: Dynamic Domain Identification + Version-to-Version Comparison
 */
async function computeDiff(oldFields, newFields, versionInfo = {}) {
  const items = [];
  const domainsDict = {};
  const allKeys = new Set([...Object.keys(oldFields || {}), ...Object.keys(newFields || {})]);

  for (const key of allKeys) {
    const oldVal = oldFields ? oldFields[key] : undefined;
    const newVal = newFields ? newFields[key] : undefined;

    if (oldVal === newVal) continue;

    let changeType;
    if (oldVal === undefined) changeType = 'added';
    else if (newVal === undefined) changeType = 'removed';
    else changeType = 'modified';

    // Stage 3 Domain Classification
    const classResult = await domainClassifier.classifyDomain(key, oldVal, newVal);
    const domainName = classResult.domain || 'Operations';
    const severity = classResult.severity || 'minor';
    const needsReview = classResult.needs_review || 0;
    
    // Impact level logic
    let impact_level = 'Minor';
    let risk_score = 10;
    if (severity === 'critical') { impact_level = 'Critical'; risk_score = 75; }
    else if (severity === 'major') { impact_level = 'Moderate'; risk_score = 40; }
    
    // Add extra risk based on domain
    if (domainName === 'Security (IPsec)' || domainName === 'Routing (GT)') risk_score += 15;
    
    // AI Analysis simulation
    const ai_analysis = {
      summary: `${changeType === 'added' ? 'Added new' : (changeType === 'removed' ? 'Removed' : 'Updated')} parameter '${key}'.`,
      business_impact: `Changes to ${key} within the ${domainName} domain may require network configuration updates. Ensure compatibility with partner systems.`,
      rollback_recommendation: `Revert the ${key} setting to '${oldVal || 'its previous state'}' if connectivity degradation is observed.`
    };
    
    const affected = {
      teams: [domainName],
      countries: ['Global'],
      services: ['Roaming']
    };

    const diffItem = {
      field_path: key,
      field: key,
      category: domainName,
      domain: domainName,
      change_type: changeType,
      before: oldVal ?? null,
      after: newVal ?? null,
      old_value: oldVal ?? null,
      new_value: newVal ?? null,
      severity,
      needs_review: needsReview,
      risk_score,
      impact_level,
      ai_analysis,
      affected
    };

    items.push(diffItem);

    if (!domainsDict[domainName]) {
      domainsDict[domainName] = [];
    }
    domainsDict[domainName].push(diffItem);
  }

  let highestSeverity = 'minor';
  for (const item of items) {
    if (SEVERITY_RANK[item.severity] > SEVERITY_RANK[highestSeverity]) {
      highestSeverity = item.severity;
    }
  }

  const comparedVersion = {
    current: versionInfo.current || versionInfo.to_version || 'v2',
    against: versionInfo.against || versionInfo.from_version || 'v1',
    current_filename: versionInfo.current_filename || '',
    against_filename: versionInfo.against_filename || ''
  };

  return {
    items,
    domains: domainsDict,
    compared_version: comparedVersion,
    totalChanges: items.length,
    highestSeverity
  };
}

module.exports = { extractFields, computeDiff };
