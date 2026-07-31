const fs = require('fs');

async function parse(filePath, rawText = '') {
  let content = rawText;
  if (!content && fs.existsSync(filePath)) {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      content = '';
    }
  }

  if (!content || content.trim().length === 0) {
    return {};
  }

  // Check if AI API key is configured
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey && process.env.ENABLE_AI_PARSING === 'true') {
    try {
      // AI-assisted parsing call logic can be triggered here if configured
      // (Placeholder for remote LLM payload formatting)
    } catch (err) {
      console.warn('AI Parsing fallback call failed, defaulting to heuristic parser:', err.message);
    }
  }

  // Robust Heuristic Extraction Fallback for unstructured text
  const fields = {};
  const lines = content.split(/\r?\n/);
  let currentSection = 'ExtractedFields';

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Header detection
    if (/^[A-Z\s]{4,30}$/.test(line)) {
      currentSection = line.replace(/[^a-zA-Z0-9]/g, '');
      continue;
    }

    // Common patterns: "Key: Value", "Key = Value", "Key ... Value"
    const kvMatch = line.match(/^([A-Za-z0-9\s._-]+)\s*[:=]\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      if (key.length > 1 && val.length > 0) {
        fields[`${currentSection}.${key}`] = val;
      }
    }
  }

  return fields;
}

module.exports = { parse };
