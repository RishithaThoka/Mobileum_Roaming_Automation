// Maps an IR21/RAEX field label/path to a business category, based on
// real-world GSMA IR.21 section vocabulary, so each approver only ever
// sees the slice of a document that belongs to their domain.

const RULES = [
  { category: 'Network/Technical', severity: 'major', keywords: [
    'imsi', 'network element', 'signalling', 'signaling', 'point code', 'gt', 'global title',
    'msc', 'hlr', 'sgsn', 'ggsn', 'stp', 'ipx', 'grx', 'apn', 'diameter', 'sctp', 'routing',
    'interconnect', 'testing', 'iot', 'interoperability', 'network id', 'mcc', 'mnc',
    'roaming hub', 'ss7', 'firewall rule', 'technical contact'
  ]},
  { category: 'Security', severity: 'critical', keywords: [
    'security', 'fraud', 'camel', 'encryption', 'authentication', 'ciphering', 'access control',
    'sim security', 'steering of roaming', 'ip security', 'vpn'
  ]},
  { category: 'Commercial', severity: 'major', keywords: [
    'commercial terms', 'agreement', 'roaming agreement', 'discount', 'tap', 'traffic volume',
    'contract', 'sla', 'service level', 'preferred roaming', 'partnership', 'bilateral'
  ]},
  { category: 'Financial/Billing', severity: 'critical', keywords: [
    'tariff', 'rate', 'billing', 'settlement', 'invoice', 'wholesale price', 'ted', 'tap file',
    'currency', 'payment terms', 'financial contact', 'clearing house', 'iot rate'
  ]},
  { category: 'Legal/Compliance', severity: 'major', keywords: [
    'legal', 'regulatory', 'compliance', 'gdpr', 'data protection', 'jurisdiction', 'termination clause',
    'liability', 'signatory', 'authorized representative'
  ]},
  { category: 'Operations', severity: 'minor', keywords: [
    'contact', 'roaming manager', 'operations', 'escalation contact', 'noc', 'support hours',
    'address', 'effective date', 'validity', 'document version', 'revision'
  ]},
];

function categorize(fieldPath, oldValue, newValue) {
  const lower = String(fieldPath).toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return { category: rule.category, domain: rule.category, severity: rule.severity };
    }
  }
  // Rule-based fallback: default to Operations domain
  return { category: 'Operations', domain: 'Operations', severity: 'minor' };
}

module.exports = { categorize };
