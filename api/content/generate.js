// api/content/generate.js
//
// POST /api/content/generate { prompt, model?, max_tokens?, temperature? }
//   -> { content: "<model text response>" }
//
// This is a thin server-side proxy in front of the Railway NIM endpoint.
// The browser used to call Railway directly (see old sidepanel.js /
// agent.js), which is fragile: it's subject to CORS preflight, it leaks
// the Railway URL to every client, and any change to that URL means
// editing multiple front-end files. Routing through our own serverless
// function fixes all three — server-to-server calls aren't subject to
// CORS, and the URL now lives in one place.

const NIM_ENDPOINT = 'https://nimrailway-production.up.railway.app/api/chat';
const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-pro';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const { prompt, model, max_tokens, temperature } = body || {};

    if (!prompt || typeof prompt !== 'string') {
      return json({ error: 'prompt (string) is required' }, 400);
    }

    const upstream = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        model: model || DEFAULT_MODEL,
        stream: false,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 4096,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return json({ error: `NIM API error: ${upstream.status} - ${errText}` }, 502);
    }

    const result = await upstream.json();
    const content = result.choices?.[0]?.message?.content || '';
    return json({ content });
  } catch (err) {
    console.error('generate.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
