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

  // 2. AI Classification Pass (Groq API when configured)
  const apiKey = process.env.GROQ_API_KEY;
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
  const { callGemini } = require('./aiClient'); // callGemini, not callGeminiJSON
  try {
    // Do NOT use json_object response_format (jsonMode: true) -- openai/gpt-oss-120b
    // produces json_validate_failed on short single-key responses under that constraint.
    // Instead ask for JSON in the prompt text and extract it from the free-text response.
    const text = await callGemini({
      system: 'You are a telecom roaming document classifier. Output ONLY a raw JSON object with no explanation, no preamble, no markdown. Classify the field change into exactly one of these five domains: "Routing (GT)", "Packet Core (APN)", "Voice/SMS (IMSI)", "Commercial (IOT)", "Security (IPsec)".',
      prompt: `Return ONLY this JSON (nothing before or after it): {"domain": "<one of the five domains>"}\n\nField path: ${fieldPath}\nOld value: ${oldValue}\nNew value: ${newValue}`,
      maxTokens: 500,   // 200 was too low -- model preamble consumed budget before JSON completed
                        // 500 handles a verbose ~300-token preamble + ~15-token JSON safely
      jsonMode: false   // bypass Groq server-side json_object enforcement; we parse ourselves
    });
    // Diagnostic: log raw response length so truncation is detectable
    console.log(`[domainClassifier] raw response length: ${(text || '').length} chars`);
    // Extract the first { ... } object from the response (handles any preamble/markdown)
    const cleaned = (text || '').replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[^}]+\}/);
    if (!match) {
      console.warn('[domainClassifier] LLM returned no JSON object in response (full text):', cleaned);
      return null;
    }
    const result = JSON.parse(match[0]);
    console.log(`[domainClassifier] AI classified "${fieldPath}" => domain: ${result && result.domain}`);
    return result && result.domain;
  } catch (err) {
    console.warn('[domainClassifier] LLM call failed:', err.message);
    return null;
  }
}

module.exports = { classifyDomain, DOMAINS };
