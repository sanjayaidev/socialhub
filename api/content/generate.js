// api/content/generate.js
//
// POST /api/content/generate { prompt, model?, max_tokens?, temperature? }
//   -> { content: "<model text response>" }
//
// Server-side proxy in front of the NVIDIA NIM endpoint.
// Uses stream:false so the response is always plain JSON — the client
// (callNIM in sidepanel.js) calls response.json() and expects { content }.
// Streaming belongs in /api/chat.js only.

const NIM_ENDPOINT  = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-pro';

const ALLOWED_MODELS = [
  'moonshotai/kimi-k2.6',
  'nvidia/llama-3.1-nemoguard-8b-content-safety',
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v4-pro',
  'mistralai/mistral-large-3-675b-instruct-2512',
];

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
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

    const selectedModel = model || DEFAULT_MODEL;
    if (!ALLOWED_MODELS.includes(selectedModel)) {
      return json({ error: `Model "${selectedModel}" is not in the allowed list` }, 403);
    }

    if (!NVIDIA_API_KEY) {
      return json({ error: 'NVIDIA_API_KEY environment variable is not set' }, 500);
    }

    const upstream = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        messages:    [{ role: 'user', content: prompt }],
        model:       selectedModel,
        stream:      false,         // must be false — callNIM() expects { content }, not SSE
        temperature: temperature ?? 0.7,
        max_tokens:  max_tokens  ?? 4096,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return json({ error: `NIM API error: ${upstream.status} - ${errText}` }, 502);
    }

    const result  = await upstream.json();
    const content = result.choices?.[0]?.message?.content || '';
    return json({ content });

  } catch (err) {
    console.error('generate.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
