const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1/models';

export async function consultarGemini(prompt, systemInstruction = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const fullPrompt = systemInstruction
    ? `${systemInstruction}\n\n${prompt}`
    : prompt;

  const body = {
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      const msg = errBody ? errBody.substring(0, 200) : `HTTP ${res.status}`;
      throw new Error(`Gemini API error ${res.status}: ${msg}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.trim();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
