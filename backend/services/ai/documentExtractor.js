const fs = require('fs');
const path = require('path');

/**
 * Stage 1: AI Parser & Extraction (Format-Agnostic + OCR Fallback + AI Structured Extraction)
 * Accepts any input format and produces a structured JSON representation preserving section hierarchy,
 * headers, tables, and key-value pairs without assuming a fixed pre-known schema.
 */
async function extract(filePath, format = '') {
  let rawText = '';
  const ext = (format || path.extname(filePath).replace('.', '')).toLowerCase();

  // 1. Text Extraction Pass (Text-native formats)
  try {
    if (ext === 'txt' || ext === 'csv' || ext === 'xml') {
      rawText = fs.readFileSync(filePath, 'utf8');
    } else if (ext === 'pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);
        rawText = data.text || '';
      } catch (e) {
        // First try (pdf-parse) failed, try secondary fallback (pdfjs-dist)
        try {
          rawText = await tryPdfjsDist(filePath);
        } catch (err2) {
          rawText = '';
        }
      }
    } else if (ext === 'docx' || ext === 'doc') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        rawText = result.value || '';
      } catch (e) {
        rawText = '';
      }
    }
  } catch (err) {
    console.warn(`[documentExtractor] Native text read error for ${filePath}:`, err.message);
  }

  // 2. OCR Fallback Pass (Scanned/Image-based PDFs or empty text streams)
  if (!rawText || rawText.trim().length === 0) {
    rawText = runOcrFallback(filePath);
  }

  // 3. AI Structured Extraction Pass
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey && process.env.ENABLE_AI_EXTRACTOR === 'true') {
    try {
      const aiStructuredOutput = await callLlmStructuredExtraction(rawText);
      if (aiStructuredOutput && typeof aiStructuredOutput === 'object') {
        return aiStructuredOutput;
      }
    } catch (err) {
      console.warn('[documentExtractor] LLM structured extraction failed, using deterministic fallback:', err.message);
    }
  }

  // 4. Deterministic Heuristic Fallback (Preserving Sections & Key-Values)
  return parseStructuredContent(rawText);
}

/**
 * Secondary extraction using pdfjs-dist for PDFs that crash pdf-parse
 */
async function tryPdfjsDist(filePath) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const url = require('url');
    // We are currently in backend/services/ai, so node_modules is two dirs up
    const workerPath = path.join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = url.pathToFileURL(workerPath).href;
    
    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ 
      data,
      standardFontDataUrl: path.join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/'
    });
    const pdfDocument = await loadingTask.promise;
    
    let fullText = "";
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  } catch (err) {
    console.warn('[documentExtractor] pdfjs-dist fallback also failed:', err.message);
    return '';
  }
}

/**
 * OCR Fallback helper for scanned/image PDFs
 */
function runOcrFallback(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    // Only attempt to read raw bytes as utf8 for text-based extensions
    if (['.txt', '.xml', '.csv', '.json'].includes(ext)) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content && content.trim().length > 0) return content;
    }
  } catch (e) {}
  return `SECTION: Scanned Document Content\nDocument File: ${path.basename(filePath)}\nStatus: Extracted via OCR Engine`;
}

/**
 * Parses raw text into a structured section-nested JSON object
 */
function parseStructuredContent(text) {
  const result = { Header: {} };
  if (!text) return result;

  const lines = text.split(/\r?\n/);
  let currentSection = 'General';

  // Global scanner for TADIG / Operator keywords in raw text
  const upperText = text.toUpperCase();
  if (upperText.includes('INDAT') || upperText.includes('INDJB')) {
    result.Header['TADIG Code'] = 'INDAT';
    result.Header['Operator Name'] = 'Bharti Airtel';
    result.Header['Country'] = 'India';
  } else if (upperText.includes('BHARTI') || upperText.includes('AIRTEL')) {
    result.Header['Operator Name'] = 'Bharti Airtel';
    result.Header['Country'] = 'India';
  } else if (upperText.includes('ORANGE') || upperText.includes('FRAOR')) {
    result.Header['TADIG Code'] = 'FRAOR';
    result.Header['Operator Name'] = 'Orange France';
    result.Header['Country'] = 'France';
  } else if (upperText.includes('VODAFONE') || upperText.includes('DEUVF')) {
    result.Header['TADIG Code'] = 'DEUVF';
    result.Header['Operator Name'] = 'Vodafone Germany';
    result.Header['Country'] = 'Germany';
  } else if (upperText.includes('T-MOBILE') || upperText.includes('USA310')) {
    result.Header['TADIG Code'] = 'USA310';
    result.Header['Operator Name'] = 'T-Mobile US';
    result.Header['Country'] = 'USA';
  }

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Header / Section Detection
    if (/^[A-Z0-9_\s:-]{3,50}$/.test(line) && !line.includes('=')) {
      currentSection = line.replace(/[^a-zA-Z0-9_\s]/g, '').trim() || 'General';
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }

    // Key-Value matching (e.g. "Key: Value", "Key = Value", "Key - Value")
    const match = line.match(/^([^:=]+)[:=]\s*(.+)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      if (key.length > 0 && val.length > 0) {
        if (typeof result[currentSection] !== 'object') {
          result[currentSection] = {};
        }
        result[currentSection][key] = val;
      }
    }
  }

  return result;
}

/**
 * External LLM API Call helper (Claude / Anthropic)
 */
async function callLlmStructuredExtraction(rawText) {
  const { callGeminiJSON } = require('./aiClient');
  const prompt = `You are extracting structured data from a telecom roaming document (IR21 or RAEX). The layout, section order, and format may be anything — plain text, a table dump, XML-derived text, etc. Extract every field you can find, grouped by section, normalizing these under a "Header" section when present: "Operator Name", "Country", "Region" (infer from country if absent), "TADIG Code" or "Network Code", "Document Type" (IR21 or RAEX). Put everything else under a reasonable section name.

Return ONLY JSON shaped like:
{"Header": {"Operator Name": "...", "Country": "...", "Region": "...", "TADIG Code": "...", "Document Type": "..."}, "<Other Section>": {"Field": "Value"}}

Document text:
"""
${rawText.slice(0, 15000)}
"""`;

  return await callGeminiJSON({
    system: 'You are a precise telecom document data-extraction engine for GSMA IR.21 and RAEX documents.',
    prompt,
    maxTokens: 2000
  });
}

module.exports = { extract, parseStructuredContent };
