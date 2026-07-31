const { categorize } = require('../categorize');

/**
 * Stage 3: Domain Classifier (Rule-based priority + AI classification fallback)
 * Identifies the business domain for any field or section dynamically, even when
 * the document structure is brand new or unseen.
 */
const DOMAINS = [
  'Routing (GT)',
  'Packet Core (APN)',
  'Voice/SMS (IMSI)',
  'Commercial (IOT)',
  'Security (IPsec)'
];

async function classifyDomain(fieldPath, oldValue, newValue) {
  // 1. Priority Rule-Based Lookup
  const lowerPath = String(fieldPath).toLowerCase();

  // We are bypassing the old categorize rules to enforce the strict 5 domains.
  
  // Security
  if (lowerPath.includes('ipsec') || lowerPath.includes('security') || lowerPath.includes('vpn') || lowerPath.includes('crypto')) {
    return { domain: 'Security (IPsec)', category: 'Security (IPsec)', severity: 'critical', needs_review: 0 };
  }
  // Routing
  if (lowerPath.includes('gt') || lowerPath.includes('routing') || lowerPath.includes('global title') || lowerPath.includes('sccp')) {
    return { domain: 'Routing (GT)', category: 'Routing (GT)', severity: 'major', needs_review: 0 };
  }
  // Packet Core
  if (lowerPath.includes('apn') || lowerPath.includes('data') || lowerPath.includes('pgw') || lowerPath.includes('sgw') || lowerPath.includes('epc')) {
    return { domain: 'Packet Core (APN)', category: 'Packet Core (APN)', severity: 'major', needs_review: 0 };
  }
  // Voice/SMS
  if (lowerPath.includes('imsi') || lowerPath.includes('voice') || lowerPath.includes('sms') || lowerPath.includes('msc') || lowerPath.includes('vlr')) {
    return { domain: 'Voice/SMS (IMSI)', category: 'Voice/SMS (IMSI)', severity: 'major', needs_review: 0 };
  }
  // Commercial
  if (lowerPath.includes('iot') || lowerPath.includes('commercial') || lowerPath.includes('tariff') || lowerPath.includes('rate') || lowerPath.includes('discount')) {
    return { domain: 'Commercial (IOT)', category: 'Commercial (IOT)', severity: 'critical', needs_review: 0 };
  }

  // 2. AI Classification Pass (Claude / Anthropic API when configured)
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey && process.env.ENABLE_AI_CLASSIFIER === 'true') {
    try {
      const aiDomain = await callLlmDomainClassifier(fieldPath, oldValue, newValue);
      if (aiDomain && DOMAINS.includes(aiDomain)) {
        return {
          domain: aiDomain,
          category: aiDomain,
          severity: inferSeverity(aiDomain),
          needs_review: 0
        };
      }
    } catch (err) {
      console.warn('[domainClassifier] AI classification failed, using fallback:', err.message);
    }
  }

  // Fallback to Routing if we can't figure it out, as it's the most common IR.21 area.
  return {
    domain: 'Routing (GT)',
    category: 'Routing (GT)',
    severity: 'minor',
    needs_review: 1
  };
}

function inferSeverity(domain) {
  if (domain === 'Security (IPsec)' || domain === 'Commercial (IOT)') return 'critical';
  if (domain === 'Routing (GT)' || domain === 'Packet Core (APN)' || domain === 'Voice/SMS (IMSI)') return 'major';
  return 'minor';
}

async function callLlmDomainClassifier(fieldPath, oldValue, newValue) {
  const { callGeminiJSON } = require('./aiClient');
  try {
    const result = await callGeminiJSON({
      system: 'You classify a changed field from a telecom roaming document into exactly one of these six domains: "Network/Technical", "Security", "Commercial", "Financial/Billing", "Legal/Compliance", "Operations".',
      prompt: `Field path: ${fieldPath}\nOld value: ${oldValue}\nNew value: ${newValue}\n\nReturn ONLY JSON: {"domain": "<one of the six domains exactly>"}`,
      maxTokens: 100
    });
    return result && result.domain;
  } catch (err) {
    console.warn('[domainClassifier] LLM call failed:', err.message);
    return null;
  }
}

module.exports = { classifyDomain, DOMAINS };
