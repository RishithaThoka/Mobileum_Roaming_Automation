// Drop-in replacement for aiClient.js using Groq (OpenAI-compatible)

function getModel() {
  return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
}

async function callGemini({ system, prompt, maxTokens = 1024, jsonMode = false }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const model = getModel();
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });

  const body = {
    model: model,
    messages: messages,
    temperature: 0,
    max_tokens: maxTokens,
  };
  
  // Note: Groq requires the prompt to explicitly ask for JSON when using response_format
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      if (resp.status === 429 && attempts < maxAttempts - 1) {
        attempts++;
        const retryAfter = resp.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 10000;
        console.log(`[aiClient] Rate limit hit (429). Retrying in ${waitMs / 1000}s... (Attempt ${attempts}/${maxAttempts - 1})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(`Groq API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || '';
  }
}

// Convenience wrapper for prompts that must return structured JSON.
async function callGeminiJSON({ system, prompt, maxTokens = 1024 }) {
  const text = await callGemini({ system, prompt, maxTokens, jsonMode: true });
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// Chat-style call with multi-turn history (for the copilot).
async function callGeminiChat({ system, history = [], message, maxTokens = 1024 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const model = getModel();
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  
  for (const h of history) {
    messages.push({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: h.text
    });
  }
  messages.push({ role: "user", content: message });

  const body = {
    model: model,
    messages: messages,
    temperature: 0,
    max_tokens: maxTokens
  };

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      if (resp.status === 429 && attempts < maxAttempts - 1) {
        attempts++;
        const retryAfter = resp.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 10000;
        console.log(`[aiClient] Rate limit hit (429). Retrying in ${waitMs / 1000}s... (Attempt ${attempts}/${maxAttempts - 1})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(`Groq API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || '';
  }
}

module.exports = { callGemini, callGeminiJSON, callGeminiChat };
